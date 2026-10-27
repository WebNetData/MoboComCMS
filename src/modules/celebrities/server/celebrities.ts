import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { live as liveMusic } from '@/modules/media/server/queries/core'
import { CELEBRITY_ROLES, celebritySlug, type CelebrityRole } from '@/modules/celebrities/domain/celebrities'
import { saveMediaItem } from '@/modules/media/server/admin'
import { savePerson } from '@/modules/cinema/server/person-admin'

const PAGE = 36
const liveTitle = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })

// ------------------------------------------------------------------ building the entries

const unique = (error: unknown) => (error as { code?: string })?.code === 'P2002'
let lastSync = 0

/**
 * Gives every cinema person and music artist (not merged into another) an entry. A newcomer joins an entry of the
 * other section with exactly the same name (normalized), unless the owner kept that entry apart; otherwise it gets its
 * own. Entries pointing at a merged-away person follow the person it was merged into. Safe to run concurrently.
 */
export async function syncCelebrities(): Promise<{ created: number; joined: number }> {
  let created = 0, joined = 0
  // A person merged into another: the entry follows the canonical one when that has none, else lets go.
  const stale = await db.celebrity.findMany({ where: { OR: [{ cinemaPerson: { mergedIntoId: { not: null } } }, { musicArtist: { mergedIntoId: { not: null } } }] }, select: { id: true, cinemaPerson: { select: { mergedIntoId: true } }, musicArtist: { select: { mergedIntoId: true } } } })
  for (const row of stale) {
    const data: Prisma.CelebrityUpdateInput = {}
    if (row.cinemaPerson?.mergedIntoId) data.cinemaPerson = await db.celebrity.count({ where: { cinemaPersonId: row.cinemaPerson.mergedIntoId } }) ? { disconnect: true } : { connect: { id: row.cinemaPerson.mergedIntoId } }
    if (row.musicArtist?.mergedIntoId) data.musicArtist = await db.celebrity.count({ where: { musicArtistId: row.musicArtist.mergedIntoId } }) ? { disconnect: true } : { connect: { id: row.musicArtist.mergedIntoId } }
    await db.celebrity.update({ where: { id: row.id }, data }).catch(() => undefined)
  }
  await db.celebrity.deleteMany({ where: { cinemaPersonId: null, musicArtistId: null } })

  const [people, artists] = await Promise.all([
    db.cinemaPerson.findMany({ where: { mergedIntoId: null, celebrity: { is: null } }, select: { id: true, name: true }, orderBy: { id: 'asc' }, take: 5000 }),
    db.musicArtist.findMany({ where: { mergedIntoId: null, celebrity: { is: null } }, select: { id: true, name: true, slug: true }, orderBy: { id: 'asc' }, take: 5000 }),
  ])
  for (const person of people) {
    const key = normalizePersonName(person.name)
    const partner = key ? await db.celebrity.findFirst({ where: { normalizedName: key, cinemaPersonId: null, musicArtistId: { not: null }, keepApart: false }, select: { id: true } }) : null
    try {
      if (partner) { await db.celebrity.update({ where: { id: partner.id }, data: { cinemaPersonId: person.id } }); joined++ }
      else { await db.celebrity.create({ data: { slug: celebritySlug({ cinemaId: person.id }), name: person.name, normalizedName: key, cinemaPersonId: person.id } }); created++ }
    } catch (error) { if (!unique(error)) throw error }
  }
  for (const artist of artists) {
    const key = normalizePersonName(artist.name)
    const partner = key ? await db.celebrity.findFirst({ where: { normalizedName: key, musicArtistId: null, cinemaPersonId: { not: null }, keepApart: false }, select: { id: true } }) : null
    try {
      if (partner) { await db.celebrity.update({ where: { id: partner.id }, data: { musicArtistId: artist.id } }); joined++; continue }
      const slug = celebritySlug({ musicSlug: artist.slug }) || `artist-${artist.id}`
      const taken = await db.celebrity.count({ where: { slug } })
      await db.celebrity.create({ data: { slug: taken ? `artist-${artist.id}` : slug, name: artist.name, normalizedName: key, musicArtistId: artist.id } })
      created++
    } catch (error) { if (!unique(error)) throw error }
  }
  lastSync = Date.now()
  return { created, joined }
}

