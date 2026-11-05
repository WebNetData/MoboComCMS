import { db } from '@/platform/database/prisma'
import { assertFieldSelections } from '@/modules/imports/server/field-inputs'
import { claimImportUpdate, importContentState } from '@/modules/imports/server/edit-protection'
import { deleteMediaItem, recountMediaTaxonomy, saveMediaItem } from '@/modules/media/server/admin'
import type { Counters, FieldDef, Message, PreviewLine, SourceItem } from '@/modules/imports/domain/types'
import { latinSlug, normalizeName, toText } from '@/modules/imports/domain/values'
import { countImages, delegate, identityOf, importImages, importFileLink, localizeHtml, loadIdentities, planOnce, saveIdentity, seenBefore, snapshot, suffixOf, tracked, undoChange } from '@/modules/imports/server/adapters/common'
import { ensureTerms, planTerms, undoTerm } from '@/modules/imports/server/adapters/terms'
import { STATUS_ENUM } from '@/modules/imports/server/adapters/media'
import { type ApplyResult, type Change, type ImportAdapter, type ImportContext, type OptionDef, type Plan } from '@/modules/imports/server/registry'

/**
 * Music: one record per track, on the section's own models
 * (MusicArtist → MusicAlbum → MusicTrack), saved through the music admin's
 * save path. The artist and album named by a track are found by name (the
 * album within its artist) or created once, so a file with many tracks of
 * one album never creates a second artist or album. Section categories
 * belong to albums in this section, so they are filed on the album.
 */

const ENTITY = 'media.music-track'
const ACCESS_ENUM = [{ value: 'PUBLIC', label: 'همه' }, { value: 'MEMBERS', label: 'فقط اعضای ویژه' }]

