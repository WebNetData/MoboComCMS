/**
 * Shipping rules for physical products: the customer's address book and the
 * delivery schedule (day + time window, Digikala style) with daily capacity.
 * Pure functions only — persistence lives in ../server.
 */

export class ShippingError extends Error {
  constructor(message: string, public status = 400, public code = 'SHIPPING_INVALID') { super(message) }
}

export const PROVINCES = [
  'آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران', 'چهارمحال و بختیاری',
  'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی', 'خوزستان', 'زنجان', 'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین',
  'قم', 'کردستان', 'کرمان', 'کرمانشاه', 'کهگیلویه و بویراحمد', 'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی',
  'هرمزگان', 'همدان', 'یزد',
] as const

export const MAX_ADDRESSES = 10

/** Map centre per province (its capital), for the location picker. */
export const PROVINCE_CENTERS: Record<string, [number, number]> = {
  'آذربایجان شرقی': [38.08, 46.29], 'آذربایجان غربی': [37.55, 45.07], 'اردبیل': [38.25, 48.29], 'اصفهان': [32.65, 51.67], 'البرز': [35.84, 50.94],
  'ایلام': [33.64, 46.42], 'بوشهر': [28.97, 50.84], 'تهران': [35.70, 51.39], 'چهارمحال و بختیاری': [32.33, 50.86], 'خراسان جنوبی': [32.87, 59.22],
  'خراسان رضوی': [36.30, 59.60], 'خراسان شمالی': [37.47, 57.33], 'خوزستان': [31.32, 48.67], 'زنجان': [36.68, 48.48], 'سمنان': [35.58, 53.39],
  'سیستان و بلوچستان': [29.50, 60.86], 'فارس': [29.59, 52.58], 'قزوین': [36.27, 50.00], 'قم': [34.64, 50.88], 'کردستان': [35.31, 47.00],
  'کرمان': [30.28, 57.08], 'کرمانشاه': [34.31, 47.07], 'کهگیلویه و بویراحمد': [30.67, 51.59], 'گلستان': [36.84, 54.43], 'گیلان': [37.28, 49.58],
  'لرستان': [33.49, 48.36], 'مازندران': [36.57, 53.06], 'مرکزی': [34.09, 49.69], 'هرمزگان': [27.18, 56.27], 'همدان': [34.80, 48.51], 'یزد': [31.90, 54.36],
}
export const IRAN_CENTER: [number, number] = [32.43, 53.69]

/** A pin inside Iran's bounding box, rounded to ~1 m; anything else is dropped. */
export function normalizeCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat), b = Number(lng)
  if (lat === null || lat === undefined || lat === '' || !Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a < 24 || a > 40.5 || b < 43 || b > 64) return null
  return { lat: Math.round(a * 1e5) / 1e5, lng: Math.round(b * 1e5) / 1e5 }
}

