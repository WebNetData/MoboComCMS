import { AI_PURPOSES, type AiPurpose } from './routing'

/**
 * How much the site's paid AI may be used and what repeats are not paid for again (owner, 2026-11-11: «خیلی عالی و کم
 * مصرف»). Per purpose: a daily ceiling of requests and of tokens (0 = none), and how long an identical request is
 * answered from the cache (0 = never, the default: a «try again» must get a new answer). Prices are the owner's own
 * figures per model, so the monitoring page can say what the usage cost; nothing here is a provider's price list.
 */

export type PurposeUsage = { dailyRequests: number; dailyTokens: number; cacheHours: number }
export type ModelPrice = { provider: string; model: string; inputPerMillion: number; outputPerMillion: number }
export type UsagePolicy = { version: 1; purposes: Record<AiPurpose, PurposeUsage>; prices: ModelPrice[] }

const OPEN: PurposeUsage = { dailyRequests: 0, dailyTokens: 0, cacheHours: 0 }

/**
 * A starting point the owner may apply: ceilings where the public or a batch can spend (support, bulk production and
 * images) and on everyday tools, and a week's cache for meta descriptions, which are asked for the same text again.
 */
export const RECOMMENDED_USAGE: Partial<Record<AiPurpose, Partial<PurposeUsage>>> = {
  support: { dailyRequests: 500 }, production: { dailyRequests: 300 }, 'production-image': { dailyRequests: 40 },
  admin: { dailyRequests: 200 }, journal: { dailyRequests: 100 }, store: { dailyRequests: 200 }, editor: { dailyRequests: 200 },
  comments: { dailyRequests: 200 }, forum: { dailyRequests: 200 }, builder: { dailyRequests: 100 }, pages: { dailyRequests: 100 },
  music: { dailyRequests: 200 }, cinema: { dailyRequests: 200 }, games: { dailyRequests: 100 }, software: { dailyRequests: 100 },
  seo: { dailyRequests: 300, cacheHours: 168 }, prompts: { dailyRequests: 100, cacheHours: 24 }, operations: { dailyRequests: 100 },
}

const whole = (value: unknown, max: number) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0 }
const money = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.min(10_000, Math.round(n * 10_000) / 10_000) : 0 }
const label = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max)

/** Stored or sent policy → a valid one: unknown purposes dropped, missing ones open, numbers bounded, prices unique. */
export function normalizeUsagePolicy(input: unknown): UsagePolicy {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const given = raw.purposes && typeof raw.purposes === 'object' ? raw.purposes as Record<string, Record<string, unknown>> : {}
  const purposes = Object.fromEntries(AI_PURPOSES.map(p => {
    const row = given[p.id] && typeof given[p.id] === 'object' ? given[p.id] : {}
    return [p.id, { dailyRequests: whole(row.dailyRequests, 1_000_000), dailyTokens: whole(row.dailyTokens, 2_000_000_000), cacheHours: whole(row.cacheHours, 24 * 30) }]
  })) as Record<AiPurpose, PurposeUsage>
  const seen = new Set<string>(), prices: ModelPrice[] = []
  for (const item of Array.isArray(raw.prices) ? raw.prices.slice(0, 100) : []) {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const provider = label(row.provider, 60), model = label(row.model, 200), key = `${provider}\u0000${model}`
    if (!provider || !model || seen.has(key)) continue
    seen.add(key)
    prices.push({ provider, model, inputPerMillion: money(row.inputPerMillion), outputPerMillion: money(row.outputPerMillion) })
  }
  return { version: 1, purposes, prices }
}

/** The policy with the recommended values filled in where the owner has none yet; their own choices stay. */
export function withRecommended(policy: UsagePolicy): UsagePolicy {
  const purposes = { ...policy.purposes }
  for (const [id, values] of Object.entries(RECOMMENDED_USAGE) as [AiPurpose, Partial<PurposeUsage>][]) {
    const current = purposes[id] || { ...OPEN }
    purposes[id] = { dailyRequests: current.dailyRequests || values.dailyRequests || 0, dailyTokens: current.dailyTokens || values.dailyTokens || 0, cacheHours: current.cacheHours || values.cacheHours || 0 }
  }
  return { ...policy, purposes }
}

/** Why a request may not be sent ('' = it may): today's counts against the purpose's ceilings. */
export function overCeiling(usage: PurposeUsage, today: { requests: number; tokens: number }): '' | 'requests' | 'tokens' {
  if (usage.dailyRequests && today.requests >= usage.dailyRequests) return 'requests'
  if (usage.dailyTokens && today.tokens >= usage.dailyTokens) return 'tokens'
  return ''
}

/** The start of today in the site's time zone (Asia/Tehran unless SITE_TIMEZONE says otherwise), as an instant. */
export function siteDayStart(now: Date, timeZone = 'Asia/Tehran'): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now).map(p => [p.type, p.value]))
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second))
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - offset)
}

/** What makes two requests the same request: purpose, service, model and the exact prompt. */
export function cacheIdentity(input: { purpose: string; provider: string; model: string; baseUrl: string; system: string; user: string; maxTokens: number; json?: boolean }): string {
  return JSON.stringify([input.purpose, input.provider, input.model, input.baseUrl, input.system, input.user, input.maxTokens, !!input.json])
}

export type UsageRow = { purpose: string; provider: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number }
/**
 * The cost of the measured usage at the owner's prices. A row with only a total (no input/output split) is priced as
 * input, said as approximate; a model with no price is counted as unpriced, never guessed.
 */
export function estimateCost(rows: UsageRow[], prices: ModelPrice[]) {
  const price = new Map(prices.map(p => [`${p.provider}\u0000${p.model}`, p]))
  const byPurpose = new Map<string, { cost: number; tokens: number }>()
  let total = 0, unpricedTokens = 0, approximate = false
  for (const row of rows) {
    const p = price.get(`${row.provider}\u0000${row.model}`)
    const tokens = row.totalTokens || row.inputTokens + row.outputTokens
    if (!p) { unpricedTokens += tokens; continue }
    const split = row.inputTokens || row.outputTokens
    if (!split && tokens) approximate = true
    const cost = split ? (row.inputTokens * p.inputPerMillion + row.outputTokens * p.outputPerMillion) / 1e6 : (tokens * p.inputPerMillion) / 1e6
    total += cost
    const prior = byPurpose.get(row.purpose) || { cost: 0, tokens: 0 }
    byPurpose.set(row.purpose, { cost: prior.cost + cost, tokens: prior.tokens + tokens })
  }
  const round = (n: number) => Math.round(n * 10_000) / 10_000
  return { total: round(total), unpricedTokens, approximate, byPurpose: [...byPurpose].map(([purpose, v]) => ({ purpose, cost: round(v.cost), tokens: v.tokens })).sort((a, b) => b.cost - a.cost) }
}
