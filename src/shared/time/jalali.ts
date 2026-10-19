/**
 * Persian (Jalali) calendar arithmetic on UTC calendar days, through the platform's Intl calendar.
 * A day is still stored and sent as a Gregorian "YYYY-MM-DD"; Jalali is only how people see and pick it.
 */

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'] as const
/** Week days starting on Saturday, as the Persian week does. */
export const JALALI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

const jalaliFormat = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' })

/** Jalali year / month / day of a UTC calendar day. */
export function toJalali(date: Date): { jy: number; jm: number; jd: number } {
  const parts = jalaliFormat.formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { jy: get('year'), jm: get('month'), jd: get('day') }
}

const dayOfYear = (jm: number, jd: number) => (jm <= 7 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + jd

/** The UTC day on which the Jalali date jy/jm/jd falls. Throws for a date that does not exist. */
export function fromJalali(jy: number, jm: number, jd = 1): Date {
  // Estimate from 1 Farvardin ≈ 21 March, then walk by the day difference.
  let at = Date.UTC(jy + 621, 2, 21) + ((jm - 1) * 30.6 + (jd - 1)) * 86_400_000
  at = Math.floor(at / 86_400_000) * 86_400_000
  for (let i = 0; i < 8; i++) {
    const { jy: y, jm: m, jd: d } = toJalali(new Date(at))
    if (y === jy && m === jm && d === jd) return new Date(at)
    // Years count as 365 days, so a leap day can leave a zero gap: step one day.
    const gap = (jy - y) * 365 + dayOfYear(jm, jd) - dayOfYear(m, d) || (jy * 400 + dayOfYear(jm, jd) > y * 400 + dayOfYear(m, d) ? 1 : -1)
    at += gap * 86_400_000
  }
  throw new RangeError('Invalid Jalali date')
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return toJalali(new Date(fromJalali(jy, 12, 1).getTime() + 29 * 86_400_000)).jm === 12 ? 30 : 29
}

/** "YYYY-MM-DDTHH:mm" of a moment in this device's own time: the value a date-and-time field holds. */
export function localDateTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** "YYYY-MM-DD" of a UTC day. */
export const isoDay = (date: Date) => date.toISOString().slice(0, 10)

/** The UTC day of a "YYYY-MM-DD", or null when it is not one. */
export function parseIsoDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || isoDay(date) !== value ? null : date
}

/** "۲۹ مهر ۱۴۰۵" (optionally with the weekday) for a "YYYY-MM-DD"; empty when it is not a day. */
export function jalaliDayLabel(value: string, weekday = false): string {
  const date = parseIsoDay(value)
  return date ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', ...(weekday ? { weekday: 'long' } : {}) }).format(date) : ''
}
