import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { ForumError } from '@/modules/forum/domain/forum'
import { groupSlug, type Viewer } from '@/modules/forum/domain/community'
import { CLUBS_SECTION } from '@/modules/forum/domain/tree'
import { authorsFor, fallbackAuthor, visibleCategories, type AuthorView } from '@/modules/forum/server/forum'

// Clubs: a group a member starts, with a forum of its own. Nothing here is a new mechanism. A club is a
// forum group (joining, requests and owners are the group's), a forum under the "clubs" section whose
// access is the group's, and its founder assigned as that forum's moderator.
//   open    — anyone reads the forum and joins freely; members write
//   private — the forum is seen by members only; joining is by request to the founder

export const CLUB_PREFIX = 'club-'
/** From this trust level a member may start a club; staff always may. */
export const CLUB_MIN_TRUST = 1
/** Clubs one member may be the founder of at once. */
export const CLUB_MAX_OWNED = 3
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6']

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** The section clubs' forums sit under, made the first time a club is started. It holds forums and takes no topics. */
export async function ensureClubsSection() {
  return await db.forumCategory.findUnique({ where: { slug: CLUBS_SECTION }, select: { id: true } })
    ?? db.forumCategory.create({ data: { slug: CLUBS_SECTION, title: 'کلوب‌ها', description: 'انجمن‌هایی که اعضا خودشان ساخته‌اند', icon: '🎪', color: '#8b5cf6', sortOrder: 900 }, select: { id: true } })
}

export function clubRefusal(viewer: Viewer): string | null {
  if (!viewer.userId) return 'برای ساخت کلوب وارد شوید'
  if (viewer.silenced || viewer.suspended) return 'حساب شما در تالار محدود شده است'
  if (!viewer.moderator && viewer.trustLevel < CLUB_MIN_TRUST) return 'ساخت کلوب از سطح اعتماد «کاربر پایه» به بعد ممکن است؛ کمی در تالار فعالیت کنید'
  return null
}

/**
 * Starts a club: the group, its forum and the founder's place in both, in one transaction, so a club never
 * exists without its forum or its founder.
 */
export async function createClub(viewer: Viewer, input: { name?: unknown; slug?: unknown; description?: unknown; kind?: unknown; icon?: unknown; color?: unknown }) {
  const refusal = clubRefusal(viewer)
  if (refusal) throw new ForumError(refusal, viewer.userId ? 403 : 401)
  const userId = viewer.userId!
  const name = clean(input.name, 60), description = clean(input.description, 300)
  if (name.length < 3) throw new ForumError('نام کلوب دست‌کم سه حرف باشد')
  let slug: string
  try { slug = groupSlug(input.slug) } catch { throw new ForumError('نشانی کلوب فقط حروف انگلیسی کوچک، عدد و خط تیره باشد') }
  if (slug.length < 3 || slug.length > 30) throw new ForumError('نشانی کلوب بین ۳ تا ۳۰ حرف باشد')
  const full = `${CLUB_PREFIX}${slug}`
  const kind = input.kind === 'private' ? 'private' : 'open'
  const color = COLORS.includes(String(input.color)) ? String(input.color) : COLORS[0]
  const icon = clean(input.icon, 8) || '🎪'
  if (!viewer.moderator) {
    if (await db.forumGroupMember.count({ where: { userId, owner: true, status: 'ACTIVE', group: { clubCategoryId: { not: null } } } }) >= CLUB_MAX_OWNED) throw new ForumError(`هر عضو می‌تواند بنیان‌گذار ${CLUB_MAX_OWNED.toLocaleString('fa-IR')} کلوب باشد`, 409)
    if (!rateLimitHit(`forum:club:${userId}`, 3, 86_400_000).ok) throw new ForumError('امروز به سقف ساخت کلوب رسیده‌اید', 429)
  }
  if (await db.forumGroup.findUnique({ where: { slug: full }, select: { id: true } }) || await db.forumCategory.findUnique({ where: { slug: full }, select: { id: true } })) throw new ForumError('این نشانی پیش‌تر گرفته شده است', 409)
  const [section, everyone] = await Promise.all([ensureClubsSection(), db.forumGroup.findUnique({ where: { automatic: 'everyone' }, select: { id: true } })])

  return db.$transaction(async (tx) => {
    const category = await tx.forumCategory.create({ data: { slug: full, title: name, description, icon, color, parentId: section.id, sortOrder: 0 } })
    const group = await tx.forumGroup.create({
      data: { slug: full, name, description, icon, color, visibility: 'PUBLIC', joinMode: kind === 'open' ? 'OPEN' : 'REQUEST', memberCount: 1, clubCategoryId: category.id, members: { create: { userId, owner: true, status: 'ACTIVE' } } },
    })
    // Members write; an open club is also read by everyone. A private one has the members' row only, so
    // nobody else sees it. (Without an "everyone" group an open club would be closed, so it stays unrestricted.)
    const rows = kind === 'open' ? everyone ? [{ groupId: everyone.id, level: 'SEE' }, { groupId: group.id, level: 'CREATE' }] : [] : [{ groupId: group.id, level: 'CREATE' }]
    if (rows.length) await tx.forumCategoryPermission.createMany({ data: rows.map((row) => ({ ...row, categoryId: category.id })) })
    await tx.forumCategoryModerator.create({ data: { categoryId: category.id, userId } })
    return { slug: full, kind, groupId: group.id, categoryId: category.id }
  })
}

