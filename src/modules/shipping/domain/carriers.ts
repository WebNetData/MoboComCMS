/**
 * Shipping carriers (Post, Tipax, Chapar, Alopeyk, the shop's own courier):
 * rate tables by zone and weight, which carriers serve an address, waybill
 * numbers, tracking links and the Code 128 barcode printed on the label.
 * Pure functions only.
 */

export type Zone = 'city' | 'province' | 'country'
export const ZONE_LABEL: Record<Zone, string> = { city: 'درون‌شهری', province: 'درون‌استانی', country: 'برون‌استانی' }

export type ZoneRate = { baseRial: number; perKgRial: number; etaMin: number; etaMax: number }

/** What the carrier is, for its label: post, express company, in-city courier, freight / bus terminal. */
export type CarrierKind = 'post' | 'express' | 'local' | 'freight'
export const KIND_LABEL: Record<CarrierKind, string> = { post: 'پست', express: 'پیک سراسری (اکسپرس)', local: 'پیک درون‌شهری', freight: 'باربری / ترمینال' }

/** How the fee is worked out: the zone and weight table, one fixed amount, or paid by the receiver on delivery. */
export type Pricing = 'zone' | 'flat' | 'collect'
export const PRICING_LABEL: Record<Pricing, string> = { zone: 'بر اساس مسیر و وزن', flat: 'مبلغ ثابت', collect: 'پس‌کرایه (گیرنده هنگام تحویل می‌پردازد)' }

/** Which places it serves beyond its routes: everywhere, only the listed ones, or all but the listed ones. */
export type PlaceMode = 'all' | 'only' | 'except'

/** A fee set by hand for one city or province; it replaces the computed fee there (a city beats its province). */
export type PlaceFee = { level: 'city' | 'province'; place: string; feeRial: number }

