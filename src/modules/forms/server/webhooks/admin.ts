import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { FormsError, parseForm } from '../../domain/forms'
import { assertFormsAvailable } from '../availability'
import { endpoints, matchingEndpoint, recordWebhook, scheduleWebhook, type WebhookStatus } from './store'

const PAGE_SIZE = 30
const FAILURE_DETAIL: Record<string, string> = {
  EXPIRED: 'مهلت نگه‌داری دادهٔ ارسال گذشته است.',
  SOURCE_REMOVED: 'پاسخ فرم حذف، پاک‌سازی یا به‌عنوان هرزنامه علامت‌گذاری شده است.',
  TARGET_CHANGED: 'تنظیمات مقصد یا رویداد تغییر کرده است.',
  MODULE_PAUSED: 'ارسال پس از فعال‌سازی فرم‌ها دوباره بررسی می‌شود.',
  HTTP_RESPONSE: 'مقصد پاسخ ناموفق برگرداند.',
  NOT_SENT: 'برقراری اتصال به مقصد پیش از ارسال ناموفق بود.',
  TARGET_BLOCKED: 'نشانی مقصد برای ارسال مجاز نیست.',
  RESPONSE_UNKNOWN: 'مقصد ممکن است پیام را دریافت کرده باشد.',
  WORKER_INTERRUPTED: 'اجرای ارسال پیش از ثبت نتیجه متوقف شد.',
  PAYLOAD_UNAVAILABLE: 'دادهٔ ارسال در دسترس نیست.',
  AUTHORITY_CHANGED: 'امکان ارسال پیش از برقراری ارتباط تغییر کرد.',
}

type Actor = { id: number; email: string }
type ReplayCandidate = { failure: string; event: string; status: string; expiresAt: Date | null; endpointKey: string; submission: { status: string; data?: string } | null }

function canReplay(row: ReplayCandidate, targets: ReturnType<typeof endpoints>, now: Date) {
  return (row.status === 'UNKNOWN' || row.status === 'FAILED') &&
    row.failure !== 'TARGET_BLOCKED' &&
    (!row.submission || (row.submission.status !== 'SPAM' && row.submission.data !== '{}')) &&
    !!row.expiresAt && row.expiresAt > now && !!matchingEndpoint(targets, row.endpointKey, row.event)
}

export async function listFormWebhookDeliveries(formId: number, filter: { status?: WebhookStatus; before?: number } = {}) {
  const [form, rows] = await Promise.all([
    db.siteForm.findUnique({ where: { id: formId } }),
    db.formWebhookDelivery.findMany({
      where: { formId, status: filter.status, ...(filter.before ? { id: { lt: filter.before } } : {}) },
      orderBy: { id: 'desc' }, take: PAGE_SIZE + 1,
      select: {
        id: true, eventId: true, event: true, endpointKey: true, host: true, status: true, failure: true, attempts: true,
        httpStatus: true, durationMs: true, createdAt: true, updatedAt: true, nextAttemptAt: true, expiresAt: true,
        submission: { select: { status: true } },
      },
    }),
  ])
  if (!form) throw new FormsError('فرم پیدا نشد', 404)
  const targets = endpoints(parseForm(form))
  const now = new Date()
  const page = rows.slice(0, PAGE_SIZE)
  return {
    rows: page.map(row => ({
      id: row.id, eventId: row.eventId, event: row.event, host: row.host, status: row.status,
      attempts: row.attempts, httpStatus: row.httpStatus, durationMs: row.durationMs,
      detail: FAILURE_DETAIL[row.failure] ?? '', createdAt: row.createdAt, updatedAt: row.updatedAt,
      nextAttemptAt: row.status === 'IN_FLIGHT' ? null : row.nextAttemptAt, replayable: canReplay(row, targets, now),
    })),
    targets: targets.map(({ index, host, enabled }) => ({ index, host, enabled })),
    nextBefore: rows.length > PAGE_SIZE ? page[PAGE_SIZE - 1].id : null,
  }
}

export async function testFormWebhook(req: NextRequest, actor: Actor, formId: number, targetIndex: number) {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > 2) throw new FormsError('مقصد آزمون را انتخاب کنید')
  return db.$transaction(async tx => {
    await assertFormsAvailable(tx)
    const form = await tx.siteForm.findUnique({ where: { id: formId } })
    if (!form) throw new FormsError('فرم پیدا نشد', 404)
    const definition = parseForm(form)
    const target = endpoints(definition)[targetIndex]
    if (!target) throw new FormsError('مقصد ذخیره‌شده پیدا نشد', 404)
    const saved = await recordWebhook(tx, { ...definition, id: form.id }, target, 'test', null, `test:${randomUUID()}`, { test: true })
    await auditAdminStrict({ req, actor, action: 'forms.webhooks.test', targetType: 'form-webhook-delivery', targetId: saved.id, metadata: { formId, eventId: saved.eventId } }, tx)
    return saved
  })
}

export async function replayFormWebhook(req: NextRequest, actor: Actor, formId: number, id: number, reason: unknown, confirmed: unknown) {
  const note = typeof reason === 'string' ? reason.trim() : ''
  if (confirmed !== true || note.length < 5 || note.length > 300) throw new FormsError('ارسال دوباره را تأیید کنید و دلیل آن را در ۵ تا ۳۰۰ نویسه بنویسید')
  return db.$transaction(async tx => {
    await assertFormsAvailable(tx)
    const row = await tx.formWebhookDelivery.findFirst({
      where: { id, formId }, include: { form: true, submission: { select: { status: true, data: true } } },
    })
    if (!row) throw new FormsError('رویداد ارسال پیدا نشد', 404)
    const now = new Date()
    if (!canReplay(row, endpoints(parseForm(row.form)), now)) throw new FormsError('این رویداد در وضعیت فعلی قابل ارسال دوباره نیست', 409)
    const updated = await tx.formWebhookDelivery.updateMany({
      where: { id, version: row.version, status: row.status, expiresAt: { gt: now } },
      data: {
        status: 'PENDING', version: { increment: 1 }, nextAttemptAt: now, cycleAttempts: 0,
        failure: '', httpStatus: null, durationMs: null,
      },
    })
    if (!updated.count) throw new FormsError('وضعیت ارسال تغییر کرده است؛ تاریخچه را تازه کنید', 409)
    await scheduleWebhook(tx, id, row.version + 1, now)
    await auditAdminStrict({
      req, actor, action: 'forms.webhooks.replay', targetType: 'form-webhook-delivery', targetId: id,
      metadata: { formId, eventId: row.eventId, previousStatus: row.status, previousHttpStatus: row.httpStatus, previousAttempts: row.attempts, reason: note },
    }, tx)
    return { id, eventId: row.eventId }
  })
}