const FIELDS: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی آهنگ', type: 'text', group: 'meta', updatable: false, synonyms: ['id', 'external_id', 'track_id', 'source_id', 'شناسه'] },
  { key: 'title', label: 'نام آهنگ', type: 'text', group: 'main', requiredOnCreate: true, updateByDefault: false, synonyms: ['title', 'track', 'track_title', 'name', 'song', 'نام آهنگ', 'عنوان'] },
  { key: 'titleEn', label: 'نام انگلیسی آهنگ', type: 'text', group: 'main', synonyms: ['title_en', 'english_title', 'track_en'] },
  { key: 'slug', label: 'نامک (slug)', type: 'slug', group: 'main', updatable: false, synonyms: ['slug', 'permalink'] },
  { key: 'artist', label: 'خواننده / هنرمند', type: 'text', group: 'relations', requiredOnCreate: true, updatable: false, synonyms: ['artist', 'singer', 'artist_name', 'performer', 'خواننده', 'هنرمند'] },
  { key: 'artistEn', label: 'نام انگلیسی هنرمند', type: 'text', group: 'relations', updatable: false, synonyms: ['artist_en', 'artist_english'] },
  { key: 'artistImage', label: 'تصویر هنرمند (فقط هنرمند جدید)', type: 'image', group: 'media', updatable: false, synonyms: ['artist_image', 'artist_photo', 'تصویر خواننده'] },
  { key: 'album', label: 'آلبوم', type: 'text', group: 'relations', synonyms: ['album', 'album_title', 'album_name', 'آلبوم'] },
  { key: 'albumEn', label: 'نام انگلیسی آلبوم', type: 'text', group: 'relations', updatable: false, synonyms: ['album_en'] },
  { key: 'albumYear', label: 'سال آلبوم (فقط آلبوم جدید)', type: 'int', group: 'relations', updatable: false, synonyms: ['year', 'album_year', 'release_year', 'سال'] },
  { key: 'albumCover', label: 'کاور آلبوم (فقط آلبوم جدید)', type: 'image', group: 'media', updatable: false, synonyms: ['album_cover', 'album_art', 'کاور آلبوم'] },
  { key: 'trackNo', label: 'شمارهٔ ترک', type: 'int', group: 'main', synonyms: ['track_no', 'track_number', 'number', 'no', 'شماره'] },
  { key: 'cover', label: 'کاور آهنگ', type: 'image', group: 'media', synonyms: ['cover', 'image', 'artwork', 'thumbnail', 'کاور', 'تصویر'] },
  { key: 'audioUrl', label: 'فایل صوتی', type: 'url', group: 'media', synonyms: ['audio', 'audio_url', 'url', 'mp3', 'file', 'download', 'link_128', 'لینک'] },
  { key: 'audioHqUrl', label: 'فایل صوتی کیفیت بالا', type: 'url', group: 'media', synonyms: ['audio_hq', 'hq_url', 'link_320', 'mp3_320'] },
  { key: 'duration', label: 'مدت (ثانیه یا m:ss)', type: 'duration', group: 'main', synonyms: ['duration', 'length', 'time', 'مدت'] },
  { key: 'genre', label: 'سبک', type: 'list', group: 'relations', synonyms: ['genre', 'genres', 'style', 'سبک', 'ژانر'] },
  { key: 'lyrics', label: 'متن آهنگ', type: 'html', group: 'content', synonyms: ['lyrics', 'lyric', 'text', 'متن', 'متن آهنگ'] },
  { key: 'categories', label: 'دسته‌های بخش (روی آلبوم)', type: 'category', group: 'relations', synonyms: ['category', 'categories', 'دسته'] },
  { key: 'access', label: 'دسترسی', type: 'enum', group: 'meta', enum: ACCESS_ENUM, synonyms: ['access', 'visibility', 'دسترسی'] },
  { key: 'status', label: 'وضعیت انتشار', type: 'enum', group: 'meta', enum: STATUS_ENUM, synonyms: ['status', 'وضعیت'] },
  { key: 'featured', label: 'ویژه', type: 'bool', group: 'meta', synonyms: ['featured', 'ویژه'] },
  { key: 'publishedAt', label: 'تاریخ انتشار در سایت', type: 'date', group: 'meta', synonyms: ['published_at', 'publish_date', 'date', 'تاریخ انتشار'] },
]
const TRACK_COLUMNS = ['title', 'titleEn', 'trackNo', 'cover', 'audioUrl', 'audioHqUrl', 'duration', 'genre', 'lyrics', 'access', 'status', 'featured', 'publishedAt']

