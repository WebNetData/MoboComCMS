/**
 * Shipping carriers (Post, Tipax, Chapar, Alopeyk, the shop's own courier):
 * rate tables by zone and weight, which carriers serve an address, waybill
 * numbers, tracking links and the Code 128 barcode printed on the label.
 * Pure functions only.
 */

export type Zone = 'city' | 'province' | 'country'
export const ZONE_LABEL: Record<Zone, string> = { city: 'درون‌شهری', province: 'درون‌استانی', country: 'برون‌استانی' }

export type ZoneRate = { baseRial: number; perKgRial: number; etaMin: number; etaMax: number }

export type Carrier = {
  id: string
  name: string
  enabled: boolean
  /** post / express couriers ship anywhere; local couriers only inside listed cities. */
  kind: 'post' | 'express' | 'local'
  rates: Record<Zone, ZoneRate>
  /** Local couriers: cities served (same city as the store only). Empty = the store's city. */
  cities: string[]
  maxWeightGrams: number
  /** Orders whose items reach this amount (Rial) ship free with this carrier; 0 = never. */
  freeOverRial: number
  /** Uses the store's delivery day / time-window schedule. */
  scheduled: boolean
  /** Public tracking page; {code} is replaced by the tracking number. */
  trackingUrl: string
  note: string
}

/** Where a free-shipping rule applies: the store's own city, its province, the whole country, or listed cities. */
export type FreeArea = 'city' | 'province' | 'country' | 'cities'

/**
 * Free shipping by order size and place ("orders over 5,000,000 Toman ship free inside our city"): every enabled rule
 * whose window is open, whose area holds the address and whose carriers include the chosen one makes that carrier's
 * fee zero once the items reach its minimum. Amounts are Rial.
 */
export type FreeShippingRule = {
  id: string
  enabled: boolean
  label: string
  minRial: number
  area: FreeArea
  /** For area 'cities': the cities it covers. */
  cities: string[]
  /** Carriers it applies to; empty = every carrier. */
  carrierIds: string[]
  /** Optional window (ISO dates); empty = always. */
  startsAt: string
  endsAt: string
}

export type CarrierSettings = {
  enabled: boolean
  originProvince: string
  originCity: string
  /** Box and filler added to every parcel. */
  packagingGrams: number
  /** Weight used for products without one. */
  defaultWeightGrams: number
  carriers: Carrier[]
  freeRules: FreeShippingRule[]
}

const rate = (baseRial: number, perKgRial: number, etaMin: number, etaMax: number): ZoneRate => ({ baseRial, perKgRial, etaMin, etaMax })

