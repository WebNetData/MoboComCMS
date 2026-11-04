// Domains: what a customer types, which extension it falls under, the IRNIC handle, name servers and the yearly
// lifecycle. Pure rules shared by the public search, checkout, staff and the scheduler.
import { HostingError } from '@/modules/hosting/domain/catalog'
import { addMonths } from '@/modules/hosting/domain/services'

export const DOMAIN_STATUS = {
  PENDING: { label: 'در حال ثبت', tone: 'is-warn' },
  ACTIVE: { label: 'فعال', tone: 'is-ok' },
  EXPIRED: { label: 'منقضی', tone: 'is-bad' },
  CANCELLED: { label: 'لغوشده', tone: '' },
} as const
export type DomainStatus = keyof typeof DOMAIN_STATUS

export type Availability = 'available' | 'taken' | 'unknown'

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const SUFFIX = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/

/** "https://www.Shop.ir/x" → "shop.ir"; "Shop" → "shop". Already ASCII (the server converts other scripts). */
export function cleanDomainInput(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '').replace(/\s+/g, '')
}

export function normalizeSuffix(value: unknown): string {
  const suffix = String(value ?? '').trim().toLowerCase().replace(/^\./, '')
  if (!SUFFIX.test(suffix) || suffix.length > 63) throw new HostingError('پسوند دامنه معتبر نیست؛ مثلاً ir یا co.ir یا com')
  return suffix
}

/** The longest extension on sale that the name ends with: shop.co.ir is under co.ir, not ir. */
export function matchSuffix(name: string, suffixes: readonly string[]): string | null {
  return [...suffixes].sort((a, b) => b.length - a.length).find((suffix) => name.endsWith(`.${suffix}`) && name.length > suffix.length + 1) || null
}

/** IRNIC asks for at least three characters; other registries allow one or two. */
export function validLabel(label: string, suffix: string): boolean {
  const min = suffix === 'ir' || suffix.endsWith('.ir') ? 3 : 1
  return LABEL.test(label) && label.length >= min && !/^..--/.test(label.replace(/^xn--/, 'ok'))
}

/** "1,2,3,5" → [1, 2, 3, 5]: whole years 1–10. */
export function parseYears(value: unknown): number[] {
  const years = String(value ?? '').split(/[,،\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
  return [...new Set(years)].sort((a, b) => a - b)
}

/** An IRNIC NIC handle, e.g. ab1234-irnic. */
export function normalizeHandle(value: unknown): string {
  const handle = String(value ?? '').trim().toLowerCase()
  if (!/^[a-z]{2}\d{2,6}-irnic$/.test(handle)) throw new HostingError('شناسهٔ ایرنیک معتبر نیست؛ مثلاً ab1234-irnic')
  return handle
}

/** Two to six distinct name servers, each a host name with at least one dot. */
export function normalizeNameservers(value: unknown): string[] {
  const list = (Array.isArray(value) ? value : String(value ?? '').split(/[\s,،]+/)).map((item) => String(item).trim().toLowerCase().replace(/\.$/, '')).filter(Boolean)
  const unique = [...new Set(list)]
  if (unique.length < 2 || unique.length > 6) throw new HostingError('بین ۲ تا ۶ نیم‌سرور وارد کنید')
  for (const host of unique) if (host.length > 253 || host.split('.').length < 2 || !host.split('.').every((label) => LABEL.test(label))) throw new HostingError(`نیم‌سرور «${host}» معتبر نیست`)
  return unique
}

/** The new expiry after paying for `years`: from the current expiry, never from the payment day. */
export const renewedExpiry = (expiresAt: Date, years: number) => addMonths(expiresAt, years * 12)

const DAY = 86_400_000
export type DomainSettings = { reminderDays: number[]; autoRenew: boolean; autoRenewDays: number }

export function domainSettings(raw: Record<string, unknown>): DomainSettings {
  const days = String(raw['domain-reminder-days'] ?? '30,7,1').split(/[,،\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 120)
  return { reminderDays: days.length ? [...new Set(days)].sort((a, b) => b - a) : [30, 7, 1], autoRenew: raw['auto-renew'] !== false, autoRenewDays: 3 }
}

export type DomainStep = { kind: 'remind'; days: number } | { kind: 'renew' } | { kind: 'expire' } | null

/** Reminders before the expiry, a wallet renewal from three days before, and EXPIRED once the date has passed. */
export function domainStep(domain: { status: string; expiresAt: Date | null; autoRenew: boolean }, now: Date, settings: DomainSettings): DomainStep {
  if (!domain.expiresAt || !['ACTIVE', 'EXPIRED'].includes(domain.status)) return null
  const left = domain.expiresAt.getTime() - now.getTime()
  if (domain.status === 'ACTIVE' && left <= 0) return { kind: 'expire' }
  if (domain.autoRenew && settings.autoRenew && left <= settings.autoRenewDays * DAY && left > -30 * DAY) return { kind: 'renew' }
  if (domain.status === 'ACTIVE') {
    const days = Math.ceil(left / DAY)
    if (settings.reminderDays.includes(days)) return { kind: 'remind', days }
  }
  return null
}
