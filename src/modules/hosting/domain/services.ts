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

// ============ Renewal and due dates (slice 3) ============

const DAY = 86_400_000

export type LifecycleSettings = { reminderDays: number[]; graceDays: number; terminateDays: number; autoRenew: boolean }

/** "7, 3, 1" → [7, 3, 1]: whole days from 1 to 60, largest first, without repeats. */
export function parseDays(value: unknown, fallback: number[]): number[] {
  const days = String(value ?? '').split(/[,،\s]+/).map((part) => Number(part.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))).filter((n) => Number.isInteger(n) && n >= 1 && n <= 60)
  return days.length ? [...new Set(days)].sort((a, b) => b - a) : fallback
}

const whole = (value: unknown, fallback: number, max: number) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback }

export function lifecycleSettings(raw: Record<string, unknown>): LifecycleSettings {
  return {
    reminderDays: parseDays(raw['reminder-days'], [7, 3, 1]),
    graceDays: whole(raw['grace-days'], 3, 60),
    terminateDays: whole(raw['terminate-days'], 14, 365),
    autoRenew: raw['auto-renew'] !== false,
  }
}

export type LifecycleStep = { kind: 'remind'; days: number } | { kind: 'renew' } | { kind: 'suspend' } | { kind: 'warn-terminate'; days: number } | { kind: 'terminate' } | null

/**
 * What the scheduled run does to one fixed-term service now. Reminders go out on the listed days before the due
 * date; a wallet renewal is tried from a day before it; an unpaid service is suspended after the grace days and,
 * when the system suspended it for that reason, terminated after the termination days (with a warning 3 days before).
 */
export function lifecycleStep(service: { status: string; cycle: string; nextDueAt: Date | null; suspendedAt: Date | null; autoRenew: boolean; unpaidSuspension: boolean }, now: Date, settings: LifecycleSettings): LifecycleStep {
  if (service.cycle === 'HOURLY' || !service.nextDueAt) return null
  const left = service.nextDueAt.getTime() - now.getTime()
  if (service.status === 'ACTIVE') {
    // Past the grace days an unpaid service is suspended even when a wallet renewal keeps failing.
    if (left < -settings.graceDays * DAY) return { kind: 'suspend' }
    if (service.autoRenew && settings.autoRenew && left <= DAY) return { kind: 'renew' }
    if (left > 0) {
      const days = Math.ceil(left / DAY)
      if (settings.reminderDays.includes(days)) return { kind: 'remind', days }
    }
    return null
  }
  if (service.status === 'SUSPENDED' && service.unpaidSuspension && service.suspendedAt) {
    if (service.autoRenew && settings.autoRenew) return { kind: 'renew' }
    const until = service.suspendedAt.getTime() + settings.terminateDays * DAY - now.getTime()
    if (until <= 0) return { kind: 'terminate' }
    const days = Math.ceil(until / DAY)
    if (days <= 3) return { kind: 'warn-terminate', days }
  }
  return null
}

/** The next due date after a paid renewal: one more term from the current due date, never from the past payment day. */
export function renewedDue(current: Date, cycle: string): Date {
  return termEnd(current, cycle) || current
}
