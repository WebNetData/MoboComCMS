import type { OptionDef } from '@/modules/imports/server/registry'
import { db } from '@/platform/database/prisma'
import { STAT_LABELS, toCsv } from '@/modules/imports/domain/report'
import { LIMITS, type ImportSettings, type Message } from '@/modules/imports/domain/types'
import { appendUploadChunk, deleteUpload, finishUploadFile } from '@/modules/imports/server/files'
import {
  adapterFor, analyzeJob, ensureModule, ImportError, planJob, readSettings, settingsFor, setJobState, startJob, startRollback, type DryRun,
} from '@/modules/imports/server/engine'
import { listImporters } from '@/modules/imports/server/registry'
import { authorizedImportActor } from '@/modules/imports/server/authority'

/**
 * What the admin wizard and history pages call. Every function takes
 * validated ids and untrusted bodies; the HTTP layer adds the permission
 * check and the audit entries.
 */

type Actor = { id: number; email: string }
type Job = NonNullable<Awaited<ReturnType<typeof db.importJob.findUnique>>>

const idOf = (value: unknown) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new ImportError('شناسه نامعتبر است')
  return id
}

export async function getJob(id: unknown): Promise<Job> {
  const job = await db.importJob.findUnique({ where: { id: idOf(id) } })
  if (!job) throw new ImportError('ورود اطلاعات پیدا نشد', 404)
  return job
}

/** New owner-scoped destinations keep file previews/reports behind the same current section authority as writes. */
export async function requireJobAccess(id: unknown, actor: Actor) {
  const job = await getJob(id), adapter = adapterFor(job.adapter)
  if (adapter.permissions?.length && !await authorizedImportActor(actor.id, new Date(), adapter.id)) throw new ImportError('دسترسی مدیریت این مقصد لازم است', 403)
  return job
}

const parseJson = <T>(text: string, fallback: T): T => { try { return JSON.parse(text) as T } catch { return fallback } }

/** A job for the wizard and the history (the file itself never leaves the server). */
export function jobView(job: Job) {
  return {
    id: job.id, adapter: job.adapter, status: job.status, fileName: job.fileName, format: job.format,
    total: job.total, cursor: job.cursor, stats: parseJson<Record<string, number>>(job.stats, {}),
    settings: parseJson<Partial<ImportSettings>>(job.settings, {}), dryRun: job.dryRun ? parseJson<DryRun | null>(job.dryRun, null) : null,
    templateId: job.templateId, error: job.error, createdByEmail: job.createdByEmail,
    createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt, updatedAt: job.updatedAt,
  }
}

/** Destinations with the metadata the wizard renders (fields, variant fields, options, identity rules). */
export async function destinations(actor?: Actor) {
  const { isModuleEnabled } = await import('@/extensions/server/modules')
  const out = []
  for (const adapter of listImporters()) {
    const modulesOn = (await Promise.all([adapter.module, ...(adapter.requiredModules || [])].filter((id): id is string => !!id).map(id => isModuleEnabled(id)))).every(Boolean)
    const permitted = !adapter.permissions?.length || !!(actor && await authorizedImportActor(actor.id, new Date(), adapter.id))
    out.push({
      id: adapter.id, label: adapter.label, description: adapter.description, entity: adapter.entity,
      enabled: modulesOn && permitted, unavailableReason: !modulesOn ? 'بخش یا وابستگی آن در سایت خاموش است' : !permitted ? 'دسترسی مدیریت این مقصد لازم است' : '',
      fields: adapter.fields, variantFields: adapter.variantFields || [], variantLabel: adapter.variantLabel || '',
      supports: adapter.supports, identity: adapter.identity, options: [...adapter.options, ...MEDIA_OPTIONS],
    })
  }
  return { destinations: out, limits: LIMITS, statLabels: STAT_LABELS }
}

export async function choicesFor(adapterId: unknown, key: unknown) {
  const adapter = adapterFor(String(adapterId || ''))
  const option = adapter.options.find((o) => o.key === key && o.dynamic)
  if (!option || !adapter.choices) return []
  return adapter.choices(option.key)
}

/**
 * Upload, one chunk per call: streamed to disk; with `final`, the file is
 * parsed and validated and a DRAFT job holds it.
 */
export async function uploadChunk(actor: Actor, input: { adapter: unknown; name: unknown; token: unknown; offset: unknown; final: boolean }, body: ReadableStream<Uint8Array> | null) {
  const adapter = adapterFor(String(input.adapter || ''))
  await ensureModule(adapter)
  if (adapter.permissions?.length && !await authorizedImportActor(actor.id, new Date(), adapter.id)) throw new ImportError('دسترسی مدیریت مقصد لازم است', 403)
  const received = await appendUploadChunk(input.token || '', input.offset, body)
  if (!input.final) return { token: received.token, received: received.size, done: false as const }
  const name = String(input.name || 'import').replace(/[\u0000-\u001f/\\]/g, '').slice(0, 180) || 'import'
  const saved = await finishUploadFile(received.token, name)
  try {
    const job = await db.importJob.create({
      data: {
        adapter: adapter.id, status: 'DRAFT', fileName: name, fileKey: saved.fileKey, fileHash: saved.hash, format: saved.parsed.format,
        total: saved.parsed.rows.length, createdById: actor.id, createdByEmail: actor.email,
        settings: JSON.stringify({ sheet: saved.parsed.sheet || '', options: { mediaPolicyVersion: 1, copyAssets: false } }),
      },
    })
    return { done: true as const, job: jobView(job), size: saved.size, rows: saved.parsed.rows.length, sheets: saved.parsed.sheets || [] }
  } catch (error) {
    await deleteUpload(saved.fileKey)
    throw error
  }
}

