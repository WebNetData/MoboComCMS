import { db } from '@/platform/database/prisma'
import QRCode from 'qrcode'
import { getSiteConfig } from '@/modules/site/config/store'
import {
  CONTENT_TYPES, FormsError, SECRET_MASK, answerText, checkSubmission, parseForm, readDeviceLock, stepLabel, visibleFields, workSteps,
  type Answer, type Receipt, type StoredAnswer,
} from '@/modules/forms/domain/forms'
import { receiptCodes, revealSecrets, sealSecrets, tellSender } from '@/modules/forms/server/paid'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { resolvePhoneCustomer } from '@/modules/identity/server/phone-customer'

/**
 * Work at the counter (owner 2026-11-12, mobile repair): staff enter a customer who brings the device to the shop, and
 * print the receipts. The shop's copy holds every answer, the device lock included (reading it is recorded by the
 * route); the customer's copy holds the fields the form chose, the terms, the pickup code and room for a stamp and a
 * signature. The customer's copy is also at /receipt/<token>, the link their SMS carries.
 */
const parse = <T,>(text: string, fallback: T): T => { try { return JSON.parse(text) as T } catch { return fallback } }

/** A customer in the shop, entered by staff: the same checks as the public form; the device is taken in at once. */
export async function staffSubmit(formId: number, input: { values?: unknown }, actor: { id: number }) {
  const row = await db.siteForm.findUnique({ where: { id: formId } })
  if (!row) throw new FormsError('فرم پیدا نشد', 404)
  const form = parseForm(row), settings = form.settings!
  if (settings.payment.enabled) throw new FormsError('فرم پرداختی را مشتری خودش در سایت ارسال و پرداخت می‌کند')
  const { values, errors } = checkSubmission(form.fields, input.values)
  const firstBad = form.fields.find((field) => errors[field.id])
  if (firstBad) throw new FormsError(errors[firstBad.id])
  const shown = visibleFields(form.fields, values).filter((field) => !CONTENT_TYPES.includes(field.type) && field.type !== 'file' && field.type !== 'signature' && field.type !== 'slot')
  const { answers, secrets } = sealSecrets(shown.map((field) => ({ id: field.id, label: field.label, type: field.type, value: values[field.id] as Answer })))
  const steps = workSteps(settings), intake = steps.find((step) => step.receipt)
  const codes = intake ? receiptCodes() : {}
  const mobile = shown.filter(field => field.type === 'tel' || field.type === 'mobile').map(field => normalizeMobile(values[field.id])).find(Boolean)
  const created = await db.$transaction(async tx => {
    const customer = mobile ? await resolvePhoneCustomer(tx,mobile,String(values.name||'')) : null
    return tx.formSubmission.create({ data: {
    userId: customer?.id || null,
    formId, data: JSON.stringify(answers), secrets, status: 'READ', read: true, source: 'STAFF', createdById: actor.id, assigneeId: actor.id,
    stage: intake?.key || 'OPEN', ...codes,
  } })
  })
  if (intake) await tellSender({ id: created.id, title: form.title, data: created.data, userId: created.userId, pickupCode: created.pickupCode, receiptToken: created.receiptToken }, intake).catch(() => undefined)
  return { id: created.id, stage: created.stage, pickupCode: created.pickupCode, receiptToken: created.receiptToken }
}


async function receiptFrom(row: { id: number; data: string; stage: string; createdAt: Date; receivedAt: Date | null; pickupCode: string; receiptToken: string; source: string; createdById: number | null; assigneeId: number | null; form: Parameters<typeof parseForm>[0] }, copy: 'shop' | 'customer'): Promise<Receipt> {
  const form = parseForm(row.form), settings = form.settings!
  const answers = parse<StoredAnswer[]>(row.data, [])
  const chosen = settings.receipt.customerFields
  const visible = copy === 'shop' ? answers : answers.filter((answer) => (!chosen.length || chosen.includes(answer.id)) && answer.type !== 'secret' && answer.type !== 'devicelock')
  const lines = visible.filter((answer) => answer.type !== 'file' && answer.type !== 'signature' && answer.value !== SECRET_MASK && answerText(answer.value) !== '')
    .map((answer) => ({ label: answer.label, value: answerText(answer.value) }))
  const secrets = copy === 'shop' ? (await revealSecrets(row.id).catch(() => [])).map((secret) => ({ label: secret.label, value: secret.text, ...(secret.type === 'devicelock' ? { pattern: readDeviceLock(secret.value).pattern } : {}) })) : []
  const site = await getSiteConfig()
  const staffId = row.createdById || row.assigneeId
  const staff = staffId ? (await db.user.findUnique({ where: { id: staffId }, select: { name: true } }))?.name || '' : ''
  return {
    copy, number: row.id, title: settings.receipt.title || form.title, form: form.title, brand: { title: site.brand || '', logo: site.logo || '' },
    createdAt: row.createdAt.toISOString(), receivedAt: row.receivedAt?.toISOString() || null, stage: row.stage ? stepLabel(settings, row.stage) : '',
    lines, secrets, terms: settings.receipt.terms.split('\n').map((line) => line.trim()).filter(Boolean),
    pickupCode: row.pickupCode, link: row.receiptToken ? `/receipt/${row.receiptToken}` : '', staff, source: row.source,
    qr:row.receiptToken?await QRCode.toDataURL(new URL(`/receipt/${row.receiptToken}`,process.env.NEXTAUTH_URL||'http://localhost:3000').href,{width:160,margin:2}):'',
  }
}

const RECEIPT_SELECT = { id: true, data: true, stage: true, createdAt: true, receivedAt: true, pickupCode: true, receiptToken: true, source: true, createdById: true, assigneeId: true, form: true } as const

/** A receipt for staff to print. The shop's copy reads the encrypted answers: the route records who asked. */
export async function receiptOf(submissionId: number, copy: 'shop' | 'customer') {
  const row = await db.formSubmission.findUnique({ where: { id: submissionId }, select: RECEIPT_SELECT })
  if (!row) throw new FormsError('پاسخ پیدا نشد', 404)
  if (!parseForm(row.form).settings!.receipt.enabled) throw new FormsError('رسید برای این فرم روشن نیست؛ از تنظیمات فرم روشنش کنید', 409)
  return receiptFrom(row, copy)
}

/** The customer's copy behind the link in their SMS; nothing else of the answer. */
export async function receiptByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null
  const row = await db.formSubmission.findFirst({ where: { receiptToken: token, status: { not: 'SPAM' } }, select: RECEIPT_SELECT })
  if (!row || !parseForm(row.form).settings!.receipt.enabled) return null
  return {...await receiptFrom(row, 'customer'),pickupCode:''}
}
