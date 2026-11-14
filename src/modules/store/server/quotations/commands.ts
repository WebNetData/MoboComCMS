import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import { latinDigits } from '@/shared/text/digits'
import { toMinor } from '@/shared/money'
import { quotationPrice, readQuotationLines } from './read'

type Tx = Prisma.TransactionClient
type Authorize = (tx: Tx) => Promise<void>
type Audit = (tx: Tx, id: number) => Promise<unknown>
export async function createQuotation(raw: Record<string, unknown>, actorId: number, authorize: Authorize, audit: Audit) {
  const userId = Number(raw.userId), expiresAt = new Date(String(raw.expiresAt || ''))
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 90 * 86400_000) throw new StoreError('مشتری و مهلت اعتبار تا حداکثر نود روز را مشخص کنید')
  const wants = readQuotationLines(raw.lines)
  return db.$transaction(async tx => {
    await authorize(tx)
    if (!await tx.user.count({ where: { id: userId, status: 'ACTIVE' } })) throw new StoreError('حساب مشتری فعال نیست', 409)
    const price = await quotationPrice(tx, wants, userId)
    const text = latinDigits(String(raw.discount || '0')).trim()
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) throw new StoreError('مبلغ تخفیف معتبر نیست')
    const discountMinor = toMinor(text, price.currency)
    if (discountMinor >= price.subtotalMinor) throw new StoreError('تخفیف باید کمتر از مبلغ کالاها باشد')
    const title = String(raw.title || 'پیش‌فاکتور خرید').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 120)
    const quote = await tx.storeQuotation.create({ data: { token: randomBytes(24).toString('hex'), userId, createdById: actorId, title, expiresAt, currency: price.currency, subtotalMinor: price.subtotalMinor, discountMinor, lines: JSON.stringify(price.lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity, unitMinor: line.unitMinor, name: line.name, variantName: line.variantName }))) } })
    await audit(tx, quote.id)
    return { id: quote.id, href: `/quote/${quote.token}` }
  })
}
export async function cancelQuotation(id: number, updatedAt: string, authorize: Authorize, audit: Audit) {
  const version = new Date(updatedAt)
  if (!Number.isFinite(version.getTime())) throw new StoreError('نسخهٔ پیشنهاد معتبر نیست')
  return db.$transaction(async tx => { await authorize(tx); const changed = await tx.storeQuotation.updateMany({ where: { id, status: 'OPEN', orderId: null, updatedAt: version }, data: { status: 'CANCELLED' } }); if (changed.count !== 1) throw new StoreError('پیشنهاد تغییر کرده یا به سفارش تبدیل شده است', 409); await audit(tx, id) })
}
export async function listQuotations() {
  const rows = await db.storeQuotation.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { customer: { select: { name: true, phone: true } }, order: { select: { id: true, status: true, invoice: { select: { number: true } } } } } })
  return rows.map(row => ({ id: row.id, title: row.title, customer: row.customer, status: row.status, currency: row.currency, subtotalMinor: row.subtotalMinor.toString(), discountMinor: row.discountMinor.toString(), expiresAt: row.expiresAt.toISOString(), updatedAt: row.updatedAt.toISOString(), href: `/quote/${row.token}`, counterHref: `/admin/store/counter?quotation=${row.id}`, orderId: row.orderId, invoiceNumber: row.order?.invoice?.number || '' }))
}
