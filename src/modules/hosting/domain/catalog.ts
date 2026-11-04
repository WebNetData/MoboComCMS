// Hosting catalogue: what can be sold, how it is billed and which outside systems deliver it.
// Pure rules shared by the Admin, the public pages and the server. Spec: docs/specs/hosting-cloud/SPEC.md.

export class HostingError extends Error {}

/** Where a product is shown publicly: web hosting at /hosting, servers and cloud at /servers. */
export type HostingGroup = 'hosting' | 'servers'

export const HOSTING_KINDS = [
  { id: 'SHARED', label: 'هاست اشتراکی', group: 'hosting', family: 'WEB_PANEL', hourly: false },
  { id: 'RESELLER', label: 'نمایندگی هاست', group: 'hosting', family: 'WEB_PANEL', hourly: false },
  { id: 'CLOUD_HOSTING', label: 'هاست ابری', group: 'hosting', family: 'WEB_PANEL', hourly: true },
  { id: 'VPS', label: 'سرور مجازی', group: 'servers', family: 'COMPUTE', hourly: false },
  { id: 'CLOUD_SERVER', label: 'سرور ابری', group: 'servers', family: 'COMPUTE', hourly: true },
  { id: 'DEDICATED', label: 'سرور اختصاصی', group: 'servers', family: 'COMPUTE', hourly: false },
] as const
export type HostingKind = (typeof HOSTING_KINDS)[number]['id']

export const PROVIDER_FAMILIES = [
  { id: 'WEB_PANEL', label: 'کنترل‌پنل هاست' },
  { id: 'COMPUTE', label: 'سرور و مجازی‌ساز' },
  { id: 'REGISTRAR', label: 'ثبت دامنه' },
] as const
export type ProviderFamily = (typeof PROVIDER_FAMILIES)[number]['id']

/** How the site reaches a system: its HTTP API, a direct connection to the owner's own virtualizer, or SSH. */
export type DriverConnection = 'api' | 'direct' | 'ssh'

export type DriverMeta = {
  id: string
  family: ProviderFamily
  label: string
  connection: DriverConnection
  /** The address is fixed by the provider (e.g. a public cloud API) and not asked for. */
  fixedUrl?: string
  needsUsername: boolean
  secretLabel: string
  urlHint?: string
}

export const HOSTING_DRIVERS: readonly DriverMeta[] = [
  { id: 'CPANEL', family: 'WEB_PANEL', label: 'cPanel / WHM', connection: 'api', needsUsername: true, secretLabel: 'API Token', urlHint: 'https://server.example.com:2087' },
  { id: 'DIRECTADMIN', family: 'WEB_PANEL', label: 'DirectAdmin', connection: 'api', needsUsername: true, secretLabel: 'Login Key', urlHint: 'https://server.example.com:2222' },
  { id: 'HESTIACP', family: 'WEB_PANEL', label: 'HestiaCP', connection: 'api', needsUsername: false, secretLabel: 'Access key:Secret key', urlHint: 'https://server.example.com:8083' },
  { id: 'ISPCONFIG', family: 'WEB_PANEL', label: 'ISPConfig', connection: 'api', needsUsername: true, secretLabel: 'رمز کاربر Remote', urlHint: 'https://server.example.com:8080' },
  { id: 'VIRTUALMIN', family: 'WEB_PANEL', label: 'Virtualmin GPL', connection: 'api', needsUsername: true, secretLabel: 'رمز کاربر Remote', urlHint: 'https://server.example.com:10000' },
  { id: 'CLOUDPANEL', family: 'WEB_PANEL', label: 'CloudPanel', connection: 'ssh', needsUsername: true, secretLabel: 'کلید خصوصی SSH', urlHint: 'ssh://server.example.com:22' },
  { id: 'HETZNER_CLOUD', family: 'COMPUTE', label: 'Hetzner Cloud', connection: 'api', fixedUrl: 'https://api.hetzner.cloud/v1', needsUsername: false, secretLabel: 'API Token (Read & Write)' },
  { id: 'PROXMOX', family: 'COMPUTE', label: 'Proxmox VE', connection: 'direct', needsUsername: true, secretLabel: 'API Token secret', urlHint: 'https://pve.example.com:8006' },
  { id: 'XEN_ORCHESTRA', family: 'COMPUTE', label: 'XCP-ng + Xen Orchestra', connection: 'direct', needsUsername: false, secretLabel: 'Authentication token', urlHint: 'https://xo.example.com' },
  { id: 'OPENNEBULA', family: 'COMPUTE', label: 'OpenNebula', connection: 'direct', needsUsername: true, secretLabel: 'رمز یا توکن', urlHint: 'https://one.example.com:2633/RPC2' },
  { id: 'CLOUDSTACK', family: 'COMPUTE', label: 'Apache CloudStack', connection: 'direct', needsUsername: true, secretLabel: 'Secret key (نام کاربری: API key)', urlHint: 'https://cloud.example.com/client/api' },
  { id: 'VIRTUALIZOR', family: 'COMPUTE', label: 'Virtualizor', connection: 'direct', needsUsername: true, secretLabel: 'API Pass (نام کاربری: API Key)', urlHint: 'https://panel.example.com:4085' },
  { id: 'VMWARE', family: 'COMPUTE', label: 'VMware vCenter', connection: 'direct', needsUsername: true, secretLabel: 'رمز', urlHint: 'https://vcenter.example.com' },
  { id: 'SOLUSVM', family: 'COMPUTE', label: 'SolusVM', connection: 'direct', needsUsername: false, secretLabel: 'API Token', urlHint: 'https://solus.example.com' },
  { id: 'OPENSTACK', family: 'COMPUTE', label: 'OpenStack', connection: 'direct', needsUsername: true, secretLabel: 'رمز (پروژه در تنظیمات)', urlHint: 'https://keystone.example.com:5000/v3' },
  { id: 'IRNIC', family: 'REGISTRAR', label: 'ایرنیک (IRNIC EPP)', connection: 'api', needsUsername: true, secretLabel: 'رمز EPP', urlHint: 'epp.nic.ir' },
]

