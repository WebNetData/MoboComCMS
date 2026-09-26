import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { validateCover } from '@/shared/content/cover'
import { cleanRichText } from '@/shared/content/sanitize'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { cleanLinks, cleanRecords, cleanRequirements, joinList, slugOf, type LinkOwner } from '@/modules/media/domain/media'
import { normalizeAccess, parsePerks } from '@/modules/membership/domain/membership'

/**
 * One admin CRUD endpoint for every media/VIP resource:
 *   /api/admin/media-library?type=music-tracks | music-albums | music-artists | music-playlists | cinema-titles | games | vip-plans
 * Each resource declares its module, permissions and how a request body becomes row data.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
type Input = Record<string, unknown>
type Resource = {
  module: string
  perms: string[]
  delegate: (tx: Tx | typeof db) => any
  orderBy: Record<string, 'asc' | 'desc'>[] | Record<string, 'asc' | 'desc'>
  include?: Record<string, unknown>
  parse: (body: Input, existing: Record<string, any> | null) => Promise<Input> | Input
  /** Nested data saved in the same transaction (links, seasons…). */
  afterSave?: (tx: Tx, id: number, body: Input) => Promise<void>
  /** Extra fields for the admin form (links, seasons…). */
  expand?: (rows: any[]) => Promise<any[]>
  onDelete?: (tx: Tx, id: number) => Promise<void>
  label: (row: Record<string, any>) => string
}

const text = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number | null = null) => {
  if (value === '' || value === null || value === undefined) return fallback
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`عدد نامعتبر / Invalid number: ${value}`)
  return n
}
const float = (value: unknown, min: number, max: number) => {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`عدد نامعتبر / Invalid number: ${value}`)
  return Math.round(n * 10) / 10
}
const bool = (value: unknown) => value === true || value === 'true' || value === 'on'
const status = (value: unknown) => (value === 'DRAFT' ? 'DRAFT' : 'PUBLISHED')
const date = (value: unknown) => {
  if (!value) return null
  const d = new Date(String(value))
  if (!Number.isFinite(d.getTime())) throw new Error('تاریخ نامعتبر / Invalid date')
  return d
}
/** Audio/image/file URL: site path or http(s). */
const mediaUrl = (value: unknown) => {
  const url = text(value, 2000)
  if (!url) return ''
  if (/^\/(?!\/)[^\s<>\\]*$/.test(url)) return url
  try { if (['http:', 'https:'].includes(new URL(url).protocol) && !/[\s<>\\]/.test(url)) return url } catch { /* invalid */ }
  throw new Error(`نشانی نامعتبر / Invalid URL: ${url.slice(0, 60)}`)
}
const html = (value: unknown, max = 60000) => cleanRichText(String(value ?? '').slice(0, max))

/** Only keys present in the body are updated (PATCH semantics). */
function pickDefined(input: Input): Input {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}
const has = (body: Input, key: string) => Object.prototype.hasOwnProperty.call(body, key)
const when = <T>(body: Input, key: string, fn: (value: unknown) => T): T | undefined => (has(body, key) ? fn(body[key]) : undefined)

async function saveLinks(tx: Tx, ownerType: LinkOwner, ownerId: number, input: unknown) {
  const links = cleanLinks(input)
  await tx.mediaLink.deleteMany({ where: { ownerType, ownerId } })
  if (links.length) await tx.mediaLink.createMany({ data: links.map((link) => ({ ...link, ownerType, ownerId })) })
}

