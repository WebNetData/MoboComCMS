/**
 * In-process operational metrics for the monitoring page: recent errors,
 * slow database queries and request counters. Bounded ring buffers — they
 * reset on restart by design (long-term trends live in the perf samples).
 */

export type ErrorEntry = { at: string; event: string; message: string; path: string }
export type SlowQuery = { at: string; model: string; action: string; ms: number }

const MAX = 200
const state = globalThis as unknown as { __mobocomMetrics?: { errors: ErrorEntry[]; slow: SlowQuery[]; queries: number; queryMs: number; startedAt: number; errorCount: number } }
const metrics = (state.__mobocomMetrics ??= { errors: [], slow: [], queries: 0, queryMs: 0, startedAt: Date.now(), errorCount: 0 })

export const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS) || 300

export function recordError(event: string, message: string, path = '') {
  metrics.errorCount++
  metrics.errors.unshift({ at: new Date().toISOString(), event, message: message.slice(0, 500), path: path.slice(0, 200) })
  if (metrics.errors.length > MAX) metrics.errors.length = MAX
}

export function recordQuery(model: string, action: string, ms: number) {
  metrics.queries++
  metrics.queryMs += ms
  if (ms < SLOW_QUERY_MS) return
  metrics.slow.unshift({ at: new Date().toISOString(), model, action, ms: Math.round(ms) })
  if (metrics.slow.length > MAX) metrics.slow.length = MAX
}

export function metricsSnapshot() {
  return {
    startedAt: new Date(metrics.startedAt).toISOString(),
    errors: metrics.errors.slice(0, 50), errorCount: metrics.errorCount,
    slowQueries: metrics.slow.slice(0, 50), queries: metrics.queries, avgQueryMs: metrics.queries ? Math.round((metrics.queryMs / metrics.queries) * 10) / 10 : 0,
  }
}
