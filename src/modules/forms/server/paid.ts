import { db } from '@/platform/database/prisma'
import { minorToNumber, toMinor } from '@/shared/money'
import { quoteForeignAmount } from '@/modules/fx/server/fx'
import { FxError, percentToBps } from '@/modules/fx/domain/fx'
import { decryptDigitalDelivery, encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { releaseSlots, sendFormNotifications, sendFormWebhooks, webhookAnswers } from '@/modules/forms/server/advanced'
import {
  FormsError, SECRET_MASK, STAGES, STAGE_LABEL, parseForm, parseFxAnswer, priceLines, visibleFields,
  type Answer, type FormDefinition, type PriceLine, type Stage, type StoredAnswer,
} from '@/modules/forms/domain/forms'

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
  const hidden = answers.filter((answer) => answer.type === 'secret' && typeof answer.value === 'string' && answer.value)
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
  return parse<StoredAnswer[]>(row.data, []).filter((answer) => answer.type === 'secret' && values[answer.id]).map((answer) => ({ id: answer.id, label: answer.label, value: values[answer.id] }))
}

export async function eraseSecrets(submissionId: number) {
  const done = await db.formSubmission.updateMany({ where: { id: submissionId, secrets: { not: '' } }, data: { secrets: '', secretsErasedAt: new Date() } })
  if (!done.count) throw new FormsError('اطلاعات محرمانه‌ای برای پاک‌کردن نمانده است', 409)
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
  if (bill.totalMinor <= 0n) throw new FormsError('مبلغی برای پرداخت محاسبه نشد', 409)
  await db.formSubmission.update({ where: { id: row.id }, data: { amountMinor: bill.totalMinor, currency: bill.currency, pricing: JSON.stringify(bill.lines) } })
  return { submissionId: row.id, formId: row.formId, title: form.title, amountMinor: bill.totalMinor, currency: bill.currency }
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
    void sendFormWebhooks(form, 'paid', { entryId: submissionId, orderId: order.id, total, currency: order.currency, answers: webhookAnswers(answers) }).catch(() => undefined)
  }
  await createInboxEvent({
    userId: order.userId, kind: 'FORM', dedupeKey: `form:paid:${submissionId}`, titleFa: `پرداخت «${title}» انجام شد`, titleEn: 'Your request is paid',
    bodyFa: 'درخواست شما به کارشناس سپرده شد؛ وضعیت آن را در «درخواست‌های من» ببینید.', bodyEn: 'Your request is with our staff now.', href: '/dashboard/requests',
  }).catch(() => undefined)
  const staff = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(staff.map((admin) => createInboxEvent({
    userId: admin.id, kind: 'FORM', dedupeKey: `form:paid:${submissionId}:${admin.id}`, titleFa: `درخواست پرداخت‌شدهٔ تازه در «${title}»`, titleEn: 'New paid form request',
    bodyFa: `شمارهٔ ${submissionId.toLocaleString('fa-IR')} منتظر کارشناس است.`, bodyEn: '', href: `/admin/forms?form=${Number(meta.formId) || ''}&tab=inbox`,
  }).catch(() => undefined)))
}

// ------------------------------------------------------------------ the work on an answer

/** Staff move an answer along, take it, or write back to its sender. */
export async function workOnSubmission(submissionId: number, actor: { id: number }, patch: { stage?: unknown; take?: unknown; reply?: unknown; assignTo?: unknown }) {
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, include: { form: true } })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  if (row.payStatus === 'UNPAID') throw new FormsError('این درخواست هنوز پرداخت نشده است', 409)
  const data: { stage?: string; assigneeId?: number | null; reply?: string; read?: boolean; status?: string } = {}
  if (patch.stage !== undefined) {
    if (!STAGES.includes(patch.stage as Stage)) throw new FormsError('وضعیت کار معتبر نیست')
    data.stage = patch.stage as string
    // Whoever starts the work owns it unless somebody already does.
    if (patch.stage === 'IN_PROGRESS' && !row.assigneeId) data.assigneeId = actor.id
  }
  if (patch.take === true) { data.assigneeId = actor.id; if (row.stage === 'OPEN' || !row.stage) data.stage = 'IN_PROGRESS' }
  if (patch.take === false) data.assigneeId = null
  if (patch.assignTo !== undefined) {
    // Handing the work to a named member of staff: an account of the admin area, and one the form allows.
    const to = Number(patch.assignTo)
    const member = Number.isSafeInteger(to) && to > 0 ? await db.user.findFirst({ where: { id: to, role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } }) : null
    const allowed = parseForm(row.form).settings?.handlers || []
    if (!member) throw new FormsError('این کاربر از کارمندان نیست')
    if (allowed.length && !allowed.includes(member.id)) throw new FormsError('این فرم به این کارمند سپرده نشده است')
    data.assigneeId = member.id
  }
  if (patch.reply !== undefined) data.reply = String(patch.reply).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 2000)
  if (!Object.keys(data).length) throw new FormsError('تغییری ارسال نشده است')
  if (row.status === 'NEW') { data.status = 'READ'; data.read = true }
  await db.formSubmission.update({ where: { id: row.id }, data })
  const stage = (data.stage || row.stage) as Stage | ''
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
      titleFa: `درخواست شما در «${row.form.title.slice(0, 80)}»: ${stage ? STAGE_LABEL[stage] : 'به‌روز شد'}`, titleEn: 'Your request was updated',
      bodyFa: (data.reply || 'جزئیات را در «درخواست‌های من» ببینید.').slice(0, 300), bodyEn: '', href: '/dashboard/requests',
    }).catch(() => undefined)
  }
  return { stage, assigneeId: data.assigneeId === undefined ? row.assigneeId : data.assigneeId, reply: data.reply ?? row.reply }
}

/** A signed-in sender's own answers, newest first: what they sent (passwords masked), the bill, and where the work stands. */
export async function myRequests(userId: number) {
  const rows = await db.formSubmission.findMany({ where: { userId, status: { not: 'SPAM' } }, orderBy: { createdAt: 'desc' }, take: 60, include: { form: { select: { title: true, slug: true, settings: true } } } })
  return rows.map((row) => ({
    id: row.id, form: row.form.title, slug: row.form.slug, createdAt: row.createdAt.toISOString(),
    answers: parse<StoredAnswer[]>(row.data, []).map((answer) => ({ label: answer.label, type: answer.type || 'text', value: answer.type === 'file' && Array.isArray(answer.value) ? `${answer.value.length.toLocaleString('fa-IR')} فایل` : answer.value })),
    amount: row.amountMinor > 0n ? minorToNumber(row.amountMinor, row.currency || FORM_CURRENCY) : 0, currency: row.currency || FORM_CURRENCY,
    lines: parse<PriceLine[]>(row.pricing || '[]', []), payStatus: row.payStatus, paidAt: row.paidAt?.toISOString() || null,
    stage: row.stage, reply: row.reply, score: row.score, scoreMax: row.scoreMax,
  }))
}