const draftOnly = (job: Job) => { if (job.status !== 'DRAFT') throw new ImportError('تنظیمات ورود اطلاعاتِ شروع‌شده قابل تغییر نیست') }

export async function analyze(job: Job, sheet?: unknown) {
  if (typeof sheet === 'string' && job.status === 'DRAFT') {
    const settings = { ...readSettings(job), sheet: sheet.slice(0, 100) }
    job = await db.importJob.update({ where: { id: job.id }, data: { settings: JSON.stringify(settings), dryRun: '' } })
  }
  return analyzeJob(job)
}

/** Stores the wizard's settings (validated); any earlier dry run no longer applies. */
export async function saveSettings(job: Job, raw: unknown, templateId?: unknown) {
  draftOnly(job)
  const settings = settingsFor(adapterFor(job.adapter), raw, job)
  const template = templateId ? await db.importTemplate.findUnique({ where: { id: idOf(templateId) }, select: { id: true } }) : null
  const updated = await db.importJob.update({ where: { id: job.id }, data: { settings: JSON.stringify(settings), dryRun: '', ...(template ? { templateId: template.id } : {}) } })
  return jobView(updated)
}

export async function preview(job: Job, raw: unknown, actor: Actor, count: unknown) {
  const limit = Math.min(Math.max(Number(count) || 10, 5), LIMITS.previewItems)
  const { summary, previews } = await planJob(job, raw, actor, limit)
  return { previews, summary }
}

/** Dry run of the whole file with these settings; stored so the start can check it matches. */
export async function dryRun(job: Job, raw: unknown, actor: Actor) {
  draftOnly(job)
  const { settings, summary, previews } = await planJob(job, raw, actor)
  await db.importJob.update({ where: { id: job.id }, data: { settings: JSON.stringify(settings), dryRun: JSON.stringify(summary) } })
  return { summary, previews }
}

export async function start(job: Job, raw: unknown, actor: Actor) {
  return jobView(await startJob(job, raw, actor))
}

export async function control(job: Job, op: 'pause' | 'resume' | 'cancel', actor: Actor) {
  return jobView(await setJobState(job, op, actor))
}

export async function rollback(job: Job, actor: Actor) {
  return jobView(await startRollback(job, actor))
}

export async function removeJob(job: Job) {
  if (['QUEUED', 'RUNNING', 'ROLLING_BACK'].includes(job.status)) throw new ImportError('ابتدا ورود اطلاعات را متوقف یا لغو کنید')
  await deleteUpload(job.fileKey)
  // The per-record history goes with the job (cascade); external-id links stay so a later import still finds the rows.
  await db.importJob.delete({ where: { id: job.id } })
}

export async function jobList(input: { adapter?: unknown; status?: unknown; page?: unknown }) {
  const page = Math.max(1, Math.min(10_000, Number(input.page) || 1))
  const where: Record<string, unknown> = {}
  if (typeof input.adapter === 'string' && input.adapter) where.adapter = input.adapter.slice(0, 40)
  if (typeof input.status === 'string' && input.status) where.status = input.status.slice(0, 20)
  const [rows, total] = await Promise.all([
    db.importJob.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 25, take: 25 }),
    db.importJob.count({ where }),
  ])
  return { jobs: rows.map((job) => { const v = jobView(job); return { ...v, dryRun: undefined, settings: undefined } }), total, page, pages: Math.max(1, Math.ceil(total / 25)) }
}

const RECORD_STATUSES = ['OK', 'WARNING', 'FAILED', 'ROLLED_BACK', 'ROLLBACK_CONFLICT']

