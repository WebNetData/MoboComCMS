import { validateAddress, type AddressInput } from '@/modules/shipping/domain/shipping'
import { StoreError } from '@/modules/store/domain/store'
import type { OrderField } from '@/modules/store/domain/order-inputs'
import type { DeliveryItem, ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'

export const COUNTER_PAYMENT_METHODS = ['CASH', 'CARD', 'WALLET', 'SPLIT'] as const
export type CounterPaymentMethod = typeof COUNTER_PAYMENT_METHODS[number]
export type CounterLine = { productId: number; variantId: number | null; quantity: number; expectedUnitMinor: string; inputs: Record<string, string> }
/** A repair invoiced at the counter (owner 2026-11-13): work done and parts not kept in stock, priced by staff; parts from stock stay ordinary lines. */
export type CounterWorkLine = { name: string; part: boolean; quantity: number; unitMinor: string }
export type CounterRepair = { submissionId: number; currency: string; work: CounterWorkLine[] }
/** On a repair invoice each line says what it is: a part from the shelf or bought in, or the work done. */
const REPAIR_LINE_NOTE: Record<string, string> = { PHYSICAL: 'قطعهٔ تعویض‌شده', PART: 'قطعهٔ تعویض‌شده', SERVICE: 'اجرت و کار انجام‌شده' }
export const repairLineNote = (kind: string, variant: string) => [REPAIR_LINE_NOTE[kind], variant].filter(Boolean).join(' · ')
export type CounterTenderInput = { method: 'CASH' | 'CARD' | 'WALLET'; amountMinor: string; reference: string }
export type CounterShipment = { locationId: number; address: AddressInput; date: string; slotId: string; carrierId: string }
export type CounterSaleInput = { shipment?: CounterShipment; discountCode?: string; expectedTotalMinor?: string; requestId: string; customerId: number | null; customerName: string; customerPhone: string; customerFirstName?: string; customerLastName?: string; method: CounterPaymentMethod; reference: string; lines: CounterLine[]; sessionId?: number | null; payments?: CounterTenderInput[]; walletCode?: string; redeemPoints?: number; repair?: CounterRepair }
export type CounterProduct = { id: number; name: string; kind: string; currency: string; stock: number; unitMinor: string; maxPerOrder: number; fields: OrderField[]; variants: { id: number; name: string; stock: number; unitMinor: string }[] }
export type CounterCustomer = { id: number; name: string; email: string; phone: string }
/** Seller block printed on sale receipts: the Admin invoice profile (billing), with the site brand as fallback. */
export type SaleSeller = { name: string; logo: string; phone: string; address: string; postalCode: string; economicCode: string; nationalId: string; registrationNo: string; stamp: string; note: string; tagline?: string; website?: string }
export type CounterReceipt = {
  orderId: number; invoiceNumber: string; createdAt: string; customer: string; phone: string; cashier: string; method: string; reference: string; currency: string; totalMinor: string
  deliveryMode?: 'SHIP' | 'HANDOVER'; subtotalMinor?: string; discountMinor?: string; shippingMinor?: string; shippingAddress?: string;
  brand: { title: string; logo: string }; link?: string; qr?: string; payments?: CounterTenderInput[]; seller?: SaleSeller; register?: string
  lines: { name: string; variant: string; quantity: number; unitMinor: string; totalMinor: string; kind: string }[]
  /** the repair this sale invoiced (its form answer number) */
  repair?: { id: number }
  cards: { id: number; product: string; items: DeliveryItem[]; template: ProductDeliveryTemplate }[]
}
const text = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit)
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0

function readRepair(raw: unknown): CounterRepair | undefined {
  if (raw === undefined || raw === null) return undefined
  const value = typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const submissionId = Number(value.submissionId), currency = text(value.currency, 3).toUpperCase()
  if (!positive(submissionId) || !/^[A-Z]{3}$/.test(currency)) throw new StoreError('درخواست تعمیر یا واحد پول فاکتور معتبر نیست')
  if (!Array.isArray(value.work) || value.work.length > 30) throw new StoreError('ردیف‌های کار و قطعه معتبر نیست')
  const work = value.work.map((row): CounterWorkLine => {
    const line = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const name = text(line.name, 120), quantity = Number(line.quantity), unitMinor = String(line.unitMinor ?? '')
    if (name.length < 2 || !positive(quantity) || quantity > 99 || !/^\d{1,16}$/.test(unitMinor)) throw new StoreError('هر ردیف کار یا قطعه شرح، تعداد و مبلغ معتبر می‌خواهد')
    return { name, part: line.part === true, quantity, unitMinor }
  })
  return { submissionId, currency, work }
}

