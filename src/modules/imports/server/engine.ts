import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { auditSystem } from '@/platform/audit/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { coerceValues } from '@/modules/imports/domain/coerce'
import { buildItems } from '@/modules/imports/domain/items'
import { allowedValues, autoMap, discoverColumns, missingForCreate, type SourceColumn } from '@/modules/imports/domain/mapping'
import { ImportFileError } from '@/modules/imports/domain/parse'
import { addStats, type Stats } from '@/modules/imports/domain/report'
import { normalizeSettings } from '@/modules/imports/domain/settings'
import { LIMITS, type FieldDef, type ImportSettings, type Message, type PreviewCard, type PreviewLine, type SourceItem } from '@/modules/imports/domain/types'
import { toText } from '@/modules/imports/domain/values'
import { deleteUpload, loadParsed } from '@/modules/imports/server/files'
import { importImage, knownSources } from '@/modules/imports/server/media'
import { getImporter, type ApplyResult, type Change, type ImportAdapter, type ImportContext, type Plan } from '@/modules/imports/server/registry'
import '@/modules/imports/server/adapters'

/**
 * The import engine: settings → items → plans (preview and dry run, no
 * writes) → a background job that applies the plan record by record, with
 * progress, pause/resume/cancel, a per-record history and rollback.
 */

export class ImportError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

type Job = NonNullable<Awaited<ReturnType<typeof db.importJob.findUnique>>>
type Actor = { id: number; email: string }

const BATCH = 25
const LEASE_MS = 90_000
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

export function adapterFor(id: string): ImportAdapter {
  const adapter = getImporter(id)
  if (!adapter) throw new ImportError('مقصد ورود اطلاعات ناشناخته است')
  return adapter
}

export async function ensureModule(adapter: ImportAdapter) {
  if (adapter.module && !await isModuleEnabled(adapter.module)) throw new ImportError(`بخش «${adapter.label}» در سایت خاموش است`)
}

/** Untrusted settings → validated settings for this destination. */
export function settingsFor(adapter: ImportAdapter, raw: unknown): ImportSettings {
  const settings = normalizeSettings(raw, adapter.id, adapter.fields, adapter.variantFields || [])
  settings.options = adapter.normalizeOptions(settings.options)
  for (const field of adapter.fields) if (field.implicit) delete settings.mapping[field.key]
  if (!adapter.supports.variants) {
    settings.variants = { mode: 'none', source: '', groupBy: '' }
    settings.variantMapping = {}
    settings.variantPolicies = {}
  }
  if (!adapter.supports.attributes) settings.attributes = []
  else if (settings.variants.mode === 'none') settings.attributes = settings.attributes.map((attr) => ({ ...attr, variation: false }))
  if (!adapter.supports.specs) settings.specsSource = ''
  // Implicit fields (specifications, variants) have no column; their policy depends on whether they are configured.
  const rawPolicies = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).policies : null) as Record<string, { create?: unknown; update?: unknown }> | null
  const active = new Set(adapter.implicitActive?.(settings) || [])
  for (const field of adapter.fields.filter((f) => f.implicit)) {
    const given = rawPolicies?.[field.key]
    settings.policies[field.key] = active.has(field.key)
      ? { create: typeof given?.create === 'boolean' ? given.create : true, update: typeof given?.update === 'boolean' ? given.update : field.updateByDefault !== false }
      : { create: false, update: false }
  }
  return settings
}

export const settingsHash = (settings: ImportSettings) => sha(JSON.stringify(settings)).slice(0, 32)
export const readSettings = (job: Job) => { try { return JSON.parse(job.settings || '{}') } catch { return {} } }

// ------------------------------------------------------------------ analysis

const VARIANT_LIST = /variant|variation|option|sku|model|child|تنوع|مدل/i
const PARENT_KEY = /^(parent|group|product|main)[\s_-]?(sku|id|code|key)$|^(sku|code)[\s_-]?parent$|^parent$/i