/** Public pages keep the entries current without a job: at most once every five minutes per server. */
export async function ensureCelebritiesSynced() {
  if (Date.now() - lastSync < 5 * 60_000) return
  lastSync = Date.now()
  await syncCelebrities().catch(() => { lastSync = 0 })
}

// ------------------------------------------------------------------ what a visitor may see

/** A person is public through a published film or series, or a published song or album (or a credit on one). */
function publicWhere(now: Date, role: CelebrityRole | null, creditRole: string): Prisma.CelebrityWhereInput {
  const music = liveMusic()
  const cinema = (code?: string): Prisma.CelebrityWhereInput => ({ cinemaPerson: { is: { mergedIntoId: null, credits: { some: { title: liveTitle(now), ...(code ? { role: code } : {}) } } } } })
  const singer: Prisma.CelebrityWhereInput = { musicArtist: { is: { mergedIntoId: null, OR: [{ tracks: { some: music } }, { albums: { some: music } }] } } }
  const credited = (code?: string): Prisma.CelebrityWhereInput => ({ musicArtist: { is: { mergedIntoId: null, credits: { some: { track: music, ...(code ? { role: code } : {}) } } } } })
  if (creditRole) return credited(creditRole)
  if (role === 'singer') return singer
  if (role) return cinema(CELEBRITY_ROLES[role].code)
  return { OR: [cinema(), singer, credited()] }
}

const cardSelect = (now: Date) => ({
  id: true, slug: true, name: true, featured: true,
  cinemaPerson: { select: { image: true, credits: { where: { title: liveTitle(now) }, select: { role: true, titleId: true } } } },
  musicArtist: { select: { image: true, nameEn: true, _count: { select: { tracks: { where: liveMusic() }, albums: { where: liveMusic() } } }, credits: { where: { track: liveMusic() }, select: { role: true }, distinct: ['role' as const] } } },
}) satisfies Prisma.CelebritySelect

type CardRow = Prisma.CelebrityGetPayload<{ select: ReturnType<typeof cardSelect> }>

/** A card: picture, roles in the order a visitor reads them, and how many works of each kind. */
function toCard(row: CardRow, creditNames: Record<string, string>) {
  const cinemaRoles = new Set(row.cinemaPerson?.credits.map((credit) => credit.role) || [])
  const roles: string[] = []
  if (cinemaRoles.has('CAST')) roles.push(CELEBRITY_ROLES.actor.label)
  if (cinemaRoles.has('DIRECTOR')) roles.push(CELEBRITY_ROLES.director.label)
  if (cinemaRoles.has('PRODUCER')) roles.push(CELEBRITY_ROLES.producer.label)
  const songs = row.musicArtist?._count.tracks || 0, albums = row.musicArtist?._count.albums || 0
  if (songs || albums) roles.push(CELEBRITY_ROLES.singer.label)
  for (const credit of row.musicArtist?.credits || []) { const name = creditNames[credit.role]; if (name && !roles.includes(name)) roles.push(name) }
  return {
    id: row.id, slug: row.slug, name: row.name, nameEn: row.musicArtist?.nameEn || '', featured: row.featured,
    image: row.musicArtist?.image || row.cinemaPerson?.image || '', roles,
    titles: new Set(row.cinemaPerson?.credits.map((credit) => credit.titleId) || []).size, songs, albums,
  }
}
export type CelebrityCard = ReturnType<typeof toCard>