export const DEFAULT_CARRIERS: Carrier[] = [
  { id: 'post-pishtaz', name: 'پست پیشتاز', enabled: true, kind: 'post', rates: { city: rate(450_000, 100_000, 1, 2), province: rate(550_000, 130_000, 2, 3), country: rate(700_000, 180_000, 3, 5) }, cities: [], maxWeightGrams: 30_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://tracking.post.ir/?id={code}', note: 'تحویل به سراسر کشور با کد رهگیری پست' },
  { id: 'post-sefareshi', name: 'پست سفارشی', enabled: false, kind: 'post', rates: { city: rate(320_000, 70_000, 2, 4), province: rate(380_000, 90_000, 3, 6), country: rate(480_000, 120_000, 5, 10) }, cities: [], maxWeightGrams: 30_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://tracking.post.ir/?id={code}', note: 'اقتصادی، زمان تحویل طولانی‌تر' },
  { id: 'tipax', name: 'تیپاکس', enabled: true, kind: 'express', rates: { city: rate(800_000, 150_000, 1, 1), province: rate(1_100_000, 200_000, 1, 2), country: rate(1_500_000, 300_000, 2, 3) }, cities: [], maxWeightGrams: 70_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://tipax.ir/tracking?code={code}', note: 'ارسال سریع درب به درب' },
  { id: 'chapar', name: 'چاپار', enabled: false, kind: 'express', rates: { city: rate(700_000, 140_000, 1, 1), province: rate(950_000, 180_000, 1, 2), country: rate(1_300_000, 260_000, 2, 4) }, cities: [], maxWeightGrams: 50_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://chaparnet.com/track/?tracking={code}', note: 'پست پیشتاز خصوصی' },
  { id: 'alopeyk', name: 'الوپیک', enabled: false, kind: 'local', rates: { city: rate(1_000_000, 0, 0, 0), province: rate(0, 0, 0, 0), country: rate(0, 0, 0, 0) }, cities: ['تهران', 'کرج', 'اصفهان', 'شیراز', 'مشهد', 'تبریز', 'قم', 'اهواز', 'رشت'], maxWeightGrams: 25_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: 'پیک موتوری همان روز، فقط درون‌شهری' },
  { id: 'courier', name: 'پیک فروشگاه', enabled: false, kind: 'local', rates: { city: rate(500_000, 0, 0, 1), province: rate(0, 0, 0, 0), country: rate(0, 0, 0, 0) }, cities: [], maxWeightGrams: 40_000, freeOverRial: 0, scheduled: true, trackingUrl: '', note: 'تحویل در روز و ساعت انتخابی شما' },
]

export const DEFAULT_CARRIER_SETTINGS: CarrierSettings = { enabled: false, originProvince: 'تهران', originCity: 'تهران', packagingGrams: 200, defaultWeightGrams: 500, freeRules: [], carriers: DEFAULT_CARRIERS }

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** ي/ك, ZWNJ and spaces do not make two city names different. */
export const placeKey = (value: string) => String(value || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s]+/g, '').replace(/^(شهر|استان)/, '').trim()

function normalizeRate(input: unknown, fallback: ZoneRate): ZoneRate {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return {
    baseRial: int(raw.baseRial ?? fallback.baseRial, 0, 10_000_000_000, fallback.baseRial),
    perKgRial: int(raw.perKgRial ?? fallback.perKgRial, 0, 1_000_000_000, fallback.perKgRial),
    etaMin: int(raw.etaMin ?? fallback.etaMin, 0, 60, fallback.etaMin),
    etaMax: int(raw.etaMax ?? fallback.etaMax, 0, 60, fallback.etaMax),
  }
}

function safeTrackingUrl(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try { const url = new URL(raw.replace('{code}', 'X')); return url.protocol === 'https:' && raw.includes('{code}') ? raw.slice(0, 300) : '' } catch { return '' }
}

export function normalizeCarrierSettings(input: unknown): CarrierSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const list = Array.isArray(raw.carriers) ? raw.carriers : DEFAULT_CARRIERS
  const carriers: Carrier[] = []
  for (const row of list.slice(0, 20)) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const id = String(item.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)
    if (!id || carriers.some((carrier) => carrier.id === id)) continue
    const base = DEFAULT_CARRIERS.find((carrier) => carrier.id === id) || DEFAULT_CARRIERS[0]
    const rates = (item.rates && typeof item.rates === 'object' ? item.rates : {}) as Record<string, unknown>
    const kind = item.kind === 'post' || item.kind === 'express' || item.kind === 'local' ? item.kind : base.kind
    carriers.push({
      id, name: text(item.name, 40) || base.name, enabled: item.enabled === true, kind,
      rates: { city: normalizeRate(rates.city, base.rates.city), province: normalizeRate(rates.province, base.rates.province), country: normalizeRate(rates.country, base.rates.country) },
      cities: Array.isArray(item.cities) ? [...new Set(item.cities.map((city) => text(city, 40)).filter(Boolean))].slice(0, 100) : base.cities,
      maxWeightGrams: int(item.maxWeightGrams ?? base.maxWeightGrams, 100, 1_000_000, base.maxWeightGrams),
      freeOverRial: int(item.freeOverRial ?? 0, 0, 100_000_000_000, 0),
      scheduled: typeof item.scheduled === 'boolean' ? item.scheduled : base.scheduled,
      trackingUrl: item.trackingUrl === undefined ? base.trackingUrl : safeTrackingUrl(item.trackingUrl),
      note: item.note === undefined ? base.note : text(item.note, 120),
    })
  }
  return {
    enabled: raw.enabled === true,
    originProvince: text(raw.originProvince, 40) || DEFAULT_CARRIER_SETTINGS.originProvince,
    originCity: text(raw.originCity, 40) || DEFAULT_CARRIER_SETTINGS.originCity,
    packagingGrams: int(raw.packagingGrams ?? DEFAULT_CARRIER_SETTINGS.packagingGrams, 0, 20_000, DEFAULT_CARRIER_SETTINGS.packagingGrams),
    defaultWeightGrams: int(raw.defaultWeightGrams ?? DEFAULT_CARRIER_SETTINGS.defaultWeightGrams, 1, 100_000, DEFAULT_CARRIER_SETTINGS.defaultWeightGrams),
    carriers,
    freeRules: normalizeFreeRules(raw.freeRules),
  }
}

const isoDate = (value: unknown) => { const date = new Date(String(value ?? '')); return String(value ?? '').trim() && Number.isFinite(date.getTime()) ? date.toISOString() : '' }

/** At most twenty rules, each with a positive minimum; malformed parts fall back to safe values. */
export function normalizeFreeRules(input: unknown): FreeShippingRule[] {
  const rules: FreeShippingRule[] = []
  for (const row of Array.isArray(input) ? input.slice(0, 20) : []) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const minRial = int(item.minRial, 0, 100_000_000_000, 0)
    if (minRial <= 0) continue
    const id = String(item.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || `rule-${rules.length + 1}`
    if (rules.some((rule) => rule.id === id)) continue
    const area: FreeArea = item.area === 'province' || item.area === 'country' || item.area === 'cities' ? item.area : 'city'
    rules.push({
      id, enabled: item.enabled !== false, label: text(item.label, 80), minRial, area,
      cities: area === 'cities' && Array.isArray(item.cities) ? [...new Set(item.cities.map((city) => text(city, 40)).filter(Boolean))].slice(0, 100) : [],
      carrierIds: Array.isArray(item.carrierIds) ? [...new Set(item.carrierIds.map((carrierId) => String(carrierId).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)).filter(Boolean))] : [],
      startsAt: isoDate(item.startsAt), endsAt: isoDate(item.endsAt),
    })
  }
  return rules
}