export type Carrier = {
  id: string
  name: string
  enabled: boolean
  kind: CarrierKind
  rates: Record<Zone, ZoneRate>
  /** Routes served: inside the store's city, other cities of its province, other provinces. */
  zones: Record<Zone, boolean>
  /** With placeMode 'only' / 'except': the cities and provinces listed. */
  placeMode: PlaceMode
  cities: string[]
  provinces: string[]
  pricing: Pricing
  /** Pricing 'flat': the fee anywhere it serves. */
  flatRial: number
  /** Added to every fee (packing, insurance, taking the parcel to the freight office); charged now also with 'collect'. */
  extraRial: number
  placeFees: PlaceFee[]
  /** Offered only for orders whose items are within this range; 0 = no limit. */
  minOrderRial: number
  maxOrderRial: number
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
export type FreeArea = 'city' | 'province' | 'country' | 'cities' | 'outside' | 'except'

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
  /** For area 'cities': the cities it covers; for 'except': the cities it leaves out. */
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
const ALL_ZONES: Record<Zone, boolean> = { city: true, province: true, country: true }
const CITY_ONLY: Record<Zone, boolean> = { city: true, province: false, country: false }
const OUT_OF_CITY: Record<Zone, boolean> = { city: false, province: true, country: true }
/** The parts every carrier has with no limits and no extras; a carrier below names only what differs. */
const plain = { zones: ALL_ZONES, placeMode: 'all' as PlaceMode, cities: [] as string[], provinces: [] as string[], pricing: 'zone' as Pricing, flatRial: 0, extraRial: 0, placeFees: [] as PlaceFee[], minOrderRial: 0, maxOrderRial: 0 }

export const DEFAULT_CARRIERS: Carrier[] = [
  { ...plain, id: 'post-pishtaz', name: 'پست پیشتاز', enabled: true, kind: 'post', rates: { city: rate(450_000, 100_000, 1, 2), province: rate(550_000, 130_000, 2, 3), country: rate(700_000, 180_000, 3, 5) }, cities: [], maxWeightGrams: 30_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://tracking.post.ir/?id={code}', note: 'تحویل به سراسر کشور با کد رهگیری پست' },
  { ...plain, id: 'post-sefareshi', name: 'پست سفارشی', enabled: false, kind: 'post', rates: { city: rate(320_000, 70_000, 2, 4), province: rate(380_000, 90_000, 3, 6), country: rate(480_000, 120_000, 5, 10) }, cities: [], maxWeightGrams: 30_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://tracking.post.ir/?id={code}', note: 'اقتصادی، زمان تحویل طولانی‌تر' },
  { ...plain, id: 'tipax', name: 'تیپاکس', enabled: true, kind: 'express', rates: { city: rate(800_000, 150_000, 1, 1), province: rate(1_100_000, 200_000, 1, 2), country: rate(1_500_000, 300_000, 2, 3) }, cities: [], maxWeightGrams: 70_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://tipax.ir/tracking?code={code}', note: 'ارسال سریع درب به درب' },
  { ...plain, id: 'chapar', name: 'چاپار', enabled: false, kind: 'express', rates: { city: rate(700_000, 140_000, 1, 1), province: rate(950_000, 180_000, 1, 2), country: rate(1_300_000, 260_000, 2, 4) }, cities: [], maxWeightGrams: 50_000, freeOverRial: 0, scheduled: false, trackingUrl: 'https://chaparnet.com/track/?tracking={code}', note: 'پست پیشتاز خصوصی' },
  { ...plain, zones: CITY_ONLY, placeMode: 'only', id: 'alopeyk', name: 'الوپیک', enabled: false, kind: 'local', rates: { city: rate(1_000_000, 0, 0, 0), province: rate(0, 0, 0, 0), country: rate(0, 0, 0, 0) }, cities: ['تهران', 'کرج', 'اصفهان', 'شیراز', 'مشهد', 'تبریز', 'قم', 'اهواز', 'رشت'], maxWeightGrams: 25_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: 'پیک موتوری همان روز، فقط درون‌شهری' },
  { ...plain, zones: CITY_ONLY, placeMode: 'all', id: 'courier', name: 'پیک فروشگاه', enabled: false, kind: 'local', rates: { city: rate(500_000, 0, 0, 1), province: rate(0, 0, 0, 0), country: rate(0, 0, 0, 0) }, cities: [], maxWeightGrams: 40_000, freeOverRial: 0, scheduled: true, trackingUrl: '', note: 'تحویل در روز و ساعت انتخابی شما' },
  { ...plain, id: 'mahex', name: 'ماهکس', enabled: false, kind: 'express', rates: { city: rate(750_000, 150_000, 1, 1), province: rate(1_000_000, 190_000, 1, 2), country: rate(1_400_000, 280_000, 2, 3) }, cities: [], maxWeightGrams: 70_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: 'تحویل درب به درب' },
  { ...plain, zones: OUT_OF_CITY, pricing: 'collect', id: 'freight', name: 'باربری', enabled: false, kind: 'freight', rates: { city: rate(0, 0, 0, 0), province: rate(0, 0, 1, 3), country: rate(0, 0, 2, 6) }, cities: [], maxWeightGrams: 1_000_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: 'کرایه هنگام تحویل از گیرنده گرفته می‌شود' },
  { ...plain, zones: OUT_OF_CITY, pricing: 'collect', id: 'terminal', name: 'ترمینال مسافربری', enabled: false, kind: 'freight', rates: { city: rate(0, 0, 0, 0), province: rate(0, 0, 1, 2), country: rate(0, 0, 1, 3) }, cities: [], maxWeightGrams: 100_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: 'تحویل در ترمینال مقصد؛ کرایه با گیرنده' },
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
    const kind: CarrierKind = item.kind === 'post' || item.kind === 'express' || item.kind === 'local' || item.kind === 'freight' ? item.kind : base.kind
    const cities = Array.isArray(item.cities) ? names(item.cities) : base.cities
    // Saved before routes and places existed: a local courier served its listed cities (or the store's) inside the city.
    const zonesRaw = item.zones && typeof item.zones === 'object' ? item.zones as Record<string, unknown> : null
    const zones = zonesRaw ? { city: zonesRaw.city === true, province: zonesRaw.province === true, country: zonesRaw.country === true } : kind === 'local' ? CITY_ONLY : base.zones
    const placeMode: PlaceMode = item.placeMode === 'only' || item.placeMode === 'except' || item.placeMode === 'all' ? item.placeMode : kind === 'local' && cities.length ? 'only' : 'all'
    carriers.push({
      id, name: text(item.name, 40) || base.name, enabled: item.enabled === true, kind,
      rates: { city: normalizeRate(rates.city, base.rates.city), province: normalizeRate(rates.province, base.rates.province), country: normalizeRate(rates.country, base.rates.country) },
      zones, placeMode, cities,
      provinces: Array.isArray(item.provinces) ? names(item.provinces) : base.provinces,
      pricing: item.pricing === 'flat' || item.pricing === 'collect' || item.pricing === 'zone' ? item.pricing : base.pricing,
      flatRial: int(item.flatRial ?? base.flatRial, 0, 10_000_000_000, 0),
      extraRial: int(item.extraRial ?? base.extraRial, 0, 10_000_000_000, 0),
      placeFees: normalizePlaceFees(item.placeFees),
      minOrderRial: int(item.minOrderRial ?? 0, 0, 100_000_000_000, 0),
      maxOrderRial: int(item.maxOrderRial ?? 0, 0, 100_000_000_000, 0),
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

function names(list: unknown[]) { return [...new Set(list.map((name) => text(name, 40)).filter(Boolean))].slice(0, 100) }

/** At most fifty hand-set fees, one per place. */
export function normalizePlaceFees(input: unknown): PlaceFee[] {
  const fees: PlaceFee[] = []
  for (const row of Array.isArray(input) ? input.slice(0, 50) : []) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const place = text(item.place, 40), level = item.level === 'province' ? 'province' : 'city'
    if (!place || fees.some((fee) => fee.level === level && placeKey(fee.place) === placeKey(place))) continue
    fees.push({ level, place, feeRial: int(item.feeRial, 0, 10_000_000_000, 0) })
  }
  return fees
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
    const area: FreeArea = item.area === 'province' || item.area === 'country' || item.area === 'cities' || item.area === 'outside' || item.area === 'except' ? item.area : 'city'
    rules.push({
      id, enabled: item.enabled !== false, label: text(item.label, 80), minRial, area,
      cities: (area === 'cities' || area === 'except') && Array.isArray(item.cities) ? names(item.cities) : [],
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
  if (rule.area === 'outside') return `خارج از ${origin.city}`
  if (rule.area === 'except') return rule.cities.length ? `در همه‌جا به‌جز ${rule.cities.join('، ')}` : 'در سراسر کشور'
  return 'در سراسر کشور'
}

const ruleOpen = (rule: FreeShippingRule, now: Date) => rule.enabled && (!rule.startsAt || new Date(rule.startsAt) <= now) && (!rule.endsAt || now <= new Date(rule.endsAt))

/** Does the rule's area hold the address? */
function ruleCovers(rule: FreeShippingRule, origin: { province: string; city: string }, dest: { province: string; city: string }) {
  if (rule.area === 'country') return true
  if (rule.area === 'cities') return rule.cities.some((city) => placeKey(city) === placeKey(dest.city))
  if (rule.area === 'except') return !rule.cities.some((city) => placeKey(city) === placeKey(dest.city))
  if (rule.area === 'outside') return zoneOf(origin, dest) !== 'city'
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
  | { ok: true; carrierId: string; name: string; kind: Carrier['kind']; zone: Zone; feeRial: number; etaMin: number; etaMax: number; scheduled: boolean; free: boolean; note: string; freeBy?: string; collect?: boolean }
  | { ok: false; carrierId: string; name: string; reason: string }

export function quote(carrier: Carrier, input: { origin: { province: string; city: string }; dest: { province: string; city: string }; weightGrams: number; itemRial: number; rules?: FreeShippingRule[]; now?: Date }): Quote {
  const fail = (reason: string): Quote => ({ ok: false, carrierId: carrier.id, name: carrier.name, reason })
  if (!carrier.enabled) return fail('غیرفعال')
  if (input.weightGrams > carrier.maxWeightGrams) return fail(`حداکثر وزن ${(carrier.maxWeightGrams / 1000).toLocaleString('fa-IR')} کیلوگرم`)
  const zone = zoneOf(input.origin, input.dest)
  if (!carrier.zones[zone]) return fail(zone === 'city' ? 'داخل شهر ارسال ندارد' : zone === 'province' ? 'فقط داخل شهر ارسال دارد' : 'به استان‌های دیگر ارسال ندارد')
  if (!placeAllowed(carrier, input.dest)) return fail('به این مقصد ارسال ندارد')
  if (carrier.minOrderRial > 0 && input.itemRial < carrier.minOrderRial) return fail(`برای سفارش‌های از ${tomanLabel(carrier.minOrderRial)} تومان`)
  if (carrier.maxOrderRial > 0 && input.itemRial > carrier.maxOrderRial) return fail(`برای سفارش‌های تا ${tomanLabel(carrier.maxOrderRial)} تومان`)
  const r = carrier.rates[zone]
  const collect = carrier.pricing === 'collect'
  // The receiver pays a collect carrier's freight, so free shipping does not apply to it; its extra fee is still charged.
  const rule = !collect && input.rules?.length ? freeRuleFor(input.rules, { carrierId: carrier.id, origin: input.origin, dest: input.dest, itemRial: input.itemRial, now: input.now ?? new Date() }) : null
  const free = !collect && (!!rule || (carrier.freeOverRial > 0 && input.itemRial >= carrier.freeOverRial))
  const feeRial = free ? 0 : carrierFee(carrier, zone, input.dest, input.weightGrams) + carrier.extraRial
  return { ok: true, carrierId: carrier.id, name: carrier.name, kind: carrier.kind, zone, feeRial, etaMin: r.etaMin, etaMax: Math.max(r.etaMin, r.etaMax), scheduled: carrier.scheduled, free, note: carrier.note, ...(rule ? { freeBy: rule.label || `ارسال رایگان ${freeAreaLabel(rule, input.origin)}` } : {}), ...(collect ? { collect: true } : {}) }
}

const tomanLabel = (rial: number) => Math.round(rial / 10).toLocaleString('fa-IR')
const inList = (list: string[], name: string) => list.some((item) => placeKey(item) === placeKey(name))

/** The carrier's listed places: 'only' needs the address in them (nothing listed = no limit), 'except' keeps it out. */
export function placeAllowed(carrier: Pick<Carrier, 'placeMode' | 'cities' | 'provinces'>, dest: { province: string; city: string }) {
  if (carrier.placeMode === 'all' || (!carrier.cities.length && !carrier.provinces.length)) return true
  const listed = inList(carrier.cities, dest.city) || inList(carrier.provinces, dest.province)
  return carrier.placeMode === 'only' ? listed : !listed
}

/** The carrier's own fee before extras: a hand-set fee for the city or province, else by its pricing. */
export function carrierFee(carrier: Carrier, zone: Zone, dest: { province: string; city: string }, weightGrams: number) {
  if (carrier.pricing === 'collect') return 0
  const set = carrier.placeFees.find((fee) => fee.level === 'city' && placeKey(fee.place) === placeKey(dest.city)) || carrier.placeFees.find((fee) => fee.level === 'province' && placeKey(fee.place) === placeKey(dest.province))
  if (set) return set.feeRial
  if (carrier.pricing === 'flat') return carrier.flatRial
  const r = carrier.rates[zone]
  return r.baseRial + (chargeableKg(weightGrams) - 1) * r.perKgRial
}

/** Ready carriers to add: the defaults plus a blank one; the owner edits names, prices and places after. */
export const CARRIER_PRESETS: { key: string; label: string }[] = [
  ...DEFAULT_CARRIERS.map((carrier) => ({ key: carrier.id, label: carrier.name })),
  { key: 'blank', label: 'روش دلخواه (خالی)' },
]

export function presetCarrier(key: string, taken: string[]): Carrier {
  const base = DEFAULT_CARRIERS.find((carrier) => carrier.id === key)
  const stem = base ? base.id : 'custom'
  let id = stem, n = 2
  while (taken.includes(id)) id = `${stem}-${n++}`.slice(0, 30)
  if (base) return { ...structuredClone(base), id, enabled: false }
  const blank = rate(0, 0, 1, 3)
  return { ...plain, id, name: 'روش ارسال جدید', enabled: false, kind: 'express', rates: { city: { ...blank }, province: { ...blank }, country: { ...blank } }, maxWeightGrams: 30_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: '' }
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
