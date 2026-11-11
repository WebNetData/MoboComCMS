import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { live as liveMusic } from '@/modules/media/server/queries/core'
import { CELEBRITY_ROLES, celebritySlug, suggestedCelebritySlug, type CelebrityRole } from '@/modules/celebrities/domain/celebrities'
import { parseFacts } from '@/modules/celebrities/domain/fields'

const PAGE = 36
const liveTitle = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' })

// ------------------------------------------------------------------ building the entries

const unique = (error: unknown) => (error as { code?: string })?.code === 'P2002'

/** A free profile address from an English name ("-2", "-3"… when taken); '' when the name gives none. */
async function englishSlug(reader: Pick<Prisma.TransactionClient, 'celebrity' | 'celebritySlugAlias'>, nameEn: string, id?: number) {
  const base = suggestedCelebritySlug(nameEn)
  if (!base) return ''
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 76).replace(/-+$/, '')}-${n}`
    const [entry, alias] = await Promise.all([reader.celebrity.findUnique({ where: { slug }, select: { id: true } }), reader.celebritySlugAlias.findUnique({ where: { slug }, select: { celebrityId: true } })])
    if ((!entry || entry.id === id) && (!alias || alias.celebrityId === id)) return slug
  }
  return ''
}

/**
 * A film person's own entry follows their names: it shows their Persian name, and an entry still at its number
 * address moves to one made from their English name (the number address stays reserved and leads there).
 * An entry shared with a singer keeps the music side's name and address.
 */
async function followCinemaNames() {
  const rows = await db.celebrity.findMany({ where: { musicArtistId: null, cinemaPerson: { is: { mergedIntoId: null } } }, select: { id: true, slug: true, name: true, cinemaPersonId: true, cinemaPerson: { select: { name: true, nameEn: true } } }, take: 5000 })
  for (const row of rows) {
    const person = row.cinemaPerson
    if (!person || !row.cinemaPersonId) continue
    const rename = person.name !== row.name
    const move = row.slug === celebritySlug({ cinemaId: row.cinemaPersonId }) && !!suggestedCelebritySlug(person.nameEn)
    if (!rename && !move) continue
    await db.$transaction(async tx => {
      const data: Prisma.CelebrityUpdateManyMutationInput = rename ? { name: person.name, normalizedName: normalizePersonName(person.name) } : {}
      const slug = move ? await englishSlug(tx, person.nameEn, row.id) : ''
      if (slug) data.slug = slug
      if (!Object.keys(data).length) return
      // Claimed against the address read: an Admin edit meanwhile wins.
      if (!(await tx.celebrity.updateMany({ where: { id: row.id, slug: row.slug }, data })).count) return
      if (slug) { await tx.celebritySlugAlias.deleteMany({ where: { slug, celebrityId: row.id } }); await tx.celebritySlugAlias.create({ data: { slug: row.slug, celebrityId: row.id } }) }
    }).catch(error => { if (!unique(error)) throw error })
  }
}
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
    db.cinemaPerson.findMany({ where: { mergedIntoId: null, celebrity: { is: null } }, select: { id: true, name: true, nameEn: true }, orderBy: { id: 'asc' }, take: 5000 }),
    db.musicArtist.findMany({ where: { mergedIntoId: null, celebrity: { is: null } }, select: { id: true, name: true, slug: true }, orderBy: { id: 'asc' }, take: 5000 }),
  ])
  for (const person of people) {
    const key = normalizePersonName(person.name)
    const partner = key ? await db.celebrity.findFirst({ where: { normalizedName: key, cinemaPersonId: null, musicArtistId: { not: null }, keepApart: false }, select: { id: true } }) : null
    try {
      if (partner) { await db.celebrity.update({ where: { id: partner.id }, data: { cinemaPersonId: person.id } }); joined++ }
      else { await db.celebrity.create({ data: { slug: await englishSlug(db, person.nameEn) || celebritySlug({ cinemaId: person.id }), name: person.name, normalizedName: key, cinemaPersonId: person.id } }); created++ }
    } catch (error) { if (!unique(error)) throw error }
  }
  for (const artist of artists) {
    const key = normalizePersonName(artist.name)
    const partner = key ? await db.celebrity.findFirst({ where: { normalizedName: key, musicArtistId: null, cinemaPersonId: { not: null }, keepApart: false }, select: { id: true } }) : null
    try {
      if (partner) { await db.celebrity.update({ where: { id: partner.id }, data: { musicArtistId: artist.id } }); joined++; continue }
      const slug = celebritySlug({ musicSlug: artist.slug }) || `artist-${artist.id}`
      const taken = await db.celebrity.count({ where: { slug } }) || await db.celebritySlugAlias.count({ where: { slug } })
      await db.celebrity.create({ data: { slug: taken ? `artist-${artist.id}` : slug, name: artist.name, normalizedName: key, musicArtistId: artist.id } })
      created++
    } catch (error) { if (!unique(error)) throw error }
  }
  await followCinemaNames()
  await refreshScores()
  lastSync = Date.now()
  return { created, joined }
}

/**
 * Each entry's published works across the sections (films and series credited on, songs, albums, credits on songs):
 * the «most known» order. Written only where it changed.
 */
async function refreshScores() {
  const now = new Date(), music = liveMusic()
  const [credits, tracks, albums, songCredits, entries] = await Promise.all([
    db.cinemaCredit.groupBy({ by: ['personId'], where: { title: liveTitle(now) }, _count: { _all: true } }),
    db.musicTrack.groupBy({ by: ['artistId'], where: music, _count: { _all: true } }),
    db.musicAlbum.groupBy({ by: ['artistId'], where: music, _count: { _all: true } }),
    db.musicCredit.groupBy({ by: ['artistId'], where: { track: music }, _count: { _all: true } }),
    db.celebrity.findMany({ select: { id: true, score: true, cinemaPersonId: true, musicArtistId: true } }),
  ])
  const of = (rows: { _count: { _all: number } }[], key: (row: never) => number | null) => new Map(rows.map((row) => [key(row as never), row._count._all]))
  const film = of(credits, (row: { personId: number }) => row.personId), song = of(tracks, (row: { artistId: number }) => row.artistId), album = of(albums, (row: { artistId: number }) => row.artistId), credited = of(songCredits, (row: { artistId: number }) => row.artistId)
  for (const entry of entries) {
    const score = (entry.cinemaPersonId ? film.get(entry.cinemaPersonId) || 0 : 0) + (entry.musicArtistId ? (song.get(entry.musicArtistId) || 0) + (album.get(entry.musicArtistId) || 0) * 3 + (credited.get(entry.musicArtistId) || 0) : 0)
    if (score !== entry.score) await db.celebrity.update({ where: { id: entry.id }, data: { score } }).catch(() => undefined)
  }
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
  musicArtist: { select: { image: true, cover: true, nameEn: true, _count: { select: { tracks: { where: liveMusic() }, albums: { where: liveMusic() } } }, credits: { where: { track: liveMusic() }, select: { role: true }, distinct: ['role' as const] } } },
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
    image: row.musicArtist?.image || row.cinemaPerson?.image || '', cover: row.musicArtist?.cover || '', roles,
    titles: new Set(row.cinemaPerson?.credits.map((credit) => credit.titleId) || []).size, songs, albums,
  }
}
export type CelebrityCard = ReturnType<typeof toCard>

/** The directory: featured first, then by name; filtered by role and narrowed by name. */
export type CelebritySort = 'known' | 'new' | 'name'
export type CelebritySection = '' | 'cinema' | 'music'

/** Only people of one section: those with a public film or series, or a public song, album or song credit. */
function sectionWhere(now: Date, section: CelebritySection): Prisma.CelebrityWhereInput | null {
  if (section === 'cinema') return { cinemaPerson: { is: { mergedIntoId: null, credits: { some: { title: liveTitle(now) } } } } }
  if (section === 'music') { const music = liveMusic(); return { musicArtist: { is: { mergedIntoId: null, OR: [{ tracks: { some: music } }, { albums: { some: music } }, { credits: { some: { track: music } } }] } } } }
  return null
}

/** Names written in Latin letters or starting with a digit: the «A–Z» letter of the directory. */
const LATIN: Prisma.CelebrityWhereInput = { OR: 'abcdefghijklmnopqrstuvwxyz0123456789'.split('').map((char) => ({ normalizedName: { startsWith: char } })) }

/** The directory: by role, section, first letter and name; most known first unless asked otherwise. */
export async function celebrityDirectory(input: { q?: unknown; role: CelebrityRole | null; creditRole: string; page?: unknown; section?: CelebritySection; sort?: CelebritySort; letter?: string }, creditNames: Record<string, string>) {
  const now = new Date()
  const page = Math.max(1, Math.min(500, Math.trunc(Number(input.page)) || 1))
  const q = normalizePersonName(String(input.q ?? '')).slice(0, 60)
  const letter = String(input.letter || '').slice(0, 2)
  const section = sectionWhere(now, input.section || '')
  const where: Prisma.CelebrityWhereInput = { AND: [
    publicWhere(now, input.role, input.creditRole),
    ...(section ? [section] : []),
    ...(q ? [{ OR: [{ normalizedName: { contains: q } }, { musicArtist: { is: { nameEn: { contains: q, mode: 'insensitive' as const } } } }] }] : []),
    ...(letter === 'en' ? [LATIN] : letter ? [{ normalizedName: { startsWith: letter } }] : []),
  ] }
  if (input.sort === 'name') {
    // A to Z on a Persian site: Persian names first, then Latin ones (the database collation would put Latin first).
    const persian: Prisma.CelebrityWhereInput = { AND: [where, { NOT: LATIN }] }, latin: Prisma.CelebrityWhereInput = { AND: [where, LATIN] }
    const [total, before] = await Promise.all([db.celebrity.count({ where }), db.celebrity.count({ where: persian })])
    const skip = (page - 1) * PAGE, orderBy: Prisma.CelebrityOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }]
    const rows = skip < before ? await db.celebrity.findMany({ where: persian, orderBy, skip, take: PAGE, select: cardSelect(now) }) : []
    if (rows.length < PAGE) rows.push(...await db.celebrity.findMany({ where: latin, orderBy, skip: Math.max(0, skip - before), take: PAGE - rows.length, select: cardSelect(now) }))
    return { q, page, pages: Math.max(1, Math.ceil(total / PAGE)), total, people: rows.map((row) => toCard(row, creditNames)) }
  }
  const orderBy: Prisma.CelebrityOrderByWithRelationInput[] = input.sort === 'new' ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ featured: 'desc' }, { score: 'desc' }, { name: 'asc' }, { id: 'asc' }]
  const [total, rows] = await Promise.all([
    db.celebrity.count({ where }),
    db.celebrity.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, select: cardSelect(now) }),
  ])
  return { q, page, pages: Math.max(1, Math.ceil(total / PAGE)), total, people: rows.map((row) => toCard(row, creditNames)) }
}

/** How many people each role and section holds (the directory's chips and figures). */
export async function celebrityCounts(creditCodes: string[]) {
  const now = new Date()
  const roles = Object.keys(CELEBRITY_ROLES) as CelebrityRole[]
  const [all, cinema, music, ...rest] = await Promise.all([
    db.celebrity.count({ where: publicWhere(now, null, '') }),
    db.celebrity.count({ where: { AND: [publicWhere(now, null, ''), sectionWhere(now, 'cinema')!] } }),
    db.celebrity.count({ where: { AND: [publicWhere(now, null, ''), sectionWhere(now, 'music')!] } }),
    ...roles.map((role) => db.celebrity.count({ where: publicWhere(now, role, '') })),
    ...creditCodes.map((code) => db.celebrity.count({ where: publicWhere(now, null, code) })),
  ])
  return { all, cinema, music, roles: Object.fromEntries(roles.map((role, index) => [role, rest[index]])) as Record<CelebrityRole, number>, credits: Object.fromEntries(creditCodes.map((code, index) => [code, rest[roles.length + index]])) as Record<string, number> }
}

/** The featured strip: the owner's featured people, else the most known. */
export async function featuredCelebrities(creditNames: Record<string, string>, take = 8) {
  const now = new Date()
  const rows = await db.celebrity.findMany({ where: publicWhere(now, null, ''), orderBy: [{ featured: 'desc' }, { score: 'desc' }, { id: 'asc' }], take, select: cardSelect(now) })
  return rows.map((row) => toCard(row, creditNames))
}

/**
 * The people someone worked with: credited on the same public films and series, singing or credited on the same
 * public songs. Most shared works first.
 */
export async function celebrityCollaborators(entry: { cinemaPersonId: number | null; musicArtistId: number | null }, creditNames: Record<string, string>, take = 12) {
  const now = new Date(), music = liveMusic()
  const people = new Map<number, number>(), artists = new Map<number, number>()
  if (entry.cinemaPersonId) {
    const titles = (await db.cinemaCredit.findMany({ where: { personId: entry.cinemaPersonId, title: liveTitle(now) }, select: { titleId: true }, take: 400 })).map((row) => row.titleId)
    if (titles.length) for (const row of await db.cinemaCredit.groupBy({ by: ['personId'], where: { titleId: { in: [...new Set(titles)] }, personId: { not: entry.cinemaPersonId } }, _count: { _all: true } })) people.set(row.personId, row._count._all)
  }
  if (entry.musicArtistId) {
    const own = (await db.musicTrack.findMany({ where: { artistId: entry.musicArtistId, ...music }, select: { id: true }, take: 400 })).map((row) => row.id)
    const credited = await db.musicCredit.findMany({ where: { artistId: entry.musicArtistId, track: music }, select: { track: { select: { id: true, artistId: true } } }, take: 400 })
    const tracks = [...new Set([...own, ...credited.map((row) => row.track.id)])]
    if (tracks.length) for (const row of await db.musicCredit.groupBy({ by: ['artistId'], where: { trackId: { in: tracks }, artistId: { not: entry.musicArtistId } }, _count: { _all: true } })) artists.set(row.artistId, (artists.get(row.artistId) || 0) + row._count._all)
    for (const row of credited) if (row.track.artistId !== entry.musicArtistId) artists.set(row.track.artistId, (artists.get(row.track.artistId) || 0) + 1)
  }
  if (!people.size && !artists.size) return []
  const rows = await db.celebrity.findMany({ where: { AND: [{ OR: [{ cinemaPersonId: { in: [...people.keys()] } }, { musicArtistId: { in: [...artists.keys()] } }] }, publicWhere(now, null, '')] }, select: { ...cardSelect(now), cinemaPersonId: true, musicArtistId: true } })
  const shared = (row: { cinemaPersonId: number | null; musicArtistId: number | null }) => (row.cinemaPersonId ? people.get(row.cinemaPersonId) || 0 : 0) + (row.musicArtistId ? artists.get(row.musicArtistId) || 0 : 0)
  return rows.sort((a, b) => shared(b) - shared(a) || a.name.localeCompare(b.name, 'fa')).slice(0, take).map((row) => ({ ...toCard(row, creditNames), shared: shared(row) }))
}

/** One person's page: the entry with the sections it draws from; null when nothing of theirs is public. */
export async function celebrityBySlug(slug: string, creditNames: Record<string, string>) {
  const now = new Date()
  const address = String(slug).slice(0, 90)
  const row = await db.celebrity.findFirst({ where: { AND: [{ OR: [{ slug: address }, { slugAliases: { some: { slug: address } } }] }, publicWhere(now, null, '')] }, select: cardSelect(now) })
  if (!row) return null
  const sources = await db.celebrity.findUnique({ where: { id: row.id }, select: { facts: true, cinemaPersonId: true, cinemaPerson: { select: { bio: true } }, musicArtist: { select: { slug: true, bio: true } } } })
  return { card: toCard(row, creditNames), cinemaPersonId: sources?.cinemaPersonId ?? null, musicSlug: sources?.musicArtist?.slug || '', cinemaBio: sources?.cinemaPerson?.bio || '', musicBio: sources?.musicArtist?.bio || '', facts: parseFacts(sources?.facts) }
}

/** The entry a section's own person page links to. */
export async function celebrityFor(source: { cinemaPersonId?: number; musicArtistId?: number }) {
  if (!source.cinemaPersonId && !source.musicArtistId) return null
  return db.celebrity.findFirst({ where: source.cinemaPersonId ? { cinemaPersonId: source.cinemaPersonId } : { musicArtistId: source.musicArtistId }, select: { slug: true, cinemaPersonId: true, musicArtistId: true } }).catch(() => null)
}

// ------------------------------------------------------------------ management

export { CelebrityError } from './errors'
import { CelebrityError } from './errors'

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
      tx.celebrity.findUnique({ where: { id: otherId }, select: { id: true, slug: true, cinemaPersonId: true, musicArtistId: true } }),
    ])
    if (!target || !other) throw new CelebrityError('چهره پیدا نشد')
    const cinemaPersonId = target.cinemaPersonId ?? other.cinemaPersonId, musicArtistId = target.musicArtistId ?? other.musicArtistId
    if ((target.cinemaPersonId && other.cinemaPersonId) || (target.musicArtistId && other.musicArtistId)) throw new CelebrityError('هر دو چهره در یک بخش هستند؛ ادغام در همان بخش انجام می‌شود')
    await tx.celebritySlugAlias.updateMany({ where: { celebrityId: other.id }, data: { celebrityId: target.id } })
    await tx.celebrity.delete({ where: { id: other.id } })
    await tx.celebritySlugAlias.create({ data: { slug: other.slug, celebrityId: target.id } })
    return tx.celebrity.update({ where: { id: target.id }, data: { cinemaPersonId, musicArtistId, keepApart: false } })
  }, { isolationLevel: 'Serializable' })
}

export { celebrityProfile, saveCelebrityProfile } from './celebrities/profile'
export { celebrityImportState, restoreCelebrityImportState, type CelebrityImportState } from './celebrities/import-state'

/** The person's single page address when it shows something (a section's own person page sends visitors there). */
/** Everyone with a public page, for the sitemap. */
export function publicCelebrities(now = new Date(), take = 5000) {
  return db.celebrity.findMany({ where: publicWhere(now, null, ''), select: { slug: true, updatedAt: true, musicArtistId: true, cinemaPersonId: true }, take })
}

export async function publicCelebritySlug(source: { cinemaPersonId?: number; musicArtistId?: number }) {
  if (!source.cinemaPersonId && !source.musicArtistId) return null
  const row = await db.celebrity.findFirst({ where: { AND: [source.cinemaPersonId ? { cinemaPersonId: source.cinemaPersonId } : { musicArtistId: source.musicArtistId }, publicWhere(new Date(), null, '')] }, select: { slug: true } }).catch(() => null)
  return row?.slug ?? null
}

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