/** Where a rule applies, in words ("در قائم‌شهر"). */
export function freeAreaLabel(rule: Pick<FreeShippingRule, 'area' | 'cities'>, origin: { province: string; city: string }): string {
  if (rule.area === 'city') return `در ${origin.city}`
  if (rule.area === 'province') return `در استان ${origin.province}`
  if (rule.area === 'cities') return rule.cities.length ? `در ${rule.cities.join('، ')}` : 'در شهرهای انتخابی'
  return 'در سراسر کشور'
}

const ruleOpen = (rule: FreeShippingRule, now: Date) => rule.enabled && (!rule.startsAt || new Date(rule.startsAt) <= now) && (!rule.endsAt || now <= new Date(rule.endsAt))

/** Does the rule's area hold the address? */
function ruleCovers(rule: FreeShippingRule, origin: { province: string; city: string }, dest: { province: string; city: string }) {
  if (rule.area === 'country') return true
  if (rule.area === 'cities') return rule.cities.some((city) => placeKey(city) === placeKey(dest.city))
  if (placeKey(origin.province) !== placeKey(dest.province)) return false
  return rule.area === 'province' || placeKey(origin.city) === placeKey(dest.city)
}

/** The rule that makes a carrier free for this address and amount, if any (the lowest minimum that is met). */
export function freeRuleFor(rules: FreeShippingRule[], input: { carrierId: string; origin: { province: string; city: string }; dest: { province: string; city: string }; itemRial: number; now: Date }): FreeShippingRule | null {
  return rules
    .filter((rule) => ruleOpen(rule, input.now) && input.itemRial >= rule.minRial && (!rule.carrierIds.length || rule.carrierIds.includes(input.carrierId)) && ruleCovers(rule, input.origin, input.dest))
    .sort((a, b) => a.minRial - b.minRial)[0] ?? null
}