/** The directory: featured first, then by name; filtered by role and narrowed by name. */
export async function celebrityDirectory(input: { q?: unknown; role: CelebrityRole | null; creditRole: string; page?: unknown }, creditNames: Record<string, string>) {
  const now = new Date()
  const page = Math.max(1, Math.min(500, Math.trunc(Number(input.page)) || 1))
  const q = normalizePersonName(String(input.q ?? '')).slice(0, 60)
  const where: Prisma.CelebrityWhereInput = { AND: [publicWhere(now, input.role, input.creditRole), ...(q ? [{ OR: [{ normalizedName: { contains: q } }, { musicArtist: { is: { nameEn: { contains: q, mode: 'insensitive' as const } } } }] }] : [])] }
  const [total, rows] = await Promise.all([
    db.celebrity.count({ where }),
    db.celebrity.findMany({ where, orderBy: [{ featured: 'desc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * PAGE, take: PAGE, select: cardSelect(now) }),
  ])
  return { q, page, pages: Math.max(1, Math.ceil(total / PAGE)), total, people: rows.map((row) => toCard(row, creditNames)) }
}

/** One person's page: the entry with the sections it draws from; null when nothing of theirs is public. */
export async function celebrityBySlug(slug: string, creditNames: Record<string, string>) {
  const now = new Date()
  const row = await db.celebrity.findFirst({ where: { AND: [{ slug: String(slug).slice(0, 90) }, publicWhere(now, null, '')] }, select: cardSelect(now) })
  if (!row) return null
  const sources = await db.celebrity.findUnique({ where: { id: row.id }, select: { cinemaPersonId: true, cinemaPerson: { select: { bio: true } }, musicArtist: { select: { slug: true, bio: true } } } })
  return { card: toCard(row, creditNames), cinemaPersonId: sources?.cinemaPersonId ?? null, musicSlug: sources?.musicArtist?.slug || '', cinemaBio: sources?.cinemaPerson?.bio || '', musicBio: sources?.musicArtist?.bio || '' }
}

/** The entry a section's own person page links to. */
export async function celebrityFor(source: { cinemaPersonId?: number; musicArtistId?: number }) {
  if (!source.cinemaPersonId && !source.musicArtistId) return null
  return db.celebrity.findFirst({ where: source.cinemaPersonId ? { cinemaPersonId: source.cinemaPersonId } : { musicArtistId: source.musicArtistId }, select: { slug: true, cinemaPersonId: true, musicArtistId: true } }).catch(() => null)
}

// ------------------------------------------------------------------ management

export class CelebrityError extends Error { status = 400 }

/** The manager's list: every entry with its two sources, narrowed by name and by which sections it has. */
export async function adminCelebrities(params: URLSearchParams) {
  const q = normalizePersonName(params.get('q') || '').slice(0, 60)
  const only = params.get('only') || ''
  const page = Math.max(1, Math.min(500, Math.trunc(Number(params.get('page'))) || 1))
  const where: Prisma.CelebrityWhereInput = {
    ...(q ? { normalizedName: { contains: q } } : {}),
    ...(only === 'cinema' ? { cinemaPersonId: { not: null }, musicArtistId: null } : only === 'music' ? { musicArtistId: { not: null }, cinemaPersonId: null } : only === 'both' ? { cinemaPersonId: { not: null }, musicArtistId: { not: null } } : {}),
  }
  const [total, rows] = await Promise.all([
    db.celebrity.count({ where }),
    db.celebrity.findMany({ where, orderBy: [{ featured: 'desc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 40, take: 40, select: { id: true, slug: true, name: true, featured: true, keepApart: true, cinemaPerson: { select: { id: true, name: true, image: true } }, musicArtist: { select: { id: true, name: true, slug: true, image: true } } } }),
  ])
  return { page, pages: Math.max(1, Math.ceil(total / 40)), total, rows }
}

export async function setCelebrityFeatured(id: number, featured: boolean) {
  const row = await db.celebrity.update({ where: { id }, data: { featured } }).catch(() => null)
  if (!row) throw new CelebrityError('چهره پیدا نشد')
  return row
}

/**
 * Two different people with one name: they become two entries and neither is joined by name again. The side the
 * entry's address came from keeps the entry (its page stays where it was); the other side gets an entry of its own.
 */
export async function splitCelebrity(id: number) {
  return db.$transaction(async (tx) => {
    const row = await tx.celebrity.findUnique({ where: { id }, select: { id: true, slug: true, name: true, cinemaPersonId: true, musicArtistId: true } })
    if (!row) throw new CelebrityError('چهره پیدا نشد')
    if (!row.cinemaPersonId || !row.musicArtistId) throw new CelebrityError('این چهره فقط در یک بخش است؛ چیزی برای جدا کردن نیست')
    const cinemaKeeps = row.slug === celebritySlug({ cinemaId: row.cinemaPersonId })
    await tx.celebrity.update({ where: { id }, data: cinemaKeeps ? { musicArtistId: null, keepApart: true } : { cinemaPersonId: null, keepApart: true } })
    if (cinemaKeeps) {
      const artist = await tx.musicArtist.findUnique({ where: { id: row.musicArtistId }, select: { name: true, slug: true } })
      const wanted = celebritySlug({ musicSlug: artist?.slug || '' })
      const slug = wanted && !(await tx.celebrity.count({ where: { slug: wanted } })) ? wanted : `artist-${row.musicArtistId}`
      return tx.celebrity.create({ data: { slug, name: artist?.name || row.name, normalizedName: normalizePersonName(artist?.name || row.name), musicArtistId: row.musicArtistId, keepApart: true } })
    }
    const person = await tx.cinemaPerson.findUnique({ where: { id: row.cinemaPersonId }, select: { name: true } })
    return tx.celebrity.create({ data: { slug: celebritySlug({ cinemaId: row.cinemaPersonId }), name: person?.name || row.name, normalizedName: normalizePersonName(person?.name || row.name), cinemaPersonId: row.cinemaPersonId, keepApart: true } })
  }, { isolationLevel: 'Serializable' })
}

/** One person kept as two entries (different spellings): the other's section joins this one, the other goes. */
export async function joinCelebrities(targetId: number, otherId: number) {
  if (targetId === otherId) throw new CelebrityError('یک چهره را نمی‌شود به خودش وصل کرد')
  return db.$transaction(async (tx) => {
    const [target, other] = await Promise.all([
      tx.celebrity.findUnique({ where: { id: targetId }, select: { id: true, cinemaPersonId: true, musicArtistId: true } }),
      tx.celebrity.findUnique({ where: { id: otherId }, select: { id: true, cinemaPersonId: true, musicArtistId: true } }),
    ])
    if (!target || !other) throw new CelebrityError('چهره پیدا نشد')
    const cinemaPersonId = target.cinemaPersonId ?? other.cinemaPersonId, musicArtistId = target.musicArtistId ?? other.musicArtistId
    if ((target.cinemaPersonId && other.cinemaPersonId) || (target.musicArtistId && other.musicArtistId)) throw new CelebrityError('هر دو چهره در یک بخش هستند؛ ادغام در همان بخش انجام می‌شود')
    await tx.celebrity.delete({ where: { id: other.id } })
    return tx.celebrity.update({ where: { id: target.id }, data: { cinemaPersonId, musicArtistId, keepApart: false } })
  }, { isolationLevel: 'Serializable' })
}

// ------------------------------------------------------------------ one profile for every section

type Actor = { id: number; email: string }
type AuditPerson = (tx: Prisma.TransactionClient, id: number, created: boolean) => Promise<unknown>

/** What the central editor shows of one person: the profile and which sections they are in. */
export async function celebrityProfile(id: number) {
  const row = await db.celebrity.findUnique({ where: { id }, select: { id: true, slug: true, name: true, featured: true, cinemaPersonId: true, musicArtistId: true, cinemaPerson: { select: { name: true, image: true, bio: true } }, musicArtist: { select: { name: true, nameEn: true, image: true, bio: true, slug: true } } } })
  if (!row) throw new CelebrityError('چهره پیدا نشد')
  return {
    id: row.id, slug: row.slug, featured: row.featured, music: !!row.musicArtistId, cinema: !!row.cinemaPersonId,
    name: row.musicArtist?.name || row.cinemaPerson?.name || row.name, nameEn: row.musicArtist?.nameEn || '',
    image: row.musicArtist?.image || row.cinemaPerson?.image || '', bio: row.musicArtist?.bio || row.cinemaPerson?.bio || '',
  }
}

/**
 * Saves one person once for every section they are in, through each section's own save (its checks, history and
 * concurrency): the music artist and the cinema person get the same name, picture and biography. Ticking a section the
 * person is not yet in makes their record there; a new person is made in the sections ticked. The cinema picture is
 * kept from then on (a title's import does not replace it).
 */
export async function saveCelebrityProfile(raw: Record<string, unknown>, actor: Actor, auditPerson: AuditPerson) {
  const id = Number(raw.id) || 0
  const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
  const name = text(raw.name), nameEn = text(raw.nameEn), image = String(raw.image ?? '').trim(), bio = String(raw.bio ?? '')
  if (normalizePersonName(name).length < 2) throw new CelebrityError('نام را وارد کنید')
  const row = id ? await db.celebrity.findUnique({ where: { id }, select: { id: true, slug: true, cinemaPersonId: true, musicArtistId: true, cinemaPerson: { select: { profileVersion: true } } } }) : null
  if (id && !row) throw new CelebrityError('چهره پیدا نشد')
  const wantMusic = raw.music === true || !!row?.musicArtistId, wantCinema = raw.cinema === true || !!row?.cinemaPersonId
  if (!wantMusic && !wantCinema) throw new CelebrityError('دست‌کم یکی از بخش‌ها را انتخاب کنید: موسیقی یا فیلم و سریال')
  if (wantMusic && !row?.musicArtistId && !/[a-z0-9]/i.test(nameEn)) throw new CelebrityError('برای افزودن به موسیقی نام انگلیسی لازم است (نشانی صفحهٔ خواننده از آن ساخته می‌شود)')

  let musicArtistId = row?.musicArtistId ?? null
  const profile = { name, nameEn, image, bio }
  if (musicArtistId) await saveMediaItem('music-artists', profile, musicArtistId, actor)
  else if (wantMusic) musicArtistId = Number((await saveMediaItem('music-artists', profile, null, actor)).row.id)

  let cinemaPersonId = row?.cinemaPersonId ?? null
  if (cinemaPersonId) await savePerson({ id: cinemaPersonId, profileVersion: row!.cinemaPerson!.profileVersion, name, bio, image, imageLocked: true }, auditPerson)
  else if (wantCinema) {
    // Credits already name this person (a film saved before): that record is theirs, unless another entry holds it.
    const known = await db.cinemaPerson.findUnique({ where: { normalizedName: normalizePersonName(name) }, select: { id: true, profileVersion: true, mergedIntoId: true, celebrity: { select: { id: true } } } })
    if (known && !known.mergedIntoId && (!known.celebrity || known.celebrity.id === row?.id)) {
      await savePerson({ id: known.id, profileVersion: known.profileVersion, name, bio, image, imageLocked: true }, auditPerson)
      cinemaPersonId = known.id
    } else if (known) throw new CelebrityError('این نام در فیلم و سریال به چهرهٔ دیگری وصل است؛ از «وصل به…» استفاده کنید')
    else cinemaPersonId = (await savePerson({ name, bio, image, imageLocked: true }, auditPerson)).id
  }

  return db.$transaction(async (tx) => {
    // A record of this person may already hold an entry of its own (a sync ran between the saves): one entry stays.
    const held = await tx.celebrity.findMany({ where: { OR: [...(musicArtistId ? [{ musicArtistId }] : []), ...(cinemaPersonId ? [{ cinemaPersonId }] : [])], ...(row ? { id: { not: row.id } } : {}) }, select: { id: true, slug: true } })
    const keep = row ? row : held[0]
    for (const other of held) if (other.id !== keep?.id) await tx.celebrity.delete({ where: { id: other.id } })
    const data = { name, normalizedName: normalizePersonName(name), cinemaPersonId, musicArtistId }
    if (keep) return tx.celebrity.update({ where: { id: keep.id }, data })
    const artist = musicArtistId ? await tx.musicArtist.findUnique({ where: { id: musicArtistId }, select: { slug: true } }) : null
    return tx.celebrity.create({ data: { ...data, slug: artist ? celebritySlug({ musicSlug: artist.slug }) : celebritySlug({ cinemaId: cinemaPersonId! }) } })
  }, { isolationLevel: 'Serializable' })
}

/** The person's single page address when it shows something (a section's own person page sends visitors there). */
export async function publicCelebritySlug(source: { cinemaPersonId?: number; musicArtistId?: number }) {
  if (!source.cinemaPersonId && !source.musicArtistId) return null
  const row = await db.celebrity.findFirst({ where: { AND: [source.cinemaPersonId ? { cinemaPersonId: source.cinemaPersonId } : { musicArtistId: source.musicArtistId }, publicWhere(new Date(), null, '')] }, select: { slug: true } }).catch(() => null)
  return row?.slug ?? null
}
