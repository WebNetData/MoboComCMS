import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { requirePerm } from '@/modules/identity/server/access'
import { isModuleEnabled } from '@/extensions/server/modules'
import { sniffImage } from '@/shared/files/image-type'
import { normalizeReceipt } from '@/modules/billing/domain/card-transfer'
import { readReceiptMultipart, receiptDirectory } from '@/modules/billing/server/card-transfer'
import { markInvoicePaid } from '@/modules/billing/server/billing'
import { PayError } from '@/modules/billing/domain/pay'
import { reference } from '@/modules/billing/domain/pay-policy'
import { requirePayPayer } from './payer'
import { payAudit, payContext, payTransaction, type PayActor } from './context'
import { publicPayment } from './payments'
import { reconcileReference } from './reconcile'

export async function submitPayReceipt(req: NextRequest, id: string) {
  await requirePayPayer(req, id)
  if (!(await rateLimitStrict('pay:receipt:' + id, 6, 3600000)).ok) throw new PayError('تعداد ارسال رسید زیاد است', 429)
  const form = await readReceiptMultipart(req)
  const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'))
  const input = normalizeReceipt(fields)
  input.trackingCode = reference(input.trackingCode)
  const upload = form.get('image')
  if (!upload || typeof upload === 'string' || upload.size < 1 || upload.size > 6 * 1024 * 1024) throw new PayError('تصویر رسید تا ۶ مگابایت لازم است', 422)
  const bytes = Buffer.from(await upload.arrayBuffer()), type = sniffImage(bytes)
  if (!type) throw new PayError('تصویر رسید باید PNG، JPEG یا WebP باشد')
  const filename = `${randomUUID()}.${type.extension}`
  await mkdir(receiptDirectory(), { recursive: true })
  await writeFile(join(receiptDirectory(), filename), bytes, { flag: 'wx', mode: 0o600 })
  try {
    return await payTransaction(async tx => {
      await requirePayPayer(req, id, tx)
      const row = await publicPayment(tx, id), invoice = row.invoice
      if (!invoice || invoice.kind !== 'PAY_COLLECTION' || invoice.status !== 'UNPAID' || row.gatewayAttemptStatus !== 'READY' || !['CARD_TRANSFER', 'MANUAL'].includes(invoice.gateway?.provider || '')) throw new PayError('روش پرداخت برای ارسال رسید آماده نیست', 409)
      if (row.status !== 'PENDING' || row.expiresAt <= new Date()) throw new PayError('مهلت یا وضعیت پرداخت تغییر کرده است', 409)
      if (await tx.paymentReceipt.count({ where: { invoiceId: invoice.id, status: 'PENDING' } })) throw new PayError('رسید قبلی در انتظار بررسی است', 409)
      if (input.bankAccountId && input.bankAccountId !== row.bankAccountId) throw new PayError('حساب مقصد با پرداخت مطابقت ندارد')
      const receipt = await tx.paymentReceipt.create({ data: { ...input, bankAccountId: invoice.gateway?.provider === 'CARD_TRANSFER' ? row.bankAccountId : null, invoiceId: invoice.id, userId: null, amountMinor: row.totalMinor, currency: 'IRR', image: filename, imageType: type.mimeType } })
      if (input.trackingCode && /^[A-Za-z0-9_-]{6,64}$/.test(input.trackingCode)) {
        const claim = await tx.payPayment.updateMany({ where: { id, status: 'PENDING', transferReference: row.transferReference }, data: { transferReference: input.trackingCode } })
        if (claim.count !== 1) throw new PayError('پرداخت هم‌زمان تغییر کرده است', 409)
        if (row.bankAccountId) await reconcileReference(tx, row.bankAccountId, input.trackingCode)
      }
      await payAudit(tx, { id: row.merchant.userId, email: '' }, 'receipt.submit', id, { receiptId: receipt.id })
      return { id: receipt.id, status: receipt.status }
    })
  } catch (error) { await unlink(join(receiptDirectory(), filename)).catch(() => {}); throw error }
}

