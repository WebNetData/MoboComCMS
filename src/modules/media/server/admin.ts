import { NextRequest } from 'next/server'
import { MEDIA_RESOURCE_TYPE, contentChanged } from '@/modules/content/server/events'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { validateCover } from '@/shared/content/cover'
import { cleanRichText } from '@/shared/content/sanitize'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { cleanLinks, cleanRecords, cleanRequirements, joinList, normalizeLicense, slugOf, type LinkOwner } from '@/modules/media/domain/media'
import { PRICED_LINK_OWNERS, normalizeLinkPrice } from '@/modules/paywall/domain/paywall'
import { GAME_MODES, LOCALIZATIONS, cleanReleases, cleanStoreLinks, normalizeCodes } from '@/modules/games/domain/games'
import { normalizeAccess, parsePerks } from '@/modules/membership/domain/membership'
import { assignTerms, assignmentsFor, recount, removeOwner } from '@/modules/taxonomy/server/taxonomy'
import type { Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import { bulkSameOrigin, readBulkInput } from '@/modules/content/server/bulk'
import { publicPathFor, queueIndexNow } from '@/modules/seo/server/indexnow'
import { adminPageParams, adminPageSlice } from '@/modules/content/domain/admin-pagination'
import { scheduleTrackRelease } from '@/modules/music/server/release-notifications'
import { currentSoftwareVersions, projectSoftwareVersion } from '@/modules/software/server/current-version'
import { resolveStudioId } from '@/modules/studios/server/identity'
import { scheduleStudioPublication } from '@/modules/studios/server/publication-notifications'

/**
 * One admin CRUD endpoint for every media/VIP resource:
 *   /api/admin/media-library?type=music-tracks | music-albums | music-artists | music-playlists | cinema-titles | games | software | vip-plans
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
  /** Section taxonomy the items are filed under (`terms` in the form). */
  taxonomy?: Taxonomy
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

/**
 * Reconciles links by URL instead of replacing them, so an edited item keeps
 * its link ids — and with them click counts, broken-link reports and the
 * disabled flag set by link or copyright moderation.
 */
async function saveLinks(tx: Tx, ownerType: LinkOwner, ownerId: number, input: unknown) {
  const links = cleanLinks(input)
  const prices = linkPriceInputs(input, ownerType)
  const existing = await tx.mediaLink.findMany({ where: { ownerType, ownerId }, orderBy: { id: 'asc' } })
  const unused = [...existing]
  for (const link of links) {
    const index = unused.findIndex((row) => row.url === link.url)
    let id: number
    if (index >= 0) {
      const [row] = unused.splice(index, 1)
      await tx.mediaLink.update({ where: { id: row.id }, data: link })
      id = row.id
    } else {
      id = (await tx.mediaLink.create({ data: { ...link, ownerType, ownerId } })).id
    }
    if (prices.has(link.url)) await saveLinkPrice(tx, id, prices.get(link.url) || null)
  }
  if (unused.length) {
    await tx.mediaLink.deleteMany({ where: { id: { in: unused.map((row) => row.id) } } })
    await tx.paidItem.deleteMany({ where: { ownerType: 'link', ownerId: { in: unused.map((row) => row.id) } } })
  }
}

/**
 * Own prices typed on link rows (url → price). Only rows that carry a `price`
 * key are touched; only titles, games and software keep stable link ids, so
 * only their links can be sold on their own.
 */
function linkPriceInputs(input: unknown, ownerType: LinkOwner) {
  const out = new Map<string, ReturnType<typeof normalizeLinkPrice>>()
  if (!(PRICED_LINK_OWNERS as readonly string[]).includes(ownerType) || !Array.isArray(input)) return out
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || !('price' in raw)) continue
    const row = raw as Record<string, unknown>
    try { out.set(String(row.url || '').trim().slice(0, 2000), normalizeLinkPrice(row)) } catch (error) {
      throw new Error(`قیمت لینک «${String(row.label || row.quality || row.url).slice(0, 40)}»: ${error instanceof Error ? error.message : 'نامعتبر'}`)
    }
  }
  return out
}

async function saveLinkPrice(tx: Tx, linkId: number, rule: ReturnType<typeof normalizeLinkPrice>) {
  if (!rule) { await tx.paidItem.deleteMany({ where: { ownerType: 'link', ownerId: linkId } }); return }
  await tx.paidItem.upsert({ where: { ownerType_ownerId: { ownerType: 'link', ownerId: linkId } }, create: { ownerType: 'link', ownerId: linkId, ...rule }, update: rule })
}