/** The open rules a shopper can be told about, lowest minimum first, each with its place in words. */
export function freeShippingOffers(settings: Pick<CarrierSettings, 'enabled' | 'freeRules' | 'originProvince' | 'originCity'>, now: Date) {
  if (!settings.enabled) return []
  const origin = { province: settings.originProvince, city: settings.originCity }
  return settings.freeRules.filter((rule) => ruleOpen(rule, now)).sort((a, b) => a.minRial - b.minRial)
    .map((rule) => ({ id: rule.id, label: rule.label, minRial: rule.minRial, place: freeAreaLabel(rule, origin), endsAt: rule.endsAt }))
}

// ------------------------------------------------------------------ quotes

export function zoneOf(origin: { province: string; city: string }, dest: { province: string; city: string }): Zone {
  if (placeKey(origin.province) === placeKey(dest.province)) return placeKey(origin.city) === placeKey(dest.city) ? 'city' : 'province'
  return 'country'
}

/** Parcel weight: items (each item's weight or the default) plus packaging. */
export function parcelWeight(items: { weightGrams: number; quantity: number }[], settings: Pick<CarrierSettings, 'packagingGrams' | 'defaultWeightGrams'>): number {
  const goods = items.reduce((sum, item) => sum + (item.weightGrams > 0 ? item.weightGrams : settings.defaultWeightGrams) * Math.max(1, item.quantity), 0)
  return goods + settings.packagingGrams
}

/** Carriers bill whole kilograms; the first kilogram is in the base price. */
export const chargeableKg = (grams: number) => Math.max(1, Math.ceil(grams / 1000))

export type Quote =
  | { ok: true; carrierId: string; name: string; kind: Carrier['kind']; zone: Zone; feeRial: number; etaMin: number; etaMax: number; scheduled: boolean; free: boolean; note: string; freeBy?: string }
  | { ok: false; carrierId: string; name: string; reason: string }

export function quote(carrier: Carrier, input: { origin: { province: string; city: string }; dest: { province: string; city: string }; weightGrams: number; itemRial: number; rules?: FreeShippingRule[]; now?: Date }): Quote {
  const fail = (reason: string): Quote => ({ ok: false, carrierId: carrier.id, name: carrier.name, reason })
  if (!carrier.enabled) return fail('غیرفعال')
  if (input.weightGrams > carrier.maxWeightGrams) return fail(`حداکثر وزن ${(carrier.maxWeightGrams / 1000).toLocaleString('fa-IR')} کیلوگرم`)
  const zone = zoneOf(input.origin, input.dest)
  if (carrier.kind === 'local') {
    if (zone !== 'city') return fail('فقط درون‌شهری')
    const cities = carrier.cities.length ? carrier.cities : [input.origin.city]
    if (!cities.some((city) => placeKey(city) === placeKey(input.dest.city))) return fail('در این شهر فعال نیست')
  }
  const r = carrier.rates[zone]
  if (r.baseRial <= 0 && carrier.kind === 'local' && zone !== 'city') return fail('این مسیر را پوشش نمی‌دهد')
  const rule = input.rules?.length ? freeRuleFor(input.rules, { carrierId: carrier.id, origin: input.origin, dest: input.dest, itemRial: input.itemRial, now: input.now ?? new Date() }) : null
  const free = !!rule || (carrier.freeOverRial > 0 && input.itemRial >= carrier.freeOverRial)
  const feeRial = free ? 0 : r.baseRial + (chargeableKg(input.weightGrams) - 1) * r.perKgRial
  return { ok: true, carrierId: carrier.id, name: carrier.name, kind: carrier.kind, zone, feeRial, etaMin: r.etaMin, etaMax: Math.max(r.etaMin, r.etaMax), scheduled: carrier.scheduled, free, note: carrier.note, ...(rule ? { freeBy: rule.label || `ارسال رایگان ${freeAreaLabel(rule, input.origin)}` } : {}) }
}

