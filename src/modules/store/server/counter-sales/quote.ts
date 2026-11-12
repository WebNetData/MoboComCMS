import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { lockProduct, availableCodeStock } from '@/modules/catalog/server/code-stock'
import { unitPrice } from '@/modules/store/server/pricing'
import { validateAnswers, validateOrderFields } from '@/modules/store/domain/order-inputs'
import { sealAnswers } from '@/modules/store/server/order-inputs'
import { readCounterSale, type CounterSaleInput } from '@/modules/store/domain/counter-sales'
import { StoreError } from '@/modules/store/domain/store'
import { findPhoneCustomer } from '@/modules/identity/server/phone-customer'
import { counterTotals } from './totals'

export async function priceCounterLines(tx: Prisma.TransactionClient, input: CounterSaleInput) {
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
    const price = unitPrice(product, variant, false, new Date(), undefined, 'COUNTER')
    if (price.unitMinor <= 0n || price.unitMinor.toString() !== wanted.expectedUnitMinor) throw new StoreError(`قیمت «${product.name}» تغییر کرده است؛ قیمت‌ها را تازه و مبلغ را دوباره تأیید کنید`, 409, 'PRICE_CHANGED')
    if (currency && currency !== price.currency) throw new StoreError('واحد پول کالاهای یک فروش باید یکسان باشد')
    currency = price.currency
    if (product.digitalMode === 'CODES' && (available.get(product.id)?.get(variant?.id || null) || 0) < wanted.quantity) throw new StoreError(`کد آمادهٔ «${product.name}» کافی نیست؛ کدهای رزروشدهٔ سایت قابل فروش دوباره نیستند`, 409, 'OUT_OF_STOCK')
    const amount = price.unitMinor * BigInt(wanted.quantity)
    totalMinor += amount
    return { line, productId: product.id, variantId: variant?.id || null, name: product.name, variantName: variant?.name || '', sku: variant?.sku || product.sku, image: product.image, kind: product.kind, quantity: wanted.quantity, unitPriceMinor: price.unitMinor, listPriceMinor: price.listMinor, totalMinor: amount, currency, unitCostMinor: variant?.costMinor ?? product.costMinor, inputs: sealAnswers(validateAnswers(validateOrderFields(product.orderFields), variant?.name || '', wanted.inputs)) }
  })
  if (totalMinor > 9_000_000_000_000_000n) throw new StoreError('مبلغ فروش بیش از حد مجاز است')
  return { products, lines, subtotalMinor: totalMinor, currency }
}

export async function quoteCounterSale(raw: unknown) {
  const input = readCounterSale({ ...(raw as Record<string, unknown>), requestId: '00000000-0000-4000-8000-000000000000', confirmed: true, method: 'CASH', payments: undefined, walletCode: '', redeemPoints: 0 })
  const customer = input.customerPhone ? await findPhoneCustomer(input.customerPhone) : null
  const userId = customer?.id || input.customerId || null
  return db.$transaction(async tx => {
    const base = await priceCounterLines(tx, input)
    const totals = await counterTotals(tx, input, userId, base.lines, base.subtotalMinor, base.currency)
    return { subtotalMinor: totals.subtotalMinor.toString(), discountMinor: totals.discountMinor.toString(), shippingMinor: totals.shippingMinor.toString(), totalMinor: totals.totalMinor.toString(), currency: totals.currency }
  }, { timeout: 15000 })
}