async function linksFor(ownerType: LinkOwner, ids: number[]) {
  if (!ids.length) return new Map<number, any[]>()
  const rows = await db.mediaLink.findMany({ where: { ownerType, ownerId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  const priced = (PRICED_LINK_OWNERS as readonly string[]).includes(ownerType) && rows.length
    ? new Map((await db.paidItem.findMany({ where: { ownerType: 'link', ownerId: { in: rows.map((row) => row.id) } } })).map((rule) => [rule.ownerId, rule]))
    : new Map()
  const map = new Map<number, any[]>()
  for (const row of rows) {
    const rule = priced.get(row.id)
    const price = rule ? { price: rule.priceMinor.toString(), priceVip: rule.vipAccess === 'NONE' ? 'NONE' : 'FREE', sales: rule.sales } : {}
    map.set(row.ownerId, [...(map.get(row.ownerId) || []), { id: row.id, label: row.label, kind: row.kind, quality: row.quality, size: row.size, audio: row.audio, subtitle: row.subtitle, url: row.url, access: row.access, sortOrder: row.sortOrder, disabled: row.disabled, clicks: row.clicks, ...price }])
  }
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
    taxonomy: 'music', module: 'music', perms: ['music.manage', 'cms.posts'],
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
    taxonomy: 'cinema', module: 'cinema', perms: ['cinema.manage', 'cms.posts'],
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
    taxonomy: 'games', module: 'games', perms: ['games.manage', 'cms.posts'],
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
      franchiseId: when(b, 'franchiseId', (v) => int(v, 1, 2_000_000_000)),
      engine: when(b, 'engine', (v) => text(v, 80)),
      modes: when(b, 'modes', (v) => normalizeCodes(v, GAME_MODES)),
      localization: when(b, 'localization', (v) => normalizeCodes(v, LOCALIZATIONS)),
      releases: when(b, 'releases', (v) => JSON.stringify(cleanReleases(v))),
      playMain: when(b, 'playMain', (v) => int(v, 0, 20000, 0) ?? 0),
      playExtra: when(b, 'playExtra', (v) => int(v, 0, 20000, 0) ?? 0),
      playComplete: when(b, 'playComplete', (v) => int(v, 0, 20000, 0) ?? 0),
      storeLinks: when(b, 'storeLinks', (v) => JSON.stringify(cleanStoreLinks(v))),
      gameSize: when(b, 'gameSize', (v) => text(v, 40)),
      version: when(b, 'version', (v) => text(v, 60)),
      verdict: when(b, 'verdict', (v) => text(v, 240)),
      editorsChoice: when(b, 'editorsChoice', bool),
      seoTitle: when(b, 'seoTitle', (v) => text(v, 120)),
      seoDescription: when(b, 'seoDescription', (v) => text(v, 320)),
    }),
    afterSave: async (tx, id, b) => { if (has(b, 'links')) await saveLinks(tx, 'game', id, b.links) },
    onDelete: async (tx, id) => {
      const updates = (await tx.gameUpdate.findMany({ where: { gameId: id }, select: { id: true } })).map((row) => row.id)
      await tx.mediaLink.deleteMany({ where: { OR: [{ ownerType: 'game', ownerId: id }, ...(updates.length ? [{ ownerType: 'gameupdate', ownerId: { in: updates } }] : [])] } })
    },
    expand: async (rows) => {
      const links = await linksFor('game', rows.map((row) => row.id))
      const json = (value: string, fallback: unknown) => { try { return JSON.parse(value) } catch { return fallback } }
      return rows.map((row) => ({
        ...row,
        releaseDate: row.releaseDate ? new Date(row.releaseDate).toISOString().slice(0, 10) : '',
        screenshots: json(row.screenshots, []), pros: json(row.pros, []), cons: json(row.cons, []), requirements: json(row.requirements, { min: {}, rec: {} }),
        releases: json(row.releases, []), storeLinks: json(row.storeLinks, []),
        links: links.get(row.id) || [],
      }))
    },
  },
  software: {
    taxonomy: 'software', module: 'software', perms: ['software.manage', 'cms.posts'],
    delegate: (t) => t.softwareTitle, orderBy: { updatedAt: 'desc' },
    label: (row) => row.title,
    parse: (b, existing) => pickDefined({
      slug: when(b, 'slug', (v) => slugOf(v)) ?? (existing ? undefined : slugOf(b.titleEn || b.title)),
      title: when(b, 'title', (v) => text(v, 200)),
      titleEn: when(b, 'titleEn', (v) => text(v, 200)),
      icon: when(b, 'icon', validateCover),
      cover: when(b, 'cover', validateCover),
      version: when(b, 'version', (v) => text(v, 60)),
      developer: when(b, 'developer', (v) => text(v, 160)),
      publisher: when(b, 'publisher', (v) => text(v, 160)),
      license: when(b, 'license', normalizeLicense),
      platforms: when(b, 'platforms', (v) => joinList(v, 8)),
      category: when(b, 'category', (v) => text(v, 60)),
      size: when(b, 'size', (v) => text(v, 40)),
      website: when(b, 'website', mediaUrl),
      requirements: when(b, 'requirements', (v) => text(v, 2000)),
      screenshots: when(b, 'screenshots', (v) => JSON.stringify(cleanRecords(v, ['src'], 30, 2048).map((shot) => ({ src: validateCover(shot.src) })))),
      summary: when(b, 'summary', (v) => text(v, 3000)),
      content: when(b, 'content', (v) => html(v)),
      changelog: when(b, 'changelog', (v) => html(v, 20000)),
      features: when(b, 'features', (v) => html(v, 20000)),
      installGuide: when(b, 'installGuide', (v) => html(v, 20000)),
      archivePassword: when(b, 'archivePassword', (v) => text(v, 60)),
      access: when(b, 'access', normalizeAccess),
      status: when(b, 'status', status),
      featured: when(b, 'featured', bool),
      releasedAt: when(b, 'releasedAt', date),
      publishedAt: when(b, 'publishedAt', (v) => date(v) || new Date()),
    }),
    afterSave: async (tx, id, b) => { if (has(b, 'links')) await saveLinks(tx, 'software', id, b.links) },
    onDelete: async (tx, id) => {
      const releases = await tx.softwareRelease.findMany({ where: { softwareId: id }, select: { id: true } })
      await tx.mediaLink.deleteMany({ where: { OR: [{ ownerType: 'software', ownerId: id }, ...(releases.length ? [{ ownerType: 'softwarerelease', ownerId: { in: releases.map((row) => row.id) } }] : [])] } })
    },
    expand: async (rows) => {
      const links = await linksFor('software', rows.map((row) => row.id))
      const versions = await currentSoftwareVersions(rows.map((row) => row.id))
      const json = (value: string, fallback: unknown) => { try { return JSON.parse(value) } catch { return fallback } }
      return rows.map((source) => { const row = projectSoftwareVersion(source, versions); return { ...row, releasedAt: row.releasedAt ? new Date(row.releasedAt).toISOString().slice(0, 10) : '', screenshots: json(row.screenshots, []), links: links.get(row.id) || [] } })
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

const PUBLISHABLE = new Set(['music-albums', 'music-tracks', 'music-playlists', 'cinema-titles', 'games', 'software'])

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
  const [type, resource] = found
  const off = await moduleGuard(resource.module)
  if (off) return off
  if (!await authorize(req, resource)) return err('forbidden', 403)
  const one = Number(req.nextUrl.searchParams.get('id'))
  const offset = Number(req.nextUrl.searchParams.get('skip') || 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) return err('invalid offset', 400)
  const paged = req.nextUrl.searchParams.get('paged') === '1' && !(Number.isSafeInteger(one) && one > 0)
  let pageInfo: ReturnType<typeof adminPageParams> | null = null
  if (paged) {
    try { pageInfo = adminPageParams(req.nextUrl.searchParams) } catch (error) { return err(error instanceof Error ? error.message : 'invalid page', 400) }
  }
  const searchFields: Record<string, string[]> = {
    'music-artists': ['name', 'nameEn', 'slug'],
    'music-albums': ['title', 'titleEn', 'slug'],
    'music-tracks': ['title', 'titleEn', 'slug'],
    'music-playlists': ['title', 'titleEn', 'slug'],
    'cinema-titles': ['title', 'titleEn', 'originalTitle', 'slug'],
    games: ['title', 'titleEn', 'slug'],
    software: ['title', 'titleEn', 'slug'],
    'vip-plans': ['name', 'nameEn', 'slug'],
  }
  const where = Number.isSafeInteger(one) && one > 0 ? { id: one } : pageInfo?.query ? { OR: searchFields[type].map((field) => ({ [field]: { contains: pageInfo.query, mode: 'insensitive' } })) } : undefined
  const total = pageInfo ? await resource.delegate(db).count({ where }) as number : 0
  const slice = pageInfo ? adminPageSlice(total, pageInfo.page, pageInfo.size) : null
  const orderBy = Array.isArray(resource.orderBy) || 'id' in resource.orderBy ? resource.orderBy : [resource.orderBy, { id: 'desc' as const }]
  const rows = await resource.delegate(db).findMany({ ...(where ? { where } : {}), orderBy, include: resource.include, skip: slice?.skip ?? offset, ...(slice ? slice.take ? { take: slice.take } : {} : { take: 1000 }) })
  const expanded = resource.expand ? await resource.expand(rows) : rows
  const terms = resource.taxonomy ? await assignmentsFor(resource.taxonomy, expanded.map((row: { id: number }) => row.id)) : null
  const result = terms ? expanded.map((row: { id: number }) => ({ ...row, terms: terms.get(row.id) || { ids: [], primary: null } })) : expanded
  if (!pageInfo || !slice) return ok(result)
  const overall = await resource.delegate(db).count() as number
  const vip = type !== 'music-artists' && type !== 'vip-plans' ? await resource.delegate(db).count({ where: { access: 'MEMBERS' } }) as number : null
  return ok({ rows: result, total, overall, vip, page: slice.page, pages: slice.pages })
}

/**
 * Saves one item exactly as the admin form does (validation, nested links/seasons,
 * section categories). Shared with the bulk import engine; the caller recounts taxonomy.
 */
export async function saveMediaItem(type: string, body: Input, id: number | null): Promise<{ row: Record<string, any>; existing: Record<string, any> | null }> {
  const resource = RESOURCES[type]
  if (!resource) throw new Error(`Unknown resource: ${type}`)
  const existing = id ? await resource.delegate(db).findUnique({ where: { id } }) : null
  if (id && !existing) throw new Error('not found')
  const data = await resource.parse(body, existing)
  const row = await db.$transaction(async (tx) => {
    if (type === 'games' || type === 'software') {
      for (const role of ['developer', 'publisher'] as const) {
        if (data[role] !== undefined) data[`${role}StudioId`] = await resolveStudioId(tx, data[role])
      }
    }
    const saved = id ? await resource.delegate(tx).update({ where: { id }, data }) : await resource.delegate(tx).create({ data })
    if (type === 'games' || type === 'software') await scheduleStudioPublication(tx, type === 'games' ? 'game' : 'software', saved, existing)
    if (type === 'music-tracks') await scheduleTrackRelease(tx, saved, existing)
    if (resource.afterSave) await resource.afterSave(tx, saved.id, body)
    if (resource.taxonomy && has(body, 'terms')) await assignTerms(tx, resource.taxonomy, saved.id, body.terms)
    return saved
  }, { timeout: 30_000 })
  if (MEDIA_RESOURCE_TYPE[type]) contentChanged({ type: MEDIA_RESOURCE_TYPE[type], id: row.id }, existing, row)
  return { row, existing }
}

/** Deletes one item with its links and section categories (import rollback). */
export async function deleteMediaItem(type: string, id: number) {
  const resource = RESOURCES[type]
  if (!resource) throw new Error(`Unknown resource: ${type}`)
  const row = await db.$transaction(async (tx) => {
    if (type === 'games' || type === 'software') await tx.studioPublicationNotification.deleteMany({ where: { itemType: type === 'games' ? 'game' : 'software', itemId: id } })
    if (resource.onDelete) await resource.onDelete(tx, id)
    if (resource.taxonomy) await removeOwner(tx, resource.taxonomy, id)
    return resource.delegate(tx).delete({ where: { id } })
  })
  if (MEDIA_RESOURCE_TYPE[type]) contentChanged({ type: MEDIA_RESOURCE_TYPE[type], id }, row, null)
}

/** Recounts a resource's section categories after many writes. */
export async function recountMediaTaxonomy(type: string) {
  const resource = RESOURCES[type]
  if (resource?.taxonomy) await recount(resource.taxonomy).catch(() => undefined)
}

/** Existing download links of an item (import merges new links with them instead of dropping them). */
export async function mediaLinksOf(ownerType: LinkOwner, id: number) {
  return (await linksFor(ownerType, [id])).get(id) || []
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
    if (mode === 'update' && !await resource.delegate(db).findUnique({ where: { id } })) return err('not found', 404)
    const { row } = await saveMediaItem(type, body, mode === 'update' ? id : null)
    if (resource.taxonomy) await recount(resource.taxonomy).catch(() => undefined)
    await auditAdmin({ req, actor: admin, action: `media.${type}.${mode}`, targetType: type, targetId: row.id, metadata: { label: resource.label(row) } })
    return ok({ id: row.id, slug: row.slug, status: row.status }, mode === 'create' ? 201 : 200)
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
      if (type === 'games' || type === 'software') await tx.studioPublicationNotification.deleteMany({ where: { itemType: type === 'games' ? 'game' : 'software', itemId: id } })
      if (resource.onDelete) await resource.onDelete(tx, id)
      if (resource.taxonomy) await removeOwner(tx, resource.taxonomy, id)
      return resource.delegate(tx).delete({ where: { id } })
    })
    if (resource.taxonomy) await recount(resource.taxonomy).catch(() => undefined)
    await auditAdmin({ req, actor: admin, action: `media.${type}.delete`, targetType: type, targetId: id, metadata: { label: resource.label(row) } })
    if (MEDIA_RESOURCE_TYPE[type]) contentChanged({ type: MEDIA_RESOURCE_TYPE[type], id }, row, null)
    return ok({ deleted: true })
  } catch (error) {
    return failure(error)
  }
}

