import { decryptDigitalDelivery, encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { quoteForeignAmount } from '@/modules/fx/server/fx'
import { FxError } from '@/modules/fx/domain/fx'
import { StoreError } from '@/modules/store/domain/store'
import { OrderInputError, openCurrenciesOf, type OrderAnswer, type OpenAmountRule } from '@/modules/store/domain/order-inputs'

// The buyer's answers at rest, and the price of an amount the buyer typed.

/** Answers as stored on a cart line or an order line: encrypted as a whole, or '' when there are none. */
export function sealAnswers(answers: OrderAnswer[]): string {
  return answers.length ? encryptDigitalDelivery(JSON.stringify(answers)) : ''
}

/** Stored answers, readable. A value that cannot be read (lost key, damaged) gives none rather than an error page. */
export function openAnswers(stored: string | null | undefined): OrderAnswer[] {
  if (!stored) return []
  try {
    const parsed = JSON.parse(decryptDigitalDelivery(stored))
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.key === 'string' && typeof item.value === 'string').map((item) => ({ key: item.key, label: String(item.label || item.key), kind: item.kind, value: item.value })) : []
  } catch { return [] }
}

type OpenProduct = OpenAmountRule & { currency: string; markupBps: number; markupFixedMinor: bigint }

/**
 * What one unit of an open-amount product costs for the amount on the line, now. Used by the cart, by the
 * quote the page shows, and again by checkout — so a rate that moved changes the price before the buyer pays.
 */
export async function openAmountPrice(product: OpenProduct, amountMinor: bigint, currency: string) {
  if (!product.openAmount) throw new StoreError('این کالا مبلغ دلخواه ندارد', 400, 'OPEN_AMOUNT')
  if (amountMinor <= 0n || !openCurrenciesOf(product).includes(currency)) throw new StoreError('مبلغ این خدمت را دوباره وارد کنید', 409, 'OPEN_AMOUNT')
  if ((product.openMinMinor > 0n && amountMinor < product.openMinMinor) || (product.openMaxMinor > 0n && amountMinor > product.openMaxMinor)) throw new StoreError('مبلغ این خدمت دیگر در بازهٔ مجاز نیست؛ دوباره وارد کنید', 409, 'OPEN_AMOUNT')
  try {
    const quote = await quoteForeignAmount(product, amountMinor, currency)
    if (quote.priceMinor <= 0n) throw new StoreError('قیمت این خدمت محاسبه نشد', 409, 'OPEN_AMOUNT')
    return quote
  } catch (error) {
    if (error instanceof FxError) throw new StoreError(`${error.message}؛ کمی بعد دوباره تلاش کنید`, 409, 'FX_RATE')
    throw error
  }
}

/** A buyer-input problem as the shop's own error, so every route answers it the same way. */
export function asStoreError(error: unknown): never {
  if (error instanceof OrderInputError) throw new StoreError(error.message, error.status, error.code)
  throw error
}