async function linksFor(ownerType: LinkOwner, ids: number[]) {
  if (!ids.length) return new Map<number, any[]>()
  const rows = await db.mediaLink.findMany({ where: { ownerType, ownerId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  const map = new Map<number, any[]>()
  for (const row of rows) map.set(row.ownerId, [...(map.get(row.ownerId) || []), { label: row.label, kind: row.kind, quality: row.quality, size: row.size, audio: row.audio, subtitle: row.subtitle, url: row.url, access: row.access, sortOrder: row.sortOrder }])
  return map
}

const RESOURCES: Record<string, Resource> = {
  'music-artists': {
    module: 'music', perms: ['music.manage', 'cms.posts'],
    delegate: (t) => t.musicArtist, orderBy: { id: 'desc' },
    label: (row) => row.name,
    parse: (b, existing) => pickDefined({
      slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.nameEn || b.name)),
      name: when(b, 'name', (v) => text(v, 160)),
      nameEn: when(b, 'nameEn', (v) => text(v, 160)),
      bio: when(b, 'bio', (v) => html(v, 20000)),
      image: when(b, 'image', validateCover),
      cover: when(b, 'cover', validateCover),
      featured: when(b, 'featured', bool),
    }),
  },
  'music-albums': {
    module: 'music', perms: ['music.manage', 'cms.posts'],
    delegate: (t) => t.musicAlbum, orderBy: { publishedAt: 'desc' }, include: { artist: { select: { name: true } } },
    label: (row) => row.title,
    parse: async (b, existing) => {
      const artistId = when(b, 'artistId', (v) => int(v, 1, 2 ** 31 - 1))
      if (!existing && !artistId) throw new Error('هنرمند را انتخاب کنید / Choose an artist')
      return pickDefined({
        slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.titleEn || b.title)),
        title: when(b, 'title', (v) => text(v, 200)),
        titleEn: when(b, 'titleEn', (v) => text(v, 200)),
        artistId: artistId ?? undefined,
        cover: when(b, 'cover', validateCover),
        year: when(b, 'year', (v) => int(v, 1900, 2100)),
        genre: when(b, 'genre', (v) => joinList(v, 6)),
        description: when(b, 'description', (v) => html(v, 20000)),
        access: when(b, 'access', normalizeAccess),
        status: when(b, 'status', status),
        featured: when(b, 'featured', bool),
        publishedAt: when(b, 'publishedAt', (v) => date(v) || new Date()),
      })
    },
  },
  'music-tracks': {
    module: 'music', perms: ['music.manage', 'cms.posts'],
    delegate: (t) => t.musicTrack, orderBy: { publishedAt: 'desc' }, include: { artist: { select: { name: true } }, album: { select: { title: true } } },
    label: (row) => row.title,
    parse: (b, existing) => {
      const artistId = when(b, 'artistId', (v) => int(v, 1, 2 ** 31 - 1))
      if (!existing && !artistId) throw new Error('هنرمند را انتخاب کنید / Choose an artist')
      return pickDefined({
        slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(`${b.titleEn || b.title}-${Date.now().toString(36).slice(-4)}`)),
        title: when(b, 'title', (v) => text(v, 200)),
        titleEn: when(b, 'titleEn', (v) => text(v, 200)),
        artistId: artistId ?? undefined,
        albumId: when(b, 'albumId', (v) => int(v, 1, 2 ** 31 - 1)),
        trackNo: when(b, 'trackNo', (v) => int(v, 0, 999, 0) ?? 0),
        cover: when(b, 'cover', validateCover),
        audioUrl: when(b, 'audioUrl', mediaUrl),
        audioHqUrl: when(b, 'audioHqUrl', mediaUrl),
        duration: when(b, 'duration', (v) => int(v, 0, 36000, 0) ?? 0),
        genre: when(b, 'genre', (v) => joinList(v, 6)),
        lyrics: when(b, 'lyrics', (v) => text(v, 20000)),
        access: when(b, 'access', normalizeAccess),
        status: when(b, 'status', status),
        featured: when(b, 'featured', bool),
        publishedAt: when(b, 'publishedAt', (v) => date(v) || new Date()),
      })
    },
  },
  'music-playlists': {
    module: 'music', perms: ['music.manage', 'cms.posts'],
    delegate: (t) => t.musicPlaylist, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    label: (row) => row.title,
    parse: (b, existing) => pickDefined({
      slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.titleEn || b.title || `playlist-${Date.now().toString(36)}`)),
      title: when(b, 'title', (v) => text(v, 200)),
      titleEn: when(b, 'titleEn', (v) => text(v, 200)),
      cover: when(b, 'cover', validateCover),
      description: when(b, 'description', (v) => text(v, 2000)),
      trackIds: when(b, 'trackIds', (v) => JSON.stringify((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200))),
      access: when(b, 'access', normalizeAccess),
      status: when(b, 'status', status),
      featured: when(b, 'featured', bool),
      sortOrder: when(b, 'sortOrder', (v) => int(v, -9999, 9999, 0) ?? 0),
    }),
    expand: async (rows) => rows.map((row) => ({ ...row, trackIds: (() => { try { return (JSON.parse(row.trackIds || '[]') as number[]).map(String) } catch { return [] } })() })),
  },
  'cinema-titles': {
    module: 'cinema', perms: ['cinema.manage', 'cms.posts'],
    delegate: (t) => t.cinemaTitle, orderBy: { publishedAt: 'desc' },
    label: (row) => row.title,
    parse: (b, existing) => pickDefined({
      slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.titleEn || b.originalTitle || b.title)),
      kind: when(b, 'kind', (v) => (v === 'SERIES' ? 'SERIES' : 'MOVIE')),
      title: when(b, 'title', (v) => text(v, 200)),
      titleEn: when(b, 'titleEn', (v) => text(v, 200)),
      originalTitle: when(b, 'originalTitle', (v) => text(v, 200)),
      poster: when(b, 'poster', validateCover),
      backdrop: when(b, 'backdrop', validateCover),
      year: when(b, 'year', (v) => int(v, 1880, 2100)),
      endYear: when(b, 'endYear', (v) => int(v, 1880, 2100)),
      imdbRating: when(b, 'imdbRating', (v) => float(v, 0, 10)),
      imdbId: when(b, 'imdbId', (v) => text(v, 20).replace(/[^a-z0-9]/gi, '')),
      runtime: when(b, 'runtime', (v) => int(v, 0, 1000, 0) ?? 0),
      ageRating: when(b, 'ageRating', (v) => text(v, 20)),
      countries: when(b, 'countries', (v) => joinList(v, 10)),
      languages: when(b, 'languages', (v) => joinList(v, 10)),
      genres: when(b, 'genres', (v) => joinList(v, 10)),
      director: when(b, 'director', (v) => text(v, 200)),
      cast: when(b, 'cast', (v) => JSON.stringify(cleanRecords(v, ['name', 'role', 'image'], 40, 300))),
      summary: when(b, 'summary', (v) => text(v, 6000)),
      summaryEn: when(b, 'summaryEn', (v) => text(v, 6000)),
      trailerUrl: when(b, 'trailerUrl', mediaUrl),
      quality: when(b, 'quality', (v) => text(v, 60)),
      dubbed: when(b, 'dubbed', bool),
      subtitle: when(b, 'subtitle', bool),
      seriesStatus: when(b, 'seriesStatus', (v) => (v === 'ENDED' ? 'ENDED' : v === 'ONGOING' ? 'ONGOING' : '')),
      access: when(b, 'access', normalizeAccess),
      status: when(b, 'status', status),
      featured: when(b, 'featured', bool),
      publishedAt: when(b, 'publishedAt', (v) => date(v) || new Date()),
    }),
    afterSave: async (tx, id, b) => {
      if (has(b, 'links')) await saveLinks(tx, 'title', id, b.links)
      if (!has(b, 'seasons')) return
      const seasons = Array.isArray(b.seasons) ? b.seasons.slice(0, 60) : []
      // Replace the season/episode tree; episode links are rebuilt with it.
      const old = await tx.cinemaSeason.findMany({ where: { titleId: id }, select: { episodes: { select: { id: true } } } })
      const oldEpisodes = old.flatMap((season: { episodes: { id: number }[] }) => season.episodes.map((episode) => episode.id))
      if (oldEpisodes.length) await tx.mediaLink.deleteMany({ where: { ownerType: 'episode', ownerId: { in: oldEpisodes } } })
      await tx.cinemaSeason.deleteMany({ where: { titleId: id } })
      const seenSeasons = new Set<number>()
      for (const [index, raw] of seasons.entries()) {
        const s = (raw && typeof raw === 'object' ? raw : {}) as Input
        const number = int(s.number, 0, 999, index + 1) ?? index + 1
        if (seenSeasons.has(number)) throw new Error(`فصل تکراری / Duplicate season ${number}`)
        seenSeasons.add(number)
        const season = await tx.cinemaSeason.create({ data: { titleId: id, number, name: text(s.name, 120), poster: s.poster ? validateCover(s.poster) : '' } })
        const episodes = Array.isArray(s.episodes) ? s.episodes.slice(0, 200) : []
        const seenEpisodes = new Set<number>()
        for (const [epIndex, epRaw] of episodes.entries()) {
          const e = (epRaw && typeof epRaw === 'object' ? epRaw : {}) as Input
          const epNumber = int(e.number, 0, 9999, epIndex + 1) ?? epIndex + 1
          if (seenEpisodes.has(epNumber)) throw new Error(`قسمت تکراری / Duplicate episode ${number}x${epNumber}`)
          seenEpisodes.add(epNumber)
          const episode = await tx.cinemaEpisode.create({ data: {
            seasonId: season.id, number: epNumber, title: text(e.title, 200), titleEn: text(e.titleEn, 200), summary: text(e.summary, 3000),
            still: e.still ? validateCover(e.still) : '', runtime: int(e.runtime, 0, 1000, 0) ?? 0, airDate: date(e.airDate), access: normalizeAccess(e.access),
          } })
          if (e.links) await saveLinks(tx, 'episode', episode.id, e.links)
        }
      }
    },
    onDelete: async (tx, id) => {
      const seasons = await tx.cinemaSeason.findMany({ where: { titleId: id }, select: { episodes: { select: { id: true } } } })
      const episodes = seasons.flatMap((season: { episodes: { id: number }[] }) => season.episodes.map((episode) => episode.id))
      await tx.mediaLink.deleteMany({ where: { OR: [{ ownerType: 'title', ownerId: id }, ...(episodes.length ? [{ ownerType: 'episode', ownerId: { in: episodes } }] : [])] } })
    },
    expand: async (rows) => {
      const ids = rows.map((row) => row.id)
      const [links, seasons] = await Promise.all([
        linksFor('title', ids),
        db.cinemaSeason.findMany({ where: { titleId: { in: ids } }, orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } }),
      ])
      const episodeLinks = await linksFor('episode', seasons.flatMap((season) => season.episodes.map((episode) => episode.id)))
      return rows.map((row) => ({
        ...row,
        cast: (() => { try { return JSON.parse(row.cast || '[]') } catch { return [] } })(),
        links: links.get(row.id) || [],
        seasons: seasons.filter((season) => season.titleId === row.id).map((season) => ({
          number: season.number, name: season.name, poster: season.poster,
          episodes: season.episodes.map((episode) => ({ ...episode, airDate: episode.airDate ? episode.airDate.toISOString().slice(0, 10) : '', links: episodeLinks.get(episode.id) || [] })),
        })),
      }))
    },
  },
  games: {
    module: 'games', perms: ['games.manage', 'cms.posts'],
    delegate: (t) => t.gameTitle, orderBy: { publishedAt: 'desc' },
    label: (row) => row.title,
    parse: (b, existing) => pickDefined({
      slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.titleEn || b.title)),
      title: when(b, 'title', (v) => text(v, 200)),
      titleEn: when(b, 'titleEn', (v) => text(v, 200)),
      cover: when(b, 'cover', validateCover),
      backdrop: when(b, 'backdrop', validateCover),
      platforms: when(b, 'platforms', (v) => joinList(v, 12)),
      genres: when(b, 'genres', (v) => joinList(v, 8)),
      developer: when(b, 'developer', (v) => text(v, 160)),
      publisher: when(b, 'publisher', (v) => text(v, 160)),
      releaseDate: when(b, 'releaseDate', date),
      score: when(b, 'score', (v) => int(v, 0, 100)),
      userScore: when(b, 'userScore', (v) => float(v, 0, 10)),
      ageRating: when(b, 'ageRating', (v) => text(v, 20)),
      trailerUrl: when(b, 'trailerUrl', mediaUrl),
      screenshots: when(b, 'screenshots', (v) => JSON.stringify(cleanRecords(v, ['src'], 30, 2048).map((shot) => ({ src: validateCover(shot.src) })))),
      summary: when(b, 'summary', (v) => text(v, 3000)),
      content: when(b, 'content', (v) => html(v)),
      pros: when(b, 'pros', (v) => JSON.stringify(cleanRecords(v, ['text'], 20, 300))),
      cons: when(b, 'cons', (v) => JSON.stringify(cleanRecords(v, ['text'], 20, 300))),
      requirements: when(b, 'requirements', (v) => JSON.stringify(cleanRequirements(v))),
      access: when(b, 'access', normalizeAccess),
      status: when(b, 'status', status),
      featured: when(b, 'featured', bool),
      publishedAt: when(b, 'publishedAt', (v) => date(v) || new Date()),
    }),
    afterSave: async (tx, id, b) => { if (has(b, 'links')) await saveLinks(tx, 'game', id, b.links) },
    onDelete: async (tx, id) => { await tx.mediaLink.deleteMany({ where: { ownerType: 'game', ownerId: id } }) },
    expand: async (rows) => {
      const links = await linksFor('game', rows.map((row) => row.id))
      const json = (value: string, fallback: unknown) => { try { return JSON.parse(value) } catch { return fallback } }
      return rows.map((row) => ({
        ...row,
        releaseDate: row.releaseDate ? new Date(row.releaseDate).toISOString().slice(0, 10) : '',
        screenshots: json(row.screenshots, []), pros: json(row.pros, []), cons: json(row.cons, []), requirements: json(row.requirements, { min: {}, rec: {} }),
        links: links.get(row.id) || [],
      }))
    },
  },
  'vip-plans': {
    module: 'membership', perms: ['membership.manage', 'plans.manage'],
    delegate: (t) => t.membershipPlan, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    label: (row) => row.name,
    parse: (b, existing) => {
      const currency = normalizeCurrency(has(b, 'currency') ? b.currency : existing?.currency || 'USD')
      const out: Input = pickDefined({
        slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.nameEn || `vip-${b.days || ''}`)),
        name: when(b, 'name', (v) => text(v, 120)),
        nameEn: when(b, 'nameEn', (v) => text(v, 120)),
        description: when(b, 'description', (v) => text(v, 1000)),
        descriptionEn: when(b, 'descriptionEn', (v) => text(v, 1000)),
        days: when(b, 'days', (v) => int(v, 1, 3650)),
        currency: has(b, 'currency') ? currency : undefined,
        perks: when(b, 'perks', (v) => JSON.stringify(parsePerks(typeof v === 'string' ? v : JSON.stringify(v)))),
        highlight: when(b, 'highlight', bool),
        active: when(b, 'active', bool),
        sortOrder: when(b, 'sortOrder', (v) => int(v, -9999, 9999, 0) ?? 0),
      })
      if (has(b, 'price')) {
        const priceMinor = toMinor(String(b.price || '0'), currency)
        if (priceMinor <= 0n) throw new Error('قیمت باید بیشتر از صفر باشد / Price must be positive')
        out.priceMinor = priceMinor
      }
      if (!existing && (!out.days || !out.priceMinor || !out.name)) throw new Error('نام، مدت و قیمت لازم است / Name, days and price are required')
      return out
    },
    expand: async (rows) => rows.map((row) => ({ ...row, price: legacyNumber(row.priceMinor, row.currency), priceMinor: undefined, perks: (() => { try { return JSON.parse(row.perks || '[]') } catch { return [] } })() })),
  },
}