/** Columns of the file, a few sample rows and suggested mapping/variant settings. */
export async function analyzeJob(job: Job) {
  const adapter = adapterFor(job.adapter)
  const settings = readSettings(job) as Partial<ImportSettings>
  const parsed = await loadParsed(job.fileKey, job.fileName, String(settings.sheet || ''))
  const columns = discoverColumns(parsed.rows)
  const valueColumns = columns.filter((column) => column.kind !== 'object' && !column.path.includes('[].')).map((column) => column.path)
  const mapping = autoMap(adapter.fields.filter((field) => !field.implicit), valueColumns)
  let variants: ImportSettings['variants'] = { mode: 'none', source: '', groupBy: '' }
  let variantMapping: Record<string, string> = {}
  const attributes: { source: string; name: string; variation: boolean }[] = []
  if (adapter.supports.variants && adapter.variantFields?.length) {
    const nested = columns.find((column) => column.kind === 'objects' && VARIANT_LIST.test(column.path) && !column.path.includes('[].'))
    const parentKey = columns.find((column) => column.kind === 'value' && PARENT_KEY.test(column.path.replace(/[^a-z_\-\s]/gi, '')))
    if (nested) {
      variants = { mode: 'nested', source: nested.path, groupBy: '' }
      const children = columns.filter((column) => column.path.startsWith(`${nested.path}[].`) && column.kind !== 'objects').map((column) => column.path)
      variantMapping = autoMap(adapter.variantFields, children)
      const used = new Set(Object.values(variantMapping))
      for (const child of children) if (!used.has(child)) attributes.push({ source: child, name: child.slice(nested.path.length + 3), variation: true })
    } else if (parentKey) {
      variants = { mode: 'flat', source: '', groupBy: parentKey.path }
      delete mapping[Object.keys(mapping).find((key) => mapping[key] === parentKey.path) || '']
      const rest = valueColumns.filter((column) => column !== parentKey.path && !Object.values(mapping).includes(column))
      variantMapping = autoMap(adapter.variantFields, [...rest, ...valueColumns.filter((c) => c !== parentKey.path)])
      // Columns whose value changes inside a group are the variation attributes.
      const groups = new Map<string, Record<string, unknown>[]>()
      for (const row of parsed.rows.slice(0, 2000)) { const key = toText(row[parentKey.path]); if (key) groups.set(key, [...(groups.get(key) || []), row]) }
      const used = new Set([...Object.values(mapping), ...Object.values(variantMapping), parentKey.path])
      for (const column of valueColumns.filter((c) => !used.has(c))) {
        const varies = [...groups.values()].some((rows) => rows.length > 1 && new Set(rows.map((row) => toText(row[column]))).size > 1)
        if (varies) attributes.push({ source: column, name: column, variation: true })
      }
    }
  }
  return {
    columns, rows: parsed.rows.length, sheets: parsed.sheets || [], sheet: parsed.sheet || '', format: parsed.format,
    sample: parsed.rows.slice(0, 5),
    suggestions: { mapping, variants, variantMapping, attributes },
  }
}

// ------------------------------------------------------------------ context

function previewLines(fields: FieldDef[], values: Record<string, unknown>, allowed: Record<string, unknown>, format?: (key: string, value: unknown) => string): PreviewLine[] {
  const lines: PreviewLine[] = []
  for (const field of fields) {
    if (!(field.key in values)) continue
    const value = values[field.key]
    const shown = format ? format(field.key, value) : Array.isArray(value) ? `${value.length} مورد` : value instanceof Date ? value.toISOString().slice(0, 10) : toText(value, 120)
    lines.push({ label: field.label, value: shown, state: field.key in allowed ? 'IMPORTED' : 'IGNORED' })
  }
  return lines
}

function makeContext(job: Job | null, settings: ImportSettings, actor: Actor, dryRun: boolean): ImportContext {
  return {
    jobId: job?.id ?? null, actor, dryRun, settings,
    cache: new Map(), planned: new Set(), knownImages: new Set(),
    importImage: async (url) => {
      if (dryRun) throw new Error('dry run never downloads')
      return importImage(url)
    },
    allow: (values, mode, current) => allowedValues(values, settings.policies, mode, settings.existing, current),
    allowVariant: (values, mode, current) => allowedValues(values, settings.variantPolicies, mode, settings.existing, current),
    previewLines,
  }
}

type Typed = { values: Record<string, unknown>; variantValues: Record<string, unknown>[]; messages: Message[] }

function typed(adapter: ImportAdapter, settings: ImportSettings, item: SourceItem): Typed {
  const options = { categorySeparator: String(settings.options.categorySeparator || '>') }
  const main = coerceValues(adapter.fields, item.values, options)
  const variants = item.variants.map((values) => coerceValues(adapter.variantFields || [], values, options))
  // A value that cannot be read is left out (and reported); the rest of the record still imports.
  const soften = (message: Message, prefix = '') => ({ level: 'warning' as const, text: `${prefix}${message.text} — این مقدار وارد نمی‌شود` })
  return {
    values: main.values,
    variantValues: variants.map((v) => v.values),
    messages: [...main.messages.map((m) => soften(m)), ...variants.flatMap((v, i) => v.messages.map((m) => soften(m, `تنوع ${i + 1}: `)))],
  }
}