export async function records(job: Job, input: { status?: unknown; page?: unknown }) {
  const page = Math.max(1, Math.min(100_000, Number(input.page) || 1))
  const status = typeof input.status === 'string' && RECORD_STATUSES.includes(input.status) ? input.status : undefined
  const where = { jobId: job.id, ...(status ? { status } : {}) }
  const [rows, total, counts] = await Promise.all([
    db.importRecord.findMany({ where, orderBy: { index: 'asc' }, skip: (page - 1) * 50, take: 50 }),
    db.importRecord.count({ where }),
    db.importRecord.groupBy({ by: ['status'], where: { jobId: job.id }, _count: { _all: true } }),
  ])
  return {
    records: rows.map((row) => ({
      id: row.id, index: row.index, rows: parseJson<{ rows?: number[] }>(row.changes, {}).rows || [], sourceKey: row.sourceKey, title: row.title,
      action: row.action, status: row.status, entityType: row.entityType, entityId: row.entityId, messages: parseJson<Message[]>(row.messages, []),
    })),
    total, page, pages: Math.max(1, Math.ceil(total / 50)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  }
}

/** Records with errors or warnings as CSV (formula-safe) or JSON. */
export async function exportErrors(job: Job, format: 'csv' | 'json', all = false) {
  const rows = await db.importRecord.findMany({ where: { jobId: job.id, ...(all ? {} : { status: { in: ['FAILED', 'WARNING', 'ROLLBACK_CONFLICT'] } }) }, orderBy: { index: 'asc' }, take: 50_000 })
  const items = rows.map((row) => ({
    record: row.index + 1, rows: (parseJson<{ rows?: number[] }>(row.changes, {}).rows || []).join(' '), sourceKey: row.sourceKey, title: row.title,
    action: row.action, status: row.status, entity: row.entityType, entityId: row.entityId ?? '',
    errors: parseJson<Message[]>(row.messages, []).filter((m) => m.level === 'error').map((m) => m.text).join(' | '),
    warnings: parseJson<Message[]>(row.messages, []).filter((m) => m.level === 'warning').map((m) => m.text).join(' | '),
  }))
  if (format === 'json') return JSON.stringify({ job: job.id, file: job.fileName, adapter: job.adapter, records: items }, null, 2)
  const header = ['رکورد', 'ردیف‌های فایل', 'شناسهٔ منبع', 'عنوان', 'عملیات', 'وضعیت', 'نوع', 'شناسه', 'خطاها', 'هشدارها']
  return toCsv(header, items.map((i) => [i.record, i.rows, i.sourceKey, i.title, i.action, i.status, i.entity, i.entityId, i.errors, i.warnings]))
}

// ------------------------------------------------------------------ templates

/** A template keeps the wizard's decisions (mapping, policies, options), never the file or its rows. */
export async function templateList(adapter?: unknown) {
  const rows = await db.importTemplate.findMany({ where: typeof adapter === 'string' && adapter ? { adapter: adapter.slice(0, 40) } : {}, orderBy: [{ adapter: 'asc' }, { name: 'asc' }] })
  return rows.map((row) => ({ id: row.id, name: row.name, adapter: row.adapter, settings: parseJson<Partial<ImportSettings>>(row.settings, {}), updatedAt: row.updatedAt }))
}

export async function templateSave(actor: Actor, input: { id?: unknown; name?: unknown; adapter?: unknown; settings?: unknown }) {
  const adapter = adapterFor(String(input.adapter || ''))
  if (adapter.permissions?.length && !await authorizedImportActor(actor.id, new Date(), adapter.id)) throw new ImportError('دسترسی مدیریت این مقصد لازم است', 403)
  const name = String(input.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120)
  if (!name) throw new ImportError('نام الگو را وارد کنید')
  const settings = settingsFor(adapter, input.settings)
  const { sheet: _sheet, ...kept } = settings
  const data = { name, adapter: adapter.id, settings: JSON.stringify(kept) }
  const clash = await db.importTemplate.findUnique({ where: { adapter_name: { adapter: adapter.id, name } } })
  if (input.id) {
    const id = idOf(input.id)
    if (clash && clash.id !== id) throw new ImportError('الگویی با این نام وجود دارد')
    const row = await db.importTemplate.update({ where: { id }, data })
    return { id: row.id, name: row.name, adapter: row.adapter, created: false }
  }
  if (clash) throw new ImportError('الگویی با این نام وجود دارد')
  const row = await db.importTemplate.create({ data: { ...data, createdById: actor.id } })
  return { id: row.id, name: row.name, adapter: row.adapter, created: true }
}

export async function templateDelete(id: unknown) {
  await db.importTemplate.delete({ where: { id: idOf(id) } }).catch(() => { throw new ImportError('الگو پیدا نشد', 404) })
}

const MEDIA_OPTIONS: OptionDef[] = [
  { key: 'copyAssets', label: 'تصاویر و فایل‌ها به سرور سایت منتقل شوند', type: 'bool', default: false, step: 8, hint: 'خاموش: لینک‌های بیرونی حفظ می‌شوند و هیچ فایل رسانه‌ای دانلود نمی‌شود. روشن: تصاویر، فایل‌های صوتی و لینک‌های دانلود انتخاب‌شده منتقل می‌شوند.' },
  { key: 'mediaTransferMode', label: 'زمان انتقال رسانه', type: 'select', default: 'immediate', step: 8, when: { key: 'copyAssets', values: [true] }, choices: [{ value: 'immediate', label: 'هنگام ورود اطلاعات' }, { value: 'queued', label: 'در پس‌زمینه' }, { value: 'scheduled', label: 'در زمان مشخص' }], hint: 'در انتقال پس‌زمینه، لینک سایت تا تکمیل انتقال به منبع اصلی هدایت می‌شود.' },
  { key: 'mediaTransferAt', label: 'تاریخ و ساعت انتقال (ISO 8601)', type: 'text', default: '', step: 8, when: { key: 'mediaTransferMode', values: ['scheduled'] }, hint: 'برای مثال: 2026-10-20T02:00:00+03:30' },
]
