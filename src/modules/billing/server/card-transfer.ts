import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { logEvent } from '@/platform/observability/logger'
import { sniffImage } from '@/shared/files/image-type'
import { normalizeCurrency, toMinor } from '@/shared/money'
import { invoiceDueMinor } from '@/modules/billing/server/billing'
import { settleInvoiceManually } from '@/modules/billing/server/settle'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { normalizeBankAccount, normalizeReceipt, TransferError } from '@/modules/billing/domain/card-transfer'

// Card-to-card / bank transfer payments. The customer uploads a receipt on the
// invoice page; staff approve it (which settles the invoice through the same
// path as "mark paid") or reject it with a reason the customer can see.

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_REQUEST_BYTES = 8 * 1024 * 1024
export const receiptDirectory = () => join(process.cwd(), 'storage', 'receipts')

// ------------------------------------------------------------------ bank accounts

export const listBankAccounts = (activeOnly = false) =>
  db.bankAccount.findMany({ where: activeOnly ? { active: true } : undefined, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })

export async function saveBankAccount(input: Record<string, unknown>) {
  const data = normalizeBankAccount(input)
  const id = Number(input.id)
  if (Number.isSafeInteger(id) && id > 0) return db.bankAccount.update({ where: { id }, data })
  return db.bankAccount.create({ data })
}

// ------------------------------------------------------------------ receipts

async function readMultipart(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) throw new TransferError('فرم رسید معتبر نیست')
  if (Number(req.headers.get('content-length')) > MAX_REQUEST_BYTES) throw new TransferError('حجم تصویر رسید بیش از ۶ مگابایت است', 413)
  const reader = req.body?.getReader()
  if (!reader) throw new TransferError('فرم رسید دریافت نشد')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new TransferError('حجم تصویر رسید بیش از ۶ مگابایت است', 413) }
    chunks.push(part.value)
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData() }
  catch { throw new TransferError('فرم رسید معتبر نیست') }
}

/** Customer submits a transfer receipt for one of their unpaid card-transfer invoices. */
export async function submitReceipt(req: NextRequest, userId: number, invoiceNumber: string) {
  if (!rateLimitHit(`receipt:${userId}`, 6, 60 * 60_000).ok) throw new TransferError('تعداد ارسال رسید زیاد است؛ کمی بعد دوباره تلاش کنید', 429)
  const invoice = await db.invoice.findUnique({ where: { number: invoiceNumber }, include: { gateway: { select: { provider: true } } } })
  if (!invoice || invoice.userId !== userId) throw new TransferError('فاکتور پیدا نشد', 404)
  if (invoice.status !== 'UNPAID') throw new TransferError('این فاکتور در انتظار پرداخت نیست', 409)
  if (invoice.gateway?.provider !== 'CARD_TRANSFER') throw new TransferError('پرداخت این فاکتور با کارت به کارت نیست', 409)
  if (await db.paymentReceipt.count({ where: { invoiceId: invoice.id, status: 'PENDING' } })) throw new TransferError('رسید قبلی شما در انتظار بررسی است', 409)

  const form = await readMultipart(req)
  const fields = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string')) as Record<string, string>
  const receipt = normalizeReceipt(fields)
  if (receipt.bankAccountId && !await db.bankAccount.count({ where: { id: receipt.bankAccountId, active: true } })) throw new TransferError('حساب مقصد معتبر نیست')

  const upload = form.get('image')
  if (!upload || typeof upload === 'string' || !upload.size) throw new TransferError('تصویر رسید را بارگذاری کنید')
  if (upload.size > MAX_IMAGE_BYTES) throw new TransferError('حجم تصویر رسید بیش از ۶ مگابایت است', 413)
  const bytes = Buffer.from(await upload.arrayBuffer())
  const type = sniffImage(bytes)
  if (!type) throw new TransferError('تصویر رسید باید PNG، JPEG یا WebP باشد')

  const currency = normalizeCurrency(invoice.currency)
  const dueMinor = invoiceDueMinor({ totalMinor: invoice.totalMinor || toMinor(invoice.total, currency), walletAppliedMinor: invoice.walletAppliedMinor })
  const filename = `${randomUUID()}.${type.extension}`
  await mkdir(receiptDirectory(), { recursive: true })
  await writeFile(join(receiptDirectory(), filename), bytes, { flag: 'wx', mode: 0o600 })
  try {
    const row = await db.paymentReceipt.create({
      data: { ...receipt, invoiceId: invoice.id, userId, amountMinor: dueMinor, currency, image: filename, imageType: type.mimeType },
    })
    logEvent('info', 'receipt.submitted', { receiptId: row.id, invoiceId: invoice.id, userId })
    void import('@/modules/sms/server/sms').then(({ notifyAdmins }) => notifyAdmins('ADMIN_RECEIPT', { invoice: invoice.number, amount: dueMinor.toString(), currency }))
      .catch((error) => logEvent('error', 'sms.admin_failed', { error }))
    return row
  } catch (error) {
    await unlink(join(receiptDirectory(), filename)).catch(() => {})
    throw error
  }
}

