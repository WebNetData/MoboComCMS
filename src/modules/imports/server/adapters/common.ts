import { copiesFiles, copiesImages } from '@/modules/imports/domain/media-options'
import { db } from '@/platform/database/prisma'
import { findAssets, rewriteAssets } from '@/modules/downloads/domain/localize'
import type { Counters, Message } from '@/modules/imports/domain/types'
import { stableHash, toText } from '@/modules/imports/domain/values'
import { ApplyFailure, type Change, type ImportContext } from '@/modules/imports/server/registry'

/** Helpers every adapter uses: identities, in-file duplicates, images, snapshots and safe rollback. */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
export type Client = Tx | typeof db

// ------------------------------------------------------------------ identities

/**
 * External ids live in ImportExternalRef, per source (the job's `source`
 * setting) and entity type, so one row can carry ids from several suppliers
 * and a re-import of the same source finds the same row.
 */

/** Loads external id → row id for many ids at once (cached for the run). */
export async function loadIdentities(ctx: ImportContext, entity: string, externalIds: string[]) {
  const key = `identity:${entity}`
  const map = (ctx.cache.get(key) as Map<string, number> | undefined) || new Map<string, number>()
  const missing = [...new Set(externalIds.filter((id) => id && !map.has(id)))]
  for (let i = 0; i < missing.length; i += 500) {
    const rows = await db.importExternalRef.findMany({ where: { source: ctx.settings.source, entityType: entity, externalId: { in: missing.slice(i, i + 500) } }, select: { externalId: true, entityId: true } })
    for (const row of rows) map.set(row.externalId, row.entityId)
  }
  ctx.cache.set(key, map)
  return map
}

export const identityOf = (ctx: ImportContext, entity: string, externalId: string) =>
  (ctx.cache.get(`identity:${entity}`) as Map<string, number> | undefined)?.get(externalId)

export async function saveIdentity(tx: Client, ctx: ImportContext, entity: string, externalId: string, entityId: number) {
  if (!externalId) return
  const source = ctx.settings.source
  await tx.importExternalRef.upsert({
    where: { source_entityType_externalId: { source, entityType: entity, externalId } },
    create: { source, entityType: entity, externalId, entityId, jobId: ctx.jobId },
    update: { entityId, jobId: ctx.jobId },
  })
  const key = `identity:${entity}`
  const map = (ctx.cache.get(key) as Map<string, number> | undefined) || new Map<string, number>()
  map.set(externalId, entityId)
  ctx.cache.set(key, map)
}

/** Second time the same identity appears in the file: the index of its first appearance. */
export function seenBefore(ctx: ImportContext, key: string, index: number): number | null {
  const map = (ctx.cache.get('seen') as Map<string, number> | undefined) || new Map<string, number>()
  ctx.cache.set('seen', map)
  const first = map.get(key)
  if (first !== undefined && first !== index) return first
  map.set(key, index)
  return null
}

/** Counts a planned creation once per run ("17 categories to create"). */
export function planOnce(ctx: ImportContext, key: string, counters: Counters, counter: string) {
  if (ctx.planned.has(key)) return
  ctx.planned.add(key)
  counters[counter] = (counters[counter] || 0) + 1
}

// ------------------------------------------------------------------ images

/** Dry-run image counts: new downloads versus images already in the library. */
export function countImages(ctx: ImportContext, urls: string[], counters: Counters) {
  if (!copiesImages(ctx.settings.options)) return
  for (const url of urls) {
    if (!/^https?:/i.test(url)) continue
    if (ctx.knownImages.has(url)) continue
    planOnce(ctx, `img:${url}`, counters, 'imagesQueued')
  }
}

/** Downloads images into the library; a failed image is a warning, never a failed record. */
export async function importImages(ctx: ImportContext, urls: string[], messages: Message[], counters: Counters, label: string): Promise<string[]> {
  if (!copiesImages(ctx.settings.options)) return [...urls]
  const out: string[] = []
  for (const url of urls) {
    try {
      const result = await ctx.importImage(url)
      out.push(result.url)
      const counter = result.deferred ? 'imagesQueued' : result.reused ? 'imagesReused' : 'imagesDownloaded'
      counters[counter] = (counters[counter] || 0) + 1
    } catch (error) {
      out.push(url) // optional copying never erases the original asset
      counters.imagesFailed = (counters.imagesFailed || 0) + 1
      messages.push({ level: 'warning', text: `${label}: تصویر دریافت نشد (${toText(url, 80)}) — ${error instanceof Error ? error.message : 'خطا'}` })
    }
  }
  return out
}

