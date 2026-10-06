// How long inbox notices are kept, the daily summary of unread ones, and what a delivery came to.
// Pure rules; the database side is in server/policy.ts.

export type NotificationPolicy = {
  /** Days a read notice is kept after it was read. 0 = kept for good. */
  readDays: number
  /** Days any notice is kept after it was created, read or not. 0 = kept for good. */
  unreadDays: number
  digest: {
    /** One email a day listing the unread notices that were not emailed on their own. */
    enabled: boolean
    /** The hour (site time, Tehran) from which the day's summary goes out. */
    hour: number
  }
}

/** Nothing is removed and no summary is sent until the owner says so. */
export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = { readDays: 0, unreadDays: 0, digest: { enabled: false, hour: 9 } }

const days = (value: unknown, fallback: number) => { const n = Math.floor(Number(value)); return Number.isSafeInteger(n) && n >= 0 && n <= 3650 ? n : fallback }

export function normalizeNotificationPolicy(input: unknown): NotificationPolicy {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const digest = raw.digest && typeof raw.digest === 'object' ? raw.digest as Record<string, unknown> : {}
  const hour = Math.floor(Number(digest.hour))
  const readDays = days(raw.readDays, DEFAULT_NOTIFICATION_POLICY.readDays)
  let unreadDays = days(raw.unreadDays, DEFAULT_NOTIFICATION_POLICY.unreadDays)
  // A notice nobody read is never removed sooner than one that was read.
  if (unreadDays && readDays && unreadDays < readDays) unreadDays = readDays
  return {
    readDays, unreadDays,
    digest: { enabled: digest.enabled === true, hour: Number.isSafeInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_NOTIFICATION_POLICY.digest.hour },
  }
}

/** The moments before which notices go: read ones by when they were read, all by when they were made. Null = that rule is off. */
export function retentionCutoffs(policy: NotificationPolicy, now: Date): { readBefore: Date | null; createdBefore: Date | null } {
  const back = (count: number) => (count > 0 ? new Date(now.getTime() - count * 86_400_000) : null)
  return { readBefore: back(policy.readDays), createdBefore: back(policy.unreadDays) }
}

// Site time is Tehran, a fixed +03:30 (no daylight saving since 2022).
const TEHRAN_OFFSET_MS = 3.5 * 3_600_000
const tehran = (now: Date) => new Date(now.getTime() + TEHRAN_OFFSET_MS)

/** The day (YYYY-MM-DD, site time) whose summary is due at `now`, or null before the hour. */
export function digestDay(now: Date, hour: number): string | null {
  const local = tehran(now)
  return local.getUTCHours() >= hour ? local.toISOString().slice(0, 10) : null
}

/** What a day's summary covers: the twenty-four hours up to its hour. */
export function digestWindow(day: string, hour: number): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const to = new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) - TEHRAN_OFFSET_MS)
  return Number.isFinite(to.getTime()) ? { from: new Date(to.getTime() - 86_400_000), to } : null
}

export const DIGEST_LIST = 8

/** The summary email: how many, the first few titles, and how many more. */
export function digestText(titles: readonly string[], total: number): { title: string; body: string } {
  const shown = titles.slice(0, DIGEST_LIST)
  const more = Math.max(0, total - shown.length)
  return {
    title: `${total.toLocaleString('fa-IR')} اعلان خوانده‌نشده دارید`,
    body: [...shown.map((title) => `• ${title}`), ...(more ? [`و ${more.toLocaleString('fa-IR')} مورد دیگر`] : [])].join('\n'),
  }
}

export type Receipt = 'sent' | 'notSent' | 'waiting' | 'failed'

/**
 * What one channel's delivery job came to. Done without a copy leaving means the member has that
 * channel off, has no address for it, or the channel is not set up: not a fault.
 */
export function receiptOf(job: { status: string; result: string }): Receipt {
  if (job.status === 'FAILED') return 'failed'
  if (job.status !== 'DONE') return 'waiting'
  try { return (JSON.parse(job.result || 'null') as { sent?: unknown } | null)?.sent === true ? 'sent' : 'notSent' } catch { return 'notSent' }
}

export const CHANNELS = ['sms', 'email', 'push'] as const
export type Channel = (typeof CHANNELS)[number]
export type ChannelReceipts = Record<Receipt, number>

/** Receipts per channel from the delivery jobs of a period. */
export function summarizeReceipts(jobs: readonly { status: string; result: string; payload: string }[]): Record<Channel, ChannelReceipts> {
  const empty = (): ChannelReceipts => ({ sent: 0, notSent: 0, waiting: 0, failed: 0 })
  const summary: Record<Channel, ChannelReceipts> = { sms: empty(), email: empty(), push: empty() }
  for (const job of jobs) {
    let channel = ''
    try { channel = String((JSON.parse(job.payload || '{}') as { channel?: unknown }).channel || '') } catch { /* not a delivery payload */ }
    if ((CHANNELS as readonly string[]).includes(channel)) summary[channel as Channel][receiptOf(job)]++
  }
  return summary
}
