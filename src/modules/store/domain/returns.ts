/**
 * Cancellations and returns of store orders: who may ask for what and when,
 * how much comes back, and the review workflow. Pure functions only.
 *
 *   CANCEL  — before the parcel leaves (fulfilment not yet shipped); the whole order.
 *   RETURN  — after delivery, within the return window; chosen lines and quantities.
 *
 * Refunds are credited to the customer's wallet in the order currency.
 */

export type ReturnKind = 'CANCEL' | 'RETURN'
export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'WITHDRAWN'

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'در انتظار بررسی',
  APPROVED: 'تأیید شد؛ در انتظار دریافت کالا',
  REJECTED: 'رد شد',
  REFUNDED: 'مبلغ به کیف پول برگشت',
  WITHDRAWN: 'لغو درخواست توسط شما',
}

export const RETURN_KIND_LABEL: Record<ReturnKind, string> = { CANCEL: 'لغو سفارش', RETURN: 'مرجوعی کالا' }

export const RETURN_REASONS = [
  { key: 'damaged', label: 'کالا آسیب‌دیده یا معیوب رسید', photos: true, forKinds: ['RETURN'] },
  { key: 'wrong_item', label: 'کالای اشتباه ارسال شد', photos: true, forKinds: ['RETURN'] },
  { key: 'not_as_described', label: 'با توضیحات و تصاویر سایت مطابقت ندارد', photos: true, forKinds: ['RETURN'] },
  { key: 'missing_parts', label: 'قطعه یا لوازم جانبی ناقص است', photos: true, forKinds: ['RETURN'] },
  { key: 'code_invalid', label: 'کد کار نمی‌کند یا نامعتبر است', photos: false, forKinds: ['RETURN'] },
  { key: 'code_used', label: 'کد پیش از من استفاده شده بود', photos: false, forKinds: ['RETURN'] },
  { key: 'changed_mind', label: 'از خرید منصرف شدم', photos: false, forKinds: ['RETURN', 'CANCEL'] },
  { key: 'late_delivery', label: 'ارسال بیش از حد طول کشید', photos: false, forKinds: ['CANCEL'] },
  { key: 'better_price', label: 'قیمت بهتری پیدا کردم', photos: false, forKinds: ['CANCEL'] },
  { key: 'wrong_order', label: 'در ثبت سفارش اشتباه کردم', photos: false, forKinds: ['CANCEL'] },
  { key: 'other', label: 'دلیل دیگر', photos: false, forKinds: ['RETURN', 'CANCEL'] },
] as const

export const reasonLabel = (key: string) => RETURN_REASONS.find((reason) => reason.key === key)?.label || key
export const reasonsFor = (kind: ReturnKind) => RETURN_REASONS.filter((reason) => (reason.forKinds as readonly string[]).includes(kind))

/** Reasons that are only about a delivered code; the others (but "other") are only about goods that were shipped. */
const CODE_REASONS: readonly string[] = ['code_invalid', 'code_used']
/** The reasons offered for what is being sent back: a code is never "damaged in transit", a parcel never "already used". */
export const reasonsForGoods = (kind: ReturnKind, goods: { physical: boolean; codes: boolean }) => reasonsFor(kind).filter((reason) => kind !== 'RETURN' ? true : CODE_REASONS.includes(reason.key) ? goods.codes : reason.key === 'other' || goods.physical)

export const MAX_RETURN_PHOTOS = 5
export const MAX_RETURN_PHOTO_BYTES = 5 * 1024 * 1024

export type ReturnSettings = {
  enabled: boolean
  /** Days after delivery during which a return may be requested. */
  windowDays: number
  /** Customers may cancel on their own until the order reaches this stage. */
  cancelBefore: 'PROCESSING' | 'PACKED' | 'SHIPPED'
  /** Cancellations before shipping are refunded at once, without staff review. */
  autoRefundCancel: boolean
  /** A damaged / wrong item return also needs at least one photo. */
  requirePhotos: boolean
  /**
   * Days after delivery during which a code the shop delivered by itself may be sent back. 0 = never
   * (the default): a code the buyer has read cannot be sold again, so this is the owner's call.
   */
  codeReturnDays: number
  /** Shown on the request form and the product page. */
  policy: string
}

export const DEFAULT_RETURN_SETTINGS: ReturnSettings = {
  enabled: true,
  windowDays: 7,
  cancelBefore: 'SHIPPED',
  autoRefundCancel: true,
  requirePhotos: true,
  codeReturnDays: 0,
  policy: 'کالا باید در بسته‌بندی اصلی، سالم و همراه همهٔ لوازم و فاکتور بازگردانده شود. پس از دریافت و بررسی کالا، مبلغ به کیف پول شما برمی‌گردد.',
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f<>]/g, ' ').trim().slice(0, max)

export function normalizeReturnSettings(input: unknown): ReturnSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const days = Math.floor(Number(raw.windowDays))
  const codeDays = Math.floor(Number(raw.codeReturnDays))
  const bool = (key: 'enabled' | 'autoRefundCancel' | 'requirePhotos') => typeof raw[key] === 'boolean' ? raw[key] as boolean : DEFAULT_RETURN_SETTINGS[key]
  return {
    enabled: bool('enabled'),
    windowDays: Number.isSafeInteger(days) && days >= 0 && days <= 365 ? days : DEFAULT_RETURN_SETTINGS.windowDays,
    cancelBefore: raw.cancelBefore === 'PROCESSING' || raw.cancelBefore === 'PACKED' || raw.cancelBefore === 'SHIPPED' ? raw.cancelBefore : DEFAULT_RETURN_SETTINGS.cancelBefore,
    autoRefundCancel: bool('autoRefundCancel'),
    requirePhotos: bool('requirePhotos'),
    codeReturnDays: Number.isSafeInteger(codeDays) && codeDays >= 0 && codeDays <= 60 ? codeDays : DEFAULT_RETURN_SETTINGS.codeReturnDays,
    policy: raw.policy === undefined ? DEFAULT_RETURN_SETTINGS.policy : clean(raw.policy, 1200),
  }
}

