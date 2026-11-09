import { db } from '@/platform/database/prisma'
import { invocationPurpose, monitoringDays } from '../domain/telemetry'

/** Read-only, bounded operational metrics. Never makes a provider request. */
export async function aiMonitoring(input: { days?: unknown; purpose?: unknown }) {
  const days = monitoringDays(input.days)
  const purpose = input.purpose ? invocationPurpose(input.purpose) : ''
  const since = new Date(Date.now() - days * 86_400_000)
  const where = { startedAt: { gte: since }, ...(purpose ? { purpose } : {}) }
  const [states, totals, known, recent, outcomes] = await db.$transaction([
    db.aiInvocation.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.aiInvocation.aggregate({ where, _sum: { attempts: true, inputTokens: true, outputTokens: true, totalTokens: true }, _avg: { durationMs: true } }),
    db.aiInvocation.count({ where: { ...where, totalTokens: { not: null } } }),
    db.aiInvocation.findMany({ where, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true, purpose: true, kind: true, transport: true, provider: true, model: true, status: true, startedAt: true, durationMs: true, attempts: true, inputTokens: true, outputTokens: true, totalTokens: true, errorKind: true, errorStatus: true, outcome: true } }),
    db.aiInvocation.groupBy({ by: ['outcome'], where: { ...where, outcome: { not: '' } }, _count: { _all: true } }),
  ])
  const counts = Object.fromEntries(states.map(row => [row.status, row._count._all]))
  return { days, purpose, since: since.toISOString(), counts, total: states.reduce((sum, row) => sum + row._count._all, 0), knownUsage: known, totals: { ...totals._sum, averageDurationMs: totals._avg.durationMs }, outcomes: Object.fromEntries(outcomes.map(row => [row.outcome, row._count._all])), recent }
}
export type AiMonitoring = Awaited<ReturnType<typeof aiMonitoring>>