export const HOSTING_CYCLES = [
  { id: 'HOURLY', label: 'ساعتی', short: 'ساعت', months: 0 },
  { id: 'MONTH', label: 'ماهانه', short: 'ماه', months: 1 },
  { id: 'QUARTER', label: 'سه‌ماهه', short: '۳ ماه', months: 3 },
  { id: 'HALF', label: 'شش‌ماهه', short: '۶ ماه', months: 6 },
  { id: 'YEAR', label: 'سالانه', short: 'سال', months: 12 },
] as const
export type HostingCycle = (typeof HOSTING_CYCLES)[number]['id']

/** Hours billed for a month of hourly use (365 × 24 / 12, the figure cloud providers quote). */
export const HOURS_PER_MONTH = 730

export const FULFILLMENT = [
  { id: 'MANUAL', label: 'تحویل دستی', hint: 'IP، نام کاربری و رمز را کارشناس تحویل می‌دهد؛ مشتری کنترل مستقیم ندارد.' },
  { id: 'DRIVER', label: 'خودکار از سامانهٔ متصل', hint: 'پس از پرداخت روی سامانهٔ انتخاب‌شده ساخته می‌شود و مشتری از پنل خودش مدیریت می‌کند.' },
] as const
export type Fulfillment = (typeof FULFILLMENT)[number]['id']

export const kindMeta = (kind: string) => HOSTING_KINDS.find((item) => item.id === kind)
export const driverMeta = (driver: string) => HOSTING_DRIVERS.find((item) => item.id === driver)
export const cycleMeta = (cycle: string) => HOSTING_CYCLES.find((item) => item.id === cycle)
export const kindsOf = (group: HostingGroup) => HOSTING_KINDS.filter((item) => item.group === group).map((item) => item.id)

/** Cycles a kind may be priced in: hourly only for cloud kinds, every fixed term for all. */
export function cyclesFor(kind: string): HostingCycle[] {
  return HOSTING_CYCLES.filter((cycle) => cycle.id !== 'HOURLY' || kindMeta(kind)?.hourly).map((cycle) => cycle.id)
}

export type PriceLine = { cycle: string; amountMinor: bigint; setupMinor: bigint; currency: string }

/** The price of one month in this cycle, for comparing terms. Hourly is 730 hours. */
export function monthlyEquivalent(price: Pick<PriceLine, 'cycle' | 'amountMinor'>): bigint {
  if (price.cycle === 'HOURLY') return price.amountMinor * BigInt(HOURS_PER_MONTH)
  const months = cycleMeta(price.cycle)?.months || 1
  return price.amountMinor / BigInt(months)
}

