import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { snapshotOf } from '@/modules/content/domain/revisions'
import type { ImportAdapter, ImportContext, Plan } from '@/modules/imports/server/registry'

const MODELS: Record<string, string> = { store: 'product', magazine: 'post', movies: 'cinemaTitle', series: 'cinemaTitle', music: 'musicTrack', games: 'gameTitle', software: 'softwareTitle' }
type Row = Record<string, unknown>
type Reader = { findUnique(args: object): Promise<Row | null> }
type Client = typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** A content fingerprint, never user data or secret-bearing related records. */
export async function importContentState(adapter: string, id: number, client: Client = db) {
  const model = MODELS[adapter]
  if (!model) return null
  const reader = (client as unknown as Record<string, Reader>)[model]
  const include = model === 'product' ? { variants: { orderBy: { id: 'asc' } } }
    : model === 'post' ? { categories: { orderBy: { categoryId: 'asc' } } }
    : model === 'cinemaTitle' ? { seasons: { orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } } }
    : model === 'musicTrack' ? { album: true } : undefined
  const row = await reader.findUnique({ where: { id }, ...(include ? { include } : {}) })
  if (!row) return null
  const content: Row = { ...snapshotOf(row) }
  for (const key of ['variants', 'categories', 'seasons', 'album']) if (row[key]) content[key] = row[key]
  const ownerType = ({ cinemaTitle: 'title', gameTitle: 'game', softwareTitle: 'software' } as Record<string, string>)[model]
  if (ownerType) {
    const ids = [id, ...((row.seasons || []) as { episodes: { id: number }[] }[]).flatMap(s => s.episodes.map(e => e.id))]
    content.links = await client.mediaLink.findMany({ where: { OR: [{ ownerType, ownerId: id }, ...(model === 'cinemaTitle' ? [{ ownerType: 'episode', ownerId: { in: ids.slice(1) } }] : [])] }, orderBy: [{ ownerType: 'asc' }, { ownerId: 'asc' }, { id: 'asc' }], select: { id: true, ownerType: true, ownerId: true, url: true, label: true, kind: true, quality: true, audio: true, language: true, access: true, disabled: true, sortOrder: true } })
  }
  const taxonomy = ({ cinemaTitle: 'cinema', gameTitle: 'games', softwareTitle: 'software', musicTrack: 'music' } as Record<string, string>)[model]
  if (taxonomy && (model !== 'musicTrack' || row.albumId)) content.terms = await client.taxonomyAssignment.findMany({ where: { taxonomy, ownerId: model === 'musicTrack' ? Number(row.albumId) : id }, orderBy: { termId: 'asc' }, select: { termId: true, primary: true } })
  const stable = (value: unknown): unknown => value instanceof Date ? value.toISOString() : typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !['clicks', 'views', 'plays', 'downloads', 'createdAt', 'updatedAt'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : value
  return { model, updatedAt: row.updatedAt as Date, fingerprint: createHash('sha256').update(JSON.stringify(stable(content))).digest('hex') }
}

/** Preview and execution share the same conservative policy; no media/relationship writes happen on SKIP. */
export async function protectImportPlan(adapter: ImportAdapter, plan: Plan, ctx: ImportContext): Promise<Plan> {
  if (!ctx.settings.protectEdits || plan.action !== 'UPDATE' || !plan.entityId) return plan
  const current = await importContentState(adapter.id, plan.entityId)
  if (!current) return { ...plan, action: 'FAIL', messages: [...plan.messages, { level: 'error', text: 'مورد موجود برای بررسی ویرایش‌ها پیدا نشد' }] }
  // Limit to this source/destination; failed and rolled-back attempts never establish a baseline.
  const previous = await db.importRecord.findFirst({ where: { entityType: current.model, entityId: plan.entityId, action: { in: ['CREATE', 'UPDATE'] }, status: { in: ['OK', 'WARNING'] }, job: { adapter: adapter.id } }, orderBy: { id: 'desc' }, select: { changes: true, job: { select: { settings: true } } } })
  let baseline = ''
  try {
    if (previous && JSON.parse(previous.job.settings).source === ctx.settings.source) baseline = JSON.parse(previous.changes).contentFingerprint || ''
  } catch { /* A historical/malformed baseline cannot authorize an overwrite. */ }
  if (baseline && baseline === current.fingerprint) {
    ctx.cache.set(`import-expected:${current.model}:${plan.entityId}`, current)
    return plan
  }
  const messages = [...plan.messages, { level: 'warning' as const, text: baseline ? 'این مورد پس از ورود اطلاعات تغییر کرده است؛ برای حفظ ویرایش‌ها از کل رکورد عبور شد' : 'سابقهٔ قابل اتکایی برای مقایسه نیست؛ مورد موجود برای حفظ محتوای محلی تغییر نمی‌کند' }]
  return { ...plan, action: 'SKIP', counters: { protectedEdits: 1 }, messages, preview: { ...plan.preview, action: 'SKIP', lines: plan.preview.lines.map(line => ({ ...line, state: 'UNCHANGED' })), children: [], messages } }
}

/** Called inside the owner's write transaction, after remote work and before any content mutation. */
export async function claimImportUpdate(tx: Client, ctx: ImportContext, model: string, id: number) {
  if (!ctx.settings.protectEdits) return
  const expected = ctx.cache.get(`import-expected:${model}:${id}`) as Awaited<ReturnType<typeof importContentState>>
  if (!expected) throw new Error('ویرایش محافظت‌شده بدون سابقهٔ مقایسه ذخیره نمی‌شود')
  const reader = (tx as unknown as Record<string, Reader & { updateMany(args: object): Promise<{ count: number }> }>)[model]
  const claimed = await reader.updateMany({ where: { id, updatedAt: expected.updatedAt }, data: { updatedAt: new Date(Math.max(Date.now(), expected.updatedAt.getTime() + 1)) } })
  if (!claimed.count || (await importContentState(ctx.settings.adapter, id, tx))?.fingerprint !== expected.fingerprint) throw new Error('محتوا هم‌زمان تغییر کرده است؛ برای حفظ ویرایش‌ها این رکورد ذخیره نشد')
}
