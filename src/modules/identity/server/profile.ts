import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { sniffImage } from '@/shared/files/image-type'
import { readJsonSetting } from '@/modules/settings/server'
import { nextUsername, normalizeFieldsConfig } from '@/modules/identity/domain/profile-fields'
import {
  ProfileError, canFollow, canMessage, canViewProfile, cleanText, mediaPath, normalizeLinks, normalizePrivacy, normalizeUsername, normalizeWebsite,
  type Privacy, type ProfileLink, type Relation,
} from '@/modules/identity/domain/profile'

// The unified member profile (core identity): one username, avatar, cover,
// bio, links and privacy used by every section, plus the follow/block graph.

/**
 * Default username for a member who has not chosen one: prefix, prefix2,
 * prefix3… (prefix from the registration-fields settings, "mobocomuser" by
 * default), continuing after the highest one already taken.
 */
async function defaultUsername(offset = 0) {
  const stored = await readJsonSetting('profile.fields.v1')
  const prefix = normalizeFieldsConfig(stored).usernamePrefix
  const [profiles, forum] = await Promise.all([
    db.userProfile.findMany({ where: { username: { startsWith: prefix } }, select: { username: true } }),
    db.forumProfile.findMany({ where: { username: { startsWith: prefix } }, select: { username: true } }).catch(() => [] as { username: string }[]),
  ])
  const taken = [...profiles, ...forum].map((row) => row.username)
  const next = nextUsername(prefix, taken)
  if (!offset) return next
  const base = next === prefix ? 1 : Number(next.slice(prefix.length))
  return `${prefix}${base + offset}`
}

/**
 * Creates missing profiles. Members who already had a forum profile keep
 * its username, bio, avatar and cover, so nobody's address changes.
 */
export async function ensureUserProfiles(userIds: number[]) {
  const ids = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (!ids.length) return
  const existing = new Set((await db.userProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true } })).map((row) => row.userId))
  const missing = ids.filter((id) => !existing.has(id))
  if (!missing.length) return
  const [users, forum] = await Promise.all([
    db.user.findMany({ where: { id: { in: missing } }, select: { id: true, email: true, name: true } }),
    db.forumProfile.findMany({ where: { userId: { in: missing } }, select: { userId: true, username: true, bio: true, location: true, website: true, avatar: true, cover: true } }).catch(() => []),
  ])
  const forumByUser = new Map(forum.map((row) => [row.userId, row]))
  for (const user of users) {
    const legacy = forumByUser.get(user.id)
    if (legacy) {
      await db.userProfile.create({ data: { userId: user.id, username: legacy.username, bio: legacy.bio, location: legacy.location, website: legacy.website, avatar: legacy.avatar, cover: legacy.cover } })
        .catch((error: { code?: string }) => { if (error?.code !== 'P2002') throw error })
      continue
    }
    // Two sign-ups at once can pick the same next number: retry with the following one.
    for (let attempt = 0; attempt < 8; attempt++) {
      try { await db.userProfile.create({ data: { userId: user.id, username: await defaultUsername(attempt) } }); break }
      catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error
        if (await db.userProfile.findUnique({ where: { userId: user.id }, select: { userId: true } })) break
      }
    }
  }
}

export async function ensureUserProfile(userId: number) {
  await ensureUserProfiles([userId])
  const profile = await db.userProfile.findUnique({ where: { userId } })
  if (!profile) throw new ProfileError('پروفایل پیدا نشد', 404, 'NOT_FOUND')
  return profile
}

export type PublicProfile = {
  userId: number; username: string; name: string; headline: string; bio: string; location: string; website: string; avatar: string; avatarColor: string; cover: string
  links: ProfileLink[]; verified: boolean; staff: boolean; joinedAt: string; lastSeenAt: string | null
  followers: number; following: number; posts: number
}

function linksOf(raw: string): ProfileLink[] {
  try { return normalizeLinks(JSON.parse(raw)) } catch { return [] }
}

type Row = Awaited<ReturnType<typeof db.userProfile.findUnique>> & {}
type UserRow = { id: number; name: string; avatarColor: string; role: string; createdAt: Date; lastLoginAt: Date | null }

export function toPublicProfile(profile: Row, user: UserRow, privacy: Privacy): PublicProfile {
  return {
    userId: user.id, username: profile.username, name: user.name || profile.username, headline: profile.headline, bio: profile.bio, location: profile.location, website: profile.website,
    avatar: profile.avatar, avatarColor: user.avatarColor, cover: profile.cover, links: linksOf(profile.links), verified: profile.verified, staff: user.role === 'ADMIN',
    joinedAt: user.createdAt.toISOString(), lastSeenAt: privacy.showOnline && user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    followers: profile.followerCount, following: profile.followingCount, posts: profile.postCount,
  }
}