/**
 * How much cheaper a month is in `cycle` than paying month by month, as a whole percent (0 when there is no
 * monthly price to compare with, or the term is not cheaper).
 */
export function savingPercent(prices: readonly Pick<PriceLine, 'cycle' | 'amountMinor' | 'currency'>[], cycle: string, currency: string): number {
  const monthly = prices.find((price) => price.cycle === 'MONTH' && price.currency === currency)
  const term = prices.find((price) => price.cycle === cycle && price.currency === currency)
  if (!monthly || !term || cycle === 'MONTH' || cycle === 'HOURLY' || monthly.amountMinor <= 0n) return 0
  const months = BigInt(cycleMeta(cycle)?.months || 1)
  const full = monthly.amountMinor * months
  if (term.amountMinor >= full) return 0
  return Number(((full - term.amountMinor) * 100n) / full)
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const int = (value: unknown, max: number) => {
  const number = Math.trunc(Number(value) || 0)
  if (number < 0 || number > max) throw new HostingError('عدد واردشده خارج از محدوده است')
  return number
}
const minor = (value: unknown): bigint => {
  const text = String(value ?? '0').trim() || '0'
  if (!/^\d{1,15}$/.test(text)) throw new HostingError('مبلغ باید عددی صحیح و نامنفی باشد')
  return BigInt(text)
}
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

export type ProductInput = {
  id?: number
  slug: string
  name: string
  tagline: string
  description: string
  kind: HostingKind
  fulfillment: Fulfillment
  providerId: number | null
  providerPlan: string
  cpuCores: number
  ramMb: number
  diskGb: number
  diskType: string
  trafficGb: number
  bandwidthMbps: number
  sites: number
  mailboxes: number
  databases: number
  ipv4: number
  location: string
  features: string[]
  allowTraffic: boolean
  trafficPackGb: number
  trafficPackMinor: bigint
  allowUpgrade: boolean
  stoppedHourlyMinor: bigint
  active: boolean
  featured: boolean
  sort: number
  prices: PriceLine[]
}

/** Checks and normalises a product from the Admin form. Throws HostingError with a message for the form. */
export function normalizeProduct(raw: Record<string, unknown>, currency = 'IRT'): ProductInput {
  const kind = String(raw.kind || '')
  if (!kindMeta(kind)) throw new HostingError('نوع محصول را انتخاب کنید')
  const name = text(raw.name, 120)
  if (!name) throw new HostingError('نام محصول لازم است')
  const slug = text(raw.slug, 80).toLowerCase()
  if (!SLUG.test(slug)) throw new HostingError('نامک فقط حروف کوچک لاتین، عدد و خط تیره است')
  const fulfillment = raw.fulfillment === 'DRIVER' ? 'DRIVER' : 'MANUAL'
  const providerId = Number(raw.providerId) > 0 ? Math.trunc(Number(raw.providerId)) : null
  if (fulfillment === 'DRIVER' && !providerId) throw new HostingError('برای تحویل خودکار، سامانهٔ متصل را انتخاب کنید')
  const allowed = new Set(cyclesFor(kind))
  const seen = new Set<string>()
  const prices: PriceLine[] = []
  for (const line of Array.isArray(raw.prices) ? raw.prices as Record<string, unknown>[] : []) {
    const cycle = String(line?.cycle || '')
    if (!allowed.has(cycle as HostingCycle)) throw new HostingError(`دورهٔ «${cycleMeta(cycle)?.label || cycle}» برای این نوع محصول نیست`)
    if (seen.has(cycle)) throw new HostingError('هر دوره فقط یک قیمت دارد')
    seen.add(cycle)
    const amountMinor = minor(line.amountMinor)
    if (amountMinor <= 0n) continue
    prices.push({ cycle, amountMinor, setupMinor: minor(line.setupMinor), currency })
  }
  const active = raw.active !== false
  if (active && !prices.length) throw new HostingError('محصول فعال دست‌کم یک قیمت می‌خواهد')
  const allowTraffic = raw.allowTraffic === true
  const trafficPackGb = int(raw.trafficPackGb, 1_000_000)
  const trafficPackMinor = minor(raw.trafficPackMinor)
  if (allowTraffic && (!trafficPackGb || trafficPackMinor <= 0n)) throw new HostingError('برای فروش ترافیک اضافه، حجم و قیمت بسته را وارد کنید')
  return {
    id: Number(raw.id) > 0 ? Math.trunc(Number(raw.id)) : undefined,
    slug, name, kind: kind as HostingKind, fulfillment, providerId,
    tagline: text(raw.tagline, 160),
    description: text(raw.description, 4000),
    providerPlan: text(raw.providerPlan, 120),
    cpuCores: int(raw.cpuCores, 1024),
    ramMb: int(raw.ramMb, 16_777_216),
    diskGb: int(raw.diskGb, 1_000_000),
    diskType: text(raw.diskType, 20) || 'NVMe',
    trafficGb: int(raw.trafficGb, 100_000_000),
    bandwidthMbps: int(raw.bandwidthMbps, 1_000_000),
    sites: int(raw.sites, 100_000),
    mailboxes: int(raw.mailboxes, 1_000_000),
    databases: int(raw.databases, 100_000),
    ipv4: int(raw.ipv4, 1024),
    location: text(raw.location, 80),
    features: (Array.isArray(raw.features) ? raw.features : String(raw.features || '').split('\n')).map((item) => text(item, 120)).filter(Boolean).slice(0, 12),
    allowTraffic, trafficPackGb, trafficPackMinor,
    allowUpgrade: raw.allowUpgrade === true,
    stoppedHourlyMinor: kindMeta(kind)?.hourly ? minor(raw.stoppedHourlyMinor) : 0n,
    active,
    featured: raw.featured === true,
    sort: int(raw.sort, 100_000),
    prices,
  }
}

export type ProviderInput = {
  id?: number
  name: string
  family: ProviderFamily
  driver: string
  url: string
  username: string
  /** Empty on an edit keeps the stored secret. */
  secret: string
  location: string
  capacity: number
  active: boolean
}

/** Checks a connected system from the Admin form. The address must be https (or ssh for CloudPanel). */
export function normalizeProvider(raw: Record<string, unknown>): ProviderInput {
  const meta = driverMeta(String(raw.driver || ''))
  if (!meta) throw new HostingError('نوع سامانه را انتخاب کنید')
  const name = text(raw.name, 80)
  if (!name) throw new HostingError('نام سامانه لازم است')
  let url = meta.fixedUrl || text(raw.url, 300)
  if (!meta.fixedUrl) {
    if (meta.id === 'IRNIC') url = url.replace(/^https?:\/\//, '')
    else {
      let parsed: URL
      try { parsed = new URL(url) } catch { throw new HostingError('نشانی سامانه معتبر نیست') }
      const scheme = meta.connection === 'ssh' ? 'ssh:' : 'https:'
      if (parsed.protocol !== scheme) throw new HostingError(meta.connection === 'ssh' ? 'نشانی باید با ssh:// شروع شود' : 'نشانی باید https باشد')
      if (parsed.username || parsed.password) throw new HostingError('نام کاربری و رمز را در نشانی ننویسید')
      url = parsed.toString().replace(/\/+$/, '')
    }
    if (!url) throw new HostingError('نشانی سامانه لازم است')
  }
  const username = text(raw.username, 200)
  if (meta.needsUsername && !username) throw new HostingError('نام کاربری سامانه لازم است')
  return {
    id: Number(raw.id) > 0 ? Math.trunc(Number(raw.id)) : undefined,
    name, family: meta.family, driver: meta.id, url, username,
    secret: String(raw.secret ?? '').trim().slice(0, 8000),
    location: text(raw.location, 80),
    capacity: int(raw.capacity, 1_000_000),
    active: raw.active !== false,
  }
}

// ============ Public catalogue shape ============

export type PublicHostingPrice = { cycle: string; amount: number; setup: number; monthly: number; saving: number }
export type PublicHostingProduct = {
  id: number; slug: string; name: string; tagline: string; description: string; kind: string; kindLabel: string
  cpuCores: number; ramMb: number; diskGb: number; diskType: string; trafficGb: number; bandwidthMbps: number
  sites: number; mailboxes: number; databases: number; ipv4: number; location: string; features: string[]
  featured: boolean; hourly: boolean; currency: string; prices: PublicHostingPrice[]
}
