import { db } from '@/platform/database/prisma'
import { minorToNumber, toMinor } from '@/shared/money'
import { quoteForeignAmount } from '@/modules/fx/server/fx'
import { FxError, percentToBps } from '@/modules/fx/domain/fx'
import { decryptDigitalDelivery, encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { formStaff, releaseSlots, sendFormNotifications, sendFormWebhooks, webhookAnswers } from '@/modules/forms/server/advanced'
import {
  FormsError, SECRET_MASK, deviceLockText, parseForm, parseFxAnswer, priceLines, stepLabel, visibleFields, workSteps,
  type Answer, type FormDefinition, type PriceLine, type StoredAnswer, type WorkStep,
} from '@/modules/forms/domain/forms'
import { randomBytes, randomInt } from 'node:crypto'
import { mergeTags } from '@/modules/forms/domain/advanced'

// Paid forms and the work on an answer: the bill, the payment through the site's own checkout,
// the secrets a sender hands over, and the stage staff move an answer through.

/** Forms are billed in toman; a foreign amount is converted into it. */
export const FORM_CURRENCY = 'IRT'
const parse = <T,>(text: string, fallback: T): T => { try { return JSON.parse(text) as T } catch { return fallback } }

export type Bill = { lines: PriceLine[]; total: number; totalMinor: bigint; currency: string }

/** The bill of these answers, now: fixed costs, priced options and typed foreign amounts at today's rate. */
export async function billFor(form: FormDefinition, values: Record<string, Answer | undefined>): Promise<Bill> {
  const quotes = new Map<string, { amount: number; rate: number }>()
  for (const field of visibleFields(form.fields, values)) {
    if (field.type !== 'fxamount') continue
    const typed = parseFxAnswer(values[field.id])
    if (!typed) continue
    try {
      const quote = await quoteForeignAmount({ currency: FORM_CURRENCY, markupBps: percentToBps(field.markupPercent || 0), markupFixedMinor: toMinor(String(field.markupFixed || 0), FORM_CURRENCY) }, BigInt(typed.cents), typed.currency)
      if (quote.priceMinor > 0n && quote.rate > 0) quotes.set(field.id, { amount: minorToNumber(quote.priceMinor, FORM_CURRENCY), rate: quote.rate })
    } catch (error) {
      // No rate (or a locked one): the line stays unpriced and the bill refuses below.
      if (!(error instanceof FxError)) throw error
    }
  }
  const bill = priceLines(form.fields, values, (field) => quotes.get(field.id) || null)
  return { ...bill, totalMinor: toMinor(String(bill.total), FORM_CURRENCY), currency: FORM_CURRENCY }
}

// ------------------------------------------------------------------ secrets

/** Splits the answers into what is stored readable and what is stored encrypted (passwords). */
export function sealSecrets(answers: StoredAnswer[]): { answers: StoredAnswer[]; secrets: string } {
  const hidden = answers.filter((answer) => (answer.type === 'secret' || answer.type === 'devicelock') && typeof answer.value === 'string' && answer.value)
  if (!hidden.length) return { answers, secrets: '' }
  return {
    answers: answers.map((answer) => (hidden.includes(answer) ? { ...answer, value: SECRET_MASK } : answer)),
    secrets: encryptDigitalDelivery(JSON.stringify(Object.fromEntries(hidden.map((answer) => [answer.id, answer.value])))),
  }
}

/** The passwords of one answer, for the member of staff doing the work. The route records who looked. */
export async function revealSecrets(submissionId: number) {
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, select: { secrets: true, data: true } })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  if (!row.secrets) return []
  let values: Record<string, string> = {}
  try { values = JSON.parse(decryptDigitalDelivery(row.secrets)) } catch { throw new FormsError('این اطلاعات قابل خواندن نیست', 409) }
  return parse<StoredAnswer[]>(row.data, []).filter((answer) => (answer.type === 'secret' || answer.type === 'devicelock') && values[answer.id])
    .map((answer) => ({ id: answer.id, label: answer.label, value: values[answer.id], type: answer.type, text: answer.type === 'devicelock' ? deviceLockText(values[answer.id]) : values[answer.id] }))
}

export async function eraseSecrets(submissionId: number) {
  const done = await db.formSubmission.updateMany({ where: { id: submissionId, secrets: { not: '' } }, data: { secrets: '', secretsErasedAt: new Date() } })
  if (!done.count) throw new FormsError('اطلاعات محرمانه‌ای برای پاک‌کردن نمانده است', 409)
}

