/**
 * Domains, sub-domains and SSL for the server panel. The app validates and
 * stores the wanted state; the root helper (deploy/ubuntu/mobocom-webctl)
 * validates again and writes nginx / runs certbot. Pure functions only.
 */

export type SiteMode = 'app' | 'static' | 'redirect' | 'proxy'
export type SiteDomain = {
  domain: string
  mode: SiteMode
  /** static: folder under /var/www · redirect: https URL · proxy: upstream URL · app: '' */
  target: string
  www: boolean
  https: boolean
  /** Certificate (certbot name) used when https is on. */
  cert: string
  note: string
}

export const MODE_LABEL: Record<SiteMode, string> = {
  app: 'همین سایت (MoboCom)',
  static: 'پوشهٔ فایل (هاست دانلود / سایت ثابت)',
  redirect: 'انتقال به نشانی دیگر',
  proxy: 'پراکسی به سرویس دیگر',
}

export class DomainError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Lower-case host name without scheme, path or trailing dot; '' when invalid. */
export function normalizeDomain(input: unknown): string {
  const value = String(input ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').replace(/\.$/, '')
  return DOMAIN.test(value) && value.length <= 253 ? value : ''
}

export const isWildcard = (value: string) => value.startsWith('*.')
export function normalizeCertDomain(input: unknown): string {
  const value = String(input ?? '').trim().toLowerCase()
  if (isWildcard(value)) { const base = normalizeDomain(value.slice(2)); return base ? `*.${base}` : '' }
  return normalizeDomain(value)
}

/** The registrable-looking parent: a.b.example.com → example.com (two labels; good enough for .ir, .com, .net…). */
export function apexOf(domain: string): string {
  const parts = domain.split('.')
  const twoPartTld = /^(co|ac|org|gov|id|sch|net)\.(ir|uk|jp)$/.test(parts.slice(-2).join('.'))
  return parts.slice(twoPartTld ? -3 : -2).join('.')
}

export const certNameFor = (domain: string) => apexOf(domain).replace(/[^a-z0-9.-]/g, '')

/** Whether a certificate's names cover a host (exact or one-level wildcard). */
export function certCovers(names: string[], host: string): boolean {
  return names.some((name) => name === host || (isWildcard(name) && host.endsWith(name.slice(1)) && !host.slice(0, -name.length + 1).includes('.')))
}

export function validateSite(input: Record<string, unknown>): SiteDomain {
  const domain = normalizeDomain(input.domain)
  if (!domain) throw new DomainError('نام دامنه معتبر نیست (مثل example.com یا dl.example.com)')
  const mode: SiteMode = ['app', 'static', 'redirect', 'proxy'].includes(String(input.mode)) ? input.mode as SiteMode : 'app'
  let target = String(input.target ?? '').trim()
  if (mode === 'app') target = ''
  if (mode === 'static') {
    target = target.startsWith('/var/www/') || target.startsWith('/') ? target : `/var/www/${target}`
    if (!/^\/var\/www\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(target) || target.includes('..')) throw new DomainError('پوشه باید زیر /var/www باشد (مثل /var/www/dl)')
  }
  if (mode === 'redirect' || mode === 'proxy') {
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/[A-Za-z0-9._~/%-]*)?$/.test(target)) throw new DomainError(mode === 'redirect' ? 'نشانی مقصد انتقال معتبر نیست (مثل https://example.com)' : 'نشانی سرویس معتبر نیست (مثل http://127.0.0.1:8080)')
    if (mode === 'redirect' && normalizeDomain(target) === domain) throw new DomainError('دامنه نمی‌تواند به خودش منتقل شود')
  }
  const https = input.https === true
  const cert = https ? String(input.cert || certNameFor(domain)).toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 100) : ''
  return { domain, mode, target, www: input.www === true && domain.split('.').length === 2, https, cert, note: String(input.note ?? '').replace(/[<>]/g, '').trim().slice(0, 200) }
}