// ------------------------------------------------------------------ eligibility

const STAGE = ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'] as const
const stageIndex = (status: string) => STAGE.indexOf(status as (typeof STAGE)[number])

/** `goods`: what a return may hold right now, shipped goods and delivered codes each by its own window. */
export type Eligibility = { cancel: boolean; return: boolean; reason: string; returnUntil: Date | null; goods: { physical: boolean; codes: boolean } }

/**
 * What the customer may ask for right now. `open` = an unfinished request
 * already exists (one at a time per order).
 */
export function eligibility(input: {
  paid: boolean; fulfilment: string; deliveredAt: Date | null; open: boolean; fullyRefunded: boolean; physical: boolean
  /** The order holds codes delivered from a product's pool that the buyer still has. */
  codes?: boolean
}, settings: ReturnSettings, now = new Date()): Eligibility {
  const nothing = { physical: false, codes: false }
  const none = (reason: string): Eligibility => ({ cancel: false, return: false, reason, returnUntil: null, goods: nothing })
  if (!settings.enabled) return none('ثبت درخواست لغو یا مرجوعی فعلاً فعال نیست.')
  if (!input.paid) return none('سفارش پرداخت‌نشده نیاز به لغو ندارد؛ پس از مدتی خودکار بسته می‌شود.')
  if (input.fullyRefunded) return none('مبلغ این سفارش قبلاً کامل برگشت داده شده است.')
  if (input.open) return none('یک درخواست باز برای این سفارش در حال بررسی است.')
  const stage = stageIndex(input.fulfilment || 'PENDING')
  if (stage < 0) return none('این سفارش بسته شده است.')
  if (stage < stageIndex(settings.cancelBefore)) return { cancel: true, return: false, reason: '', returnUntil: null, goods: nothing }
  if (input.fulfilment !== 'DELIVERED') return none('سفارش در راه است؛ پس از تحویل می‌توانید درخواست مرجوعی ثبت کنید.')
  const window = (days: number) => { const until = new Date((input.deliveredAt || now).getTime() + days * 86_400_000); return { days, until, open: days > 0 && now <= until } }
  const physical = input.physical ? window(settings.windowDays) : null
  const codes = input.codes ? window(settings.codeReturnDays) : null
  if (!physical && (!codes || codes.days === 0)) return none(codes ? 'کد تحویل‌شده قابل مرجوع کردن نیست؛ در صورت مشکل تیکت ثبت کنید.' : 'کالای مجازی پس از تحویل قابل مرجوع کردن نیست؛ در صورت مشکل تیکت ثبت کنید.')
  if (!physical?.open && !codes?.open) {
    const closed = physical || codes!
    return { ...none(`مهلت ${closed.days.toLocaleString('fa-IR')} روزهٔ مرجوعی این سفارش تمام شده است.`), returnUntil: closed.until }
  }
  const until = [physical, codes].filter((item) => item?.open).map((item) => item!.until).sort((a, b) => b.getTime() - a.getTime())[0]
  return { cancel: false, return: true, reason: '', returnUntil: until, goods: { physical: Boolean(physical?.open), codes: Boolean(codes?.open) } }
}

// ------------------------------------------------------------------ amounts

export type RefundLine = { line: number; quantity: number; unitPriceMinor: bigint; totalMinor: bigint; returnedQuantity: number }
export type LineChoice = { line: number; quantity: number }

/** Keeps valid, de-duplicated line choices within what is still returnable. */
export function normalizeChoices(input: unknown, lines: RefundLine[]): LineChoice[] {
  const list = Array.isArray(input) ? input : []
  const chosen = new Map<number, number>()
  for (const row of list.slice(0, 100)) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const line = lines.find((candidate) => candidate.line === Number(item.line))
    const quantity = Math.floor(Number(item.quantity))
    if (!line || !Number.isSafeInteger(quantity) || quantity <= 0) continue
    const left = line.quantity - line.returnedQuantity
    chosen.set(line.line, Math.min(left, (chosen.get(line.line) || 0) + quantity))
  }
  return [...chosen].filter(([, quantity]) => quantity > 0).map(([line, quantity]) => ({ line, quantity }))
}

/**
 * Refund for returned lines: their paid share, with an order-level discount
 * (coupon) spread over the items in proportion to their price. Shipping is
 * not refunded on a return; a cancellation refunds everything still unrefunded.
 */
export function returnRefundMinor(choices: LineChoice[], lines: RefundLine[], order: { itemsMinor: bigint; discountMinor: bigint }): bigint {
  let gross = 0n
  for (const choice of choices) {
    const line = lines.find((candidate) => candidate.line === choice.line)
    if (!line || line.quantity <= 0) continue
    gross += (line.totalMinor * BigInt(choice.quantity)) / BigInt(line.quantity)
  }
  if (gross <= 0n) return 0n
  if (order.discountMinor > 0n && order.itemsMinor > 0n) {
    const share = (order.discountMinor * gross) / order.itemsMinor
    gross -= share > gross ? gross : share
  }
  return gross
}

/** An amount staff may refund: positive and within what is still unrefunded. */
export function clampRefund(requested: bigint, remaining: bigint): bigint {
  if (remaining <= 0n || requested <= 0n) return 0n
  return requested > remaining ? remaining : requested
}

/** RMA-000123: short, sortable and not guessable from the order id alone. */
export const returnNumber = (id: number) => `RMA-${String(id).padStart(6, '0')}`
