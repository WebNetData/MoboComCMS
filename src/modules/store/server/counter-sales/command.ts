import { createHmac, randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { lockProduct, availableCodeStock, syncCodeStock } from '@/modules/catalog/server/code-stock'
import { reserveInventoryInTransaction, consumeInventoryReservation, OutOfStock } from '@/modules/catalog/server/inventory'
import { createInvoiceForOrder, markInvoicePaid } from '@/modules/billing/server/billing'
import { assignLine } from '@/modules/store/server/digital-codes'
import { recordStoreSale } from '@/modules/store/server/orders'
import { sealAnswers, asStoreError } from '@/modules/store/server/order-inputs'
import { validateAnswers, validateOrderFields } from '@/modules/store/domain/order-inputs'
import { StoreError } from '@/modules/store/domain/store'
import { unitPrice } from '@/modules/store/server/pricing'
import { readCounterSale, type CounterSaleInput } from '@/modules/store/domain/counter-sales'
import { legacyNumber, minorToDecimal } from '@/shared/money'
import { resolvePhoneCustomer, PhoneCustomerError } from '@/modules/identity/server/phone-customer'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { lockRegister } from './register'
import { counterPayments, payCounterWallet } from './payment'
import { counterClub } from '@/modules/store/server/marketing'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

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
  const customer = input.customerPhone ? await resolvePhoneCustomer(tx,input.customerPhone,input.customerName) : input.customerId ? await tx.user.findFirst({ where: { id: input.customerId, status: 'ACTIVE' }, select: { id: true, name: true, phone: true } }) : null
  if(input.customerId && customer?.id !== input.customerId) throw new StoreError('شمارهٔ موبایل با حساب انتخاب‌شده تطبیق ندارد',409)
  if (input.customerId && !customer) throw new StoreError('مشتری انتخاب‌شده فعال نیست', 409)
  if(!input.sessionId)throw new StoreError('ابتدا نوبت صندوق را باز کنید',409,'REGISTER_REQUIRED')
  await lockRegister(tx,input.sessionId,actorId)
  const productIds = [...new Set(input.lines.map((line) => line.productId))].sort((a, b) => a - b)
  for (const id of productIds) await lockProduct(tx, id)
  const products = await tx.product.findMany({ where: { id: { in: productIds } }, include: { variants: { where: { active: true } } } })
  const available = new Map<number, Map<number | null, number>>()
  for (const product of products.filter((item) => item.digitalMode === 'CODES')) available.set(product.id, await availableCodeStock(tx, product.id))
  let currency = '', totalMinor = 0n
  const lines = input.lines.map((wanted, line) => {
    const product = products.find((item) => item.id === wanted.productId)
    if (!product?.active || product.sellerId || product.openAmount || !(product.kind === 'PHYSICAL' || (product.kind === 'VIRTUAL' && product.digitalMode === 'CODES'))) throw new StoreError('این کالا برای فروش حضوری آماده نیست', 409)
    const variant = wanted.variantId ? product.variants.find((item) => item.id === wanted.variantId) || null : null
    if ((product.variants.length && !variant) || (wanted.variantId && !variant)) throw new StoreError(`گزینهٔ «${product.name}» را دوباره انتخاب کنید`, 409)
    if (product.maxPerOrder > 0 && wanted.quantity > product.maxPerOrder) throw new StoreError(`تعداد «${product.name}» بیشتر از حد هر سفارش است`, 409)
    const price = unitPrice(product, variant, false)
    if (price.unitMinor <= 0n || price.unitMinor.toString() !== wanted.expectedUnitMinor) throw new StoreError(`قیمت «${product.name}» تغییر کرده است؛ قیمت‌ها را تازه و مبلغ را دوباره تأیید کنید`, 409, 'PRICE_CHANGED')
    if (currency && currency !== price.currency) throw new StoreError('واحد پول کالاهای یک فروش باید یکسان باشد')
    currency = price.currency
    if (product.digitalMode === 'CODES' && (available.get(product.id)?.get(variant?.id || null) || 0) < wanted.quantity) throw new StoreError(`کد آمادهٔ «${product.name}» کافی نیست؛ کدهای رزروشدهٔ سایت قابل فروش دوباره نیستند`, 409, 'OUT_OF_STOCK')
    const amount = price.unitMinor * BigInt(wanted.quantity)
    totalMinor += amount
    return { line, productId: product.id, variantId: variant?.id || null, name: product.name, variantName: variant?.name || '', sku: variant?.sku || product.sku, image: product.image, kind: product.kind, quantity: wanted.quantity, unitPriceMinor: price.unitMinor, listPriceMinor: price.listMinor, totalMinor: amount, currency, unitCostMinor: variant?.costMinor ?? product.costMinor, inputs: sealAnswers(validateAnswers(validateOrderFields(product.orderFields), variant?.name || '', wanted.inputs)) }
  })
  if (totalMinor > 9_000_000_000_000_000n) throw new StoreError('مبلغ فروش بیش از حد مجاز است')
  await lockRegister(tx,input.sessionId,actorId,currency)
  const payments=counterPayments(input,totalMinor)
  const order = await tx.order.create({ data: {
    registerSessionId:input.sessionId,receiptToken:randomBytes(24).toString('hex'),userId: customer?.id || null, createdById: actorId, assigneeId: actorId, saleSource: 'COUNTER', customerName: input.customerName || customer?.name || '', customerPhone: normalizeMobile(input.customerPhone || customer?.phone || '') || '',
    productId: lines[0].productId, status: 'PENDING', provider: 'MANUAL', idempotencyKey: key, totalMinor, totalAmount: legacyNumber(totalMinor, currency), currency,
    meta: JSON.stringify({ kind: 'product', counterFingerprint: fingerprint, counterMethod: input.method, counterReference: input.reference, source: 'COUNTER' }),
    lines: { create: lines },
  } })
  await reserveInventoryInTransaction(tx, { orderId: order.id })
  const wallet=await payCounterWallet(tx,input,customer,actorId,order.id,totalMinor,currency,key)
  const invoice = await createInvoiceForOrder({ orderId: order.id, userId: order.userId, saleSource: 'COUNTER', productId: order.productId, subtotal: minorToDecimal(totalMinor, currency), walletApplied:minorToDecimal(wallet,currency),currency, createdBy: actorId, idempotencyKey: `${key}:invoice` }, tx)
  const paid = await markInvoicePaid({ invoiceId: invoice.id, allocations:payments.filter(row=>row.method!=='WALLET').map(row=>({provider:row.method as 'CASH'|'CARD',amountMinor:BigInt(row.amountMinor),reference:row.reference||`counter:${order.id}`})),amount: minorToDecimal(totalMinor-wallet, currency), raw: { source: 'COUNTER', actorId, method: input.method, reference: input.reference } }, tx)
  if (!paid.ok) throw new StoreError(paid.message, 409)
  for (const line of lines) {
    if (products.find((product) => product.id === line.productId)?.digitalMode !== 'CODES') continue
    if (await assignLine(order.id, line, tx)) throw new StoreError('کد آماده هم‌زمان فروخته شد؛ فروش ثبت نشد', 409, 'OUT_OF_STOCK')
  }
  const consumed = await consumeInventoryReservation(order.id, tx)
  if (!consumed.ok) throw new StoreError(consumed.message, 409)
  await tx.productDelivery.create({ data: { orderId: order.id, status: 'DELIVERED', deliveredAt: new Date(), deliveryNote: 'تحویل حضوری در فروشگاه' } })
  await recordStoreSale(order.id, tx)
  await tx.storeTender.createMany({data:payments.map(row=>({orderId:order.id,sessionId:input.sessionId,method:row.method,amountMinor:BigInt(row.amountMinor),reference:row.reference}))})
  if(customer)await counterClub(tx,{userId:customer.id,orderId:order.id,totalMinor,currency,redeem:0,key},'EARN')
  if(customer&&order.customerPhone)await createInboxEvent({userId:customer.id,kind:'STORE_RECEIPT',dedupeKey:`counter:receipt:${order.id}`,titleFa:`فاکتور خرید حضوری ${invoice.number}`,titleEn:'Counter purchase invoice',bodyFa:'رسید و وضعیت خرید شما',href:`/receipt/store/${order.receiptToken}`,channels:['sms']},tx)
  await tx.orderEvent.create({ data: { orderId: order.id, status: 'DELIVERED', actorId, note: 'فروش و تحویل حضوری' } })
  for (const id of productIds) await syncCodeStock(tx, id)
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
      if (error instanceof OutOfStock) throw new StoreError('موجودی کالا هم‌زمان تغییر کرد؛ فروش ثبت نشد', 409, 'OUT_OF_STOCK')
      if(error instanceof PhoneCustomerError)throw new StoreError(error.message,409)
      asStoreError(error)
    }
  }
  throw new StoreError('ثبت هم‌زمان فروش ممکن نشد؛ دوباره تلاش کنید', 409)
}