/** A turn held by a bill nobody paid within a day goes back to the others. */
export async function releaseUnpaidSlots(now = new Date()) {
  const stale = await db.formBooking.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) }, submission: { payStatus: 'UNPAID' } }, select: { id: true }, take: 500 })
  if (!stale.length) return 0
  return (await db.formBooking.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } })).count
}

export const SECRET_KEEP_DAYS = 7
/** Passwords are wiped a week after the work on an answer ended (done or rejected), or after a bill nobody paid. */
export async function eraseFinishedSecrets(limit = 200, now = new Date()) {
  const before = new Date(now.getTime() - SECRET_KEEP_DAYS * 86_400_000)
  const rows = await db.formSubmission.findMany({
    where: { secrets: { not: '' }, createdAt: { lt: before }, OR: [{ stage: { in: ['DONE', 'REJECTED'] } }, { payStatus: 'UNPAID' }] },
    select: { id: true }, take: limit, orderBy: { id: 'asc' },
  })
  if (!rows.length) return 0
  return (await db.formSubmission.updateMany({ where: { id: { in: rows.map((row) => row.id) }, secrets: { not: '' } }, data: { secrets: '', secretsErasedAt: now } })).count
}

// ------------------------------------------------------------------ payment

const valuesOf = (answers: StoredAnswer[]) => Object.fromEntries(answers.map((answer) => [answer.id, answer.value])) as Record<string, Answer>

/**
 * What checkout charges for one unpaid answer. The bill is priced again here, with the rate of this
 * moment, and stored on the answer — so a rate that moved changes the price before the sender pays.
 */
export async function formCheckoutQuote(submissionId: number, userId: number) {
  const row = await db.formSubmission.findFirst({ where: { id: submissionId, userId }, include: { form: true } })
  if (!row) throw new FormsError('این درخواست در حساب شما نیست', 404)
  if (row.payStatus === 'PAID') throw new FormsError('این درخواست قبلاً پرداخت شده است', 409)
  if (row.payStatus !== 'UNPAID' || row.status === 'SPAM') throw new FormsError('این درخواست پرداختی ندارد', 409)
  const form = parseForm(row.form)
  if (!form.settings?.payment.enabled) throw new FormsError('پرداخت این فرم بسته شده است', 409)
  const bill = await billFor(form, valuesOf(parse<StoredAnswer[]>(row.data, [])))
  // The foreign currencies this answer is priced in (its typed foreign amounts).
  const answers = parse<StoredAnswer[]>(row.data, [])
  const fxCurrencies = form.fields.filter((field) => field.type === 'fxamount').map((field) => parseFxAnswer(answers.find((answer) => answer.id === field.id)?.value)?.currency || '').filter(Boolean)
  if (bill.totalMinor <= 0n) throw new FormsError('مبلغی برای پرداخت محاسبه نشد', 409)
  await db.formSubmission.update({ where: { id: row.id }, data: { amountMinor: bill.totalMinor, currency: bill.currency, pricing: JSON.stringify(bill.lines) } })
  // What the invoice says: the form's own title and description, filled from this answer (passwords are stored masked).
  // Each answer is set apart (first-strong isolate), so an address or "25.00 USD" reads correctly inside Persian text.
  const isolate = (answer: StoredAnswer): StoredAnswer => (typeof answer.value === 'string' && answer.value ? { ...answer, value: `\u2068${answer.value}\u2069` } : answer)
  const context = { formTitle: form.title, entryId: row.id, answers: parse<StoredAnswer[]>(row.data, []).map(isolate) }
  const invoiceTitle = mergeTags(form.settings.payment.invoiceTitle, context).replace(/\s+/g, ' ').trim().slice(0, 120)
  const invoiceText = mergeTags(form.settings.payment.invoiceText, context).replace(/\s+/g, ' ').trim().slice(0, 500)
  return { submissionId: row.id, formId: row.formId, title: form.title, amountMinor: bill.totalMinor, currency: bill.currency, invoiceTitle, invoiceText, fxCurrencies }
}

export async function attachFormOrder(submissionId: number, orderId: number) {
  await db.formSubmission.updateMany({ where: { id: submissionId, payStatus: 'UNPAID' }, data: { orderId } })
}

