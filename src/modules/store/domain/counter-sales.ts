import { StoreError } from '@/modules/store/domain/store'
import type { OrderField } from '@/modules/store/domain/order-inputs'
import type { DeliveryItem, ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'

export const COUNTER_PAYMENT_METHODS = ['CASH', 'CARD'] as const
export type CounterPaymentMethod = typeof COUNTER_PAYMENT_METHODS[number]
export type CounterLine = { productId: number; variantId: number | null; quantity: number; expectedUnitMinor: string; inputs: Record<string, string> }
export type CounterSaleInput = { requestId: string; customerId: number | null; customerName: string; customerPhone: string; method: CounterPaymentMethod; reference: string; lines: CounterLine[] }
export type CounterProduct = { id: number; name: string; kind: string; currency: string; stock: number; unitMinor: string; maxPerOrder: number; fields: OrderField[]; variants: { id: number; name: string; stock: number; unitMinor: string }[] }
export type CounterCustomer = { id: number; name: string; email: string; phone: string }
export type CounterReceipt = {
  orderId: number; invoiceNumber: string; createdAt: string; customer: string; phone: string; cashier: string; method: string; reference: string; currency: string; totalMinor: string
  brand: { title: string; logo: string }
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
  return { requestId, customerId, customerName: text(body.customerName, 120), customerPhone: text(body.customerPhone, 30), method: body.method as CounterPaymentMethod, reference: text(body.reference, 120), lines }
}
