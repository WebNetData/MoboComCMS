import { createHmac } from 'node:crypto'
import dns from 'node:dns/promises'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { isPrivateAddress } from '@/modules/server-panel/domain/downloads'
import { sendMail } from '@/modules/mail/server/mailer'
import {
  DEFAULT_SLOT, FormsError, checkSubmission, parseForm, slotTimes, visibleFields,
  type Answer, type FormDefinition, type FormField, type FormWebhook, type StoredAnswer,
} from '@/modules/forms/domain/forms'
import { dueNotifications, fieldStats, mergeTags, recipients, slotDays, staffEditable, type MergeContext } from '@/modules/forms/domain/advanced'

// Appointments with capacity, messages that depend on the answers, webhooks, statistics,
// staff corrections and which member of staff may open which form.

const parse = <T,>(text: string, fallback: T): T => { try { return JSON.parse(text) as T } catch { return fallback } }
const tehranToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(now)
const tehranClock = (now = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)

// ------------------------------------------------------------------ appointments

/** The open days of an appointment field, and for one day its turns with the seats left. */
export async function slotAvailability(form: FormDefinition, fieldId: string, date: string, now = new Date()) {
  const field = form.fields.find((item) => item.id === fieldId && item.type === 'slot')
  if (!field || !form.id) throw new FormsError('این فیلد نوبت ندارد', 404)
  const rule = field.slot || DEFAULT_SLOT
  const today = tehranToday(now)
  const days = slotDays(rule, today)
  const day = days.includes(date) ? date : ''
  if (!day) return { days, date: '', times: [] as { time: string; left: number }[] }
  const taken = await db.formBooking.groupBy({ by: ['slot'], where: { formId: form.id, fieldId, slot: { startsWith: `${day} ` } }, _count: { _all: true } })
  const used = new Map(taken.map((row) => [row.slot.slice(11), row._count._all]))
  const clock = tehranClock(now)
  // Turns of today that have already begun are gone.
  const times = slotTimes(rule).filter((time) => day !== today || time > clock).map((time) => ({ time, left: Math.max(0, rule.capacity - (used.get(time) || 0)) }))
  return { days, date: day, times }
}

/**
 * Takes a seat for every appointment field of an answer, inside the answer's own transaction. The unique
 * key (form, field, turn, seat) is what holds the capacity: a seat taken at the same moment by somebody
 * else fails the transaction, and the caller tries the whole answer again.
 */
export async function bookSlots(tx: Prisma.TransactionClient, form: FormDefinition, shown: FormField[], values: Record<string, Answer>, submissionId: number, now = new Date()) {
  for (const field of shown) {
    if (field.type !== 'slot' || !values[field.id]) continue
    const rule = field.slot || DEFAULT_SLOT
    const slot = String(values[field.id])
    const today = tehranToday(now)
    if (!slotDays(rule, today).includes(slot.slice(0, 10)) || (slot.slice(0, 10) === today && slot.slice(11) <= tehranClock(now))) throw new FormsError(`نوبت «${field.label}» دیگر در دسترس نیست؛ زمان دیگری انتخاب کنید`, 409)
    const seats = await tx.formBooking.findMany({ where: { formId: form.id!, fieldId: field.id, slot }, select: { seat: true } })
    const taken = new Set(seats.map((row) => row.seat))
    let seat = 0
    for (let candidate = 1; candidate <= rule.capacity; candidate++) if (!taken.has(candidate)) { seat = candidate; break }
    if (!seat) throw new FormsError(`نوبت «${field.label}» پر شده است؛ زمان دیگری انتخاب کنید`, 409)
    await tx.formBooking.create({ data: { formId: form.id!, fieldId: field.id, slot, seat, submissionId } })
  }
}

/** A rejected answer gives its turn back. */
export const releaseSlots = (submissionId: number) => db.formBooking.deleteMany({ where: { submissionId } })

// ------------------------------------------------------------------ messages and webhooks

/** The extra notifications whose conditions hold, with their merge tags filled in. */
export async function sendFormNotifications(form: FormDefinition, context: MergeContext, values: Record<string, Answer | undefined>) {
  for (const item of dueNotifications(form.settings!, values)) {
    const subject = mergeTags(item.subject || `پاسخ تازه در «{form_title}»`, context).replace(/[\r\n]+/g, ' ').slice(0, 200)
    const text = mergeTags(item.body || '{all_fields}', context)
    for (const to of recipients(item.to, context.answers)) await sendMail({ to, subject, text, source: 'forms' }).catch((error) => logEvent('error', 'forms.notification_failed', { form: form.slug, error }))
  }
}

async function assertPublicHook(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('webhook must be https')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = /^[\d.]+$|:/.test(host) ? [host] : (await dns.lookup(host, { all: true })).map((row) => row.address)
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('webhook address is not public')
  return url
}

