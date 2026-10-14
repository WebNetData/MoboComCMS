/**
 * Rules an invoice lives by after it is issued: how often a recurring invoice comes again, when an unpaid one closes by
 * itself, and when a price that followed an exchange rate is no longer fair. Pure; the engine is server/invoice-rules.ts.
 */

export const INTERVALS = [
  { id: 'WEEK', label: 'هفتگی', short: 'هر هفته', days: 7, months: 0 },
  { id: 'MONTH', label: 'ماهانه', short: 'هر ماه', days: 0, months: 1 },
  { id: 'QUARTER', label: 'سه‌ماهه', short: 'هر ۳ ماه', days: 0, months: 3 },
  { id: 'HALF', label: 'شش‌ماهه', short: 'هر ۶ ماه', days: 0, months: 6 },
  { id: 'YEAR', label: 'سالانه', short: 'هر ۱۲ ماه', days: 0, months: 12 },
] as const
export type Interval = (typeof INTERVALS)[number]['id']
export const intervalOf = (id: string) => INTERVALS.find((item) => item.id === id)

// Persian calendar, in Tehran time (+03:30, no daylight saving since 2022): months are counted as customers count them.
const TEHRAN_MS = 3.5 * 3_600_000
const DAY_MS = 86_400_000
const persianParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' })

/** Jalali year / month / day of the Tehran day `date` falls on. */
export function tehranJalali(date: Date) {
  const parts = persianParts.formatToParts(new Date(date.getTime() + TEHRAN_MS))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { jy: get('year'), jm: get('month'), jd: get('day') }
}

/** Jalali → Gregorian [year, month, day] (the jdf algorithm). */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  let gy = 400 * Math.floor(days / 146097)
  days %= 146097
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++ }
  gy += 4 * Math.floor(days / 1461)
  days %= 1461
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  let gd = days + 1
  const months = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 0
  for (gm = 0; gm < 13 && gd > months[gm]; gm++) gd -= months[gm]
  return [gy, gm, gd]
}

const jalaliMonthLength = (jy: number, jm: number) => {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  const [gy, gm, gd] = jalaliToGregorian(jy, 12, 30)
  return tehranJalali(new Date(Date.UTC(gy, gm - 1, gd) - TEHRAN_MS + DAY_MS / 2)).jd === 30 ? 30 : 29
}

/**
 * The next time after `from`, at the same time of day. A month later is the same day of the next Persian month
 * (22 Mehr → 22 Aban), or that month's last day (31 Shahrivar → 30 Mehr).
 */
export function nextRun(from: Date, interval: string): Date {
  const def = intervalOf(interval) || INTERVALS[1]
  if (def.days) return new Date(from.getTime() + def.days * DAY_MS)
  const local = from.getTime() + TEHRAN_MS
  const timeOfDay = ((local % DAY_MS) + DAY_MS) % DAY_MS
  const { jy, jm, jd } = tehranJalali(from)
  const months = jm - 1 + def.months
  const year = jy + Math.floor(months / 12), month = (months % 12) + 1
  const [gy, gm, gd] = jalaliToGregorian(year, month, Math.min(jd, jalaliMonthLength(year, month)))
  return new Date(Date.UTC(gy, gm - 1, gd) + timeOfDay - TEHRAN_MS)
}

export type CloseAction = 'void' | 'delete'
export type InvoiceRules = {
  /** Hours an invoice whose price followed an exchange rate stays open (0: no time limit). */
  fxHours: number
  /** Toman a rate may rise after checkout before such an invoice closes (0: never on a rise). */
  fxJumpToman: number
  fxAction: CloseAction
  /** Close any unpaid invoice this many hours after it fell due. */
  overdueEnabled: boolean
  overdueHours: number
  overdueAction: CloseAction
}
export const DEFAULT_INVOICE_RULES: InvoiceRules = { fxHours: 2, fxJumpToman: 3000, fxAction: 'delete', overdueEnabled: false, overdueHours: 72, overdueAction: 'void' }

const num = (value: unknown, min: number, max: number, fallback: number) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }
const action = (value: unknown, fallback: CloseAction): CloseAction => (value === 'void' || value === 'delete' ? value : fallback)

export function normalizeInvoiceRules(input: unknown): InvoiceRules {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const d = DEFAULT_INVOICE_RULES
  return {
    fxHours: Math.round(num(raw.fxHours, 0, 72, d.fxHours) * 4) / 4,
    fxJumpToman: Math.round(num(raw.fxJumpToman, 0, 10_000_000, d.fxJumpToman)),
    fxAction: action(raw.fxAction, d.fxAction),
    overdueEnabled: raw.overdueEnabled === true,
    overdueHours: Math.round(num(raw.overdueHours, 1, 24 * 365, d.overdueHours)),
    overdueAction: action(raw.overdueAction, d.overdueAction),
  }
}

/** The rates an invoice was priced at, as stored on it; anything unreadable counts as none. */
export function parseFxRates(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value || '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && rate > 0)) as Record<string, number>
  } catch { return {} }
}

/** The first currency whose rate rose by at least `threshold` toman since checkout, or null. A fall never closes an invoice. */
export function fxJump(snapshot: Record<string, number>, current: Record<string, number | null | undefined>, threshold: number) {
  if (threshold <= 0) return null
  for (const [code, from] of Object.entries(snapshot)) {
    const to = current[code]
    if (typeof to === 'number' && to > 0 && to - from >= threshold) return { code, from, to }
  }
  return null
}

export const CLOSE_REASON_LABEL: Record<string, string> = { FX_RATE: 'نوسان نرخ ارز', EXPIRED: 'پایان مهلت', OVERDUE: 'سررسید گذشته' }

const CURRENCY_FA: Record<string, string> = { USD: 'دلار', EUR: 'یورو', GBP: 'پوند', AED: 'درهم', TRY: 'لیر', USDT: 'تتر' }
export const currencyFa = (code: string) => CURRENCY_FA[code] || code

/** What the customer is told when a rule closed their invoice. */
export function closeMessage(reason: string, number: string, jump?: { code: string; from: number; to: number } | null, fx = true) {
  const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')
  if (reason === 'FX_RATE') return {
    title: `فاکتور ${number} به دلیل نوسان نرخ ارز بسته شد`,
    body: `${jump ? `نرخ ${currencyFa(jump.code)} از ${fa(jump.from)} به ${fa(jump.to)} تومان رسید. ` : ''}به دلیل نوسانات ارز، این فاکتور بسته شد؛ لطفاً سفارش را دوباره ثبت کنید تا با نرخ روز قیمت‌گذاری شود.`,
  }
  if (reason === 'EXPIRED' && !fx) return { title: `مهلت پرداخت فاکتور ${number} به پایان رسید`, body: 'مهلت پرداخت این فاکتور گذشت و فاکتور بسته شد. اگر هنوز به آن نیاز دارید، دوباره سفارش دهید یا با پشتیبانی تماس بگیرید.' }
  if (reason === 'EXPIRED') return {
    title: `مهلت پرداخت فاکتور ${number} به پایان رسید`,
    body: 'قیمت این فاکتور به نرخ ارز وابسته بود و مهلت پرداخت آن گذشت؛ فاکتور بسته شد. لطفاً سفارش را دوباره ثبت کنید تا با نرخ روز قیمت‌گذاری شود.',
  }
  return { title: `فاکتور ${number} بسته شد`, body: 'سررسید پرداخت این فاکتور گذشته بود و بسته شد. اگر هنوز به آن نیاز دارید، با پشتیبانی تماس بگیرید یا سفارش را دوباره ثبت کنید.' }
}