/** Batch editor for the shared media lists; deletion uses the same nested cleanup as single-item deletion. */
export async function BULK(req: NextRequest) {
  const found = resourceOf(req)
  if (!found) return err('Unknown resource', 404)
  const [type, resource] = found
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const off = await moduleGuard(resource.module)
  if (off) return off
  const admin = await authorize(req, resource)
  if (!admin) return err('forbidden', 403)
  let input: Awaited<ReturnType<typeof readBulkInput>>
  try { input = await readBulkInput(req) } catch (error) { return err(error instanceof Error ? error.message : 'invalid batch', 400) }
  const { ids, action } = input
  if (action !== 'delete' && !PUBLISHABLE.has(type)) return err('status is not available for this resource', 400)
  const failed: { id: number; reason: string }[] = []
  const succeeded: number[] = []

  if (action !== 'delete') {
    try {
      const rows = await resource.delegate(db).findMany({ where: { id: { in: ids } } }) as Record<string, any>[]
      const known = new Set(rows.map((row) => row.id))
      for (const id of ids) if (!known.has(id)) failed.push({ id, reason: 'not found' })
      if (rows.length) {
        const status = action === 'publish' ? 'PUBLISHED' : 'DRAFT'
        await db.$transaction(async (tx) => {
          await resource.delegate(tx).updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status } })
          if (type === 'music-tracks' && status === 'PUBLISHED') {
            for (const row of rows) if (row.status !== 'PUBLISHED') await scheduleTrackRelease(tx, { id: row.id, status, publishedAt: row.publishedAt }, { id: row.id, status: row.status, publishedAt: row.publishedAt })
          }
          if (type === 'games' || type === 'software') {
            for (const row of rows) if (row.status !== status) await scheduleStudioPublication(tx, type === 'games' ? 'game' : 'software', { id: row.id, status, publishedAt: row.publishedAt }, { id: row.id, status: row.status, publishedAt: row.publishedAt })
          }
        })
        if (resource.taxonomy) await recount(resource.taxonomy).catch(() => undefined)
        const paths: string[] = []
        for (const row of rows) {
          succeeded.push(row.id)
          if (MEDIA_RESOURCE_TYPE[type]) contentChanged({ type: MEDIA_RESOURCE_TYPE[type], id: row.id }, row, { ...row, status })
          if (action === 'publish') { const path = publicPathFor(type, { ...row, status }); if (path) paths.push(path) }
        }
        if (paths.length) queueIndexNow(paths)
      }
    } catch (error) { return failure(error) }
  } else {
    for (const id of ids) {
      try { await deleteMediaItem(type, id); succeeded.push(id) }
      catch { failed.push({ id, reason: 'cannot delete (in use or missing)' }) }
    }
    if (succeeded.length) await recountMediaTaxonomy(type)
  }
  await auditAdmin({ req, actor: admin, action: `media.${type}.bulk.${action}`, targetType: type, metadata: { succeeded, failed } })
  return ok({ changed: succeeded.length, failed })
}
