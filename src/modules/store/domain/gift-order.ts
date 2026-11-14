import { StoreError } from './store'

export type GiftOrder = { recipient: string; message: string; wrap: boolean }
const text = (value: unknown, max: number) => {
  if (typeof value !== 'string' || value.length > max) throw new StoreError('اطلاعات هدیه را با طول مجاز وارد کنید', 400, 'GIFT_INVALID')
  return value.replace(/[\u0000-\u001f<>]/g, ' ').trim()
}

/** Validated once during checkout, then frozen with the existing order snapshot. */
export function validateGiftOrder(input: unknown, options: { enabled: boolean; wrapEnabled: boolean; physical: boolean }): GiftOrder | null {
  if (input == null) return null
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StoreError('اطلاعات هدیه معتبر نیست', 400, 'GIFT_INVALID')
  const raw = input as Record<string, unknown>
  if (raw.enabled === false) return null
  if (raw.enabled !== true) throw new StoreError('انتخاب سفارش هدیه معتبر نیست', 400, 'GIFT_INVALID')
  if (!options.enabled || !options.physical) throw new StoreError('سفارش هدیه برای این خرید فعال نیست', 409, 'GIFT_UNAVAILABLE')
  if (raw.wrap !== undefined && typeof raw.wrap !== 'boolean') throw new StoreError('انتخاب بسته‌بندی معتبر نیست', 400, 'GIFT_INVALID')
  if (raw.wrap === true && !options.wrapEnabled) throw new StoreError('بسته‌بندی هدیه در حال حاضر فعال نیست', 409, 'GIFT_WRAP_UNAVAILABLE')
  const recipient = text(raw.recipient, 120)
  if (!recipient) throw new StoreError('نام گیرندهٔ هدیه را وارد کنید', 400, 'GIFT_INVALID')
  return { recipient, message: text(raw.message ?? '', 500), wrap: raw.wrap === true }
}

/** Legacy orders have no gift; malformed stored data never appears in a receipt. */
export function readGiftOrder(input: unknown): GiftOrder | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  try {
    return validateGiftOrder({ ...raw, enabled: true }, { enabled: true, wrapEnabled: true, physical: true })
  } catch { return null }
}