const toLatin = (value: unknown) => String(value ?? '')
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** 09xxxxxxxxx from any common spelling (+98, 0098, Persian digits, spaces). */
export function normalizeMobile(value: unknown): string {
  let digits = toLatin(value).replace(/[^\d+]/g, '')
  if (digits.startsWith('+98')) digits = `0${digits.slice(3)}`
  else if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`
  return /^09\d{9}$/.test(digits) ? digits : ''
}

/** Iranian postal code: 10 digits, first digit not 0 or 2 and no digit 0/2 in the first five. */
export function normalizePostalCode(value: unknown): string {
  const digits = toLatin(value).replace(/\D/g, '')
  return /^[13-9]{5}\d{5}$/.test(digits) && !/^(\d)\1{9}$/.test(digits) ? digits : ''
}

export type AddressInput = {
  title: string; recipient: string; mobile: string; province: string; city: string
  address: string; plaque: string; unit: string; postalCode: string; isDefault: boolean
  lat: number | null; lng: number | null
}

/** Validates a saved address; throws a user-facing ShippingError. */
export function validateAddress(input: Record<string, unknown>): AddressInput {
  const recipient = text(input.recipient, 80)
  const mobile = normalizeMobile(input.mobile)
  const province = text(input.province, 40)
  const city = text(input.city, 60)
  const address = text(input.address, 400)
  const postalCode = normalizePostalCode(input.postalCode)
  if (recipient.length < 3) throw new ShippingError('نام و نام خانوادگی گیرنده را وارد کنید')
  if (!mobile) throw new ShippingError('شمارهٔ موبایل گیرنده معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)')
  if (!(PROVINCES as readonly string[]).includes(province)) throw new ShippingError('استان را از فهرست انتخاب کنید')
  if (city.length < 2) throw new ShippingError('شهر را وارد کنید')
  if (address.length < 10) throw new ShippingError('نشانی دقیق پستی را وارد کنید (خیابان، کوچه، …)')
  if (!postalCode) throw new ShippingError('کد پستی ده‌رقمی معتبر نیست')
  if ((input.lat !== undefined && input.lat !== null && input.lat !== '') && !normalizeCoordinates(input.lat, input.lng)) throw new ShippingError('موقعیت انتخاب‌شده روی نقشه باید داخل ایران باشد')
  const pin = normalizeCoordinates(input.lat, input.lng)
  return {
    lat: pin?.lat ?? null, lng: pin?.lng ?? null,
    title: text(input.title, 30) || 'آدرس من', recipient, mobile, province, city, address, postalCode,
    plaque: text(toLatin(input.plaque), 10), unit: text(toLatin(input.unit), 10), isDefault: input.isDefault === true,
  }
}

/** One line for labels, invoices and the courier. */
export function formatAddress(a: { province: string; city: string; address: string; plaque?: string; unit?: string }): string {
  return [a.province === a.city ? a.province : `${a.province}، ${a.city}`, a.address, a.plaque ? `پلاک ${a.plaque}` : '', a.unit ? `واحد ${a.unit}` : ''].filter(Boolean).join('، ')
}

// ------------------------------------------------------------------ delivery schedule

export type DeliverySlot = { id: string; label: string; capacity: number }
export type DeliverySettings = {
  enabled: boolean
  /** Days between the order and the first possible delivery. */
  leadDays: number
  /** How many selectable days to offer. */
  daysAhead: number
  /** Orders after this Tehran hour ship one day later. */
  cutoffHour: number
  /** 0 = Sunday … 5 = Friday, 6 = Saturday (JavaScript weekday numbers). */
  closedWeekdays: number[]
  /** Extra closed dates, YYYY-MM-DD (Gregorian, Tehran calendar day). */
  holidays: string[]
  slots: DeliverySlot[]
  /** Shipping fee in IRR (0 = free); only charged on IRR/IRT priced products. */
  feeRial: number
  /** Orders at or above this amount (IRR) ship free; 0 = never. */
  freeOverRial: number
}

export const DEFAULT_DELIVERY: DeliverySettings = {
  enabled: true, leadDays: 1, daysAhead: 7, cutoffHour: 14, closedWeekdays: [5], holidays: [],
  slots: [{ id: '09-12', label: '۹ تا ۱۲', capacity: 30 }, { id: '12-15', label: '۱۲ تا ۱۵', capacity: 30 }, { id: '15-18', label: '۱۵ تا ۱۸', capacity: 30 }, { id: '18-21', label: '۱۸ تا ۲۱', capacity: 20 }],
  feeRial: 0, freeOverRial: 0,
}

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

export function normalizeDeliverySettings(input: Record<string, unknown> = {}, previous: DeliverySettings = DEFAULT_DELIVERY): DeliverySettings {
  const slots: DeliverySlot[] = []
  for (const raw of Array.isArray(input.slots) ? input.slots.slice(0, 12) : previous.slots) {
    const row = (raw || {}) as Record<string, unknown>
    const id = String(row.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)
    const label = text(row.label, 40)
    if (id && label && !slots.some((slot) => slot.id === id)) slots.push({ id, label, capacity: int(row.capacity, 0, 10_000, 30) })
  }
  const numbers = (value: unknown, fallback: number[]) => (Array.isArray(value) ? [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))] : fallback)
  const holidays = Array.isArray(input.holidays) ? [...new Set(input.holidays.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0, 200) : previous.holidays
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : previous.enabled,
    leadDays: input.leadDays === undefined ? previous.leadDays : int(input.leadDays, 0, 30, 1),
    daysAhead: input.daysAhead === undefined ? previous.daysAhead : int(input.daysAhead, 1, 30, 7),
    cutoffHour: input.cutoffHour === undefined ? previous.cutoffHour : int(input.cutoffHour, 0, 24, 14),
    closedWeekdays: numbers(input.closedWeekdays, previous.closedWeekdays),
    holidays,
    slots: slots.length ? slots : previous.slots,
    feeRial: input.feeRial === undefined ? previous.feeRial : int(input.feeRial, 0, 1_000_000_000, 0),
    freeOverRial: input.freeOverRial === undefined ? previous.freeOverRial : int(input.freeOverRial, 0, 100_000_000_000, 0),
  }
}

/** Tehran calendar date and hour for an instant. */
export function tehranParts(date: Date): { day: string; hour: number; weekday: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(date).map((p) => [p.type, p.value]))
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday }
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()

export type ScheduleDay = { date: string; weekday: number; slots: { id: string; label: string; available: boolean; remaining: number }[] }

/**
 * Selectable delivery days from `now`: skip lead time (one more day after the
 * cutoff hour), closed weekdays and holidays; each slot shows remaining
 * capacity given existing bookings ("YYYY-MM-DD|slot" → count).
 */
export function buildSchedule(settings: DeliverySettings, now: Date, booked: Map<string, number>): ScheduleDay[] {
  if (!settings.enabled || !settings.slots.length) return []
  const { day: today, hour } = tehranParts(now)
  let first = addDays(today, settings.leadDays + (hour >= settings.cutoffHour ? 1 : 0))
  const days: ScheduleDay[] = []
  for (let guard = 0; days.length < settings.daysAhead && guard < 90; guard++, first = addDays(first, 1)) {
    const weekday = weekdayOf(first)
    if (settings.closedWeekdays.includes(weekday) || settings.holidays.includes(first)) continue
    days.push({
      date: first, weekday,
      slots: settings.slots.map((slot) => {
        const remaining = Math.max(0, slot.capacity - (booked.get(`${first}|${slot.id}`) || 0))
        return { id: slot.id, label: slot.label, remaining, available: slot.capacity === 0 ? true : remaining > 0 }
      }),
    })
  }
  return days
}

/** Checks a requested (date, slot) against the schedule. */
export function assertSlot(schedule: ScheduleDay[], date: unknown, slotId: unknown): { date: string; slot: { id: string; label: string } } {
  const day = schedule.find((d) => d.date === date)
  const slot = day?.slots.find((s) => s.id === slotId)
  if (!day || !slot) throw new ShippingError('زمان ارسال انتخاب‌شده معتبر نیست؛ دوباره انتخاب کنید', 409, 'DELIVERY_SLOT_INVALID')
  if (!slot.available) throw new ShippingError('ظرفیت این بازهٔ زمانی تکمیل شده؛ زمان دیگری انتخاب کنید', 409, 'DELIVERY_SLOT_FULL')
  return { date: day.date, slot: { id: slot.id, label: slot.label } }
}

/** Shipping fee in the order currency's minor unit (IRR/IRT only; other currencies ship free). */
export function shippingFeeMinor(settings: DeliverySettings, currency: string, itemMinor: bigint): bigint {
  const toMinor = currency === 'IRR' ? 1n : currency === 'IRT' || currency === 'TMN' ? 10n : 0n
  if (!toMinor || settings.feeRial <= 0) return 0n
  const itemRial = itemMinor * toMinor
  if (settings.freeOverRial > 0 && itemRial >= BigInt(settings.freeOverRial)) return 0n
  return BigInt(settings.feeRial) / toMinor
}

/** Persian weekday name for a schedule day. */
export const WEEKDAY_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
