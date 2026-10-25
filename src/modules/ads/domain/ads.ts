/**
 * Advertising — pure rules: what a campaign may contain, when it may be shown
 * to a visitor, which one wins a placement, and how results are summarised.
 * The endpoints are called "promo" (not "ad") so that blockers leave the
 * site's own sponsors alone less often; labels on the page still say "تبلیغ".
 */

export class AdsError extends Error {
  constructor(message: string, readonly status = 400, readonly meta: Record<string, unknown> = {}) { super(message) }
}

export const CAMPAIGN_STATUS = ['DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number]
export const STATUS_LABEL: Record<CampaignStatus, string> = { DRAFT: 'پیش‌نویس', PENDING: 'منتظر بررسی', ACTIVE: 'فعال', PAUSED: 'متوقف', ENDED: 'پایان‌یافته', REJECTED: 'ردشده' }
export const AUDIENCES = ['ALL', 'GUEST', 'MEMBER', 'NON_VIP'] as const
export type Audience = (typeof AUDIENCES)[number]
export const AUDIENCE_LABEL: Record<Audience, string> = { ALL: 'همه', GUEST: 'فقط مهمان‌ها (بدون ورود)', MEMBER: 'فقط کاربران واردشده', NON_VIP: 'همه به‌جز اعضای VIP' }
export const DEVICES = ['ALL', 'DESKTOP', 'MOBILE'] as const
export type Device = (typeof DEVICES)[number]
export const DEVICE_LABEL: Record<Device, string> = { ALL: 'همهٔ دستگاه‌ها', DESKTOP: 'رایانه', MOBILE: 'موبایل' }
export const CREATIVE_KINDS = ['IMAGE', 'TEXT', 'HTML'] as const
export type CreativeKind = (typeof CREATIVE_KINDS)[number]
export const KIND_LABEL: Record<CreativeKind, string> = { IMAGE: 'بنر تصویری', TEXT: 'تبلیغ متنی', HTML: 'کد HTML (فقط مدیر)' }

export interface PlacementDef { key: string; name: string; description: string; width: number; height: number; device: Device; kind: 'BANNER' | 'STICKY'; sortOrder: number }

/** Placements every site starts with; more can be added for custom themes. */
export const BUILTIN_PLACEMENTS: PlacementDef[] = [
  { key: 'header-banner', name: 'زیر هدر سایت', description: 'زیر منوی اصلی، در همهٔ صفحه‌ها', width: 728, height: 90, device: 'ALL', kind: 'BANNER', sortOrder: 1 },
  { key: 'home-top', name: 'بالای صفحهٔ اصلی', description: 'ابتدای محتوای صفحهٔ اصلی', width: 728, height: 90, device: 'ALL', kind: 'BANNER', sortOrder: 2 },
  { key: 'home-middle', name: 'میانهٔ صفحهٔ اصلی', description: 'پایین محتوای صفحهٔ اصلی', width: 728, height: 90, device: 'ALL', kind: 'BANNER', sortOrder: 3 },
  { key: 'content-top', name: 'بالای مطلب', description: 'بالای صفحهٔ مقاله، نرم‌افزار، بازی، فیلم و محصول', width: 728, height: 90, device: 'ALL', kind: 'BANNER', sortOrder: 4 },
  { key: 'content-bottom', name: 'پایین مطلب', description: 'پایین صفحهٔ مقاله، نرم‌افزار، بازی، فیلم و محصول', width: 728, height: 90, device: 'ALL', kind: 'BANNER', sortOrder: 5 },
  { key: 'sidebar', name: 'ستون کناری', description: 'ستون کناری قالب‌هایی که آن را دارند', width: 300, height: 250, device: 'DESKTOP', kind: 'BANNER', sortOrder: 6 },
  { key: 'footer-banner', name: 'بالای فوتر', description: 'بالای پایین‌صفحه، در همهٔ صفحه‌ها', width: 728, height: 90, device: 'ALL', kind: 'BANNER', sortOrder: 7 },
  { key: 'sticky-bottom', name: 'چسبیده به پایین (موبایل)', description: 'نوار ثابت پایین صفحه در موبایل، با دکمهٔ بستن', width: 320, height: 50, device: 'MOBILE', kind: 'STICKY', sortOrder: 8 },
]

// ------------------------------------------------------------------ validation

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(String(value ?? '').replace(/[,٬\s]/g, '')))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** http(s) address (or a path of this site) with no way to smuggle a script. */
export function safeUrl(value: unknown, options: { allowPath?: boolean } = {}): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.length > 2000 || /[\s<>"'\\\u0000-\u001f]/.test(raw)) throw new AdsError('نشانی معتبر نیست')
  if (options.allowPath && /^\/(?!\/)/.test(raw)) return raw
  let url: URL
  try { url = new URL(raw) } catch { throw new AdsError('نشانی معتبر نیست') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AdsError('فقط نشانی http یا https مجاز است')
  return url.toString()
}

const pathPrefixes = (input: unknown): string[] => {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,،\n]+/) : []
  return [...new Set(list.map((item) => String(item).trim()).filter((item) => /^\/[A-Za-z0-9/_%.\-~]{0,150}$/.test(item)))].slice(0, 40)
}
const words = (input: unknown, pattern: RegExp, limit: number): string[] => {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,،]+/) : []
  return [...new Set(list.map((item) => String(item).trim()).filter((item) => pattern.test(item)))].slice(0, limit)
}