/** A paid form order: the answer becomes paid, goes to staff as open work, and both sides are told. Safe to run twice. */
export async function fulfillFormOrder(orderId: number): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true, totalMinor: true, currency: true } })
  if (!order || order.status !== 'PAID') throw new Error('form order is not paid')
  const meta = parse<Record<string, unknown>>(order.meta || '{}', {})
  const submissionId = Number(meta.submissionId)
  if (meta.kind !== 'form' || !Number.isSafeInteger(submissionId)) throw new Error('form order has no answer')
  const paid = await db.formSubmission.updateMany({ where: { id: submissionId, userId: order.userId, payStatus: 'UNPAID' }, data: { payStatus: 'PAID', paidAt: new Date(), stage: 'OPEN', orderId: order.id, amountMinor: order.totalMinor, currency: order.currency } })
  if (!paid.count) return
  const title = String(meta.formTitle || '').slice(0, 80)
  // The form's own notifications and webhooks hear about a paid request now (they were held back until the money came).
  const stored = await db.formSubmission.findUnique({ where: { id: submissionId }, include: { form: true } })
  if (stored) {
    const form = parseForm(stored.form), answers = parse<StoredAnswer[]>(stored.data, [])
    const total = minorToNumber(order.totalMinor, order.currency)
    void sendFormNotifications(form, { formTitle: form.title, entryId: submissionId, answers, total }, valuesOf(answers)).catch(() => undefined)
    void (await import('@/modules/forms/server/service')).emitFormEvent('form.paid', form, submissionId, order.userId, total).catch(() => undefined)
    void sendFormWebhooks(form, 'paid', { entryId: submissionId, orderId: order.id, total, currency: order.currency, answers: webhookAnswers(answers) }).catch(() => undefined)
  }
  await createInboxEvent({
    userId: order.userId, kind: 'FORM', dedupeKey: `form:paid:${submissionId}`, titleFa: `پرداخت «${title}» انجام شد`, titleEn: 'Your request is paid',
    bodyFa: 'درخواست شما به کارشناس سپرده شد؛ وضعیت آن را در «درخواست‌های من» ببینید.', bodyEn: 'Your request is with our staff now.', href: '/dashboard/requests',
  }).catch(() => undefined)
  // The form's own handlers hear about it when it names them; otherwise the managers (owner, 2026-10-28).
  const handlers = stored ? parseForm(stored.form).settings?.handlers || [] : []
  const staff = (await (await import('@/modules/forms/server/advanced')).formRecipients(handlers)).slice(0, 50).map((id) => ({ id }))
  await Promise.all(staff.map((admin) => createInboxEvent({
    userId: admin.id, kind: 'FORM', dedupeKey: `form:paid:${submissionId}:${admin.id}`, titleFa: `درخواست پرداخت‌شدهٔ تازه در «${title}»`, titleEn: 'New paid form request',
    bodyFa: `شمارهٔ ${submissionId.toLocaleString('fa-IR')} منتظر کارشناس است.`, bodyEn: '', href: `/admin/forms?form=${Number(meta.formId) || ''}&tab=inbox`,
  }).catch(() => undefined)))
}

// ------------------------------------------------------------------ the work on an answer

/** Staff move an answer along, take it, or write back to its sender. */
/**
 * Work that somebody has taken is theirs: a colleague of the same standing does not change it, read its
 * passwords or take it away. The one who holds it, or somebody who manages forms, can.
 */
export const OTHERS_WORK = 'این درخواست در دست همکار دیگری است؛ فقط خود او یا مدیر فرم‌ها می‌تواند آن را تغییر دهد'
export async function assertOwnWork(submissionId: number, actor: { id: number }, manager: boolean) {
  if (manager) return
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, select: { assigneeId: true } })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  if (row.assigneeId && row.assigneeId !== actor.id) throw new FormsError(OTHERS_WORK, 403)
}

