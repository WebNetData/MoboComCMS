import os from 'node:os'
import fs from 'node:fs/promises'
import { db } from '@/platform/database/prisma'
import { cacheStats, kv, kvHealth } from '@/platform/cache/kv'
import { metricsSnapshot } from '@/platform/observability/metrics'
import { queueOverview } from '@/modules/operations/server/queue'
import { backupHealth } from '@/modules/notifications/server/backup-status'
import { healthActions } from '@/modules/operations/domain/health'

/**
 * The monitoring page: server health (CPU, memory, disk), database and cache
 * latency, queues and scheduler, recent errors and slow queries, and real-user
 * speed (Web Vitals, p75 over 24 hours) — what to look at when the site grows.
 */

const VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
/** Google's "good" / "poor" limits for each vital (ms, CLS unitless). */
export const VITAL_LIMITS: Record<string, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800] }

export function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

export const rateVital = (kind: string, value: number): 'good' | 'needs' | 'poor' => {
  const [good, poor] = VITAL_LIMITS[kind] || [Infinity, Infinity]
  return value <= good ? 'good' : value <= poor ? 'needs' : 'poor'
}

/** One sampled measurement from a visitor's browser. Bad input is ignored. */
export async function recordVital(input: Record<string, unknown>, userAgent: string) {
  const kind = String(input.name || '')
  const value = Number(input.value)
  if (!VITALS.includes(kind as (typeof VITALS)[number]) || !Number.isFinite(value) || value < 0 || value > (kind === 'CLS' ? 10 : 120_000)) return
  const page = String(input.page || '/').split(/[?#]/)[0].replace(/\/\d+(?=\/|$)/g, '/:id').slice(0, 120)
  await db.perfSample.create({ data: { kind, value, page, device: /Mobi|Android|iPhone/i.test(userAgent) ? 'mobile' : 'desktop' } }).catch(() => undefined)
}

export async function prunePerfSamples() {
  await db.perfSample.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } })
}

async function vitals() {
  const rows = await db.perfSample.findMany({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } }, select: { kind: true, value: true, page: true, device: true }, take: 50_000 })
  const byKind = (kind: string, device?: string) => rows.filter((row) => row.kind === kind && (!device || row.device === device)).map((row) => row.value)
  const pages = new Map<string, number[]>()
  for (const row of rows) if (row.kind === 'LCP') pages.set(row.page, [...(pages.get(row.page) || []), row.value])
  return {
    samples: rows.length,
    metrics: VITALS.map((kind) => {
      const p75 = percentile(byKind(kind), 75)
      return { kind, p75, rating: rateVital(kind, p75), count: byKind(kind).length, mobile: percentile(byKind(kind, 'mobile'), 75), desktop: percentile(byKind(kind, 'desktop'), 75) }
    }),
    slowPages: [...pages].filter(([, values]) => values.length >= 3).map(([page, values]) => ({ page, lcp: percentile(values, 75), count: values.length })).sort((a, b) => b.lcp - a.lcp).slice(0, 10),
  }
}

async function disk() {
  try {
    const stat = await fs.statfs(process.cwd())
    const total = stat.blocks * stat.bsize, free = stat.bavail * stat.bsize
    return { total, free, usedPercent: total ? Math.round(((total - free) / total) * 100) : 0 }
  } catch { return null }
}

async function database() {
  const started = performance.now()
  const ok = await db.$queryRawUnsafe('SELECT 1').then(() => true).catch(() => false)
  return { ok, pingMs: Math.round((performance.now() - started) * 10) / 10, engine: (process.env.DATABASE_URL || '').startsWith('file:') ? 'SQLite' : 'PostgreSQL' }
}

export async function monitoringOverview() {
  const store = await kv()
  const [db_, diskInfo, cachePing, queue, fulfillment, leases, perf, backup, stalledJobs] = await Promise.all([
    database(), disk(), store.ping(), queueOverview(),
    db.fulfillmentJob.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
    db.setting.findMany({ where: { key: { startsWith: 'lease.' } } }).catch(() => []),
    vitals(),
    backupHealth(),
    db.backgroundJob.count({ where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
  ])
  // A configured Redis that does not answer: since when, how many tries, the last error (kv.ts reconnects by itself).
  const { degraded, degradedSince, attempts: reconnectAttempts, lastError } = await kvHealth()
  const redisFallback = { degraded, degradedSince, reconnectAttempts, lastError }
  const memory = process.memoryUsage()
  const total = cacheStats.hits + cacheStats.misses
  return {
    now: new Date().toISOString(),
    backup,
    health: healthActions({ database: db_.ok, cacheDegraded: degraded, failedJobs: queue.counts.FAILED || 0, stalledJobs, backup }),
    system: {
      node: process.version, platform: `${os.type()} ${os.release()}`, cpus: os.cpus().length, load: os.loadavg().map((n) => Math.round(n * 100) / 100),
      memory: { total: os.totalmem(), free: os.freemem(), rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      uptime: Math.round(process.uptime()), disk: diskInfo, instance: `${os.hostname()}:${process.pid}`,
    },
    database: db_,
    cache: { backend: store.kind, pingMs: cachePing, configured: !!process.env.REDIS_URL, ...redisFallback, hits: cacheStats.hits, misses: cacheStats.misses, errors: cacheStats.errors, hitRate: total ? Math.round((cacheStats.hits / total) * 100) : 0 },
    queue,
    fulfillment: Object.fromEntries(fulfillment.map((row) => [row.status, row._count._all])),
    scheduler: leases.map((row) => ({ name: row.key.slice(6), until: row.value })).sort((a, b) => a.name.localeCompare(b.name)),
    runtime: metricsSnapshot(),
    vitals: perf,
    cdn: { assetPrefix: process.env.CDN_URL || '', mediaCdn: process.env.NEXT_PUBLIC_MEDIA_CDN || '' },
  }
}

/** Clears the CDN (Cloudflare) cache of the site's zones. */
export async function purgeCdn() {
  const { purgeCloudflareCache } = await import('@/modules/server-panel/server/domains')
  return purgeCloudflareCache()
}
