import { db } from '@/platform/database/prisma'
import { visitorHash } from '@/platform/http/visitor'
import { isModuleEnabled } from '@/extensions/server/modules'
import { tehranDay } from '@/shared/time/day'
import { campaignSource, classifyUserAgent, normalizeTrackedPath, sourceOf } from '@/modules/analytics/domain/analytics'

/**
 * Cookie-free traffic analytics. A page view increments daily counters; the
 * first view of a (daily-rotating, hashed) visitor also records where they came
 * from and their device. No IP, cookie or per-user trail is stored.
 */

async function bump<K extends 'views' | 'visitors'>(day: string, path: string, field: K, by = 1) {
  const where = { day_path: { day, path } }
  try {
    await db.analyticsDaily.upsert({ where, create: { day, path, [field]: by }, update: { [field]: { increment: by } } })
  } catch {
    // Two first hits raced on create; the row exists now.
    await db.analyticsDaily.update({ where, data: { [field]: { increment: by } } }).catch(() => undefined)
  }
}

async function dimension(day: string, dim: string, value: string) {
  const clean = value.slice(0, 120) || '—'
  const where = { day_dim_value: { day, dim, value: clean } }
  try {
    await db.analyticsDimension.upsert({ where, create: { day, dim, value: clean, count: 1 }, update: { count: { increment: 1 } } })
  } catch {
    await db.analyticsDimension.update({ where, data: { count: { increment: 1 } } }).catch(() => undefined)
  }
}

/** Records one page view. Returns false when it was ignored (bot, admin page, module off). */
export async function recordPageview(input: { path: unknown; referrer: unknown; utm?: unknown; headers: Headers; host: string }): Promise<boolean> {
  const path = normalizeTrackedPath(input.path)
  const agent = classifyUserAgent(input.headers.get('user-agent') || '')
  if (!path || agent.bot || !await isModuleEnabled('analytics')) return false
  const day = tehranDay()
  const hash = visitorHash(input.headers, day)
  let firstVisit = false
  try {
    await db.analyticsVisitor.create({ data: { day, hash } })
    firstVisit = true
  } catch { /* already counted today */ }
  await Promise.all([bump(day, path, 'views'), bump(day, '*', 'views')])
  if (firstVisit) {
    await Promise.all([
      bump(day, '*', 'visitors'),
      dimension(day, 'source', campaignSource(input.utm) || sourceOf(input.referrer, input.host)),
      dimension(day, 'device', agent.device),
      dimension(day, 'browser', agent.browser),
      dimension(day, 'os', agent.os),
      dimension(day, 'landing', path),
    ])
  }
  return true
}

/** Counts a site search; zero-result searches are kept separately to show content gaps. */
export async function recordSearch(normalizedQuery: string, results: number) {
  if (!normalizedQuery || !await isModuleEnabled('analytics').catch(() => false)) return
  const day = tehranDay()
  await dimension(day, 'search', normalizedQuery)
  if (!results) await dimension(day, 'search-empty', normalizedQuery)
}

/** Keeps visitor hashes for 2 days (they only dedupe the current day) and counters for `days`. */
export async function pruneAnalytics(days = 400) {
  const today = tehranDay()
  const cutoff = tehranDay(new Date(Date.now() - days * 86_400_000))
  const [visitors, daily, dims] = await Promise.all([
    db.analyticsVisitor.deleteMany({ where: { day: { lt: tehranDay(new Date(Date.now() - 86_400_000)) } } }),
    db.analyticsDaily.deleteMany({ where: { day: { lt: cutoff } } }),
    db.analyticsDimension.deleteMany({ where: { day: { lt: cutoff } } }),
  ])
  return { today, visitors: visitors.count, daily: daily.count, dimensions: dims.count }
}