export function readCounterSale(input: unknown): CounterSaleInput {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const requestId = text(body.requestId, 80)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new StoreError('شناسهٔ فروش معتبر نیست؛ صفحه را تازه کنید')
  if (body.confirmed !== true) throw new StoreError('دریافت کامل وجه را تأیید کنید')
  if (!COUNTER_PAYMENT_METHODS.includes(body.method as CounterPaymentMethod)) throw new StoreError('روش دریافت وجه معتبر نیست')
  const customerId = body.customerId == null || body.customerId === '' ? null : Number(body.customerId)
  if (customerId !== null && !positive(customerId)) throw new StoreError('مشتری انتخاب‌شده معتبر نیست')
  const repair = readRepair(body.repair)
  if (!Array.isArray(body.lines) || body.lines.length + (repair?.work.length || 0) > 30 || (!body.lines.length && !repair?.work.length)) throw new StoreError('از ۱ تا ۳۰ ردیف کالا انتخاب کنید')
  const seen = new Set<string>()
  const lines = body.lines.map((raw): CounterLine => {
    const line = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const productId = Number(line.productId), variantId = line.variantId == null ? null : Number(line.variantId), quantity = Number(line.quantity)
    if (!positive(productId) || (variantId !== null && !positive(variantId)) || !positive(quantity) || quantity > 99) throw new StoreError('کالا، گزینه یا تعداد معتبر نیست')
    const key = `${productId}:${variantId || 0}`
    if (seen.has(key)) throw new StoreError('هر گزینهٔ کالا را یک بار اضافه کنید و تعدادش را تغییر دهید')
    seen.add(key)
    const expectedUnitMinor = String(line.expectedUnitMinor ?? '')
    if (!/^\d{1,16}$/.test(expectedUnitMinor)) throw new StoreError('قیمت کالا را دوباره دریافت کنید')
    const values = line.inputs && typeof line.inputs === 'object' && !Array.isArray(line.inputs) ? line.inputs as Record<string, unknown> : {}
    const inputs = Object.fromEntries(Object.keys(values).sort().slice(0, 12).map((key) => [key, String(values[key] ?? '')]))
    return { productId, variantId, quantity, expectedUnitMinor, inputs }
  })
  const sessionId = body.sessionId == null ? null : Number(body.sessionId), redeemPoints = Number(body.redeemPoints || 0)
  if ((sessionId !== null && !positive(sessionId)) || !Number.isSafeInteger(redeemPoints) || redeemPoints < 0 || redeemPoints > 1_000_000_000) throw new StoreError('صندوق یا تعداد امتیاز معتبر نیست')
  const payments: CounterTenderInput[] = []
  if (body.payments !== undefined) {
    if (!Array.isArray(body.payments) || !body.payments.length || body.payments.length > 3) throw new StoreError('روش‌های پرداخت را مشخص کنید')
    for (const raw of body.payments) {
      const item = raw as Record<string, unknown>, method = String(item?.method), amountMinor = String(item?.amountMinor ?? '')
      if (!['CASH','CARD','WALLET'].includes(method) || !/^\d{1,16}$/.test(amountMinor) || BigInt(amountMinor) <= 0n || payments.some(item => item.method === method)) throw new StoreError('مبلغ و روش پرداخت معتبر نیست')
      const reference = text(item.reference,120)
      if (method === 'CARD' && !reference) throw new StoreError('شمارهٔ پیگیری کارت‌خوان را وارد کنید')
      payments.push({ method: method as CounterTenderInput['method'], amountMinor, reference })
    }
  }
  if ((body.method === 'WALLET' || body.method === 'SPLIT') && !payments.length) throw new StoreError('جزئیات پرداخت لازم است')
    // First and last name, like the member profile; together they are the buyer name printed on the invoice.
  const customerFirstName = text(body.customerFirstName, 40), customerLastName = text(body.customerLastName, 40)
  const customerName = [customerFirstName, customerLastName].filter(Boolean).join(' ') || text(body.customerName, 120)
  const discountCode = text(body.discountCode, 32).toUpperCase()
  const expectedTotalMinor = body.expectedTotalMinor === undefined ? undefined : String(body.expectedTotalMinor)
  if (expectedTotalMinor !== undefined && !/^\d{1,16}$/.test(expectedTotalMinor)) throw new StoreError('مبلغ نمایش‌داده‌شده معتبر نیست')
  let shipment: CounterShipment | undefined
  if (body.shipment !== undefined && body.shipment !== null) {
    const raw = body.shipment as Record<string, unknown>
    const locationId = Number(raw.locationId)
    if (!positive(locationId)) throw new StoreError('انبار ارسال را انتخاب کنید')
    try { shipment = { locationId, address: validateAddress((raw.address || {}) as Record<string, unknown>), date: text(raw.date, 10), slotId: text(raw.slotId, 40), carrierId: text(raw.carrierId, 60) } }
    catch (error) { throw new StoreError(error instanceof Error ? error.message : 'نشانی ارسال معتبر نیست') }
  }
  return { requestId, customerId, customerName, customerPhone: text(body.customerPhone, 30), customerFirstName, customerLastName, method: body.method as CounterPaymentMethod, reference: text(body.reference, 120), lines, sessionId, payments, walletCode: text(body.walletCode,8), redeemPoints, ...(discountCode ? { discountCode } : {}), ...(shipment ? { shipment } : {}), ...(repair ? { repair } : {}), ...(expectedTotalMinor !== undefined ? { expectedTotalMinor } : {}) }
}