type Options = { missingArtists: 'create' | 'error'; missingAlbums: 'create' | 'error'; categorySeparator: string; missingCategories: 'create' | 'error'; defaultStatus: 'PUBLISHED' | 'DRAFT' }
const OPTIONS: OptionDef[] = [
  { key: 'missingArtists', label: 'هنرمند موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
  { key: 'missingAlbums', label: 'آلبوم موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
  { key: 'categorySeparator', label: 'جداکنندهٔ سطح‌های دسته', type: 'select', step: 4, default: '>', choices: [{ value: '>', label: 'A > B' }, { value: '/', label: 'A / B' }, { value: '|', label: 'A | B' }] },
  { key: 'missingCategories', label: 'دستهٔ بخش موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
  { key: 'defaultStatus', label: 'وضعیت موارد جدید (اگر ستون وضعیت نگاشت نشده)', type: 'select', step: 8, default: 'DRAFT', choices: STATUS_ENUM },
]
const normalizeOptions = (raw: Record<string, unknown>): Options => ({
  missingArtists: raw.missingArtists === 'error' ? 'error' : 'create',
  missingAlbums: raw.missingAlbums === 'error' ? 'error' : 'create',
  categorySeparator: ['>', '/', '|'].includes(String(raw.categorySeparator)) ? String(raw.categorySeparator) : '>',
  missingCategories: raw.missingCategories === 'error' ? 'error' : 'create',
  defaultStatus: raw.defaultStatus === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
})

type Artist = { id: number; name: string; nameEn: string }
type Album = { id: number; artistId: number; title: string; titleEn: string }
type Track = Record<string, unknown> & { id: number; slug: string; title: string; titleEn: string; artistId: number; albumId: number | null; updatedAt: Date }
type Run = { artists: Map<number, Artist>; albums: Map<number, Album>; tracks: Map<number, Track> }

function run(ctx: ImportContext): Run {
  const hit = ctx.cache.get('music') as Run | undefined
  if (hit) return hit
  const value: Run = { artists: new Map(), albums: new Map(), tracks: new Map() }
  ctx.cache.set('music', value)
  return value
}

const findArtist = (r: Run, name: string, nameEn = '') => {
  const keys = [name, nameEn].map(normalizeName).filter(Boolean)
  return [...r.artists.values()].find((a) => keys.includes(normalizeName(a.name)) || (a.nameEn && keys.includes(normalizeName(a.nameEn)))) || null
}
const findAlbum = (r: Run, artistId: number, title: string, titleEn = '') => {
  const keys = [title, titleEn].map(normalizeName).filter(Boolean)
  return [...r.albums.values()].find((a) => a.artistId === artistId && (keys.includes(normalizeName(a.title)) || (a.titleEn && keys.includes(normalizeName(a.titleEn))))) || null
}

async function prepare(_items: SourceItem[], values: Record<string, unknown>[], ctx: ImportContext) {
  const r = run(ctx)
  const ids = values.map((v) => toText(v.externalId, 190)).filter(Boolean)
  await loadIdentities(ctx, ENTITY, ids)
  const names = [...new Set(values.flatMap((v) => [toText(v.artist, 160), toText(v.artistEn, 160)]).filter(Boolean))]
  const artists = names.length ? await db.musicArtist.findMany({ where: { OR: [{ name: { in: names } }, { nameEn: { in: names } }] }, select: { id: true, name: true, nameEn: true } }) : []
  for (const a of artists) r.artists.set(a.id, a)
  const artistIds = [...r.artists.keys()]
  const albums = artistIds.length ? await db.musicAlbum.findMany({ where: { artistId: { in: artistIds } }, select: { id: true, artistId: true, title: true, titleEn: true } }) : []
  for (const a of albums) r.albums.set(a.id, a)
  const fromIdentity = ids.map((id) => identityOf(ctx, ENTITY, id)).filter((id): id is number => !!id)
  const slugs = values.map((v) => toText(v.slug, 120)).filter(Boolean)
  const titles = [...new Set(values.flatMap((v) => [toText(v.title, 200), toText(v.titleEn, 200)]).filter(Boolean))]
  const or: Record<string, unknown>[] = [{ id: { in: fromIdentity } }]
  if (slugs.length) or.push({ slug: { in: slugs } })
  if (titles.length && artistIds.length) or.push({ artistId: { in: artistIds }, OR: [{ title: { in: titles } }, { titleEn: { in: titles } }] })
  const tracks = await db.musicTrack.findMany({ where: { OR: or } }) as unknown as Track[]
  for (const t of tracks) r.tracks.set(t.id, t)
}

/** Identity: external id → slug → same title by the same artist (and album). */
function findTrack(ctx: ImportContext, r: Run, values: Record<string, unknown>, artist: Artist | null, album: Album | null): Track | null {
  const ext = toText(values.externalId, 190)
  const viaId = ext ? identityOf(ctx, ENTITY, ext) : undefined
  if (viaId && r.tracks.get(viaId)) return r.tracks.get(viaId)!
  const slug = toText(values.slug, 120)
  if (slug) { const hit = [...r.tracks.values()].find((t) => t.slug === slug); if (hit) return hit }
  if (!artist) return null
  const names = [values.title, values.titleEn].map(normalizeName).filter(Boolean)
  const matches = [...r.tracks.values()].filter((t) => t.artistId === artist.id && (!album || t.albumId === album.id) && (names.includes(normalizeName(t.title)) || (t.titleEn && names.includes(normalizeName(t.titleEn)))))
  return matches.length === 1 ? matches[0] : null
}

type Data = { existing: Track | null; values: Record<string, unknown>; paths: string[][]; artistName: string; albumName: string }

async function plan(item: SourceItem, values: Record<string, unknown>, _variants: Record<string, unknown>[], ctx: ImportContext): Promise<Plan> {
  const o = ctx.settings.options as unknown as Options
  const r = run(ctx)
  const messages: Message[] = []
  const counters: Counters = {}
  const title = toText(values.title, 200) || toText(values.titleEn, 200) || `ردیف ${item.rows[0]}`
  const artistName = toText(values.artist, 160)
  const albumName = toText(values.album, 200)
  const sourceKey = toText(values.externalId, 190) || toText(values.slug, 120) || `${normalizeName(artistName)}|${normalizeName(albumName)}|${normalizeName(title)}`
  const fail = (text: string): Plan => ({ action: 'FAIL', title, sourceKey, messages: [...messages, { level: 'error', text }], counters, preview: { title, action: 'FAIL', lines: [], messages: [...messages, { level: 'error', text }] } })

  const artist = ctx.selected?.artist?.[0] ? r.artists.get(ctx.selected.artist[0]) || null : artistName ? findArtist(r, artistName, toText(values.artistEn, 160)) : null
  const album = ctx.selected?.album?.[0] ? r.albums.get(ctx.selected.album[0]) || null : artist && albumName ? findAlbum(r, artist.id, albumName, toText(values.albumEn, 200)) : null
  if (ctx.selected?.artist?.length && !artist) return fail('هنرمند انتخاب‌شده دیگر وجود ندارد')
  if (ctx.selected?.album?.length && (!album || album.artistId !== artist?.id)) return fail('آلبوم انتخاب‌شده متعلق به این هنرمند نیست')
  const existing = findTrack(ctx, r, values, artist, album)
  const first = seenBefore(ctx, `music:${sourceKey}`, item.index)
  if (first !== null) { counters.duplicates = 1; messages.push({ level: 'warning', text: `تکراری در فایل (مثل رکورد ${first + 1})؛ روی همان آهنگ اعمال می‌شود` }) }
  let action: Plan['action'] = existing || first !== null ? 'UPDATE' : 'CREATE'
  if (action === 'UPDATE' && ctx.settings.existing === 'skip') return { action: 'SKIP', title, sourceKey, entityId: existing?.id, messages: [...messages, { level: 'info', text: 'از قبل وجود دارد و طبق تنظیمات رد می‌شود' }], counters, preview: { title, action: 'SKIP', lines: [], messages } }
  const mode = action === 'CREATE' ? 'create' : 'update'
  const allowed = ctx.allow(values, mode, existing ? snapshot(existing, TRACK_COLUMNS) : undefined)
  if (mode === 'create') {
    if (!('title' in allowed)) return fail('امکان ساخت آهنگ نیست؛ فیلد الزامی «نام آهنگ» در فایل نیست یا از ورود اطلاعات کنار گذاشته شده')
    if (!('artist' in allowed)) return fail('امکان ساخت آهنگ نیست؛ فیلد الزامی «هنرمند» در فایل نیست یا از ورود اطلاعات کنار گذاشته شده')
  }
  if (existing && 'album' in allowed && ctx.selected?.album?.length && album?.artistId !== existing.artistId) return fail('آلبوم انتخاب‌شده متعلق به هنرمند فعلی این آهنگ نیست؛ هنرمند آهنگ موجود از ورود گروهی تغییر نمی‌کند')
  // Artist and album are resolved (or created once per run) for new tracks, and for existing ones when the album is imported.
  const needsArtist = mode === 'create' || ('album' in allowed && albumName)
  if (needsArtist && artistName && !artist) {
    if (o.missingArtists === 'error') return fail(`هنرمند «${artistName}» وجود ندارد`)
    planOnce(ctx, `artist:${normalizeName(artistName)}`, counters, 'artistsCreated')
  }
  if ('album' in allowed && albumName && !album) {
    if (o.missingAlbums === 'error') return fail(`آلبوم «${albumName}» از «${artistName}» وجود ندارد`)
    planOnce(ctx, `album:${normalizeName(artistName)}|${normalizeName(albumName)}`, counters, 'albumsCreated')
  }
  const paths = (values.categories as string[][] | undefined) || []
  if ('categories' in allowed && paths.length) {
    if (!albumName) messages.push({ level: 'warning', text: 'در بخش موسیقی دسته‌ها روی آلبوم ثبت می‌شوند؛ این آهنگ آلبوم ندارد و دسته‌ها وارد نمی‌شوند' })
    else {
      const problem = await planTerms(ctx, 'music', paths, o.missingCategories === 'create', counters)
      if (problem) return fail(problem)
    }
  }
  const urls = ['cover', 'albumCover', 'artistImage'].filter((k) => k in allowed).map((k) => String(allowed[k]))
  countImages(ctx, urls, counters)
  if (action === 'UPDATE' && !Object.keys(allowed).length) { action = 'SKIP'; messages.push({ level: 'info', text: 'هیچ فیلدی برای به‌روزرسانی فعال نیست' }) }
  const lines: PreviewLine[] = ctx.previewLines(FIELDS, values, allowed, (key, value) => (key === 'categories' ? (value as string[][]).map((p) => p.join(' › ')).join('، ') : key === 'duration' ? `${Math.floor(Number(value) / 60)}:${String(Number(value) % 60).padStart(2, '0')}` : Array.isArray(value) ? value.join('، ') : value instanceof Date ? value.toISOString().slice(0, 10) : toText(value, 120)))
  if (artistName && needsArtist) lines.unshift({ label: 'هنرمند', value: artistName, state: artist ? 'IMPORTED' : 'NEW' })
  if (albumName && 'album' in allowed) lines.splice(1, 0, { label: 'آلبوم', value: albumName, state: album ? 'IMPORTED' : 'NEW' })
  const data: Data = { existing, values, paths, artistName, albumName }
  return { action, title, sourceKey, entityId: existing?.id, messages, counters, data, preview: { title, subtitle: [artistName, albumName].filter(Boolean).join(' · '), image: toText(values.cover ?? values.albumCover, 2048), action, lines, messages } }
}

async function uniqueSlug(model: 'musicArtist' | 'musicAlbum' | 'musicTrack', base: string, fallback: string): Promise<string> {
  const table = delegate(db, model) as unknown as { findFirst(a: object): Promise<unknown> }
  const clean = (base || fallback).slice(0, 100)
  for (let n = 1; n < 300; n++) {
    const candidate = n === 1 ? clean : `${clean}-${n}`
    if (!await table.findFirst({ where: { slug: candidate } })) return candidate
  }
  return `${clean}-${Date.now().toString(36)}`
}

function apply(item: SourceItem, planned: Plan, ctx: ImportContext): Promise<ApplyResult> {
  return tracked((changes) => applyTrack(item, planned, ctx, changes))
}

async function applyTrack(item: SourceItem, planned: Plan, ctx: ImportContext, changes: Change[]): Promise<ApplyResult> {
  const data = planned.data as Data
  const o = ctx.settings.options as unknown as Options
  const r = run(ctx)
  const messages: Message[] = []
  const counters: Counters = {}
  let existing = data.existing
  if (!existing && planned.action === 'UPDATE') {
    const id = identityOf(ctx, ENTITY, planned.sourceKey)
    existing = id ? await db.musicTrack.findUnique({ where: { id } }) as unknown as Track | null : null
    if (!existing) throw new Error('آهنگ تکراریِ پیشین در این فایل پیدا نشد')
  }
  const mode = existing ? 'update' : 'create'
  const allowed = ctx.allow(data.values, mode, existing ? snapshot(existing, TRACK_COLUMNS) : undefined)
  if (existing && 'album' in allowed && ctx.selected?.album?.[0]) { const selectedAlbum = await db.musicAlbum.findUnique({ where: { id: ctx.selected.album[0] }, select: { artistId: true } }); if (selectedAlbum?.artistId !== existing.artistId) throw new Error('آلبوم انتخاب‌شده متعلق به هنرمند فعلی این آهنگ نیست') }
  const savedArtist=existing?.artistId?await db.musicArtist.findUnique({where:{id:existing.artistId},select:{name:true,nameEn:true}}):null
  const savedAlbum=existing?.albumId?await db.musicAlbum.findUnique({where:{id:existing.albumId},select:{title:true,titleEn:true}}):null
  ctx={...ctx,organization:{section:'music',artist:toText(savedArtist?.nameEn||savedArtist?.name||data.values.artistEn||data.artistName,160),album:toText(existing&&!('album' in allowed)?savedAlbum?.titleEn||savedAlbum?.title:data.values.albumEn||data.albumName||savedAlbum?.titleEn||savedAlbum?.title,200)}}

  // Artist: found by name or created once (re-checked in the database, so a parallel import cannot duplicate it).
  let artist: Artist | null = null
  if (data.artistName && (mode === 'create' || ('album' in allowed && data.albumName))) {
    const nameEn = toText(data.values.artistEn, 160)
    artist = ctx.selected?.artist?.[0] ? await db.musicArtist.findUnique({ where: { id: ctx.selected.artist[0] }, select: { id: true, name: true, nameEn: true } }) : findArtist(r, data.artistName, nameEn)
      || await db.musicArtist.findFirst({ where: { OR: [{ name: data.artistName }, ...(nameEn ? [{ nameEn }] : [])] }, select: { id: true, name: true, nameEn: true } })
    if (!artist) {
      if (ctx.selected?.artist?.length || o.missingArtists === 'error') throw new Error(`هنرمند «${data.artistName}» وجود ندارد`)
      const body: Record<string, unknown> = { name: data.artistName, nameEn, slug: await uniqueSlug('musicArtist', latinSlug(nameEn || data.artistName, 90), `artist-${suffixOf(normalizeName(data.artistName))}`) }
      if ('artistImage' in allowed) { const [img] = await importImages({...ctx,organization:{...ctx.organization!,artistImage:true}}, [String(allowed.artistImage)], messages, counters, 'تصویر هنرمند'); if (img) body.image = img }
      const { row } = await saveMediaItem('music-artists', body, null)
      artist = { id: row.id, name: row.name, nameEn: row.nameEn }
      changes.push({ kind: 'created', entity: 'musicArtist', id: row.id, stamp: (row.updatedAt as Date).toISOString() })
      counters.artistsCreated = (counters.artistsCreated || 0) + 1
    }
    const canonical = await db.musicArtist.findUnique({ where: { id: artist.id }, select: { mergedIntoId: true, mergedInto: { select: { id: true, name: true, nameEn: true } } } })
    if (canonical?.mergedInto) artist = canonical.mergedInto
    r.artists.set(artist.id, artist)
  }

  // Album: within its artist; section categories are filed here.
  let album: Album | null = null
  if (artist && data.albumName && 'album' in allowed) {
    const titleEn = toText(data.values.albumEn, 200)
    album = ctx.selected?.album?.[0] ? await db.musicAlbum.findFirst({ where: { id: ctx.selected.album[0], artistId: artist.id }, select: { id: true, artistId: true, title: true, titleEn: true } }) : findAlbum(r, artist.id, data.albumName, titleEn)
      || await db.musicAlbum.findFirst({ where: { artistId: artist.id, OR: [{ title: data.albumName }, ...(titleEn ? [{ titleEn }] : [])] }, select: { id: true, artistId: true, title: true, titleEn: true } })
    const terms = 'categories' in allowed && data.paths.length ? { ids: await ensureTerms(ctx, 'music', data.paths, changes, counters) } : null
    if (!album) {
      if (ctx.selected?.album?.length || o.missingAlbums === 'error') throw new Error(`آلبوم «${data.albumName}» وجود ندارد`)
      const body: Record<string, unknown> = {
        title: data.albumName, titleEn, artistId: artist.id,
        slug: await uniqueSlug('musicAlbum', latinSlug(`${artist.nameEn || artist.name} ${titleEn || data.albumName}`, 90), `album-${suffixOf(`${artist.id}|${normalizeName(data.albumName)}`)}`),
        status: 'status' in allowed ? allowed.status : o.defaultStatus,
      }
      if ('albumYear' in allowed) body.year = allowed.albumYear
      if ('albumCover' in allowed) { const [img] = await importImages(ctx, [String(allowed.albumCover)], messages, counters, 'کاور آلبوم'); if (img) body.cover = img }
      if (terms) body.terms = terms
      const { row } = await saveMediaItem('music-albums', body, null)
      album = { id: row.id, artistId: artist.id, title: row.title, titleEn: row.titleEn }
      changes.push({ kind: 'created', entity: 'musicAlbum', id: row.id, stamp: (row.updatedAt as Date).toISOString() })
      counters.albumsCreated = (counters.albumsCreated || 0) + 1
    } else if (terms) {
      // Existing album: the file's categories are added to what it already has.
      const current = await db.taxonomyAssignment.findMany({ where: { taxonomy: 'music', ownerId: album.id }, select: { termId: true } })
      const ids = [...new Set([...current.map((row) => row.termId), ...terms.ids])]
      if (ids.length !== current.length) await saveMediaItem('music-albums', { terms: { ids } }, album.id)
    }
    r.albums.set(album.id, album)
  }

  ctx={...ctx,organization:{...ctx.organization!,artist:artist?.nameEn||artist?.name||ctx.organization?.artist,titleEn:toText(allowed.titleEn||existing?.titleEn||data.values.titleEn,200),title:toText(allowed.title||existing?.title||data.values.title,200)}}
  // The track, through the music admin's save path (same validation).
  const body: Record<string, unknown> = {}
  for (const key of TRACK_COLUMNS) {
    if (!(key in allowed)) continue
    if (['audioUrl', 'audioHqUrl'].includes(key)) { body[key] = await importFileLink({...ctx,organization:{...ctx.organization!,quality:key==='audioHqUrl'?'320':'128'}}, String(allowed[key]), messages); continue }
    if (key === 'lyrics') { body[key] = await localizeHtml(ctx, String(allowed[key]), messages, counters, 'رسانهٔ ترانه'); continue }
    if (key === 'cover') { const [img] = await importImages(ctx, [String(allowed.cover)], messages, counters, 'کاور آهنگ'); if (img) body.cover = img; continue }
    body[key] = allowed[key]
  }
  if (artist && mode === 'create') body.artistId = artist.id
  if (album) body.albumId = album.id
  if (!existing) {
    body.slug = await uniqueSlug('musicTrack', toText(allowed.slug, 100) || latinSlug(`${artist?.nameEn || artist?.name || ''} ${data.values.titleEn || data.values.title}`, 90), `track-${suffixOf(planned.sourceKey)}`)
    if (!('status' in body)) body.status = o.defaultStatus
  }
  let id = existing?.id ?? null
  let writtenAt: string | undefined
  let contentFingerprint: string | undefined
  if (Object.keys(body).length) {
    const before = existing ? await db.musicTrack.findUnique({ where: { id: existing.id } }) as unknown as Record<string, unknown> : null
    const { row } = await saveMediaItem('music-tracks', body, id, null, { beforeWrite: Object.keys(ctx.selected || {}).length || id && ctx.settings.protectEdits ? async tx => { await assertFieldSelections('music', item.values, data.values, tx, o.categorySeparator); if (id && ctx.settings.protectEdits) await claimImportUpdate(tx, ctx, 'musicTrack', id) } : undefined, afterWrite: async (tx, savedId) => { contentFingerprint = (await importContentState('music', savedId, tx))?.fingerprint } })
    id = row.id as number
    writtenAt = (row.updatedAt as Date).toISOString()
    if (before) {
      const keys = Object.keys(body).filter((k) => k in before && JSON.stringify(snapshot(before, [k])) !== JSON.stringify(snapshot(row, [k])))
      if (keys.length) changes.push({ kind: 'updated', entity: 'musicTrack', id: row.id, before: snapshot(before, keys), after: snapshot(row, keys) })
    } else changes.push({ kind: 'created', entity: 'musicTrack', id: row.id, stamp: (row.updatedAt as Date).toISOString() })
    r.tracks.set(row.id, row as Track)
  }
  if (!id) throw new Error('ذخیره نشد')
  await saveIdentity(db, ctx, ENTITY, toText(data.values.externalId, 190) || planned.sourceKey, id)
  return { action: existing ? 'UPDATE' : 'CREATE', entityType: 'musicTrack', entityId: id, writtenAt, contentFingerprint, changes, messages, counters }
}

async function rollback(changes: Change[]) {
  const conflicts: string[] = []
  let undone = 0
  const unchanged = async (model: 'musicTrack' | 'musicAlbum' | 'musicArtist', change: Change, label: string) => {
    const row = await delegate(db, model).findUnique({ where: { id: change.id } })
    if (!row) return { row: null, problem: null }
    if (change.kind === 'created' && change.stamp && (row.updatedAt as Date).toISOString() !== change.stamp) return { row, problem: `${label} #${change.id} پس از ورود اطلاعات ویرایش شده؛ حذف نشد` }
    return { row, problem: null }
  }
  for (const change of [...changes].reverse()) {
    let problem: string | null = null
    if (change.entity === 'musicTrack') {
      if (change.kind === 'updated') problem = await undoChange(change, 'musicTrack', { label: 'آهنگ', dates: ['publishedAt'] })
      else { const u = await unchanged('musicTrack', change, 'آهنگ'); problem = u.problem; if (u.row && !problem) await deleteMediaItem('music-tracks', change.id) }
    } else if (change.entity === 'musicAlbum') {
      const u = await unchanged('musicAlbum', change, 'آلبوم')
      problem = u.problem
      if (u.row && !problem) {
        if (await db.musicTrack.count({ where: { albumId: change.id } })) problem = `آلبوم #${change.id} هنوز آهنگ دارد؛ حذف نشد`
        else await deleteMediaItem('music-albums', change.id)
      }
    } else if (change.entity === 'musicArtist') {
      const u = await unchanged('musicArtist', change, 'هنرمند')
      problem = u.problem
      // Deleting an artist cascades to its albums and tracks, so only an artist left with nothing is removed.
      if (u.row && !problem) {
        if (await db.musicAlbum.count({ where: { artistId: change.id } }) || await db.musicTrack.count({ where: { artistId: change.id } })) problem = `هنرمند #${change.id} هنوز آلبوم یا آهنگ دارد؛ حذف نشد`
        else await deleteMediaItem('music-artists', change.id)
      }
    } else if (change.entity.startsWith('term:')) problem = await undoTerm(change)
    if (problem) conflicts.push(problem); else undone++
  }
  await recountMediaTaxonomy('music-albums')
  return { undone, conflicts }
}

export const musicImporter: ImportAdapter = {
  id: 'music', label: 'موسیقی — آهنگ‌ها', entity: 'آهنگ', module: 'music',
  description: 'آهنگ‌ها با هنرمند و آلبوم (هر هنرمند و آلبوم فقط یک‌بار ساخته می‌شود)، کاور، فایل صوتی، مدت، سبک و دسته‌های بخش',
  fields: FIELDS, supports: {},
  identity: ['شناسهٔ خارجی', 'نامک (slug)', 'هنرمند + آلبوم + نام آهنگ'],
  options: OPTIONS,
  normalizeOptions: normalizeOptions as unknown as (raw: Record<string, unknown>) => Record<string, unknown>,
  prepare, plan, apply, rollback,
  finish: () => recountMediaTaxonomy('music-albums'),
}