function failed(item: SourceItem, text: string): Plan {
  const title = toText(item.values.title ?? item.values.name ?? `ردیف ${item.rows[0]}`, 120)
  return { action: 'FAIL', title, sourceKey: '', messages: [{ level: 'error', text }], counters: {}, preview: { title, action: 'FAIL', lines: [], messages: [{ level: 'error', text }] } }
}

async function planOne(adapter: ImportAdapter, item: SourceItem, t: Typed, ctx: ImportContext): Promise<Plan> {
  try {
    const plan = await adapter.plan(item, t.values, t.variantValues, ctx)
    plan.messages.unshift(...t.messages)
    plan.preview.messages = plan.messages
    return plan
  } catch (error) {
    return failed(item, error instanceof Error ? error.message.slice(0, 300) : 'خطای ناشناخته')
  }
}

async function itemsFor(job: Job, settings: ImportSettings) {
  const parsed = await loadParsed(job.fileKey, job.fileName, settings.sheet)
  return buildItems(parsed.rows, settings)
}

// ------------------------------------------------------------------ preview and dry run

export type DryRun = {
  settingsHash: string
  fileHash: string
  at: string
  total: number
  valid: number
  warnings: number
  invalid: number
  actions: Record<string, number>
  counters: Stats
  duplicates: number
  blocking: string[]
  problems: { index: number; rows: number[]; title: string; action: string; messages: Message[] }[]
}

/** Plans every item without writing; `limit` plans only the first items (the preview). */
export async function planJob(job: Job, rawSettings: unknown, actor: Actor, limit = 0) {
  const adapter = adapterFor(job.adapter)
  await ensureModule(adapter)
  const settings = settingsFor(adapter, rawSettings)
  const all = await itemsFor(job, settings)
  const items = limit ? all.slice(0, limit) : all
  const ctx = makeContext(job, settings, actor, true)
  const images = new Set<string>()
  for (const item of items) for (const field of adapter.fields.filter((f) => f.type === 'image' || f.type === 'images')) {
    const v = item.values[field.key]
    for (const url of Array.isArray(v) ? v : v ? [v] : []) if (typeof url === 'string' && /^https?:/i.test(url)) images.add(url)
  }
  ctx.knownImages = await knownSources([...images])
  const plans: Plan[] = []
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200)
    const t = chunk.map((item) => typed(adapter, settings, item))
    if (adapter.prepare) await adapter.prepare(chunk, t.map((x) => x.values), ctx)
    for (let j = 0; j < chunk.length; j++) plans.push(await planOne(adapter, chunk[j], t[j], ctx))
  }
  const blocking: string[] = []
  const missing = missingForCreate(adapter.fields, settings.policies)
  if (missing.length && plans.some((plan) => plan.action === 'CREATE' || (plan.action === 'FAIL' && !plan.entityId)))
    blocking.push(`برای ساخت ${adapter.entity} جدید این فیلدها لازم‌اند ولی در انتخاب فیلدها برای «ساخت» فعال نیستند یا نگاشت نشده‌اند: ${missing.map((f) => f.label).join('، ')}. بدون آن‌ها رکوردهای جدید ساخته نمی‌شوند (فقط رکوردهای موجود به‌روز می‌شوند).`)
  const summary: DryRun = {
    settingsHash: settingsHash(settings), fileHash: job.fileHash, at: new Date().toISOString(),
    total: all.length, valid: 0, warnings: 0, invalid: 0, actions: {}, counters: {}, duplicates: 0, blocking,
    problems: [],
  }
  for (const [index, plan] of plans.entries()) {
    summary.actions[plan.action] = (summary.actions[plan.action] || 0) + 1
    addStats(summary.counters, plan.counters)
    const hasError = plan.action === 'FAIL'
    const hasWarning = plan.messages.some((m) => m.level === 'warning' || m.level === 'error')
    if (hasError) summary.invalid++
    else if (hasWarning) summary.warnings++
    else summary.valid++
    if (plan.counters.duplicates) summary.duplicates += plan.counters.duplicates
    if ((hasError || hasWarning) && summary.problems.length < 500) summary.problems.push({ index: items[index].index, rows: items[index].rows, title: plan.title, action: plan.action, messages: plan.messages.slice(0, 20) })
  }
  return { settings, summary, previews: plans.slice(0, LIMITS.previewItems).map((plan) => plan.preview) as PreviewCard[] }
}