/** Tells the form's webhooks about an event. Passwords are never in the payload; the body is signed with the hook's secret. */
export async function sendFormWebhooks(form: Pick<FormDefinition, 'id' | 'slug' | 'title' | 'settings'>, event: FormWebhook['events'][number], payload: Record<string, unknown>) {
  const hooks = (form.settings?.webhooks || []).filter((hook) => hook.events.includes(event))
  for (const hook of hooks) {
    const body = JSON.stringify({ event, form: { id: form.id, slug: form.slug, title: form.title }, sentAt: new Date().toISOString(), ...payload })
    try {
      const url = await assertPublicHook(hook.url)
      const response = await fetch(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
        headers: { 'content-type': 'application/json', 'user-agent': 'MoboCom-Forms/1', 'x-mobocom-event': event, ...(hook.secret ? { 'x-mobocom-signature': `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}` } : {}) },
        body,
      })
      logEvent(response.ok ? 'info' : 'warn', 'forms.webhook', { form: form.slug, event, host: url.hostname, status: response.status })
    } catch (error) { logEvent('warn', 'forms.webhook_failed', { form: form.slug, event, error }) }
  }
}

/** The answer as a webhook carries it: readable answers only (a password stays masked, as it is stored). */
export const webhookAnswers = (answers: StoredAnswer[]) => Object.fromEntries(answers.map((answer) => [answer.id, { label: answer.label, type: answer.type || 'text', value: answer.value }]))

// ------------------------------------------------------------------ statistics

export async function formFieldStats(formId: number) {
  const form = await db.siteForm.findUnique({ where: { id: formId } })
  if (!form) throw new FormsError('فرم پیدا نشد', 404)
  const rows = await db.formSubmission.findMany({ where: { formId, status: { not: 'SPAM' } }, select: { data: true, score: true, scoreMax: true }, orderBy: { id: 'desc' }, take: 5000 })
  const scored = rows.filter((row) => row.scoreMax > 0)
  return {
    answers: rows.length, fields: fieldStats(parseForm(form).fields, rows.map((row) => parse<StoredAnswer[]>(row.data, []))),
    quiz: scored.length ? { taken: scored.length, average: Math.round(scored.reduce((sum, row) => sum + row.score, 0) / scored.length * 10) / 10, max: scored[0].scoreMax } : null,
  }
}

// ------------------------------------------------------------------ staff corrections

/** A member of staff corrects plain answers of a stored submission (a typo in a name or a phone number). */
export async function editSubmission(submissionId: number, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FormsError('اطلاعات ویرایش معتبر نیست')
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, include: { form: true } })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  const form = parseForm(row.form)
  const answers = parse<StoredAnswer[]>(row.data, [])
  const patch = input as Record<string, unknown>
  const fields = form.fields.filter((field) => field.id in patch)
  if (!fields.length) throw new FormsError('فیلدی برای ویرایش انتخاب نشده است')
  const locked = fields.find((field) => !staffEditable(field))
  if (locked) throw new FormsError(`«${locked.label}» قابل ویرایش نیست (مبلغ، نوبت، رمز و فایل همان می‌ماند که فرستنده داده است)`)
  // Each edited field is checked by its own rules, on its own (conditions of other fields do not hide it here).
  const changed: string[] = []
  for (const field of fields) {
    const { values, errors } = checkSubmission([{ ...field, showIf: undefined, logic: undefined }], { [field.id]: patch[field.id] })
    if (errors[field.id]) throw new FormsError(errors[field.id])
    const at = answers.findIndex((answer) => answer.id === field.id)
    const next: StoredAnswer = { id: field.id, label: field.label, type: field.type, value: values[field.id] as Answer }
    if (at >= 0) answers[at] = next; else answers.push(next)
    changed.push(field.id)
  }
  await db.formSubmission.update({ where: { id: row.id }, data: { data: JSON.stringify(answers) } })
  return { changed, answers }
}

// ------------------------------------------------------------------ who may open which form

/** A form with named handlers is open to them only (builders, who hold cms.pages, open every form). */
export const mayHandle = (form: Pick<FormDefinition, 'settings'>, user: { id: number }, builder: boolean) => builder || !form.settings?.handlers.length || form.settings.handlers.includes(user.id)

export async function assertMayHandleForm(formId: number, user: { id: number }, builder: boolean) {
  if (builder) return
  const form = await db.siteForm.findUnique({ where: { id: formId } })
  if (!form || !mayHandle(parseForm(form), user, false)) throw new FormsError('این فرم به شما سپرده نشده است', 403)
}

export async function assertMayHandleSubmission(submissionId: number, user: { id: number }, builder: boolean) {
  if (builder) return
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, select: { formId: true } })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  await assertMayHandleForm(row.formId, user, false)
}

/** Members of staff a form's work can be given to (accounts of the admin area). */
export async function formStaff() {
  const rows = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, name: true, email: true }, orderBy: { id: 'asc' }, take: 200 })
  return rows.map((row) => ({ id: row.id, name: row.name || row.email || `کاربر ${row.id}` }))
}

export { visibleFields }
