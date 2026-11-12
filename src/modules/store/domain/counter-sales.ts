import { StoreError } from '@/modules/store/domain/store'
import type { OrderField } from '@/modules/store/domain/order-inputs'
import type { DeliveryItem, ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'

export const COUNTER_PAYMENT_METHODS = ['CASH', 'CARD', 'WALLET', 'SPLIT'] as const
export type CounterPaymentMethod = typeof COUNTER_PAYMENT_METHODS[number]
export type CounterLine = { productId: number; variantId: number | null; quantity: number; expectedUnitMinor: string; inputs: Record<string, string> }
export type CounterTenderInput = { method: 'CASH' | 'CARD' | 'WALLET'; amountMinor: string; reference: string }
export type CounterSaleInput = { requestId: string; customerId: number | null; customerName: string; customerPhone: string; customerFirstName?: string; customerLastName?: string; method: CounterPaymentMethod; reference: string; lines: CounterLine[]; sessionId?: number | null; payments?: CounterTenderInput[]; walletCode?: string; redeemPoints?: number }
export type CounterProduct = { id: number; name: string; kind: string; currency: string; stock: number; unitMinor: string; maxPerOrder: number; fields: OrderField[]; variants: { id: number; name: string; stock: number; unitMinor: string }[] }
export type CounterCustomer = { id: number; name: string; email: string; phone: string }
/** Seller block printed on sale receipts: the Admin invoice profile (billing), with the site brand as fallback. */
export type SaleSeller = { name: string; logo: string; phone: string; address: string; postalCode: string; economicCode: string; nationalId: string; registrationNo: string; stamp: string; note: string; tagline?: string; website?: string }
export type CounterReceipt = {
  orderId: number; invoiceNumber: string; createdAt: string; customer: string; phone: string; cashier: string; method: string; reference: string; currency: string; totalMinor: string
  brand: { title: string; logo: string }; link?: string; qr?: string; payments?: CounterTenderInput[]; seller?: SaleSeller; register?: string
  lines: { name: string; variant: string; quantity: number; unitMinor: string; totalMinor: string; kind: string }[]
  cards: { id: number; product: string; items: DeliveryItem[]; template: ProductDeliveryTemplate }[]
}
const text = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit)
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0

export function readCounterSale(input: unknown): CounterSaleInput {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const requestId = text(body.requestId, 80)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new StoreError('شناسهٔ فروش معتبر نیست؛ صفحه را تازه کنید')
  if (body.confirmed !== true) throw new StoreError('دریافت کامل وجه را تأیید کنید')
  if (!COUNTER_PAYMENT_METHODS.includes(body.method as CounterPaymentMethod)) throw new StoreError('روش دریافت وجه معتبر نیست')
  const customerId = body.customerId == null || body.customerId === '' ? null : Number(body.customerId)
  if (customerId !== null && !positive(customerId)) throw new StoreError('مشتری انتخاب‌شده معتبر نیست')
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 30) throw new StoreError('از ۱ تا ۳۰ ردیف کالا انتخاب کنید')
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
  return { requestId, customerId, customerName, customerPhone: text(body.customerPhone, 30), customerFirstName, customerLastName, method: body.method as CounterPaymentMethod, reference: text(body.reference, 120), lines, sessionId, payments, walletCode: text(body.walletCode,8), redeemPoints }
}