// ------------------------------------------------------------------ running

type Kick = { timer?: ReturnType<typeof setTimeout> }
const kicks = globalThis as typeof globalThis & { importKicks?: Map<number, Kick> }
const kickMap = kicks.importKicks ??= new Map()

/** Runs the job's next slice soon, in this process (the scheduler also picks up any due job). */
export function kick(jobId: number, delay = 50) {
  const entry = kickMap.get(jobId) || {}
  if (entry.timer) return
  entry.timer = setTimeout(() => {
    entry.timer = undefined
    runSlice(jobId).catch((error) => logEvent('error', 'imports.slice_failed', { jobId, error: String(error) }))
  }, delay)
  entry.timer.unref?.()
  kickMap.set(jobId, entry)
}

async function claim(jobId: number, statuses: string[]) {
  const now = new Date()
  const claimed = await db.importJob.updateMany({
    where: { id: jobId, status: { in: statuses }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + LEASE_MS) },
  })
  return claimed.count === 1
}

function recordStatus(result: { action: string; messages: Message[] }) {
  if (result.action === 'FAIL') return 'FAILED'
  return result.messages.some((m) => m.level === 'warning' || m.level === 'error') ? 'WARNING' : 'OK'
}

/** Processes records until the time budget ends, the job finishes, or it is paused/cancelled. */
export async function runSlice(jobId: number, budgetMs = 30_000): Promise<{ done: boolean }> {
  if (!await claim(jobId, ['QUEUED', 'RUNNING'])) return { done: false }
  let job = await db.importJob.findUnique({ where: { id: jobId } })
  if (!job) return { done: true }
  const started = Date.now()
  try {
    const adapter = adapterFor(job.adapter)
    const settings = settingsFor(adapter, readSettings(job))
    const items = await itemsFor(job, settings)
    if (job.status === 'QUEUED') job = await db.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: job.startedAt ?? new Date(), total: items.length } })
    const ctx = makeContext(job, settings, { id: job.createdById, email: job.createdByEmail }, false)
    const stats: Stats = (() => { try { return JSON.parse(job.stats || '{}') } catch { return {} } })()
    const done = new Set((await db.importRecord.findMany({ where: { jobId, index: { gte: job.cursor } }, select: { index: true } })).map((row) => row.index))
    let cursor = job.cursor
    let stop = false
    while (cursor < items.length && !stop && Date.now() - started < budgetMs) {
      const batch = items.slice(cursor, cursor + BATCH)
      const t = batch.map((item) => typed(adapter, settings, item))
      if (adapter.prepare) await adapter.prepare(batch, t.map((x) => x.values), ctx)
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        if (done.has(item.index)) continue
        if (j % 5 === 0) {
          const current = await db.importJob.findUnique({ where: { id: jobId }, select: { status: true } })
          if (current?.status !== 'RUNNING') { stop = true; cursor = item.index; break }
        }
        const plan = await planOne(adapter, item, t[j], ctx)
        let result: ApplyResult
        if (plan.action === 'FAIL' || plan.action === 'SKIP') result = { action: plan.action, entityType: '', entityId: plan.entityId, changes: [], messages: plan.messages, counters: {} }
        else {
          try {
            result = await adapter.apply(item, plan, ctx)
            result.messages = [...plan.messages.filter((m) => m.level !== 'info'), ...result.messages]
          } catch (error) {
            result = { action: 'FAIL', entityType: '', entityId: plan.entityId, changes: [], counters: {}, messages: [...plan.messages, { level: 'error', text: error instanceof Error ? error.message.slice(0, 400) : 'خطای ناشناخته' }] }
          }
        }
        await db.importRecord.upsert({
          where: { jobId_index: { jobId, index: item.index } },
          create: {
            jobId, index: item.index, sourceKey: plan.sourceKey.slice(0, 190), title: plan.title.slice(0, 190), action: result.action, status: recordStatus(result),
            entityType: result.entityType, entityId: result.entityId ?? null, messages: JSON.stringify(result.messages.slice(0, 40)),
            changes: JSON.stringify({ changes: result.changes, counters: result.counters, rows: item.rows }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
          },
          update: {},
        })
        addStats(stats, { processed: 1, [result.action === 'CREATE' ? 'created' : result.action === 'UPDATE' ? 'updated' : result.action === 'SKIP' ? 'skipped' : 'failed']: 1, ...result.counters })
        if (j === batch.length - 1) cursor = item.index + 1
      }
      if (!stop) cursor = Math.max(cursor, batch[batch.length - 1].index + 1)
      await db.importJob.update({ where: { id: jobId }, data: { cursor, stats: JSON.stringify(stats), lockedUntil: new Date(Date.now() + LEASE_MS) } })
    }
    const finished = cursor >= items.length && !stop
    if (finished) {
      const final = await finalStats(jobId, items.length)
      await db.importJob.update({ where: { id: jobId }, data: { status: 'DONE', finishedAt: new Date(), cursor, stats: JSON.stringify(final), lockedUntil: null } })
      await auditSystem({ actor: { id: job.createdById, email: job.createdByEmail }, action: 'import.completed', targetType: 'import-job', targetId: jobId, metadata: { adapter: job.adapter, file: job.fileName, ...final } })
    } else {
      await db.importJob.update({ where: { id: jobId }, data: { lockedUntil: null } })
      const current = await db.importJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (current?.status === 'RUNNING') kick(jobId, 200)
    }
    return { done: finished }
  } catch (error) {
    const message = error instanceof ImportFileError || error instanceof ImportError ? error.message : error instanceof Error ? error.message : 'خطای ناشناخته'
    logEvent('error', 'imports.job_failed', { jobId, error: message })
    await db.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: message.slice(0, 1000), finishedAt: new Date(), lockedUntil: null } })
    return { done: true }
  }
}

