import { priceCounterLines } from './quote'
import { counterTotals } from './totals'
import { redeemCounterPromotion } from '@/modules/promotions/server/counter'
import { bookDelivery } from '@/modules/shipping/server/shipping'
import { createHmac, randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { syncCodeStock } from '@/modules/catalog/server/code-stock'
import { reserveInventoryInTransaction, consumeInventoryReservation, OutOfStock } from '@/modules/catalog/server/inventory'
import { createInvoiceForOrder, markInvoicePaid } from '@/modules/billing/server/billing'
import { assignLine } from '@/modules/store/server/digital-codes'
import { recordStoreSale } from '@/modules/store/server/orders'
import { asStoreError } from '@/modules/store/server/order-inputs'
import { StoreError } from '@/modules/store/domain/store'
import { readCounterSale, type CounterSaleInput } from '@/modules/store/domain/counter-sales'
import { legacyNumber, minorToDecimal } from '@/shared/money'
import { resolvePhoneCustomer, PhoneCustomerError } from '@/modules/identity/server/phone-customer'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { lockRegister } from './register'
import { counterPayments, payCounterWallet } from './payment'
import { counterClub } from '@/modules/store/server/marketing'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { repairWorkProduct } from './repair'

type Tx = Prisma.TransactionClient
type Commit = (tx: Tx, orderId: number) => Promise<void>

async function writeSale(tx: Tx, input: CounterSaleInput, actorId: number, commit: Commit) {
  const key = `counter:${actorId}:${input.requestId}`
  const fingerprint = createHmac('sha256', authSecret()).update(JSON.stringify(input)).digest('hex')
  const replay = await tx.order.findUnique({ where: { idempotencyKey: key }, select: { id: true, status: true, saleSource: true, meta: true } })
  if (replay) {
    const meta = JSON.parse(replay.meta)
    if (replay.saleSource !== 'COUNTER' || replay.status !== 'PAID' || meta.counterFingerprint !== fingerprint) throw new StoreError('این شناسه قبلاً برای فروش دیگری استفاده شده است؛ فروش قبلی را بررسی کنید', 409, 'REQUEST_CONFLICT')
    return { orderId: replay.id, replayed: true }
  }
  const customer = input.customerPhone ? await resolvePhoneCustomer(tx,input.customerPhone,{firstName:input.customerFirstName,lastName:input.customerLastName,name:input.customerName}) : input.customerId ? await tx.user.findFirst({ where: { id: input.customerId, status: 'ACTIVE' }, select: { id: true, name: true, phone: true } }) : null
  if(input.customerId && customer?.id !== input.customerId) throw new StoreError('شمارهٔ موبایل با حساب انتخاب‌شده تطبیق ندارد',409)
  if (input.customerId && !customer) throw new StoreError('مشتری انتخاب‌شده فعال نیست', 409)
  if(!input.sessionId)throw new StoreError('ابتدا نوبت صندوق را باز کنید',409,'REGISTER_REQUIRED')
  await lockRegister(tx,input.sessionId,actorId)
  const { products, lines, subtotalMinor, currency } = await priceCounterLines(tx, input)
  const totals = await counterTotals(tx, input, customer?.id || null, lines, subtotalMinor, currency)
  const { totalMinor, discountMinor, shippingMinor } = totals
  if ((input.discountCode || input.shipment || input.expectedTotalMinor !== undefined) && input.expectedTotalMinor !== totalMinor.toString()) throw new StoreError('مبلغ نهایی تغییر کرده است؛ مبلغ را دوباره بررسی و تأیید کنید', 409, 'PRICE_CHANGED')
  const register=await lockRegister(tx,input.sessionId,actorId,currency)
  if (!register.locationId) throw new StoreError('محل موجودی صندوق مشخص نیست؛ صندوق را ببندید و با محل فعال باز کنید', 409)
  const payments=counterPayments(input,totalMinor)
  const order = await tx.order.create({ data: {
    registerSessionId:input.sessionId,receiptToken:randomBytes(24).toString('hex'),userId: customer?.id || null, createdById: actorId, assigneeId: actorId, saleSource: 'COUNTER', customerName: input.customerName || customer?.name || '', customerPhone: normalizeMobile(input.customerPhone || customer?.phone || '') || '',
    productId: lines.find((line) => line.productId)?.productId ?? await repairWorkProduct(tx, currency), status: 'PENDING', provider: 'MANUAL', idempotencyKey: key, totalMinor, totalAmount: legacyNumber(totalMinor, currency), currency,
    meta: JSON.stringify({ kind: 'product', counterFingerprint: fingerprint, counterMethod: input.method, counterReference: input.reference, source: 'COUNTER', productKind: lines.some(line => line.kind === 'PHYSICAL') ? 'PHYSICAL' : 'VIRTUAL', subtotalMinor: subtotalMinor.toString(), discountCode: input.discountCode || '', discountMinor: discountMinor.toString(), shippingMinor: shippingMinor.toString(), ...totals.shipping, ...(input.repair ? { repair: { submissionId: input.repair.submissionId } } : {}) }),
    lines: { create: lines },
  } })
  if (totals.promotion && customer) await redeemCounterPromotion(tx, totals.promotion, order.id, customer.id)
  if (totals.delivery) await bookDelivery(tx, order.id, totals.delivery.date, totals.delivery.slot.id)
  // Units come from the register's stock location (the shop shelf), not from the warehouses the site sells from.
  await reserveInventoryInTransaction(tx, { orderId: order.id, locationId: input.shipment?.locationId || register.locationId })
  const wallet=await payCounterWallet(tx,input,customer,actorId,order.id,totalMinor,currency,key)
  const invoice = await createInvoiceForOrder({ orderId: order.id, userId: order.userId, saleSource: 'COUNTER', productId: order.productId, subtotal: minorToDecimal(subtotalMinor + shippingMinor, currency), discount: minorToDecimal(discountMinor, currency), walletApplied:minorToDecimal(wallet,currency),currency, createdBy: actorId, idempotencyKey: `${key}:invoice` }, tx)
  const paid = await markInvoicePaid({ invoiceId: invoice.id, allocations:payments.filter(row=>row.method!=='WALLET').map(row=>({provider:row.method as 'CASH'|'CARD',amountMinor:BigInt(row.amountMinor),reference:row.reference||`counter:${order.id}`})),amount: minorToDecimal(totalMinor-wallet, currency), raw: { source: 'COUNTER', actorId, method: input.method, reference: input.reference } }, tx)
  if (!paid.ok) throw new StoreError(paid.message, 409)
  for (const line of lines) {
    // A repair's work lines have no product and never take a code.
    const productId = line.productId
    if (!productId || products.find((product) => product.id === productId)?.digitalMode !== 'CODES') continue
    if (await assignLine(order.id, { ...line, productId }, tx)) throw new StoreError('کد آماده هم‌زمان فروخته شد؛ فروش ثبت نشد', 409, 'OUT_OF_STOCK')
  }
  const consumed = await consumeInventoryReservation(order.id, tx)
  if (!consumed.ok) throw new StoreError(consumed.message, 409)
  await tx.productDelivery.create({ data: { orderId: order.id, status: input.shipment ? 'PENDING' : 'DELIVERED', deliveredAt: input.shipment ? null : new Date(), deliveryNote: input.shipment ? 'پرداخت در مغازه؛ ارسال از انبار' : 'تحویل حضوری در فروشگاه' } })
  await recordStoreSale(order.id, tx)
  await tx.storeTender.createMany({data:payments.map(row=>({orderId:order.id,sessionId:input.sessionId,method:row.method,amountMinor:BigInt(row.amountMinor),reference:row.reference}))})
  if(customer)await counterClub(tx,{userId:customer.id,orderId:order.id,totalMinor,currency,redeem:0,key},'EARN')
  if(customer&&order.customerPhone)await createInboxEvent({userId:customer.id,kind:'STORE_RECEIPT',dedupeKey:`counter:receipt:${order.id}`,titleFa:input.repair?`فاکتور تعمیر ${invoice.number}`:`فاکتور خرید حضوری ${invoice.number}`,titleEn:'Counter purchase invoice',bodyFa:'رسید و وضعیت خرید شما',href:`/receipt/store/${order.receiptToken}`,channels:['sms']},tx)
  await tx.orderEvent.create({ data: { orderId: order.id, status: input.shipment ? 'PENDING' : 'DELIVERED', actorId, note: input.shipment ? 'پرداخت در مغازه؛ در انتظار ارسال از انبار' : input.repair ? `فاکتور تعمیر شمارهٔ ${input.repair.submissionId}` : 'فروش و تحویل حضوری' } })
  for (const product of products) await syncCodeStock(tx, product.id)
  await commit(tx, order.id)
  return { orderId: order.id, replayed: false }
}

/** The existing financial/stock owners commit together. The request callback rechecks authority in this transaction. */
export async function createCounterSale(raw: unknown, actorId: number, authorize: (tx: Tx) => Promise<void>, commit: Commit) {
  const input = readCounterSale(raw)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => { await authorize(tx); return writeSale(tx, input, actorId, commit) }, { isolationLevel: 'Serializable', timeout: 15000 })
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string } }
      // Prisma exposes PostgreSQL serialization/deadlock failures from raw locks as P2010.
      const retryable = ['P2034', 'P2002'].includes(String(failure?.code)) || (failure?.code === 'P2010' && ['40001', '40P01'].includes(String(failure.meta?.code)))
      if (retryable && attempt < 3) continue
      if (retryable) throw new StoreError('ثبت هم‌زمان فروش ممکن نشد؛ با همان درخواست دوباره تلاش کنید', 503)
      if (error instanceof OutOfStock) throw new StoreError('موجودی کالا در محل این صندوق کافی نیست یا هم‌زمان تغییر کرد؛ فروش ثبت نشد', 409, 'OUT_OF_STOCK')
      if(error instanceof PhoneCustomerError)throw new StoreError(error.message,409)
      asStoreError(error)
    }
  }
  throw new StoreError('ثبت هم‌زمان فروش ممکن نشد؛ دوباره تلاش کنید', 409)
}