/** "9-23" or "22-6" (overnight) → [from, to]; '' = all day. */
export function parseHours(value: unknown): [number, number] | null {
  const match = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(String(value ?? ''))
  if (!match) return null
  const from = Number(match[1]), to = Number(match[2])
  return from <= 24 && to <= 24 && from !== to ? [from, to] : null
}

export interface CampaignData {
  name: string; priority: number; startsAt: Date | null; endsAt: Date | null; placements: string[]; devices: Device; audience: Audience
  includePaths: string[]; excludePaths: string[]; languages: string[]; hours: string
  maxImpressions: number; maxClicks: number; dailyImpressions: number; dailyClicks: number; note: string
}

const date = (value: unknown): Date | null => {
  if (value === '' || value == null) return null
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) throw new AdsError('تاریخ معتبر نیست')
  return d
}

/** Admin campaign form → clean data. `known` is the list of existing placement keys. */
export function normalizeCampaign(input: Record<string, unknown>, known: string[]): CampaignData {
  const name = text(input.name, 120)
  if (!name) throw new AdsError('نام کمپین را وارد کنید')
  const placements = words(input.placements, /^[a-z0-9][a-z0-9-]{1,40}$/, 30).filter((key) => known.includes(key))
  if (!placements.length) throw new AdsError('حداقل یک جایگاه انتخاب کنید')
  const startsAt = date(input.startsAt), endsAt = date(input.endsAt)
  if (startsAt && endsAt && endsAt <= startsAt) throw new AdsError('پایان باید بعد از شروع باشد')
  const hours = String(input.hours ?? '').trim()
  if (hours && !parseHours(hours)) throw new AdsError('ساعت‌ها را مثل ۹-۲۳ بنویسید')
  return {
    name, priority: int(input.priority, 1, 10, 5), startsAt, endsAt, placements,
    devices: DEVICES.includes(input.devices as Device) ? input.devices as Device : 'ALL',
    audience: AUDIENCES.includes(input.audience as Audience) ? input.audience as Audience : 'ALL',
    includePaths: pathPrefixes(input.includePaths), excludePaths: pathPrefixes(input.excludePaths), languages: words(input.languages, /^[a-z]{2}(-[A-Za-z]{2})?$/, 10), hours,
    maxImpressions: int(input.maxImpressions, 0, 2_000_000_000, 0), maxClicks: int(input.maxClicks, 0, 2_000_000_000, 0),
    dailyImpressions: int(input.dailyImpressions, 0, 2_000_000_000, 0), dailyClicks: int(input.dailyClicks, 0, 2_000_000_000, 0), note: text(input.note, 500),
  }
}

export interface CreativeData { kind: CreativeKind; title: string; imageUrl: string; imageMobileUrl: string; alt: string; linkUrl: string; html: string; text: string; cta: string; weight: number; active: boolean }

/** Creative form → clean data. Advertisers can send images and text; HTML is for administrators. */
export function normalizeCreative(input: Record<string, unknown>, options: { admin: boolean }): CreativeData {
  const kind = CREATIVE_KINDS.includes(input.kind as CreativeKind) ? input.kind as CreativeKind : 'IMAGE'
  if (kind === 'HTML' && !options.admin) throw new AdsError('کد HTML فقط توسط مدیر ثبت می‌شود')
  const out: CreativeData = {
    kind, title: text(input.title, 120), imageUrl: '', imageMobileUrl: '', alt: text(input.alt, 160), linkUrl: '', html: '', text: text(input.text, 200), cta: text(input.cta, 40),
    weight: int(input.weight, 1, 100, 1), active: input.active !== false,
  }
  if (kind !== 'HTML') out.linkUrl = safeUrl(input.linkUrl)
  else out.linkUrl = safeUrl(input.linkUrl)
  if (kind === 'IMAGE') {
    out.imageUrl = safeUrl(input.imageUrl, { allowPath: true })
    out.imageMobileUrl = safeUrl(input.imageMobileUrl, { allowPath: true })
    if (!out.imageUrl) throw new AdsError('تصویر بنر را بارگذاری کنید')
    if (!out.linkUrl) throw new AdsError('نشانی مقصد بنر را وارد کنید')
    if (!out.alt) out.alt = out.title
  }
  if (kind === 'TEXT') {
    if (!out.title) throw new AdsError('عنوان تبلیغ متنی را وارد کنید')
    if (!out.linkUrl) throw new AdsError('نشانی مقصد را وارد کنید')
  }
  if (kind === 'HTML') {
    out.html = String(input.html ?? '').slice(0, 20_000)
    if (!out.html.trim()) throw new AdsError('کد HTML را وارد کنید')
  }
  return out
}