/** Totals rebuilt from the records themselves (exact even after a crash or a restart). */
async function finalStats(jobId: number, total: number): Promise<Stats> {
  const stats: Stats = { total }
  const records = await db.importRecord.findMany({ where: { jobId }, select: { action: true, changes: true } })
  for (const record of records) {
    addStats(stats, { processed: 1, [record.action === 'CREATE' ? 'created' : record.action === 'UPDATE' ? 'updated' : record.action === 'SKIP' ? 'skipped' : 'failed']: 1 })
    try { addStats(stats, (JSON.parse(record.changes || '{}').counters || {}) as Stats) } catch { /* old row */ }
  }
  return stats
}

/** Scheduler entry: one slice of the oldest runnable job (restarts jobs whose worker died). */
export async function runImportJobs() {
  const job = await db.importJob.findFirst({
    where: { status: { in: ['QUEUED', 'RUNNING'] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
    orderBy: { id: 'asc' }, select: { id: true },
  })
  const rolling = await db.importJob.findFirst({ where: { status: 'ROLLING_BACK', OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] }, orderBy: { id: 'asc' }, select: { id: true } })
  if (job) await runSlice(job.id, 25_000)
  if (rolling) await rollbackSlice(rolling.id, 25_000)
  // Unstarted drafts and their files are removed after a week.
  const stale = await db.importJob.findMany({ where: { status: 'DRAFT', updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true, fileKey: true }, take: 20 })
  for (const draft of stale) { await deleteUpload(draft.fileKey); await db.importJob.delete({ where: { id: draft.id } }) }
  return { job: job?.id ?? null, rollback: rolling?.id ?? null }
}

// ------------------------------------------------------------------ control

export async function startJob(job: Job, rawSettings: unknown) {
  if (job.status !== 'DRAFT') throw new ImportError('این ورود اطلاعات قبلاً شروع شده است')
  const adapter = adapterFor(job.adapter)
  await ensureModule(adapter)
  const settings = settingsFor(adapter, rawSettings)
  let dry: DryRun | null = null
  try { dry = job.dryRun ? JSON.parse(job.dryRun) as DryRun : null } catch { dry = null }
  // Preview and dry run are mandatory, and must match exactly what is started.
  if (!dry || dry.settingsHash !== settingsHash(settings) || dry.fileHash !== job.fileHash) throw new ImportError('ابتدا پیش‌نمایش و اجرای آزمایشی (Dry Run) را با همین تنظیمات انجام دهید')
  if (settings.options.missingVariants === 'delete' && settings.options.confirmDelete !== true) throw new ImportError('حذف تنوع‌های غایب نیاز به تأیید جداگانه دارد')
  const updated = await db.importJob.update({ where: { id: job.id }, data: { status: 'QUEUED', settings: JSON.stringify(settings), total: dry.total, cursor: 0, stats: JSON.stringify({ total: dry.total }), startedAt: new Date(), error: '' } })
  kick(job.id)
  return updated
}

export async function setJobState(job: Job, op: 'pause' | 'resume' | 'cancel') {
  const allowed: Record<string, string[]> = { pause: ['QUEUED', 'RUNNING'], resume: ['PAUSED'], cancel: ['QUEUED', 'RUNNING', 'PAUSED'] }
  if (!allowed[op].includes(job.status)) throw new ImportError('این کار در وضعیت فعلی ورود اطلاعات ممکن نیست')
  const status = op === 'pause' ? 'PAUSED' : op === 'resume' ? 'QUEUED' : 'CANCELLED'
  // The record being written finishes in its own transaction; the worker stops before the next one.
  const updated = await db.importJob.update({ where: { id: job.id }, data: { status, ...(op === 'cancel' ? { finishedAt: new Date() } : {}) } })
  if (op === 'resume') kick(job.id)
  return updated
}

// ------------------------------------------------------------------ rollback

type Stored = { changes?: Change[]; counters?: Stats }

export async function startRollback(job: Job) {
  if (!['DONE', 'CANCELLED', 'FAILED', 'PAUSED'].includes(job.status)) throw new ImportError('بازگردانی فقط برای ورود اطلاعات تمام‌شده، لغوشده یا متوقف‌شده ممکن است')
  const updated = await db.importJob.update({ where: { id: job.id }, data: { status: 'ROLLING_BACK', lockedUntil: null } })
  setTimeout(() => void rollbackSlice(job.id).catch((error) => logEvent('error', 'imports.rollback_failed', { jobId: job.id, error: String(error) })), 50).unref?.()
  return updated
}

/** Undoes records newest first; rows changed since the import are reported, never overwritten. */
export async function rollbackSlice(jobId: number, budgetMs = 30_000): Promise<{ done: boolean }> {
  if (!await claim(jobId, ['ROLLING_BACK'])) return { done: false }
  const job = await db.importJob.findUnique({ where: { id: jobId } })
  if (!job) return { done: true }
  const adapter = adapterFor(job.adapter)
  const started = Date.now()
  const summary: Stats = (() => { try { return JSON.parse(job.stats || '{}') } catch { return {} } })()
  for (;;) {
    const records = await db.importRecord.findMany({ where: { jobId, action: { in: ['CREATE', 'UPDATE'] }, status: { in: ['OK', 'WARNING'] } }, orderBy: { index: 'desc' }, take: 20 })
    if (!records.length) break
    for (const record of records) {
      let stored: Stored = {}
      try { stored = JSON.parse(record.changes || '{}') } catch { stored = {} }
      let result
      try { result = await adapter.rollback(stored.changes || []) } catch (error) { result = { undone: 0, conflicts: [error instanceof Error ? error.message : 'خطا'] } }
      const messages = [...(JSON.parse(record.messages || '[]') as Message[]), ...result.conflicts.map((text) => ({ level: 'warning' as const, text: `بازگردانی: ${text}` }))]
      await db.importRecord.update({ where: { id: record.id }, data: { status: result.conflicts.length ? 'ROLLBACK_CONFLICT' : 'ROLLED_BACK', messages: JSON.stringify(messages.slice(0, 60)) } })
      addStats(summary, { rolledBack: result.conflicts.length ? 0 : 1, rollbackConflicts: result.conflicts.length ? 1 : 0 })
    }
    await db.importJob.update({ where: { id: jobId }, data: { stats: JSON.stringify(summary), lockedUntil: new Date(Date.now() + LEASE_MS) } })
    if (Date.now() - started > budgetMs) {
      await db.importJob.update({ where: { id: jobId }, data: { lockedUntil: null } })
      setTimeout(() => void rollbackSlice(jobId).catch(() => undefined), 200).unref?.()
      return { done: false }
    }
  }
  await db.importJob.update({ where: { id: jobId }, data: { status: 'ROLLED_BACK', stats: JSON.stringify(summary), lockedUntil: null, finishedAt: new Date() } })
  await auditSystem({ actor: { id: job.createdById, email: job.createdByEmail }, action: 'import.rolled_back', targetType: 'import-job', targetId: jobId, metadata: { adapter: job.adapter, rolledBack: summary.rolledBack || 0, conflicts: summary.rollbackConflicts || 0 } })
  return { done: true }
}

export type { SourceColumn }
