import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { claimImportUpdate, importContentState } from '@/modules/imports/server/edit-protection'
import { appendMediaLinks, deleteMediaItem, mediaLinksOf, recountMediaTaxonomy, saveMediaItem } from '@/modules/media/server/admin'
import { cleanRichText } from '@/shared/content/sanitize'
import { cleanLinks, type LinkOwner } from '@/modules/media/domain/media'
import type { Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import type { Counters, FieldDef, ImportSettings, Message, PreviewLine, SourceItem } from '@/modules/imports/domain/types'
import { isBlank, latinSlug, normalizeName, toInt, toText } from '@/modules/imports/domain/values'
import { countImages, delegate, htmlImageUrls, identityOf, importImages, importFileLink, loadIdentities, localizeHtml, saveIdentity, seenBefore, snapshot, suffixOf, tracked, undoChange } from '@/modules/imports/server/adapters/common'
import { ensureTerms, planTerms, undoTerm } from '@/modules/imports/server/adapters/terms'
import type { ApplyResult, Change, ImportAdapter, ImportContext, OptionDef, Plan } from '@/modules/imports/server/registry'

/**
 * Films, series, games and software share one adapter shape: rows are saved
 * through the section admin's own save path (same validation, links and
 * section categories), images go to the media library first, and series
 * seasons/episodes are matched by their numbers so a re-import never
 * duplicates them.
 */

export type MediaSpec = {
  id: string; label: string; description: string; entity: string; module: string
  resource: 'cinema-titles' | 'games' | 'software'
  model: 'cinemaTitle' | 'gameTitle' | 'softwareTitle'
  taxonomy: Taxonomy
  linkOwner: LinkOwner
  fields: FieldDef[]
  /** Column matched after the external id (e.g. imdbId). */
  naturalKey?: string
  /** Fixed values for created rows and the filter for lookups (kind: MOVIE | SERIES). */
  fixed?: Record<string, string>
  slugPrefix: string
  episodes?: boolean
}

export const STATUS_ENUM = [{ value: 'PUBLISHED', label: 'منتشر' }, { value: 'DRAFT', label: 'پیش‌نویس' }]
const DATE_COLUMNS = ['publishedAt', 'releaseDate', 'releasedAt']

const EPISODE_FIELDS: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی قسمت', type: 'text', updatable: false, synonyms: ['episode_id', 'id', 'external_id'] },
  { key: 'season', label: 'شمارهٔ فصل', type: 'int', requiredOnCreate: true, updatable: false, synonyms: ['season', 'season_number', 'season_no', 'فصل'] },
  { key: 'episode', label: 'شمارهٔ قسمت', type: 'int', requiredOnCreate: true, updatable: false, synonyms: ['episode', 'episode_number', 'episode_no', 'number', 'قسمت'] },
  { key: 'title', label: 'نام قسمت', type: 'text', synonyms: ['episode_title', 'title', 'name', 'عنوان قسمت'] },
  { key: 'titleEn', label: 'نام انگلیسی قسمت', type: 'text', synonyms: ['episode_title_en', 'title_en'] },
  { key: 'summary', label: 'خلاصهٔ قسمت', type: 'html', synonyms: ['episode_summary', 'summary', 'overview', 'plot'] },
  { key: 'links', label: 'لینک‌های دانلود قسمت', type: 'json', synonyms: ['episode_links', 'download_links', 'downloads', 'links'] },
  { key: 'still', label: 'تصویر قسمت', type: 'image', synonyms: ['still', 'episode_image', 'image', 'thumbnail'] },
  { key: 'runtime', label: 'مدت قسمت (دقیقه)', type: 'int', synonyms: ['runtime', 'duration', 'episode_runtime'] },
  { key: 'airDate', label: 'تاریخ پخش', type: 'date', synonyms: ['air_date', 'airdate', 'aired', 'release_date'] },
]

const LINK_HINT = 'فهرست لینک‌ها ([{url, label, quality, size}]) یا یک نشانی؛ لینک‌های قبلی حفظ می‌شوند'