export async function workOnSubmission(submissionId: number, actor: { id: number }, patch: { stage?: unknown; take?: unknown; reply?: unknown; assignTo?: unknown; pickupCode?: unknown; override?: unknown }, manager = false) {
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, include: { form: true } })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  if (!manager && row.assigneeId && row.assigneeId !== actor.id) throw new FormsError(OTHERS_WORK, 403)
  // Handing work to somebody else is a manager's decision; anybody may take what nobody holds.
  if (!manager && patch.assignTo !== undefined && Number(patch.assignTo) !== actor.id) throw new FormsError('سپردن کار به همکار دیگر با مدیر فرم‌ها است', 403)
  if (row.payStatus === 'UNPAID') throw new FormsError('این درخواست هنوز پرداخت نشده است', 409)
  const data: { stage?: string; assigneeId?: number | null; reply?: string; read?: boolean; status?: string; pickupCode?: string; receiptToken?: string; receivedAt?: Date } = {}
  const settings = parseForm(row.form).settings
  const steps = workSteps(settings)
  let overridden = ''
  if (patch.stage !== undefined) {
    const step = steps.find((item) => item.key === patch.stage)
    if (!step) throw new FormsError('وضعیت کار معتبر نیست')
    data.stage = step.key
    // Whoever starts the work owns it unless somebody already does.
    if (step.key !== 'OPEN' && step.key !== 'REJECTED' && !row.assigneeId) data.assigneeId = actor.id
    // «No receipt, no device»: the customer's pickup code, or a manager who records why it was handed over without it.
    if (step.pickup && row.pickupCode && step.key !== row.stage) {
      const typed = String(patch.pickupCode ?? '').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/\D/g, '')
      const reason = String(patch.override ?? '').trim().slice(0, 300)
      if (typed !== row.pickupCode) {
        if (!manager || reason.length < 5) throw new FormsError(manager ? 'کد تحویل درست نیست؛ اگر رسید گم شده، دلیل تحویل بدون کد را بنویسید' : 'کد تحویل روی رسید مشتری درست نیست؛ بدون رسید، دستگاه تحویل داده نمی‌شود', 403)
        overridden = reason
      }
    }
    // The step that takes the device in issues the receipt: its link and the code asked when it is handed back.
    if (step.receipt && !row.receiptToken) Object.assign(data, receiptCodes())
  }
  if (patch.take === true) { data.assigneeId = actor.id; if ((row.stage === 'OPEN' || !row.stage) && steps.some((item) => item.key === 'IN_PROGRESS')) data.stage = 'IN_PROGRESS' }
  if (patch.take === false) data.assigneeId = null
  if (patch.assignTo !== undefined) {
    // Handing the work to a named member of staff: an account of the admin area, and one the form allows.
    const to = Number(patch.assignTo)
    const member = Number.isSafeInteger(to) && to > 0 ? (await formStaff()).find((person) => person.id === to) || null : null
    const allowed = parseForm(row.form).settings?.handlers || []
    if (!member) throw new FormsError('این کاربر کارمندی با دسترسی «پاسخ‌ها و درخواست‌های فرم» نیست')
    if (allowed.length && !allowed.includes(member.id)) throw new FormsError('این فرم به این کارمند سپرده نشده است')
    data.assigneeId = member.id
  }
  if (patch.reply !== undefined) data.reply = String(patch.reply).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 2000)
  if (!Object.keys(data).length) throw new FormsError('تغییری ارسال نشده است')
  if (row.status === 'NEW') { data.status = 'READ'; data.read = true }
  const changed = await db.formSubmission.updateMany({ where: { id: row.id, assigneeId: row.assigneeId, stage: row.stage, payStatus: row.payStatus, ...(data.reply !== undefined ? { reply: row.reply } : {}), ...(data.read !== undefined ? { read: row.read } : {}), ...(data.status !== undefined ? { status: row.status } : {}) }, data })
  if (changed.count !== 1) throw new FormsError('درخواست هم‌زمان تغییر کرد؛ صفحه را تازه کنید', 409)
  const stage = data.stage || row.stage
  if (data.stage && data.stage !== row.stage) {
    if (data.stage === 'REJECTED') await releaseSlots(row.id)
    void sendFormWebhooks(parseForm(row.form), 'stage', { entryId: row.id, stage: data.stage }).catch(() => undefined)
  }
  if (data.assigneeId && data.assigneeId !== row.assigneeId && data.assigneeId !== actor.id) {
    await createInboxEvent({ userId: data.assigneeId, kind: 'FORM', dedupeKey: `form:assigned:${row.id}:${data.assigneeId}`, titleFa: `یک درخواست در «${row.form.title.slice(0, 80)}» به شما سپرده شد`, titleEn: 'A form request was assigned to you', bodyFa: `شمارهٔ ${row.id.toLocaleString('fa-IR')}`, bodyEn: '', href: `/admin/forms?form=${row.formId}&tab=inbox` }).catch(() => undefined)
  }
  if (row.userId && ((data.stage && data.stage !== row.stage) || (data.reply && data.reply !== row.reply))) {
    await createInboxEvent({
      userId: row.userId, kind: 'FORM', dedupeKey: `form:work:${row.id}:${stage}:${(data.reply ?? row.reply).length}`,
      titleFa: `درخواست شما در «${row.form.title.slice(0, 80)}»: ${stage ? stepLabel(settings, stage) : 'به‌روز شد'}`, titleEn: 'Your request was updated',
      bodyFa: (data.reply || 'جزئیات را در «درخواست‌های من» ببینید.').slice(0, 300), bodyEn: '', href: '/dashboard/requests',
    }).catch(() => undefined)
  }
  const moved = data.stage && data.stage !== row.stage ? steps.find((item) => item.key === data.stage) : undefined
  if (moved) await tellSender({ id: row.id, title: row.form.title, data: row.data, userId: row.userId, pickupCode: data.pickupCode || row.pickupCode, receiptToken: data.receiptToken || row.receiptToken }, moved).catch(() => undefined)
  return { stage, assigneeId: data.assigneeId === undefined ? row.assigneeId : data.assigneeId, reply: data.reply ?? row.reply, pickupCode: data.pickupCode || row.pickupCode, receiptToken: data.receiptToken || row.receiptToken, overridden }
}