/** Shared review entry used by both Finance receipts and the Pay administration surface. */
export async function reviewPayReceiptByStaff(admin: { id: number; email: string; req?: NextRequest }, receiptId: number, action: 'approve' | 'reject', note: string) {
  return payTransaction(async tx => {
    if (!admin.req) throw new PayError('نشست بررسی‌کننده لازم است', 403)
    await payContext({ ...admin, req: admin.req }, tx, 'mobocom-pay.manage')
    const receipt = await tx.paymentReceipt.findUnique({ where: { id: receiptId }, include: { invoice: { include: { payCollection: { include: { merchant: true } } } } } })
    const row = receipt?.invoice.payCollection
    if (!receipt || !row || receipt.status !== 'PENDING') throw new PayError('رسید در انتظار بررسی پیدا نشد', 409)
    if (row.merchant.userId === admin.id) throw new PayError('تأیید دریافت خودتان مجاز نیست', 403)
    const clean = String(note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 300)
    if (action === 'reject' && clean.length < 3) throw new PayError('دلیل رد رسید را بنویسید')
    const claim = await tx.paymentReceipt.updateMany({ where: { id: receiptId, status: 'PENDING' }, data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', adminNote: clean, reviewedBy: admin.id, reviewedAt: new Date() } })
    if (claim.count !== 1) throw new PayError('رسید هم‌زمان بررسی شده است', 409)
    if (action === 'approve') {
      const paid = await markInvoicePaid({ invoiceId: receipt.invoiceId, gatewayId: receipt.invoice.gatewayId, amount: row.totalMinor.toString(), provider: row.gatewayAttemptProvider, providerTxnId: receipt.trackingCode || 'receipt-' + receipt.id, raw: { source: 'pay-receipt', receiptId, by: admin.id } }, tx)
      if (!paid.ok) throw new PayError(paid.message || 'ثبت پرداخت انجام نشد', 409)
    }
    await payAudit(tx, admin, 'receipt.' + action, row.id, { receiptId, note: clean })
    return { status: action === 'approve' ? 'APPROVED' : 'REJECTED' }
  })
}
export async function reviewPayReceipt(actor: PayActor, input: Record<string, unknown>) {
  await payTransaction(tx => payContext(actor, tx, 'mobocom-pay.manage'))
  const id = Number(input.id), action = input.action
  if (!Number.isSafeInteger(id) || id < 1 || (action !== 'approve' && action !== 'reject')) throw new PayError('درخواست معتبر نیست')
  return reviewPayReceiptByStaff(actor, id, action, String(input.note || ''))
}
export async function payReceipts(actor: PayActor) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const rows = await tx.paymentReceipt.findMany({ where: { invoice: { kind: 'PAY_COLLECTION' } }, orderBy: { createdAt: 'desc' }, take: 100, include: { invoice: { include: { payCollection: { include: { merchant: true } } } } } })
    return { items: rows.flatMap(r => r.invoice.payCollection ? [{ id: r.id, paymentId: r.invoice.payCollection.id, merchantName: r.invoice.payCollection.merchant.name, externalId: r.invoice.payCollection.externalId, totalRial: r.amountMinor.toString(), status: r.status, trackingCode: r.trackingCode, payerName: r.payerName, phoneLast4: r.invoice.payCollection.payerPhoneLast4, adminNote: r.adminNote, createdAt: r.createdAt.toISOString() }] : []) }
  })
}
export async function payReceiptImage(req: NextRequest, receiptId: number, paymentId?: string) {
  if (!Number.isSafeInteger(receiptId) || receiptId < 1) throw new PayError('رسید پیدا نشد', 404)
  if (!(await isModuleEnabled('mobocom-pay'))) throw new PayError('درگاه غیرفعال است', 404)
  const row = await db.paymentReceipt.findUnique({ where: { id: receiptId }, include: { invoice: { select: { kind: true, payCollection: { select: { id: true } } } } } })
  if (!row || row.invoice.kind !== 'PAY_COLLECTION' || !row.invoice.payCollection) throw new PayError('رسید پیدا نشد', 404)
  if (paymentId) { if (row.invoice.payCollection.id !== paymentId) throw new PayError('رسید پیدا نشد', 404); await requirePayPayer(req, paymentId) }
  else if (!await requirePerm(req, 'mobocom-pay.manage')) throw new PayError('دسترسی ندارید', 403)
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(row.image)) throw new PayError('تصویر پیدا نشد', 404)
  const bytes = await readFile(join(receiptDirectory(), row.image))
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': row.imageType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } })
}