async function authorize(req: NextRequest, resource: Resource) {
  for (const perm of resource.perms) {
    const admin = await requirePerm(req, perm)
    if (admin) return admin
  }
  return null
}

function resourceOf(req: NextRequest): [string, Resource] | null {
  const type = String(req.nextUrl.searchParams.get('type') || '')
  return RESOURCES[type] ? [type, RESOURCES[type]] : null
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Invalid input'
  if (/Unique constraint/i.test(message)) return err('این نشانی (slug) قبلاً استفاده شده / This slug is already used', 409)
  if (/Foreign key/i.test(message)) return err('مورد مرتبط پیدا نشد / Related item not found', 400)
  return err(message.slice(0, 300))
}

export async function GET(req: NextRequest) {
  const found = resourceOf(req)
  if (!found) return err('Unknown resource', 404)
  const [, resource] = found
  const off = await moduleGuard(resource.module)
  if (off) return off
  if (!await authorize(req, resource)) return err('forbidden', 403)
  const rows = await resource.delegate(db).findMany({ orderBy: resource.orderBy, include: resource.include, take: 1000 })
  return ok(resource.expand ? await resource.expand(rows) : rows)
}

async function write(req: NextRequest, mode: 'create' | 'update') {
  const found = resourceOf(req)
  if (!found) return err('Unknown resource', 404)
  const [type, resource] = found
  const off = await moduleGuard(resource.module)
  if (off) return off
  const admin = await authorize(req, resource)
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) as Input | null
  if (!body || typeof body !== 'object') return err('Invalid body')
  const id = mode === 'update' ? Number(body.id) : 0
  if (mode === 'update' && (!Number.isSafeInteger(id) || id <= 0)) return err('invalid id')
  try {
    const existing = mode === 'update' ? await resource.delegate(db).findUnique({ where: { id } }) : null
    if (mode === 'update' && !existing) return err('not found', 404)
    const data = await resource.parse(body, existing)
    const row = await db.$transaction(async (tx) => {
      const saved = mode === 'create' ? await resource.delegate(tx).create({ data }) : await resource.delegate(tx).update({ where: { id }, data })
      if (resource.afterSave) await resource.afterSave(tx, saved.id, body)
      return saved
    }, { timeout: 30_000 })
    await auditAdmin({ req, actor: admin, action: `media.${type}.${mode}`, targetType: type, targetId: row.id, metadata: { label: resource.label(row) } })
    return ok({ id: row.id, slug: row.slug }, mode === 'create' ? 201 : 200)
  } catch (error) {
    return failure(error)
  }
}

export const POST = (req: NextRequest) => write(req, 'create')
export const PATCH = (req: NextRequest) => write(req, 'update')

export async function DELETE(req: NextRequest) {
  const found = resourceOf(req)
  if (!found) return err('Unknown resource', 404)
  const [type, resource] = found
  const admin = await authorize(req, resource)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid id')
  try {
    const row = await db.$transaction(async (tx) => {
      if (resource.onDelete) await resource.onDelete(tx, id)
      return resource.delegate(tx).delete({ where: { id } })
    })
    await auditAdmin({ req, actor: admin, action: `media.${type}.delete`, targetType: type, targetId: id, metadata: { label: resource.label(row) } })
    return ok({ deleted: true })
  } catch (error) {
    return failure(error)
  }
}