type Options = { missingCategories: 'create' | 'error'; categorySeparator: string; defaultStatus: 'PUBLISHED' | 'DRAFT' }
const OPTIONS: OptionDef[] = [
  { key: 'categorySeparator', label: 'جداکنندهٔ سطح‌های دسته', type: 'select', step: 4, default: '>', choices: [{ value: '>', label: 'A > B' }, { value: '/', label: 'A / B' }, { value: '|', label: 'A | B' }] },
  { key: 'missingCategories', label: 'دستهٔ بخش موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
  { key: 'defaultStatus', label: 'وضعیت موارد جدید (اگر ستون وضعیت نگاشت نشده)', type: 'select', step: 8, default: 'PUBLISHED', choices: STATUS_ENUM },
]
const normalizeOptions = (raw: Record<string, unknown>): Options => ({
  missingCategories: raw.missingCategories === 'error' ? 'error' : 'create',
  categorySeparator: ['>', '/', '|'].includes(String(raw.categorySeparator)) ? String(raw.categorySeparator) : '>',
  defaultStatus: raw.defaultStatus === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
})

type Row = Record<string, unknown> & { id: number; slug: string; title: string; titleEn: string; updatedAt: Date }
type EpisodePlan = { index: number; season: number; episode: number; values: Record<string, unknown>; existingId: number | null; seasonId: number | null }
type Data = { existing: Row | null; values: Record<string, unknown>; paths: string[][]; episodes: EpisodePlan[] }

export function mediaAdapter(spec: MediaSpec): ImportAdapter {
  const entity = `media.${spec.id}`
  const imageFields = spec.fields.filter((f) => f.type === 'image' || f.type === 'images')
  const htmlFields = spec.fields.filter((f) => f.type === 'html')
  const lookupWhere = spec.fixed || {}

  async function prepare(_items: SourceItem[], values: Record<string, unknown>[], ctx: ImportContext) {
    const ids = values.map((v) => toText(v.externalId, 190)).filter(Boolean)
    await loadIdentities(ctx, entity, ids)
    const fromIdentity = ids.map((id) => identityOf(ctx, entity, id)).filter((id): id is number => !!id)
    const natural = spec.naturalKey ? values.map((v) => toText(v[spec.naturalKey!], 60)).filter(Boolean) : []
    const slugs = values.map((v) => toText(v.slug, 120)).filter(Boolean)
    const titles = [...new Set(values.flatMap((v) => [toText(v.title, 200), toText(v.titleEn, 200)]).filter(Boolean))]
    const or: Record<string, unknown>[] = [{ id: { in: fromIdentity } }]
    if (natural.length) or.push({ [spec.naturalKey!]: { in: natural } })
    if (slugs.length) or.push({ slug: { in: slugs } })
    if (titles.length) or.push({ title: { in: titles } }, { titleEn: { in: titles } })
    const rows = await (db as unknown as Record<string, { findMany(a: object): Promise<Row[]> }>)[spec.model].findMany({ where: { ...lookupWhere, OR: or } })
    const map = (ctx.cache.get('rows') as Map<number, Row> | undefined) || new Map<number, Row>()
    for (const row of rows) map.set(row.id, row)
    ctx.cache.set('rows', map)
  }

  function findExisting(ctx: ImportContext, values: Record<string, unknown>): Row | null {
    const rows = [...((ctx.cache.get('rows') as Map<number, Row> | undefined) || new Map<number, Row>()).values()]
    const ext = toText(values.externalId, 190)
    const viaId = ext ? identityOf(ctx, entity, ext) : undefined
    if (viaId) { const hit = rows.find((r) => r.id === viaId); if (hit) return hit }
    if (spec.naturalKey && toText(values[spec.naturalKey], 60)) { const hit = rows.find((r) => r[spec.naturalKey!] === toText(values[spec.naturalKey!], 60)); if (hit) return hit }
    if (toText(values.slug, 120)) { const hit = rows.find((r) => r.slug === toText(values.slug, 120)); if (hit) return hit }
    // Title (and year, when both have one) — only when exactly one row matches.
    const names = [values.title, values.titleEn].map((v) => normalizeName(v)).filter(Boolean)
    const year = values.year ?? null
    const matches = rows.filter((r) => names.includes(normalizeName(r.title)) || (r.titleEn && names.includes(normalizeName(r.titleEn))))
      .filter((r) => !year || !r.year || r.year === year)
    return matches.length === 1 ? matches[0] : null
  }

  async function plan(item: SourceItem, values: Record<string, unknown>, episodeValues: Record<string, unknown>[], ctx: ImportContext): Promise<Plan> {
    const o = ctx.settings.options as unknown as Options
    const messages: Message[] = []
    const counters: Counters = {}
    const title = toText(values.title, 200) || toText(values.titleEn, 200) || `ردیف ${item.rows[0]}`
    const sourceKey = toText(values.externalId, 190) || (spec.naturalKey ? toText(values[spec.naturalKey], 60) : '') || toText(values.slug, 120) || normalizeName(title)
    const fail = (text: string): Plan => ({ action: 'FAIL', title, sourceKey, messages: [...messages, { level: 'error', text }], counters, preview: { title, action: 'FAIL', lines: [], messages: [...messages, { level: 'error', text }] } })
    const existing = findExisting(ctx, values)
    const first = seenBefore(ctx, `${spec.id}:${sourceKey}`, item.index)
    if (first !== null) { counters.duplicates = 1; messages.push({ level: 'warning', text: `تکراری در فایل (مثل رکورد ${first + 1})؛ روی همان مورد اعمال می‌شود` }) }
    let action: Plan['action'] = existing || first !== null ? 'UPDATE' : 'CREATE'
    if (action === 'UPDATE' && ctx.settings.existing === 'skip') return { action: 'SKIP', title, sourceKey, entityId: existing?.id, messages: [...messages, { level: 'info', text: 'از قبل وجود دارد و طبق تنظیمات رد می‌شود' }], counters, preview: { title, action: 'SKIP', lines: [], messages } }
    const mode = action === 'CREATE' ? 'create' : 'update'
    const current = existing ? snapshot(existing, spec.fields.map((f) => f.key)) : undefined
    const allowed = ctx.allow(values, mode, current)
    if (mode === 'create' && !('title' in allowed)) return fail('عنوان برای ساخت لازم است')
    const paths = (values.categories as string[][] | undefined) || []
    if ('categories' in allowed && paths.length) {
      const problem = await planTerms(ctx, spec.taxonomy, paths, o.missingCategories === 'create', counters)
      if (problem) return fail(problem)
    }
    const urls: string[] = []
    for (const f of imageFields) if (f.key in allowed) urls.push(...(Array.isArray(allowed[f.key]) ? allowed[f.key] as string[] : [String(allowed[f.key])]))
    for (const f of htmlFields) if (f.key in allowed) urls.push(...htmlImageUrls(String(allowed[f.key])))
    if ('cast' in allowed) for (const c of castOf(allowed.cast)) if (c.image) urls.push(c.image)
    countImages(ctx, urls, counters)

    // Series: seasons and episodes matched by number.
    const episodes: EpisodePlan[] = []
    if (spec.episodes && item.variants.length) {
      const seen = new Set<string>()
      const existingEpisodes = existing ? await db.cinemaSeason.findMany({ where: { titleId: existing.id }, select: { id: true, number: true, episodes: { select: { id: true, number: true } } } }) : []
      for (let i = 0; i < item.variants.length; i++) {
        const v = episodeValues[i] || {}
        const season = typeof v.season === 'number' ? v.season : null
        const episode = typeof v.episode === 'number' ? v.episode : null
        if (season === null || episode === null || season < 0 || episode < 0 || season > 999 || episode > 9999) { messages.push({ level: 'error', text: `قسمت ${i + 1}: شمارهٔ فصل و قسمت لازم است` }); continue }
        const key = `${season}x${episode}`
        if (seen.has(key)) { messages.push({ level: 'error', text: `قسمت تکراری: فصل ${season} قسمت ${episode}` }); continue }
        seen.add(key)
        const s = existingEpisodes.find((row) => row.number === season)
        const e = s?.episodes.find((row) => row.number === episode)
        episodes.push({ index: i, season, episode, values: v, existingId: e?.id ?? null, seasonId: s?.id ?? null })
        if (!s) counters.seasonsCreated = (counters.seasonsCreated || 0) + (episodes.filter((ep) => ep.season === season).length === 1 ? 1 : 0)
        counters[e ? 'episodesUpdated' : 'episodesCreated'] = (counters[e ? 'episodesUpdated' : 'episodesCreated'] || 0) + 1
        if (typeof v.still === 'string') countImages(ctx, [v.still], counters)
      }
      if (item.variants.length > 400) return fail('هر سریال حداکثر ۴۰۰ قسمت در یک رکورد')
    }
    if (action === 'UPDATE' && !Object.keys(allowed).length && !episodes.length) { action = 'SKIP'; messages.push({ level: 'info', text: 'هیچ فیلدی برای به‌روزرسانی فعال نیست' }) }
    const lines: PreviewLine[] = ctx.previewLines(spec.fields, values, allowed, (key, value) => (key === 'categories' ? (value as string[][]).map((p) => p.join(' › ')).join('، ') : Array.isArray(value) ? value.map((v) => (typeof v === 'object' ? toText((v as Record<string, unknown>).name ?? (v as Record<string, unknown>).url, 40) : toText(v, 40))).slice(0, 6).join('، ') : value instanceof Date ? value.toISOString().slice(0, 10) : toText(value, 120)))
    const children = episodes.slice(0, 30).map((ep) => ({ title: `فصل ${ep.season} — قسمت ${ep.episode}${ep.existingId ? ' (موجود)' : ''}`, lines: ctx.previewLines(EPISODE_FIELDS.filter((f) => !['season', 'episode'].includes(f.key)), ep.values, ctx.allowVariant(ep.values, ep.existingId ? 'update' : 'create')) }))
    if (episodes.length) lines.push({ label: 'قسمت‌ها', value: `${episodes.length} قسمت`, state: 'IMPORTED' })
    const data: Data = { existing, values, paths, episodes }
    const cover = toText(values.poster ?? values.cover ?? values.icon, 2048)
    return { action, title, sourceKey, entityId: existing?.id, messages, counters, data, preview: { title, subtitle: toText(values.originalTitle ?? values.developer ?? '', 80), image: cover, action, lines, children, messages } }
  }

  async function uniqueSlug(base: string): Promise<string> {
    const table = delegate(db, spec.model) as unknown as { findFirst(a: object): Promise<unknown> }
    const clean = base.slice(0, 100) || `${spec.slugPrefix}-${Date.now().toString(36)}`
    for (let n = 1; n < 300; n++) {
      const candidate = n === 1 ? clean : `${clean}-${n}`
      if (!await table.findFirst({ where: { slug: candidate } })) return candidate
    }
    return `${clean}-${Date.now().toString(36)}`
  }

  function apply(item: SourceItem, planned: Plan, ctx: ImportContext): Promise<ApplyResult> {
    return tracked((changes) => applyItem(item, planned, ctx, changes))
  }

  async function applyItem(_item: SourceItem, planned: Plan, ctx: ImportContext, changes: Change[]): Promise<ApplyResult> {
    const data = planned.data as Data
    const o = ctx.settings.options as unknown as Options
    const messages: Message[] = []
    const counters: Counters = {}
    let existing = data.existing
    if (!existing && planned.action === 'UPDATE') {
      const id = identityOf(ctx, entity, toText(data.values.externalId, 190)) ?? identityOf(ctx, entity, planned.sourceKey)
      existing = id ? await delegate(db, spec.model).findUnique({ where: { id } }) as Row | null : null
      if (!existing) throw new Error('مورد تکراریِ پیشین در این فایل پیدا نشد')
    }
    const mode = existing ? 'update' : 'create'
    const allowed = ctx.allow(data.values, mode, existing ? snapshot(existing, spec.fields.map((f) => f.key)) : undefined)
    const metadata={...existing,...allowed,...spec.fixed}
    ctx={...ctx,organization:{section:spec.resource==='cinema-titles'?metadata.kind==='SERIES'?'series':'film':spec.resource,title:String(metadata.originalTitle||metadata.titleEn||metadata.title||''),category:String(('categories' in allowed?data.paths[0]?.at(-1):'')||metadata.category||metadata.genres||'Uncategorized').split(/[,،]/)[0]}}
    const body: Record<string, unknown> = {}
    for (const f of spec.fields) {
      if (!(f.key in allowed) || ['externalId', 'categories', 'links'].includes(f.key)) continue
      const value = allowed[f.key]
      if (f.type === 'image') { const [img] = await importImages(ctx, [String(value)], messages, counters, f.label); if (img) body[f.key] = img; continue }
      if (f.type === 'images') { const imgs = await importImages(ctx, value as string[], messages, counters, f.label); body[f.key] = imgs.map((src) => ({ src })); continue }
      if (f.type === 'url' && f.key === 'trailerUrl' && /\.(mp4|webm|mkv|mov)(\?|$)/i.test(String(value))) { body[f.key] = await importFileLink({...ctx,organization:{...ctx.organization!,video:true}}, String(value), messages); continue }
      if (f.type === 'html') { body[f.key] = await localizeHtml(ctx, String(value), messages, counters, f.label); continue }
      if (f.key === 'cast') {
        const cast = castOf(value)
        for (const person of cast) if (person.image) { const [img] = await importImages(ctx, [person.image], messages, counters, `تصویر ${person.name}`); person.image = img || '' }
        body.cast = cast
        continue
      }
      body[f.key] = value
    }
    if (!existing) {
      Object.assign(body, spec.fixed || {})
      body.slug = await uniqueSlug(toText(allowed.slug, 100) || latinSlug(data.values.titleEn || data.values.originalTitle || data.values.title, 90) || `${spec.slugPrefix}-${suffixOf(planned.sourceKey || planned.title)}`)
      if (!('status' in body)) body.status = o.defaultStatus
    }
    if ('categories' in allowed && data.paths.length) body.terms = { ids: await ensureTerms(ctx, spec.taxonomy, data.paths, changes, counters) }
    if ('links' in allowed) {
      const incoming = linksOf(allowed.links)
      for (const link of incoming) link.url = await importFileLink(ctx, link.url, messages)
      const current = existing ? await mediaLinksOf(spec.linkOwner, existing.id) : []
      const known = new Set(current.map((l) => l.url))
      body.links = [...current, ...incoming.filter((l) => !known.has(l.url))]
    }
    // Resolve/copy remote assets before taking database locks. Every episode write then shares
    // the title's content claim and revision transaction, including episode-only imports.
    const episodes: { ep: EpisodePlan; row: Record<string, unknown>; links: ReturnType<typeof linksOf> | null }[] = []
    if (spec.episodes && data.episodes.length && 'episodes' in ctx.allow({ episodes: true }, mode)) {
      for (const ep of data.episodes) {
        const allowedEp = ctx.allowVariant(ep.values, ep.existingId ? 'update' : 'create')
        const row: Record<string, unknown> = {}, episodeContext = { ...ctx, organization: { ...ctx.organization!, season: ep.season } }
        if ('title' in allowedEp) row.title = toText(allowedEp.title, 200)
        if ('titleEn' in allowedEp) row.titleEn = toText(allowedEp.titleEn, 200)
        if ('summary' in allowedEp) row.summary = cleanRichText(await localizeHtml(episodeContext, String(allowedEp.summary || '').slice(0, 10000), messages, counters, 'رسانهٔ خلاصه قسمت'))
        if ('runtime' in allowedEp) row.runtime = toInt(allowedEp.runtime, 0, 1000) ?? 0
        if ('airDate' in allowedEp) row.airDate = allowedEp.airDate as Date
        if ('still' in allowedEp) { const [img] = await importImages(ctx, [String(allowedEp.still)], messages, counters, `تصویر فصل ${ep.season} قسمت ${ep.episode}`); if (img) row.still = img }
        const links = 'links' in allowedEp ? linksOf(allowedEp.links) : null
        if (links) for (const link of links) link.url = await importFileLink(episodeContext, link.url, messages)
        episodes.push({ ep, row, links })
      }
    }
    const writeEpisodes = async (tx: Prisma.TransactionClient, titleId: number) => {
      for (const { ep, row, links } of episodes) {
        let season = await tx.cinemaSeason.findUnique({ where: { titleId_number: { titleId, number: ep.season } } })
        if (!season) {
          season = await tx.cinemaSeason.create({ data: { titleId, number: ep.season } })
          changes.push({ kind: 'created', entity: 'cinemaSeason', id: season.id })
          counters.seasonsCreated = (counters.seasonsCreated || 0) + 1
        }
        const current = await tx.cinemaEpisode.findUnique({ where: { seasonId_number: { seasonId: season.id, number: ep.episode } } })
        if (!current) {
          const created = await tx.cinemaEpisode.create({ data: { seasonId: season.id, number: ep.episode, ...row } as never })
          changes.push({ kind: 'created', entity: 'cinemaEpisode', id: created.id, stamp: JSON.stringify(snapshot(created as unknown as Record<string, unknown>, ['title', 'summary', 'still', 'runtime'])) })
          counters.episodesCreated = (counters.episodesCreated || 0) + 1
        } else if (Object.keys(row).length) {
          const updated = await tx.cinemaEpisode.update({ where: { id: current.id }, data: row as never })
          changes.push({ kind: 'updated', entity: 'cinemaEpisode', id: current.id, before: snapshot(current as unknown as Record<string, unknown>, Object.keys(row)), after: snapshot(updated as unknown as Record<string, unknown>, Object.keys(row)) })
          counters.episodesUpdated = (counters.episodesUpdated || 0) + 1
        }
        const saved = await tx.cinemaEpisode.findUniqueOrThrow({ where: { seasonId_number: { seasonId: season.id, number: ep.episode } } })
        if (links) for (const link of await appendMediaLinks('episode', saved.id, links, tx)) changes.push({ kind: 'created', entity: 'mediaLink', id: link.id, stamp: JSON.stringify(snapshot(link as unknown as Record<string, unknown>, ['url', 'label', 'quality', 'size', 'disabled', 'clicks'])) })
        if (toText(ep.values.externalId, 190)) await saveIdentity(tx, ctx, `${entity}.episode`, toText(ep.values.externalId, 190), saved.id)
      }
    }
    let id = existing?.id ?? null
    let writtenAt: string | undefined
    let contentFingerprint: string | undefined
    if (Object.keys(body).length || episodes.length || (id && ctx.settings.protectEdits)) {
      const before = existing ? await delegate(db, spec.model).findUnique({ where: { id: existing.id } }) : null
      const { row } = await saveMediaItem(spec.resource, body, id, null, { beforeWrite: id && ctx.settings.protectEdits ? tx => claimImportUpdate(tx, ctx, spec.model, id!) : undefined, afterWrite: async (tx, savedId) => { await writeEpisodes(tx, savedId); contentFingerprint = (await importContentState(spec.id, savedId, tx))?.fingerprint } })
      id = row.id as number
      writtenAt = (row.updatedAt as Date).toISOString()
      if (before) {
        const keys = Object.keys(body).filter((k) => !['terms', 'links', 'seasons'].includes(k) && k in before && JSON.stringify(snapshot(before, [k])) !== JSON.stringify(snapshot(row, [k])))
        if (keys.length) changes.push({ kind: 'updated', entity: spec.model, id: row.id, before: snapshot(before, keys), after: snapshot(row, keys) })
      } else changes.push({ kind: 'created', entity: spec.model, id: row.id, stamp: (row.updatedAt as Date).toISOString() })
    }
    if (!id) throw new Error('ذخیره نشد')
    if (toText(data.values.externalId, 190)) await saveIdentity(db, ctx, entity, toText(data.values.externalId, 190), id)
    else if (planned.sourceKey) await saveIdentity(db, ctx, entity, planned.sourceKey, id)

    return { action: existing ? 'UPDATE' : 'CREATE', entityType: spec.model, entityId: id, writtenAt, contentFingerprint, changes, messages, counters }
  }

  async function rollback(changes: Change[]) {
    const conflicts: string[] = []
    let undone = 0
    for (const change of [...changes].reverse()) {
      let problem: string | null = null
      if (change.entity === spec.model) {
        if (change.kind === 'updated') problem = await undoChange(change, spec.model, { label: spec.entity, dates: DATE_COLUMNS })
        else {
          const row = await delegate(db, spec.model).findUnique({ where: { id: change.id } })
          if (row && change.stamp && (row.updatedAt as Date).toISOString() !== change.stamp) problem = `${spec.entity} #${change.id} پس از ورود اطلاعات ویرایش شده؛ حذف نشد`
          else if (row) await deleteMediaItem(spec.resource, change.id)
        }
      } else if (change.entity === 'mediaLink' && change.kind === 'created') {
        const row=await db.mediaLink.findUnique({where:{id:change.id}})
        if(row && JSON.stringify(snapshot(row as unknown as Record<string,unknown>,['url','label','quality','size','disabled','clicks']))!==change.stamp)problem=`لینک #${change.id} پس از ورود اطلاعات تغییر کرده؛ حذف نشد`
        else if(row)await db.mediaLink.delete({where:{id:row.id}})
      } else if (change.entity === 'cinemaEpisode') {
        if (change.kind === 'updated') problem = await undoChange(change, 'cinemaEpisode', { label: 'قسمت', dates: ['airDate'] })
        else {
          const row = await db.cinemaEpisode.findUnique({ where: { id: change.id } })
          if (row && JSON.stringify(snapshot(row as unknown as Record<string, unknown>, ['title', 'summary', 'still', 'runtime'])) !== change.stamp) problem = `قسمت #${change.id} پس از ورود اطلاعات ویرایش شده؛ حذف نشد`
          else if (row) { await db.mediaLink.deleteMany({ where: { ownerType: 'episode', ownerId: row.id } }); await db.cinemaEpisode.delete({ where: { id: row.id } }) }
        }
      } else if (change.entity === 'cinemaSeason') {
        const row = await db.cinemaSeason.findUnique({ where: { id: change.id }, include: { _count: { select: { episodes: true } } } })
        if (row?._count.episodes) problem = `فصل ${row.number} هنوز قسمت دارد؛ حذف نشد`
        else if (row) await db.cinemaSeason.delete({ where: { id: row.id } })
      } else if (change.entity.startsWith('term:')) problem = await undoTerm(change)
      if (problem) conflicts.push(problem); else undone++
    }
    await recountMediaTaxonomy(spec.resource)
    return { undone, conflicts }
  }

  return {
    id: spec.id, label: spec.label, description: spec.description, entity: spec.entity, module: spec.module,
    fields: spec.fields, variantFields: spec.episodes ? EPISODE_FIELDS : undefined, variantLabel: spec.episodes ? 'قسمت‌ها' : undefined,
    supports: { variants: !!spec.episodes },
    identity: ['شناسهٔ خارجی', ...(spec.naturalKey ? [spec.naturalKey === 'imdbId' ? 'شناسهٔ IMDb' : spec.naturalKey] : []), 'نامک (slug)', 'عنوان (و سال)'],
    options: OPTIONS,
    normalizeOptions: normalizeOptions as unknown as (raw: Record<string, unknown>) => Record<string, unknown>,
    implicitActive: (settings: ImportSettings) => (spec.episodes && settings.variants.mode !== 'none' ? ['episodes'] : []),
    prepare, plan, apply, rollback,
    finish: () => recountMediaTaxonomy(spec.resource),
  }
}

/** Cast as a list of names or {name, role, image} records. */
function castOf(value: unknown): { name: string; role: string; image: string }[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,،|]/) : []
  return list.slice(0, 40).map((entry) => {
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      return { name: toText(e.name ?? e.actor, 120), role: toText(e.role ?? e.character, 120), image: toText(e.image ?? e.photo ?? e.profile, 2048) }
    }
    return { name: toText(entry, 120), role: '', image: '' }
  }).filter((c) => c.name)
}

/** Download links from a list of records, a list of URLs or one URL. */
function linksOf(value: unknown) {
  const list = Array.isArray(value) ? value : isBlank(value) ? [] : [value]
  return cleanLinks(list.map((entry) => (typeof entry === 'string' ? { url: entry } : entry)))
}

export { LINK_HINT }