const USER_SELECT = { id: true, name: true, avatarColor: true, role: true, status: true, createdAt: true, lastLoginAt: true } as const

/** Profile by username (active members only). */
export async function profileByUsername(username: string) {
  const name = String(username || '').trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return null
  const profile = await db.userProfile.findUnique({ where: { username: name }, include: { user: { select: USER_SELECT } } })
  if (!profile || profile.user.status !== 'ACTIVE') return null
  const privacy = normalizePrivacy(profile.privacy)
  return { profile: toPublicProfile(profile, profile.user, privacy), privacy, pinnedPostId: profile.pinnedPostId }
}

/** Compact identities for many users (feeds, lists, comments). */
export async function profileCards(userIds: number[]) {
  const ids = [...new Set(userIds)].filter((id) => Number.isSafeInteger(id) && id > 0)
  if (!ids.length) return new Map<number, ProfileCard>()
  await ensureUserProfiles(ids)
  const rows = await db.userProfile.findMany({ where: { userId: { in: ids } }, include: { user: { select: USER_SELECT } } })
  return new Map(rows.map((row) => [row.userId, { userId: row.userId, username: row.username, name: row.user.name || row.username, avatar: row.avatar, avatarColor: row.user.avatarColor, headline: row.headline, verified: row.verified, staff: row.user.role === 'ADMIN', followers: row.followerCount }]))
}
export type ProfileCard = { userId: number; username: string; name: string; avatar: string; avatarColor: string; headline: string; verified: boolean; staff: boolean; followers: number }

// ------------------------------------------------------------------ editing

export async function myProfile(userId: number) {
  const profile = await ensureUserProfile(userId)
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  return { username: profile.username, name: user?.name || '', headline: profile.headline, bio: profile.bio, location: profile.location, website: profile.website, avatar: profile.avatar, cover: profile.cover, links: linksOf(profile.links), privacy: normalizePrivacy(profile.privacy) }
}

export async function updateUserProfile(userId: number, input: Record<string, unknown>) {
  const profile = await ensureUserProfile(userId)
  const data: Record<string, unknown> = {}
  if (input.username !== undefined && String(input.username).trim().replace(/^@/, '').toLowerCase() !== profile.username) {
    if (!rateLimitHit(`profile:rename:${userId}`, 3, 86_400_000).ok) throw new ProfileError('تغییر نام کاربری امروز بیش از حد انجام شده است', 429)
    const username = normalizeUsername(input.username)
    const [taken, forumTaken] = await Promise.all([
      db.userProfile.findUnique({ where: { username }, select: { userId: true } }),
      db.forumProfile.findUnique({ where: { username }, select: { userId: true } }).catch(() => null),
    ])
    if ((taken && taken.userId !== userId) || (forumTaken && forumTaken.userId !== userId)) throw new ProfileError('این نام کاربری گرفته شده است', 409, 'TAKEN')
    data.username = username
  }
  if (input.headline !== undefined) data.headline = cleanText(input.headline, 120)
  if (input.bio !== undefined) data.bio = cleanText(input.bio, 1000)
  if (input.location !== undefined) data.location = cleanText(input.location, 80)
  if (input.website !== undefined) data.website = normalizeWebsite(input.website)
  if (input.avatar !== undefined) data.avatar = mediaPath(input.avatar)
  if (input.cover !== undefined) data.cover = mediaPath(input.cover)
  if (input.links !== undefined) data.links = JSON.stringify(normalizeLinks(input.links))
  if (input.privacy !== undefined) data.privacy = JSON.stringify(normalizePrivacy({ ...normalizePrivacy(profile.privacy), ...(input.privacy && typeof input.privacy === 'object' ? input.privacy : {}) }))
  const name = input.name !== undefined ? cleanText(input.name, 60) : undefined
  if (name !== undefined && name.length < 2) throw new ProfileError('نام نمایشی دست‌کم ۲ نویسه باشد')
  const updated = await db.$transaction(async (tx) => {
    const row = Object.keys(data).length ? await tx.userProfile.update({ where: { userId }, data }) : profile
    if (name !== undefined) await tx.user.update({ where: { id: userId }, data: { name } })
    // The forum keeps a copy of the public identity for its own lists and mentions.
    const mirror = Object.fromEntries(Object.entries(data).filter(([key]) => ['username', 'bio', 'location', 'website', 'avatar', 'cover'].includes(key)))
    if (Object.keys(mirror).length) await tx.forumProfile.updateMany({ where: { userId }, data: mirror })
    return row
  })
  return { username: updated.username }
}

