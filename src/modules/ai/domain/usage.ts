import { AI_PURPOSES, type AiPurpose } from './routing'

/**
 * How much the site's paid AI may be used and what repeats are not paid for again (owner, 2026-11-11: «خیلی عالی و کم
 * مصرف»). Per purpose: a daily ceiling of requests and of tokens (0 = none), and how long an identical request is
 * answered from the cache (0 = never, the default: a «try again» must get a new answer), and whether a Claude request
 * marks its system prompt for the service's own prompt cache (`promptCache`; the OpenAI-style services cache a repeated
 * prefix by themselves). Prices are the owner's own figures per model, so the monitoring page can say what the usage
 * cost; nothing here is a provider's price list.
 */

export type PurposeUsage = { dailyRequests: number; dailyTokens: number; cacheHours: number; promptCache: boolean }
/** Cache prices are optional: an input token read from or written to the service's cache without one is priced as input. */
export type ModelPrice = { provider: string; model: string; inputPerMillion: number; outputPerMillion: number; cachedPerMillion?: number; cacheWritePerMillion?: number }
export type UsagePolicy = { version: 1; purposes: Record<AiPurpose, PurposeUsage>; prices: ModelPrice[] }

const OPEN: PurposeUsage = { dailyRequests: 0, dailyTokens: 0, cacheHours: 0, promptCache: false }

/**
 * A starting point the owner may apply: ceilings where the public or a batch can spend (support, bulk production and
 * images) and on everyday tools, a week's cache for meta descriptions, which are asked for the same text again, and the
 * prompt cache where one long system prompt serves many requests close together (support chat, bulk production).
 */
export const RECOMMENDED_USAGE: Partial<Record<AiPurpose, Partial<PurposeUsage>>> = {
  support: { dailyRequests: 500, promptCache: true }, production: { dailyRequests: 300, promptCache: true }, 'production-image': { dailyRequests: 40 },
  admin: { dailyRequests: 200 }, journal: { dailyRequests: 100 }, store: { dailyRequests: 200 }, editor: { dailyRequests: 200 },
  comments: { dailyRequests: 200, promptCache: true }, forum: { dailyRequests: 200, promptCache: true }, builder: { dailyRequests: 100 }, pages: { dailyRequests: 100 },
  music: { dailyRequests: 200 }, cinema: { dailyRequests: 200 }, games: { dailyRequests: 100 }, software: { dailyRequests: 100 },
  seo: { dailyRequests: 300, cacheHours: 168, promptCache: true }, prompts: { dailyRequests: 100, cacheHours: 24 }, operations: { dailyRequests: 100 },
}

const whole = (value: unknown, max: number) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0 }
const money = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.min(10_000, Math.round(n * 10_000) / 10_000) : 0 }
/** An optional price: empty or not a number means «not given» (priced as input), 0 means free. */
const optionalMoney = (value: unknown) => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? undefined : money(value)
const label = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max)

/** Stored or sent policy → a valid one: unknown purposes dropped, missing ones open, numbers bounded, prices unique. */
export function normalizeUsagePolicy(input: unknown): UsagePolicy {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const given = raw.purposes && typeof raw.purposes === 'object' ? raw.purposes as Record<string, Record<string, unknown>> : {}
  const purposes = Object.fromEntries(AI_PURPOSES.map(p => {
    const row = given[p.id] && typeof given[p.id] === 'object' ? given[p.id] : {}
    return [p.id, { dailyRequests: whole(row.dailyRequests, 1_000_000), dailyTokens: whole(row.dailyTokens, 2_000_000_000), cacheHours: whole(row.cacheHours, 24 * 30), promptCache: row.promptCache === true }]
  })) as Record<AiPurpose, PurposeUsage>
  const seen = new Set<string>(), prices: ModelPrice[] = []
  for (const item of Array.isArray(raw.prices) ? raw.prices.slice(0, 100) : []) {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const provider = label(row.provider, 60), model = label(row.model, 200), key = `${provider}\u0000${model}`
    if (!provider || !model || seen.has(key)) continue
    seen.add(key)
    const cached = optionalMoney(row.cachedPerMillion), written = optionalMoney(row.cacheWritePerMillion)
    prices.push({ provider, model, inputPerMillion: money(row.inputPerMillion), outputPerMillion: money(row.outputPerMillion), ...(cached !== undefined ? { cachedPerMillion: cached } : {}), ...(written !== undefined ? { cacheWritePerMillion: written } : {}) })
  }
  return { version: 1, purposes, prices }
}

/** The policy with the recommended values filled in where the owner has none yet; their own choices stay. */
export function withRecommended(policy: UsagePolicy): UsagePolicy {
  const purposes = { ...policy.purposes }
  for (const [id, values] of Object.entries(RECOMMENDED_USAGE) as [AiPurpose, Partial<PurposeUsage>][]) {
    const current = purposes[id] || { ...OPEN }
    purposes[id] = { dailyRequests: current.dailyRequests || values.dailyRequests || 0, dailyTokens: current.dailyTokens || values.dailyTokens || 0, cacheHours: current.cacheHours || values.cacheHours || 0, promptCache: current.promptCache || values.promptCache || false }
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

export type UsageRow = { purpose: string; provider: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number }
/**
 * The cost of the measured usage at the owner's prices. A row with only a total (no input/output split) is priced as
 * input, said as approximate; a model with no price is counted as unpriced, never guessed. Input the service read from
 * its prompt cache is priced at the model's cache price (`saved` is what that spared against the input price); without
 * one it is priced as input and the total is said as approximate (an upper bound).
 */
export function estimateCost(rows: UsageRow[], prices: ModelPrice[]) {
  const price = new Map(prices.map(p => [`${p.provider}\u0000${p.model}`, p]))
  const byPurpose = new Map<string, { cost: number; tokens: number }>()
  let total = 0, unpricedTokens = 0, approximate = false, saved = 0, cachedInputTokens = 0
  for (const row of rows) {
    const p = price.get(`${row.provider}\u0000${row.model}`)
    const tokens = row.totalTokens || row.inputTokens + row.outputTokens
    cachedInputTokens += row.cachedInputTokens || 0
    if (!p) { unpricedTokens += tokens; continue }
    const split = row.inputTokens || row.outputTokens
    if (!split && tokens) approximate = true
    const cached = Math.min(row.cachedInputTokens || 0, row.inputTokens), written = Math.min(row.cacheWriteTokens || 0, row.inputTokens - cached)
    if ((cached && p.cachedPerMillion === undefined) || (written && p.cacheWritePerMillion === undefined)) approximate = true
    const readPrice = p.cachedPerMillion ?? p.inputPerMillion, writePrice = p.cacheWritePerMillion ?? p.inputPerMillion
    const input = (row.inputTokens - cached - written) * p.inputPerMillion + cached * readPrice + written * writePrice
    saved += cached * (p.inputPerMillion - readPrice) / 1e6
    const cost = split ? (input + row.outputTokens * p.outputPerMillion) / 1e6 : (tokens * p.inputPerMillion) / 1e6
    total += cost
    const prior = byPurpose.get(row.purpose) || { cost: 0, tokens: 0 }
    byPurpose.set(row.purpose, { cost: prior.cost + cost, tokens: prior.tokens + tokens })
  }
  const round = (n: number) => Math.round(n * 10_000) / 10_000
  return { total: round(total), unpricedTokens, approximate, saved: round(saved), cachedInputTokens, byPurpose: [...byPurpose].map(([purpose, v]) => ({ purpose, cost: round(v.cost), tokens: v.tokens })).sort((a, b) => b.cost - a.cost) }
}