/** Every enabled carrier for an address: available ones first, cheapest first. */
export function quotes(settings: CarrierSettings, input: { dest: { province: string; city: string }; weightGrams: number; itemRial: number; now?: Date }): Quote[] {
  const origin = { province: settings.originProvince, city: settings.originCity }
  const list = settings.carriers.filter((carrier) => carrier.enabled).map((carrier) => quote(carrier, { ...input, origin, rules: settings.freeRules }))
  return list.sort((a, b) => (a.ok === b.ok ? (a.ok && b.ok ? a.feeRial - b.feeRial : 0) : a.ok ? -1 : 1))
}

/** Rial → the order currency's minor unit (IRR 1:1, Toman ÷10, rounded up). */
export function rialToMinor(rial: number, currency: string): bigint | null {
  const code = currency.toUpperCase()
  if (code === 'IRR') return BigInt(rial)
  if (code === 'IRT' || code === 'TMN') return (BigInt(rial) + 9n) / 10n
  return null
}

export const etaLabel = (min: number, max: number) =>
  max <= 0 ? 'همان روز' : min === max ? `${min.toLocaleString('fa-IR')} روز کاری` : `${min.toLocaleString('fa-IR')} تا ${max.toLocaleString('fa-IR')} روز کاری`

// ------------------------------------------------------------------ waybills & tracking

export const SHIPMENT_STATUSES = ['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED'] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]
export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  READY: 'بارنامه صادر شد؛ آمادهٔ تحویل به مرسوله‌رسان', PICKED_UP: 'تحویل مرسوله‌رسان شد', IN_TRANSIT: 'در مسیر', OUT_FOR_DELIVERY: 'در حال توزیع',
  DELIVERED: 'تحویل گیرنده شد', RETURNED: 'برگشت به فرستنده', CANCELLED: 'باطل شد',
}
const FLOW: Record<ShipmentStatus, ShipmentStatus[]> = {
  READY: ['PICKED_UP', 'CANCELLED'], PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'], IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'], DELIVERED: ['RETURNED'], RETURNED: [], CANCELLED: [],
}
export const isShipmentStatus = (value: unknown): value is ShipmentStatus => (SHIPMENT_STATUSES as readonly string[]).includes(String(value))
export const nextShipmentStatuses = (from: string): ShipmentStatus[] => (isShipmentStatus(from) ? FLOW[from] : [])

/** Our own waybill number: MC + yymmdd + 6 digits of the shipment id + a check digit. */
export function waybillNumber(id: number, date: Date): string {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: '2-digit', month: '2-digit', day: '2-digit' }).format(date).split('/').reverse().join('')
  const body = `${day}${String(id % 1_000_000).padStart(6, '0')}`
  const check = body.split('').reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10
  return `MC${body}${check}`
}
export const validWaybill = (code: string) => {
  const match = /^MC(\d{12})(\d)$/.exec(code)
  if (!match) return false
  return match[1].split('').reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === Number(match[2])
}

export function trackingLink(template: string, code: string): string {
  if (!template || !code) return ''
  return template.replace('{code}', encodeURIComponent(code))
}

export const cleanTrackingCode = (value: unknown) => String(value ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)

// ------------------------------------------------------------------ Code 128 (set B)

const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

/** Bar/space widths (in modules) for printable ASCII text in Code 128-B, quiet zones excluded. */
export function code128(value: string): number[] {
  const chars = [...value].filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126)
  const codes = [104, ...chars.map((char) => char.charCodeAt(0) - 32)]
  const check = codes.reduce((sum, code, index) => sum + code * (index === 0 ? 1 : index), 0) % 103
  return [...codes, check, 106].flatMap((code) => CODE128[code].split('').map(Number))
}