/** Chosen during onboarding; same rules and limits as the profile editor. */
export async function setUsername(userId: number, username: string) {
  return updateUserProfile(userId, { username })
}

// ------------------------------------------------------------------ media

const MEDIA_DIR = () => join(process.cwd(), 'storage', 'profile')
const MAX_BYTES = 4 * 1024 * 1024

export async function saveProfileMedia(userId: number, file: File | null) {
  if (!rateLimitHit(`profile:upload:${userId}`, 30, 3_600_000).ok) throw new ProfileError('تعداد بارگذاری زیاد است؛ کمی بعد تلاش کنید', 429)
  if (!file || !file.size) throw new ProfileError('تصویری انتخاب نشده است')
  if (file.size > MAX_BYTES) throw new ProfileError('حجم تصویر حداکثر ۴ مگابایت است', 413)
  const bytes = Buffer.from(await file.arrayBuffer())
  const type = sniffImage(bytes)
  if (!type || !['png', 'jpg', 'webp'].includes(type.extension)) throw new ProfileError('فقط تصویر PNG، JPEG یا WebP مجاز است')
  const name = `${randomUUID()}.${type.extension}`
  await mkdir(MEDIA_DIR(), { recursive: true })
  await writeFile(join(MEDIA_DIR(), name), bytes, { flag: 'wx', mode: 0o644 })
  return { url: `/api/profile/media/${name}` }
}

export async function readProfileMedia(name: string) {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return null
  try {
    const bytes = await readFile(join(MEDIA_DIR(), name))
    return { bytes, type: name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }
  } catch { return null }
}

// ------------------------------------------------------------------ graph

async function isStaff(userId: number | null) {
  if (!userId) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
  return user?.role === 'ADMIN' && user.status === 'ACTIVE'
}

export async function relationBetween(viewerId: number | null, ownerId: number): Promise<Relation> {
  if (!viewerId) return { self: false, staff: false, signedIn: false, following: false, followedBy: false, blocked: false, blockedBy: false }
  if (viewerId === ownerId) return { self: true, staff: await isStaff(viewerId), signedIn: true, following: false, followedBy: false, blocked: false, blockedBy: false }
  const [following, followedBy, blocked, blockedBy, staff] = await Promise.all([
    db.userFollow.count({ where: { followerId: viewerId, followingId: ownerId } }),
    db.userFollow.count({ where: { followerId: ownerId, followingId: viewerId } }),
    db.userBlock.count({ where: { blockerId: viewerId, blockedId: ownerId } }),
    db.userBlock.count({ where: { blockerId: ownerId, blockedId: viewerId } }),
    isStaff(viewerId),
  ])
  return { self: false, staff, signedIn: true, following: following > 0, followedBy: followedBy > 0, blocked: blocked > 0, blockedBy: blockedBy > 0 }
}

async function refreshCounts(userIds: number[]) {
  for (const userId of [...new Set(userIds)]) {
    const [followers, following] = await Promise.all([db.userFollow.count({ where: { followingId: userId } }), db.userFollow.count({ where: { followerId: userId } })])
    await db.userProfile.updateMany({ where: { userId }, data: { followerCount: followers, followingCount: following } })
  }
}

export async function follow(viewerId: number, ownerId: number) {
  if (!rateLimitHit(`profile:follow:${viewerId}`, 60, 3_600_000).ok) throw new ProfileError('تعداد دنبال کردن زیاد است؛ کمی بعد تلاش کنید', 429)
  const relation = await relationBetween(viewerId, ownerId)
  if (!canFollow(relation)) throw new ProfileError(relation.self ? 'نمی‌توانید خودتان را دنبال کنید' : 'امکان دنبال کردن این کاربر نیست', 403)
  await ensureUserProfiles([viewerId, ownerId])
  const created = await db.userFollow.create({ data: { followerId: viewerId, followingId: ownerId } }).then(() => true).catch((error: { code?: string }) => { if (error?.code === 'P2002') return false; throw error })
  await refreshCounts([viewerId, ownerId])
  return { created }
}

export async function unfollow(viewerId: number, ownerId: number) {
  await db.userFollow.deleteMany({ where: { followerId: viewerId, followingId: ownerId } })
  await refreshCounts([viewerId, ownerId])
}

/** Blocking also removes the follow in both directions. */
export async function block(viewerId: number, ownerId: number) {
  if (viewerId === ownerId) throw new ProfileError('نمی‌توانید خودتان را مسدود کنید')
  if (await isStaff(ownerId)) throw new ProfileError('تیم سایت را نمی‌توان مسدود کرد', 403)
  await db.userBlock.create({ data: { blockerId: viewerId, blockedId: ownerId } }).catch((error: { code?: string }) => { if (error?.code !== 'P2002') throw error })
  await db.userFollow.deleteMany({ where: { OR: [{ followerId: viewerId, followingId: ownerId }, { followerId: ownerId, followingId: viewerId }] } })
  await refreshCounts([viewerId, ownerId])
}

