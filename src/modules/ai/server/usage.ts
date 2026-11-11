import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { kv } from '@/platform/cache/kv'
import { auditAdminStrict } from '@/platform/audit/server'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { AI_PURPOSES, type AiPurpose } from '../domain/routing'
import { cacheIdentity, estimateCost, normalizeUsagePolicy, overCeiling, siteDayStart, type UsagePolicy, type UsageRow } from '../domain/usage'
import { AiError } from './error'

const KEY = 'ai.usage.v1'
const LOOKUP_MS = 1500

/**
 * A lookup that may not hold up an AI request: settled within a short time and the caller's own deadline, otherwise
 * `null` (no ceiling, no cache for this request). A slow database never delays or refuses an answer.
 */
export function bounded<T>(work: Promise<T>, signal?: AbortSignal, ms = LOOKUP_MS): Promise<T | null> {
  if (signal?.aborted) { work.catch(() => undefined); return Promise.resolve(null) }
  return new Promise(resolve => {
    const timer = setTimeout(() => done(null), ms)
    const onAbort = () => done(null)
    const done = (value: T | null) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(value) }
    signal?.addEventListener('abort', onAbort, { once: true })
    work.then(done, () => done(null))
  })
}
const MAX_CACHED_CHARS = 100_000
const label = (purpose: AiPurpose) => AI_PURPOSES.find(p => p.id === purpose)?.label || purpose

export async function usagePolicy(): Promise<UsagePolicy> {
  return normalizeUsagePolicy(await readJsonSetting(KEY).catch(() => undefined))
}

export async function saveUsagePolicy(input: unknown, context: { req: NextRequest; actor: { id: number; email: string } }): Promise<UsagePolicy> {
  const next = normalizeUsagePolicy(input)
  await writeJsonSetting(KEY, next)
  await auditAdminStrict({ req: context.req, actor: context.actor, action: 'ai.usage.update', targetType: 'setting', targetId: KEY, metadata: { limited: Object.entries(next.purposes).filter(([, v]) => v.dailyRequests || v.dailyTokens).map(([k]) => k), cached: Object.entries(next.purposes).filter(([, v]) => v.cacheHours).map(([k]) => k), prices: next.prices.length } })
  return next
}

/** Today's paid-transport use of a purpose (the site's day). A request the ceiling refused is not use. */
export async function usageToday(purpose: AiPurpose, now = new Date()) {
  const where = { purpose, transport: 'api', startedAt: { gte: siteDayStart(now, process.env.SITE_TIMEZONE || 'Asia/Tehran') }, NOT: { errorKind: 'limit' } }
  const [requests, sum] = await Promise.all([db.aiInvocation.count({ where }), db.aiInvocation.aggregate({ where, _sum: { totalTokens: true } })])
  return { requests, tokens: sum._sum.totalTokens || 0 }
}

/**
 * Refuses a request over the purpose's daily ceiling before anything is sent (and notes the refusal in the monitoring
 * table). Requests in flight at the same moment may pass together: the ceiling bounds the day, not to the request.
 */
export async function enforceCeiling(purpose: AiPurpose | undefined, meta: { provider: string; model: string }, policy?: UsagePolicy | null, signal?: AbortSignal) {
  if (!purpose) return
  // A policy or a count that cannot be read in time never blocks a request (like the monitoring itself).
  const usage = (policy === undefined ? await bounded(usagePolicy(), signal) : policy)?.purposes[purpose]
  if (!usage || (!usage.dailyRequests && !usage.dailyTokens)) return
  const today = await bounded(usageToday(purpose), signal)
  if (!today) return
  const reason = overCeiling(usage, today)
  if (!reason) return
  await db.aiInvocation.create({ data: { purpose, provider: meta.provider.slice(0, 60), model: meta.model.slice(0, 200), transport: 'api', status: 'FAILED', finishedAt: new Date(), durationMs: 0, attempts: 0, errorKind: 'limit', errorStatus: 429 } }).catch(() => undefined)
  throw new AiError(`سقف روزانهٔ ${reason === 'requests' ? 'درخواست' : 'توکن'} «${label(purpose)}» پر شده است؛ از فردا دوباره باز می‌شود، یا سقف را در ادمین › هوش مصنوعی › پایش و مصرف تغییر دهید`, 429)
}

type Answer = { text: string; model: string; provider: string }
const cacheKey = (identity: string) => `ai:answer:${createHash('sha256').update(identity).digest('hex')}`

/** The same request answered within the purpose's cache time: no provider call, no cost (a hit is noted for monitoring). */
export async function cachedAnswer(purpose: AiPurpose | undefined, request: Parameters<typeof cacheIdentity>[0], policy: UsagePolicy | null, signal?: AbortSignal): Promise<{ key: string; hours: number; answer: Answer | null }> {
  const hours = purpose && policy ? policy.purposes[purpose]?.cacheHours || 0 : 0
  if (!purpose || !hours) return { key: '', hours: 0, answer: null }
  const key = cacheKey(cacheIdentity(request))
  let answer: Answer | null = null
  try {
    const raw = await bounded((async () => (await kv()).get(key))(), signal)
    const value = raw ? JSON.parse(raw) as Answer : null
    answer = value && typeof value.text === 'string' && value.text.trim() ? value : null
  } catch { answer = null }
  if (answer) await db.aiInvocation.create({ data: { purpose, provider: answer.provider.slice(0, 60), model: answer.model.slice(0, 200), transport: 'cache', status: 'SUCCEEDED', finishedAt: new Date(), durationMs: 0, attempts: 0 } }).catch(() => undefined)
  return { key, hours, answer }
}

export async function rememberAnswer(key: string, hours: number, answer: Answer) {
  if (!key || !hours || !answer.text.trim() || answer.text.length > MAX_CACHED_CHARS) return
  // Keeping a copy is a saving, never a condition: a cache that cannot be written leaves the answer as it is.
  try { await (await kv()).set(key, JSON.stringify({ text: answer.text, model: answer.model, provider: answer.provider }), hours * 3_600_000) } catch { /* answered anyway */ }
}

/** Measured usage of the period at the owner's prices, by purpose; requests answered from the cache and refused ones. */
export async function usageCost(since: Date, purpose?: string) {
  const where = { startedAt: { gte: since }, transport: 'api', status: 'SUCCEEDED', ...(purpose ? { purpose } : {}) }
  const [groups, policy, cached, refused] = await Promise.all([
    db.aiInvocation.groupBy({ by: ['purpose', 'provider', 'model'], where, _sum: { inputTokens: true, outputTokens: true, totalTokens: true } }),
    usagePolicy(),
    db.aiInvocation.count({ where: { startedAt: { gte: since }, transport: 'cache', ...(purpose ? { purpose } : {}) } }),
    db.aiInvocation.count({ where: { startedAt: { gte: since }, errorKind: 'limit', ...(purpose ? { purpose } : {}) } }),
  ])
  const rows: UsageRow[] = groups.map(g => ({ purpose: g.purpose, provider: g.provider, model: g.model, inputTokens: g._sum.inputTokens || 0, outputTokens: g._sum.outputTokens || 0, totalTokens: g._sum.totalTokens || 0 }))
  return { ...estimateCost(rows, policy.prices), cachedAnswers: cached, refusedByCeiling: refused, models: rows.map(r => ({ provider: r.provider, model: r.model })).filter((r, i, all) => all.findIndex(x => x.provider === r.provider && x.model === r.model) === i).slice(0, 50) }
}
