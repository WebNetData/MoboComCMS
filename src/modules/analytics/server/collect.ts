import { db } from '@/platform/database/prisma'
import { Prisma } from '@prisma/client'
import { logEvent } from '@/platform/observability/logger'
import { visitorHash } from '@/platform/http/visitor'
import { isModuleEnabled } from '@/extensions/server/modules'
import { tehranDay } from '@/shared/time/day'
import { campaignSource, classifyUserAgent, normalizeTrackedPath, sourceOf } from '@/modules/analytics/domain/analytics'

/**
 * Cookie-free traffic analytics. A page view increments daily counters; the
 * first view of a (daily-rotating, hashed) visitor also records where they came
 * from and their device. No IP, cookie or per-user trail is stored.
 */

function eligibleVisitor(day: string, hash?: string) {
  return hash === undefined ? Prisma.sql`true` : Prisma.sql`NOT EXISTS (SELECT 1 FROM "AnalyticsVisitor" WHERE "day" = ${day} AND "hash" = ${hash})`
}

function bump(day: string, path: string, field: 'views' | 'visitors', hash?: string) {
  const change = field === 'views'
    ? Prisma.sql`"views" = "AnalyticsDaily"."views" + 1`
    : Prisma.sql`"visitors" = "AnalyticsDaily"."visitors" + 1`
  return db.$executeRaw(Prisma.sql`INSERT INTO "AnalyticsDaily" ("day", "path", "views", "visitors") SELECT ${day}, ${path}, ${field === 'views' ? 1 : 0}, ${field === 'visitors' ? 1 : 0} WHERE ${eligibleVisitor(day, hash)} ON CONFLICT ("day", "path") DO UPDATE SET ${change}`)
}

function dimension(day: string, dim: string, value: string, hash?: string) {
  const clean = value.slice(0, 120) || '—'
  return db.$executeRaw(Prisma.sql`INSERT INTO "AnalyticsDimension" ("day", "dim", "value", "count") SELECT ${day}, ${dim}, ${clean}, 1 WHERE ${eligibleVisitor(day, hash)} ON CONFLICT ("day", "dim", "value") DO UPDATE SET "count" = "AnalyticsDimension"."count" + 1`)
}

/** Records one page view. Returns false when it was ignored (bot, admin page, module off). */
export async function recordPageview(input: { path: unknown; referrer: unknown; utm?: unknown; headers: Headers; host: string }): Promise<boolean> {
  const path = normalizeTrackedPath(input.path)
  const agent = classifyUserAgent(input.headers.get('user-agent') || '')
  if (!path || agent.bot || !await isModuleEnabled('analytics')) return false
  const day = tehranDay()
  const hash = visitorHash(input.headers, day)
  await db.$transaction([
    // Lock the daily aggregate first: concurrent visits serialize before checking
    // the visitor marker. Keep its insertion last so all first-visit dimensions
    // see the same eligibility; every write rolls back together on failure.
    // A batch also avoids SQLite interactive-transaction contention.
    bump(day, '*', 'views'),
    bump(day, path, 'views'),
    bump(day, '*', 'visitors', hash),
    dimension(day, 'source', campaignSource(input.utm) || sourceOf(input.referrer, input.host), hash),
    dimension(day, 'device', agent.device, hash),
    dimension(day, 'browser', agent.browser, hash),
    dimension(day, 'os', agent.os, hash),
    dimension(day, 'landing', path, hash),
    // Ignore only the daily visitor conflict, never an unexpected storage failure.
    db.$executeRaw(Prisma.sql`INSERT INTO "AnalyticsVisitor" ("day", "hash") VALUES (${day}, ${hash}) ON CONFLICT ("day", "hash") DO NOTHING`),
  ])
  return true
}

/** Counts a site search; zero-result searches are kept separately to show content gaps. */
export async function recordSearch(normalizedQuery: string, results: number) {
  if (!normalizedQuery || !await isModuleEnabled('analytics').catch(() => false)) return
  const day = tehranDay()
  await db.$transaction([
    dimension(day, 'search', normalizedQuery),
    ...(!results ? [dimension(day, 'search-empty', normalizedQuery)] : []),
  ]).catch(error => {
    // Search calls this without awaiting it: observe failures without exposing search text.
    logEvent('error', 'analytics.collection_failed', { phase: 'search', errorName: error instanceof Error ? error.name : 'unknown' })
  })
}

/** Records an aggregate Store funnel event. These are event counts, not visitors or a cohort. */
export async function recordStoreFunnelEvent(stage: 'cart' | 'checkout', headers: Headers): Promise<boolean> {
  if (!await isModuleEnabled('analytics').catch(() => false) || !await isModuleEnabled('store').catch(() => false)) return false
  if (classifyUserAgent(headers.get('user-agent') || '').bot) return false
  const day = tehranDay()
  const value = stage
  await db.$executeRaw(Prisma.sql`INSERT INTO "AnalyticsDimension" ("day", "dim", "value", "count") VALUES (${day}, 'store-funnel-events', ${value}, 1) ON CONFLICT ("day", "dim", "value") DO UPDATE SET "count" = "AnalyticsDimension"."count" + 1`)
  return true
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