/** A new receipt: the token of the customer's copy, and the six-digit code asked when the device is handed back. */
export const receiptCodes = () => ({ receiptToken: randomBytes(18).toString('base64url'), pickupCode: String(randomInt(100000, 1000000)), receivedAt: new Date() })

/**
 * What a sender is told when their answer reaches a step that says something: the step's message (merge tags
 * {code} — the pickup code, {receipt} — the link to their receipt, {id}) by SMS to the form's mobile answer
 * (customers in the shop often have no account). Inbox messages are sent by the caller for signed-in senders.
 */
export async function tellSender(row: { id: number; title: string; data: string; userId: number | null; pickupCode: string; receiptToken: string }, step: WorkStep) {
  if (!step.sms || !step.message) return
  const answers = parse<StoredAnswer[]>(row.data, [])
  const phone = answers.find((answer) => answer.type === 'mobile' && typeof answer.value === 'string' && answer.value)?.value
  if (typeof phone !== 'string') return
  const name = answers.find((answer) => answer.id === 'name' && typeof answer.value === 'string')?.value
  const { notifyPhone, siteLink } = await import('@/modules/sms/server/sms')
  const receipt = row.receiptToken ? await siteLink(`/receipt/${row.receiptToken}`) : ''
  const message = step.message.replace(/\{code\}/g, row.pickupCode || '—').replace(/\{receipt\}/g, receipt).replace(/\{id\}/g, String(row.id))
  await notifyPhone('FORM_STAGE', phone, { name: typeof name === 'string' && name ? name : 'مشتری', form: row.title.slice(0, 60), stage: step.label, message, link: receipt }, row.userId)
}

/** A signed-in sender's own answers, newest first: what they sent (passwords masked), the bill, and where the work stands. */
export async function myRequests(userId: number) {
  const rows = await db.formSubmission.findMany({ where: { userId, status: { not: 'SPAM' } }, orderBy: { createdAt: 'desc' }, take: 60, include: { form: { select: { id: true, slug: true, title: true, description: true, fields: true, published: true, successText: true, settings: true } } } })
  return rows.map((row) => ({
    id: row.id, form: row.form.title, slug: row.form.slug, createdAt: row.createdAt.toISOString(),
    answers: parse<StoredAnswer[]>(row.data, []).map((answer) => ({ label: answer.label, type: answer.type || 'text', value: (answer.type === 'file' || answer.type === 'signature') && Array.isArray(answer.value) ? `${answer.value.length.toLocaleString('fa-IR')} فایل` : answer.value })),
    amount: row.amountMinor > 0n ? minorToNumber(row.amountMinor, row.currency || FORM_CURRENCY) : 0, currency: row.currency || FORM_CURRENCY,
    lines: parse<PriceLine[]>(row.pricing || '[]', []), payStatus: row.payStatus, paidAt: row.paidAt?.toISOString() || null,
    stage: row.stage, stageLabel: row.stage ? stepLabel(parseForm(row.form).settings, row.stage) : '', receiptToken: row.receiptToken, reply: row.reply, score: row.score, scoreMax: row.scoreMax,
  }))
}