export type ClubCard = {
  slug: string; name: string; description: string; icon: string; color: string; kind: 'open' | 'private'; members: number
  topics: number; posts: number; lastPostAt: Date | null; founder: AuthorView | null; faces: AuthorView[]
  /** The viewer's place in it. */
  membership: 'NONE' | 'PENDING' | 'ACTIVE' | 'OWNER'
  /** Whether the viewer may open its forum. */
  open: boolean
}

/** Every club, busiest first. A private club is listed (so it can be asked to join) without what is inside it. */
export async function listClubs(viewer: Viewer): Promise<ClubCard[]> {
  const groups = await db.forumGroup.findMany({ where: { clubCategoryId: { not: null }, visibility: 'PUBLIC' }, orderBy: [{ memberCount: 'desc' }, { id: 'asc' }], take: 200, include: { clubCategory: { select: { id: true, threadCount: true, postCount: true, lastPostAt: true } } } })
  if (!groups.length) return []
  const ids = groups.map((group) => group.id)
  const [mine, visible, people] = await Promise.all([
    viewer.userId ? db.forumGroupMember.findMany({ where: { userId: viewer.userId, groupId: { in: ids } }, select: { groupId: true, status: true, owner: true } }) : Promise.resolve([]),
    visibleCategories(viewer),
    Promise.all(groups.map((group) => db.forumGroupMember.findMany({ where: { groupId: group.id, status: 'ACTIVE', user: { status: 'ACTIVE' } }, orderBy: [{ owner: 'desc' }, { createdAt: 'asc' }], take: 5, select: { userId: true, owner: true } }))),
  ])
  const state = new Map(mine.map((row) => [row.groupId, row]))
  const seen = new Set(visible.map((category) => category.id))
  const authors = await authorsFor(people.flat().map((row) => row.userId))
  return groups.map((group, index) => {
    const membership = state.get(group.id), open = !!group.clubCategory && seen.has(group.clubCategory.id)
    const faces = people[index].map((row) => authors.get(row.userId) || fallbackAuthor(row.userId))
    const founder = people[index].find((row) => row.owner)
    return {
      slug: group.slug, name: group.name, description: group.description, icon: group.icon, color: group.color, kind: group.joinMode === 'OPEN' ? 'open' : 'private', members: group.memberCount,
      // What goes on inside is shown to those who may go in.
      topics: open ? group.clubCategory!.threadCount : 0, posts: open ? group.clubCategory!.postCount : 0, lastPostAt: open ? group.clubCategory!.lastPostAt : null,
      founder: founder ? authors.get(founder.userId) || null : null, faces,
      membership: !membership ? 'NONE' : membership.status !== 'ACTIVE' ? 'PENDING' : membership.owner ? 'OWNER' : 'ACTIVE', open,
    }
  })
}
