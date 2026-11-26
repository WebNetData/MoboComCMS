import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { sniffImage } from '@/shared/files/image-type'
import { latinDigits, normalizeReceipt } from '@/modules/billing/domain/card-transfer'
import { readReceiptMultipart, receiptDirectory } from '@/modules/billing/server/card-transfer'
import { PayError } from '@/modules/billing/domain/pay'
import { auditSystemStrict } from '@/platform/audit/server'
import { payContext, payTransaction } from '../context'
import { collectionFor, baleCheckout } from './collection-view'
import { settleTransferCollection } from './collection-settle'
import { collectionConfirmation, receiptReviewResult } from '../confirmation'
import { approvalReference } from '../receipt-reference'

export async function submitCollectionReceipt(req: NextRequest, id: string) {
  if (await payTransaction(async tx => Boolean((await collectionFor(tx, id, req)).receiptId))) return baleCheckout(id, req)
  const form = await readReceiptMultipart(req)
  const fields = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'))
  const input = normalizeReceipt(fields), rawAmount = latinDigits(fields.paidAmountRial).trim()
  if (fields.paidAmountRial !== undefined && !/^[1-9]\d{0,18}$/.test(rawAmount)) throw new PayError('مبلغ رسید معتبر نیست', 422)
  const upload = form.get('image')
  if (!upload || typeof upload === 'string' || !upload.size || upload.size > 6 * 1024 * 1024) throw new PayError('تصویر رسید تا ۶ مگابایت لازم است', 422)
  const bytes = Buffer.from(await upload.arrayBuffer()), type = sniffImage(bytes)
  if (!type) throw new PayError('تصویر رسید باید PNG، JPEG یا WebP باشد', 422)
  const filename = `${randomUUID()}.${type.extension}`
  await mkdir(receiptDirectory(), { recursive: true }); await writeFile(join(receiptDirectory(), filename), bytes, { flag: 'wx', mode: 0o600 })
  let saved = false
  try {
    saved = await payTransaction(async tx => {
      const initial = await collectionFor(tx, id, req)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${initial.invoiceId} FOR UPDATE`)
      const row = await collectionFor(tx, id, req)
      if (row.receiptId) return false
      if (row.status !== 'PENDING' || !row.acceptedAt || row.expiresAt <= new Date() || row.invoice.status !== 'UNPAID' || row.activeInvoiceId !== row.invoiceId) throw new PayError('وضعیت درخواست تغییر کرده است', 409)
      const amount = rawAmount ? BigInt(rawAmount) : row.collectedRial
      if (amount !== row.principalRial && amount !== row.collectedRial) throw new PayError('مبلغ باید برابر اصل یا جمع درخواست باشد', 422)
      const receipt = await tx.paymentReceipt.create({ data: { ...input, paidAt: fields.paidAt ? input.paidAt : null, bankAccountId: row.bankAccountId, invoiceId: row.invoiceId, userId: row.invoice.userId, amountMinor: row.dueMinor, currency: row.currency, image: filename, imageType: type.mimeType } })
      const claim = await tx.payBaleCollection.updateMany({ where: { id, status: 'PENDING', receiptId: null, activeInvoiceId: row.invoiceId }, data: { status: 'UNDER_REVIEW', receiptId: receipt.id, receiptAmountRial: amount } })
      if (claim.count !== 1) throw new PayError('درخواست هم‌زمان تغییر کرده است', 409)
      const owner = await tx.user.findUniqueOrThrow({ where: { id: row.ownerUserId }, select: { id: true, email: true } })
      await auditSystemStrict({ actor: owner, action: 'mobocom-pay.transfer.receipt', targetType: 'mobocom-pay', targetId: id, metadata: { receiptId: receipt.id } }, tx)
      return true
    })
    if (!saved) await unlink(join(receiptDirectory(), filename)).catch(() => {})
    return baleCheckout(id, req)
  } catch (error) { if (!saved) await unlink(join(receiptDirectory(), filename)).catch(() => {}); throw error }
}

export async function reviewCollectionReceipt(admin: { id: number; email: string; req?: NextRequest }, receiptId: number, action: 'approve' | 'reject', note: string, verifiedReference?: unknown) {
  if (!admin.req) throw new PayError('نشست بررسی‌کننده لازم است', 403)
  const req = admin.req
  return payTransaction(async tx => {
    const initial = await tx.payBaleCollection.findUnique({ where: { receiptId } })
    if (!initial) throw new PayError('رسید پیدا نشد', 404)
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${initial.invoiceId} FOR UPDATE`)
    const row = await tx.payBaleCollection.findUniqueOrThrow({ where: { id: initial.id }, include: { invoice: { include: { payCollection: { include: { merchant: true } } } }, receipt: true, notice: { select: { sourceType: true } } } })
    if (row.invoice.payCollection) await payContext({ ...admin, req }, tx, 'mobocom-pay.manage')
    else if (!await requirePerm(req, 'invoices.manage', tx)) throw new PayError('دسترسی ندارید', 403)
    if (row.invoice.userId === admin.id || row.invoice.payCollection?.merchant.userId === admin.id) throw new PayError('بررسی پرداخت خودتان مجاز نیست', 403)
    if (!row.receipt) throw new PayError('رسید پیدا نشد', 404)
    const paid = row.status === 'PAID' && row.invoice.status === 'PAID'
    if (paid && row.receipt.status !== 'PENDING') return receiptReviewResult(row.receipt.status, true, collectionConfirmation(row))
    if (row.receipt.status !== 'PENDING') throw new PayError('رسید قبلاً بررسی شده است', 409)
    const clean = String(note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 300)
    if (!paid && action === 'reject' && clean.length < 3) throw new PayError('دلیل رد رسید را بنویسید', 422)
    const trackingCode = !paid && action === 'approve' && row.invoice.payCollection
      ? await approvalReference(tx, row.receipt, verifiedReference)
      : row.receipt.trackingCode
    const claim = await tx.paymentReceipt.updateMany({ where: { id: receiptId, status: 'PENDING' }, data: { status: paid || action === 'approve' ? 'APPROVED' : 'REJECTED', trackingCode, adminNote: clean, reviewedBy: admin.id, reviewedAt: new Date() } })
    if (claim.count !== 1) throw new PayError('رسید هم‌زمان بررسی شده است', 409)
    if (!paid) {
      if (row.status !== 'UNDER_REVIEW' || row.receiptAmountRial === null) throw new PayError('وضعیت درخواست تغییر کرده است', 409)
      if (action === 'approve') await settleTransferCollection(tx, row, { method: 'MANUAL', receiptId, actualRial: row.receiptAmountRial, actor: admin })
      else { const changed = await tx.payBaleCollection.updateMany({ where: { id: row.id, status: 'UNDER_REVIEW', receiptId }, data: { status: 'REVIEW', activeInvoiceId: null, reviewReason: 'RECEIPT_REJECTED' } }); if (changed.count !== 1) throw new PayError('درخواست هم‌زمان تغییر کرده است', 409) }
    }
    await auditSystemStrict({ actor: admin, action: 'mobocom-pay.transfer.receipt-review', targetType: 'mobocom-pay', targetId: row.id, metadata: { receiptId, action: paid ? 'already-paid' : action } }, tx)
    return receiptReviewResult(paid || action === 'approve' ? 'APPROVED' : 'REJECTED', paid,
      paid ? collectionConfirmation(row) : action === 'approve' ? { method: 'MANUAL', source: 'STAFF' } : { method: 'NONE', source: '' })
  })
}
