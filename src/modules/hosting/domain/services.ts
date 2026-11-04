// A bought hosting service: its states, its term and what the customer tells us when buying. Pure rules.
import { HostingError, cycleMeta, kindMeta } from '@/modules/hosting/domain/catalog'

export const SERVICE_STATUS = {
  PENDING: { label: 'در انتظار تحویل', tone: 'is-warn' },
  PROVISIONING: { label: 'در حال ساخت', tone: 'is-info' },
  ACTIVE: { label: 'فعال', tone: 'is-ok' },
  SUSPENDED: { label: 'معلق', tone: 'is-bad' },
  TERMINATED: { label: 'حذف‌شده', tone: '' },
  FAILED: { label: 'ساخت ناموفق', tone: 'is-bad' },
} as const
export type ServiceStatus = keyof typeof SERVICE_STATUS

/** Which status a staff action may start from, and where it leads. */
export const STAFF_TRANSITIONS: Record<'SUSPEND' | 'UNSUSPEND' | 'TERMINATE', { from: ServiceStatus[]; to: ServiceStatus }> = {
  SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED' },
  UNSUSPEND: { from: ['SUSPENDED'], to: 'ACTIVE' },
  TERMINATE: { from: ['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED'], to: 'TERMINATED' },
}

/**
 * The same day `months` later, held to the month's last day (31 January + 1 month is 28/29 February), in UTC.
 * A term is counted from the moment the service starts, not from payment.
 */
export function addMonths(start: Date, months: number): Date {
  const date = new Date(start.getTime())
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return date
}

export function termEnd(start: Date, cycle: string): Date | null {
  const months = cycleMeta(cycle)?.months || 0
  return months ? addMonths(start, months) : null
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
/** A domain like example.ir or shop.example.co.uk: lowercase ASCII (punycode for other scripts), at least two labels. */
export function normalizeDomain(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.$/, '')
  const labels = text.split('.')
  if (text.length > 253 || labels.length < 2 || !labels.every((label) => LABEL.test(label)) || !/^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/.test(labels[labels.length - 1])) throw new HostingError('نام دامنه معتبر نیست؛ مثلاً example.ir')
  return text
}

/** A server's hostname: one or more labels; empty is allowed and the service id is used. */
export function normalizeHostname(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!text) return ''
  if (text.length > 253 || !text.split('.').every((label) => LABEL.test(label))) throw new HostingError('نام میزبان فقط حروف لاتین کوچک، عدد، خط تیره و نقطه است')
  return text
}

/** What the buyer types: the domain for web hosting (required), a hostname for a server (optional). */
export function normalizeServiceName(kind: string, value: unknown): string {
  return kindMeta(kind)?.group === 'hosting' ? normalizeDomain(value) : normalizeHostname(value)
}

/** IPv4 in dotted form, or empty. */
export function normalizeIpv4(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const parts = text.split('.')
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part)) throw new HostingError('آی‌پی نسخهٔ ۴ معتبر نیست')
  return text
}

/** IPv6 (basic shape check), or empty. */
export function normalizeIpv6(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return ''
  if (text.length > 45 || !/^[0-9a-f:]+(\/\d{1,3})?$/.test(text) || !text.includes(':')) throw new HostingError('آی‌پی نسخهٔ ۶ معتبر نیست')
  return text
}

/** A panel or console address staff give the customer: https only. */
export function normalizePanelUrl(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  let url: URL
  try { url = new URL(text) } catch { throw new HostingError('نشانی پنل معتبر نیست') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new HostingError('نشانی پنل باید https و بدون نام کاربری و رمز باشد')
  return url.toString()
}