export function normalizePlacement(input: Record<string, unknown>) {
  const key = String(input.key ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(key)) throw new AdsError('کلید جایگاه فقط حروف انگلیسی کوچک، عدد و خط تیره باشد')
  const name = text(input.name, 80)
  if (!name) throw new AdsError('نام جایگاه را وارد کنید')
  return {
    key, name, description: text(input.description, 240), width: int(input.width, 0, 2000, 0), height: int(input.height, 0, 2000, 0),
    device: DEVICES.includes(input.device as Device) ? input.device as Device : 'ALL', kind: input.kind === 'STICKY' ? 'STICKY' as const : 'BANNER' as const,
    active: input.active !== false, fallbackHtml: String(input.fallbackHtml ?? '').slice(0, 10_000), sortOrder: int(input.sortOrder, 0, 1000, 0),
  }
}

export function normalizePackage(input: Record<string, unknown>, known: string[]) {
  const name = text(input.name, 80)
  if (!name) throw new AdsError('نام بسته را وارد کنید')
  const placements = words(input.placements, /^[a-z0-9][a-z0-9-]{1,40}$/, 30).filter((key) => known.includes(key))
  if (!placements.length) throw new AdsError('حداقل یک جایگاه برای بسته انتخاب کنید')
  const price = Number(String(input.price ?? '').replace(/[,٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
  if (!Number.isFinite(price) || price <= 0 || price > 1e12) throw new AdsError('قیمت معتبر نیست')
  return {
    name, description: text(input.description, 300), placements, days: int(input.days, 1, 730, 30), impressions: int(input.impressions, 0, 2_000_000_000, 0), clicks: int(input.clicks, 0, 2_000_000_000, 0),
    priceMinor: BigInt(Math.round(price)), currency: 'IRT', active: input.active !== false, sortOrder: int(input.sortOrder, 0, 1000, 0),
  }
}

// ------------------------------------------------------------------ device & bots

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|go-http/i
export const isBot = (userAgent: string) => !userAgent || BOT.test(userAgent)
export const deviceOf = (userAgent: string): Exclude<Device, 'ALL'> => (/Mobi|Android|iPhone|iPad/i.test(userAgent) ? 'MOBILE' : 'DESKTOP')

// ------------------------------------------------------------------ eligibility & choice

export interface CampaignView {
  id: number; status: string; priority: number; startsAt: Date | null; endsAt: Date | null; placements: string[]; devices: string; audience: string
  includePaths: string[]; excludePaths: string[]; languages: string[]; hours: string
  maxImpressions: number; maxClicks: number; dailyImpressions: number; dailyClicks: number; impressions: number; clicks: number
}
export interface ServeContext { placement: string; device: Exclude<Device, 'ALL'>; path: string; language: string; signedIn: boolean; vip: boolean; now: Date; hour: number; todayImpressions: number; todayClicks: number }

const under = (path: string, prefix: string) => (prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))

/** Why a campaign may not be shown here ('' = it may). */
export function ineligible(campaign: CampaignView, ctx: ServeContext): string {
  if (campaign.status !== 'ACTIVE') return 'status'
  if (campaign.startsAt && campaign.startsAt > ctx.now) return 'not-started'
  if (campaign.endsAt && campaign.endsAt <= ctx.now) return 'ended'
  if (!campaign.placements.includes(ctx.placement)) return 'placement'
  if (campaign.devices !== 'ALL' && campaign.devices !== ctx.device) return 'device'
  if (campaign.audience === 'GUEST' && ctx.signedIn) return 'audience'
  if (campaign.audience === 'MEMBER' && !ctx.signedIn) return 'audience'
  if (campaign.audience === 'NON_VIP' && ctx.vip) return 'audience'
  if (campaign.languages.length && !campaign.languages.includes(ctx.language)) return 'language'
  if (campaign.includePaths.length && !campaign.includePaths.some((prefix) => under(ctx.path, prefix))) return 'path'
  if (campaign.excludePaths.some((prefix) => under(ctx.path, prefix))) return 'path'
  const hours = parseHours(campaign.hours)
  if (hours) {
    const [from, to] = hours
    const inside = from < to ? ctx.hour >= from && ctx.hour < to : ctx.hour >= from || ctx.hour < to
    if (!inside) return 'hours'
  }
  if (campaign.maxImpressions && campaign.impressions >= campaign.maxImpressions) return 'cap'
  if (campaign.maxClicks && campaign.clicks >= campaign.maxClicks) return 'cap'
  if (campaign.dailyImpressions && ctx.todayImpressions >= campaign.dailyImpressions) return 'daily-cap'
  if (campaign.dailyClicks && ctx.todayClicks >= campaign.dailyClicks) return 'daily-cap'
  return ''
}

/** The highest priority wins; within it, campaigns share the placement evenly. `random` is [0,1). */
export function pickCampaign<T extends { id: number; priority: number }>(candidates: T[], random: number): T | null {
  if (!candidates.length) return null
  const top = Math.max(...candidates.map((item) => item.priority))
  const tier = candidates.filter((item) => item.priority === top).sort((a, b) => a.id - b.id)
  return tier[Math.min(tier.length - 1, Math.floor(random * tier.length))]
}

/** Creatives of a campaign are rotated by weight (A/B testing). */
export function pickCreative<T extends { weight: number }>(creatives: T[], random: number): T | null {
  if (!creatives.length) return null
  const total = creatives.reduce((sum, item) => sum + Math.max(1, item.weight), 0)
  let point = random * total
  for (const item of creatives) {
    point -= Math.max(1, item.weight)
    if (point < 0) return item
  }
  return creatives[creatives.length - 1]
}

// ------------------------------------------------------------------ results

export const ctr = (impressions: number, clicks: number) => (impressions > 0 ? Math.round((clicks / impressions) * 10_000) / 100 : 0)

export interface DayRow { day: string; impressions: number; clicks: number }

/** Fills days without data so charts have a continuous axis; `days` counts back from `end` (inclusive). */
export function fillDays(rows: DayRow[], end: string, days: number): DayRow[] {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const out: DayRow[] = []
  const last = new Date(`${end}T00:00:00Z`)
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(last.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    out.push(byDay.get(day) || { day, impressions: 0, clicks: 0 })
  }
  return out
}

export const dayOf = (date: Date) => date.toISOString().slice(0, 10)

/** A sold package → the campaign that starts once its creative is approved. */
export function campaignFromPackage(pkg: { name: string; placements: string[]; days: number; impressions: number; clicks: number }, advertiserName: string, now = new Date()) {
  return {
    name: `${advertiserName} — ${pkg.name}`.slice(0, 120), placements: pkg.placements, days: pkg.days, maxImpressions: pkg.impressions, maxClicks: pkg.clicks, startsAt: now,
    endsAt: new Date(now.getTime() + pkg.days * 86_400_000),
  }
}

/** When a campaign should be marked ended: its period is over or a total cap is reached. */
export function shouldEnd(campaign: Pick<CampaignView, 'endsAt' | 'maxImpressions' | 'maxClicks' | 'impressions' | 'clicks'>, now: Date): boolean {
  if (campaign.endsAt && campaign.endsAt <= now) return true
  if (campaign.maxImpressions && campaign.impressions >= campaign.maxImpressions) return true
  return !!campaign.maxClicks && campaign.clicks >= campaign.maxClicks
}

/** The page a visitor is on, cleaned for targeting ("/blog/x?utm=1#top" → "/blog/x"). */
export function cleanPath(value: unknown): string {
  const path = String(value ?? '/').split(/[?#]/)[0].slice(0, 200)
  return /^\/[A-Za-z0-9/_%.\-~]*$/.test(path) ? (path.length > 1 ? path.replace(/\/+$/, '') : path) : '/'
}

/** The placements one page asks for together (`ps=a,b,c`): valid keys only, each once, at most 16; null when the list is unusable. */
export const MAX_PLACEMENTS_PER_REQUEST = 16
export function parsePlacementList(value: string | null): string[] | null {
  if (!value) return null
  const keys = [...new Set(value.split(',').map((key) => key.trim()).filter(Boolean))]
  if (!keys.length || keys.length > MAX_PLACEMENTS_PER_REQUEST || !keys.every((key) => /^[a-z0-9][a-z0-9-]{1,40}$/.test(key))) return null
  return keys
}