/** Approve (settle the invoice) or reject (tell the customer why). */
export async function reviewReceipt(admin: { id: number; email: string }, receiptId: number, action: 'approve' | 'reject', note: string) {
  const receipt = await db.paymentReceipt.findUnique({ where: { id: receiptId }, include: { invoice: { select: { id: true, number: true, userId: true, status: true } } } })
  if (!receipt) throw new TransferError('رسید پیدا نشد', 404)
  if (receipt.status !== 'PENDING') throw new TransferError('این رسید قبلاً بررسی شده است', 409)
  const adminNote = String(note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 300)
  if (action === 'reject' && adminNote.length < 3) throw new TransferError('دلیل رد رسید را بنویسید تا به مشتری نمایش داده شود')

  // Claim the receipt first so two admins can't settle it twice.
  const claimed = await db.paymentReceipt.updateMany({
    where: { id: receipt.id, status: 'PENDING' },
    data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', adminNote, reviewedBy: admin.id, reviewedAt: new Date() },
  })
  if (claimed.count !== 1) throw new TransferError('این رسید قبلاً بررسی شده است', 409)

  if (action === 'reject') {
    await createInboxEvent({
      userId: receipt.userId, kind: 'RECEIPT_REJECTED', dedupeKey: `receipt:${receipt.id}:rejected`,
      titleEn: 'Payment receipt rejected', titleFa: 'رسید پرداخت تأیید نشد',
      bodyEn: `Receipt for invoice ${receipt.invoice.number} was rejected: ${adminNote}`,
      bodyFa: `رسید فاکتور ${receipt.invoice.number} تأیید نشد: ${adminNote}`,
      href: `/invoice/${encodeURIComponent(receipt.invoice.number)}`,
    }).catch((error) => logEvent('error', 'inbox.receipt_failed', { receiptId: receipt.id, error }))
    return { status: 'REJECTED' as const }
  }

  const settled = await settleInvoiceManually({
    invoiceId: receipt.invoiceId,
    providerTxnId: receipt.trackingCode,
    raw: { source: 'receipt', receiptId: receipt.id, by: admin.email, method: receipt.method, payerBank: receipt.payerBank, payerCard: receipt.payerCard },
  })
  if (!settled.ok) {
    // Settlement refused (e.g. out of stock): put the receipt back in the queue.
    await db.paymentReceipt.update({ where: { id: receipt.id }, data: { status: 'PENDING', reviewedBy: null, reviewedAt: null } })
    throw new TransferError(settled.message, settled.status)
  }
  return { status: 'APPROVED' as const, warning: settled.warning }
}

/** Receipt image bytes for its owner or staff. */
export async function receiptImage(receiptId: number, viewer: { id: number; staff: boolean }) {
  const receipt = await db.paymentReceipt.findUnique({ where: { id: receiptId }, select: { userId: true, image: true, imageType: true } })
  if (!receipt || (!viewer.staff && receipt.userId !== viewer.id)) return null
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(receipt.image) || !['image/png', 'image/jpeg', 'image/webp'].includes(receipt.imageType)) return null
  try { return { bytes: await readFile(join(receiptDirectory(), receipt.image)), type: receipt.imageType } } catch { return null }
}