/** Arguments for `mobocom-webctl site-apply`. */
export const siteApplyArgs = (site: SiteDomain) => ['site-apply', site.domain, site.mode, site.mode === 'app' ? '-' : site.target, site.www ? '1' : '0', site.https ? '1' : '0', site.https ? site.cert : '-']

/** Names a certificate for a site needs: the domain (and www), or apex + wildcard. */
export function certificateNames(domain: string, options: { wildcard: boolean; www: boolean }): string[] {
  if (options.wildcard) { const apex = apexOf(domain); return [apex, `*.${apex}`] }
  return options.www ? [domain, `www.${domain}`] : [domain]
}

// ------------------------------------------------------------------ certbot output

export type CertInfo = { name: string; domains: string[]; expiresAt: string | null; daysLeft: number | null; valid: boolean; path: string }

/** Parses `certbot certificates`. */
export function parseCertificates(output: string, now = new Date()): CertInfo[] {
  const blocks = output.split(/(?:^|\n)\s*Certificate Name:\s*/).slice(1)
  return blocks.map((block) => {
    const name = block.split('\n')[0].trim()
    const domains = (block.match(/Domains:\s*(.+)/)?.[1] || '').trim().split(/\s+/).filter(Boolean)
    const expiry = block.match(/Expiry Date:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})?)/)?.[1]?.replace(' ', 'T')
    const parsed = expiry ? new Date(/[Z]|[+-]\d\d:\d\d$/.test(expiry) ? expiry : `${expiry}Z`) : null
    const expiresAt = parsed && Number.isFinite(parsed.getTime()) ? parsed : null
    const daysLeft = expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000) : null
    return { name, domains, expiresAt: expiresAt ? expiresAt.toISOString() : null, daysLeft, valid: /VALID/.test(block) && !/INVALID/.test(block) && (daysLeft ?? -1) >= 0, path: block.match(/Certificate Path:\s*(\S+)/)?.[1] || '' }
  }).filter((cert) => cert.name)
}

// ------------------------------------------------------------------ site address

/** The public site address (NEXTAUTH_URL): scheme + host only. */
export function normalizeSiteUrl(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase().replace(/\/+$/, '')
  const match = /^(https?):\/\/([^/]+)$/.exec(raw)
  if (!match) return ''
  const host = normalizeDomain(match[2])
  return host ? `${match[1]}://${host}` : ''
}

// ------------------------------------------------------------------ Cloudflare DNS

export const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'] as const
export type DnsType = (typeof DNS_TYPES)[number]

export function validateDnsRecord(input: Record<string, unknown>, zone: string): { type: DnsType; name: string; content: string; proxied: boolean; ttl: number } {
  const type = String(input.type || 'A').toUpperCase() as DnsType
  if (!DNS_TYPES.includes(type)) throw new DomainError('نوع رکورد پشتیبانی نمی‌شود')
  let name = String(input.name ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!name || name === '@') name = zone
  else if (!name.endsWith(zone)) name = `${name}.${zone}`
  if (!normalizeDomain(name) && !/^(\*|_[a-z0-9-]+)\./.test(name)) throw new DomainError('نام رکورد معتبر نیست')
  const content = String(input.content ?? '').trim()
  if (type === 'A' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(content)) throw new DomainError('برای رکورد A یک IPv4 وارد کنید')
  if (type === 'AAAA' && !/^[0-9a-f:]+$/i.test(content)) throw new DomainError('برای رکورد AAAA یک IPv6 وارد کنید')
  if ((type === 'CNAME' || type === 'MX') && !normalizeDomain(content)) throw new DomainError('مقدار رکورد باید نام دامنه باشد')
  if (!content || content.length > 2000) throw new DomainError('مقدار رکورد معتبر نیست')
  const ttl = Math.round(Number(input.ttl)) || 1
  return { type, name, content, proxied: (type === 'A' || type === 'AAAA' || type === 'CNAME') && input.proxied === true, ttl: ttl === 1 ? 1 : Math.max(60, Math.min(86400, ttl)) }
}