/** Images inside HTML are copied too, so no external address is left in the content. */
export async function localizeHtml(ctx: ImportContext, html: string, messages: Message[], counters: Counters, label: string): Promise<string> {
  if (!copiesImages(ctx.settings.options) && !copiesFiles(ctx.settings.options)) return html
  const assets = findAssets(html, '').filter((asset) => /^https?:/i.test(asset.url) && (asset.kind === 'image' ? copiesImages(ctx.settings.options) : copiesFiles(ctx.settings.options)))
  if (!assets.length) return html
  const map = new Map<string, string>()
  for (const asset of assets.slice(0, 40)) {
    const local = asset.kind === 'image' ? (await importImages(ctx, [asset.url], messages, counters, label))[0] : await importFileLink(ctx, asset.url, messages)
    if (local) map.set(asset.url, local)
  }
  return map.size ? rewriteAssets(html, map) : html
}

export function htmlImageUrls(html: string): string[] {
  return findAssets(html, '').filter((asset) => asset.kind === 'image' && /^https?:/i.test(asset.url)).map((asset) => asset.url)
}

// ------------------------------------------------------------------ snapshots and rollback

const plain = (value: unknown): unknown => (typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value)

/** The given columns of a row, JSON-safe (dates → ISO, BigInt → string). */
export function snapshot(row: Record<string, unknown> | null | undefined, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!row) return out
  for (const key of keys) out[key] = plain(row[key])
  return out
}

export const sameValues = (current: Record<string, unknown>, expected: Record<string, unknown>) =>
  Object.keys(expected).every((key) => JSON.stringify(plain(current[key])) === JSON.stringify(expected[key]))

/** Turns a snapshot back into column values for Prisma (ISO strings to dates where the column is a date). */
export function restore(values: Record<string, unknown>, dates: string[] = [], bigints: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (dates.includes(key)) out[key] = value ? new Date(String(value)) : null
    else if (bigints.includes(key)) out[key] = BigInt(String(value ?? '0'))
    else out[key] = value
  }
  return out
}

type Delegate = {
  findUnique(args: { where: { id: number } }): Promise<Record<string, unknown> | null>
  update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>
  delete(args: { where: { id: number } }): Promise<unknown>
}
export const delegate = (client: Client, model: string) => (client as unknown as Record<string, Delegate>)[model]

/**
 * Generic undo for one change: an updated row gets its old values back only
 * if the imported values are still there; a created row is deleted only if
 * nobody changed it since (`stamp` = its updatedAt after the import, or the
 * created values) and `canDelete` agrees.
 */
export async function undoChange(
  change: Change,
  model: string,
  options: { dates?: string[]; bigints?: string[]; canDelete?: (id: number) => Promise<string | null>; label: string; client?: Client },
): Promise<string | null> {
  const table = delegate(options.client || db, model)
  const row = await table.findUnique({ where: { id: change.id } })
  if (change.kind === 'updated') {
    if (!row) return `${options.label} #${change.id} دیگر وجود ندارد`
    if (!sameValues(row, change.after)) return `${options.label} #${change.id} پس از ورود اطلاعات تغییر کرده است؛ دست نخورد`
    await table.update({ where: { id: change.id }, data: restore(change.before, options.dates, options.bigints) })
    return null
  }
  if (!row) return null
  if (change.stamp) {
    const current = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null
    if (current && current !== change.stamp) return `${options.label} #${change.id} پس از ورود اطلاعات ویرایش شده است؛ حذف نشد`
  }
  const reason = options.canDelete ? await options.canDelete(change.id) : null
  if (reason) return `${options.label} #${change.id}: ${reason}؛ حذف نشد`
  await table.delete({ where: { id: change.id } })
  return null
}

/** A short deterministic suffix for generated slugs/SKUs of a record. */
export const suffixOf = (seed: string) => stableHash(seed).slice(0, 6)

/** Runs an adapter's write; if it fails part-way, the rows it already changed still reach the history (and rollback). */
export async function tracked<T>(write: (changes: Change[]) => Promise<T>): Promise<T> {
  const changes: Change[] = []
  try { return await write(changes) } catch (error) {
    if (!changes.length) throw error
    throw new ApplyFailure(error instanceof Error ? error.message : 'خطای ناشناخته', changes)
  }
}

/** Only mapped downloadable media fields call this; normal web links are never downloaded. */
export async function importFileLink(ctx: ImportContext, url: string, messages: Message[]) {
  if (!copiesFiles(ctx.settings.options) || !/^https?:/i.test(url) || !ctx.importFile) return url
  try { return (await ctx.importFile(url)).url } catch { messages.push({ level: 'warning', text: 'انتقال فایل انجام نشد؛ لینک اصلی حفظ شد' }); return url }
}