export async function unblock(viewerId: number, ownerId: number) {
  await db.userBlock.deleteMany({ where: { blockerId: viewerId, blockedId: ownerId } })
}

/** Users the viewer blocked or who blocked the viewer (hidden from each other's feeds). */
export async function blockedIds(viewerId: number | null): Promise<number[]> {
  if (!viewerId) return []
  const rows = await db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } })
  return [...new Set(rows.map((row) => (row.blockerId === viewerId ? row.blockedId : row.blockerId)))]
}

export async function followingIds(userId: number): Promise<number[]> {
  return (await db.userFollow.findMany({ where: { followerId: userId }, select: { followingId: true }, take: 5000 })).map((row) => row.followingId)
}

export async function followList(userId: number, direction: 'followers' | 'following', viewerId: number | null, page = 1) {
  const size = 30
  const where = direction === 'followers' ? { followingId: userId } : { followerId: userId }
  const [rows, total] = await Promise.all([
    db.userFollow.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(1, page) - 1) * size, take: size, select: { followerId: true, followingId: true } }),
    db.userFollow.count({ where }),
  ])
  const ids = rows.map((row) => (direction === 'followers' ? row.followerId : row.followingId))
  const [cards, mine] = await Promise.all([profileCards(ids), viewerId ? followingIds(viewerId) : Promise.resolve([] as number[])])
  return { total, page, pages: Math.max(1, Math.ceil(total / size)), people: ids.flatMap((id) => (cards.has(id) ? [{ ...cards.get(id)!, following: mine.includes(id), self: id === viewerId }] : [])) }
}

/** People to follow: most-followed members the viewer does not follow yet, friends of friends first. */
export async function suggestions(viewerId: number | null, take = 6) {
  const exclude = new Set<number>(viewerId ? [viewerId, ...(await followingIds(viewerId)), ...(await blockedIds(viewerId))] : [])
  let ids: number[] = []
  if (viewerId) {
    const mine = [...exclude].filter((id) => id !== viewerId)
    if (mine.length) {
      const fof = await db.userFollow.groupBy({ by: ['followingId'], where: { followerId: { in: mine.slice(0, 500) }, followingId: { notIn: [...exclude] } }, _count: { _all: true }, orderBy: { _count: { followingId: 'desc' } }, take })
      ids = fof.map((row) => row.followingId)
    }
  }
  if (ids.length < take) {
    const popular = await db.userProfile.findMany({ where: { userId: { notIn: [...exclude, ...ids] }, user: { status: 'ACTIVE' } }, orderBy: [{ followerCount: 'desc' }, { postCount: 'desc' }, { updatedAt: 'desc' }], take: take - ids.length, select: { userId: true } })
    ids = [...ids, ...popular.map((row) => row.userId)]
  }
  const cards = await profileCards(ids)
  return ids.flatMap((id) => (cards.has(id) ? [cards.get(id)!] : []))
}

/** Member directory with search and sort. */
export async function peopleDirectory(input: { q?: string; sort?: string; page?: number }, viewerId: number | null) {
  const size = 24
  const page = Math.max(1, Math.min(200, Number(input.page) || 1))
  const q = cleanText(input.q, 40).toLowerCase()
  const where = { user: { status: 'ACTIVE' }, ...(q ? { OR: [{ username: { contains: q } }, { user: { name: { contains: q } } }, { headline: { contains: q } }] } : {}) }
  const orderBy = input.sort === 'new' ? [{ createdAt: 'desc' as const }] : input.sort === 'posts' ? [{ postCount: 'desc' as const }] : [{ followerCount: 'desc' as const }, { postCount: 'desc' as const }]
  const [rows, total] = await Promise.all([db.userProfile.findMany({ where, orderBy, skip: (page - 1) * size, take: size, select: { userId: true } }), db.userProfile.count({ where })])
  const [cards, mine] = await Promise.all([profileCards(rows.map((row) => row.userId)), viewerId ? followingIds(viewerId) : Promise.resolve([] as number[])])
  return { total, page, pages: Math.max(1, Math.ceil(total / size)), people: rows.flatMap((row) => (cards.has(row.userId) ? [{ ...cards.get(row.userId)!, following: mine.includes(row.userId), self: row.userId === viewerId }] : [])) }
}

export { canMessage, canViewProfile }
