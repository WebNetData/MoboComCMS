// Usage ceilings, the answer cache and cost estimates of the site's paid AI (ai/domain/usage).
const { test } = require('node:test'), assert = require('node:assert/strict'), loadSource = require('./connected-source-loader.cjs')
const usage = loadSource()('src/modules/ai/domain/usage.ts'), { AI_PURPOSES } = loadSource()('src/modules/ai/domain/routing.ts')

test('AI usage policy: every purpose present and bounded, unknown ones and junk ignored, prices unique', () => {
  const open = usage.normalizeUsagePolicy('junk')
  assert.deepEqual(Object.keys(open.purposes).sort(), AI_PURPOSES.map(p => p.id).sort())
  assert.ok(Object.values(open.purposes).every(v => v.dailyRequests === 0 && v.dailyTokens === 0 && v.cacheHours === 0 && v.promptCache === false), 'nothing limited or cached until the owner says so')
  const policy = usage.normalizeUsagePolicy({ purposes: { support: { dailyRequests: '120.9', dailyTokens: -5, cacheHours: 99999, promptCache: 'yes' }, pages: { promptCache: true }, nonsense: { dailyRequests: 1 } }, prices: [
    { provider: 'groq', model: 'llama', inputPerMillion: '0.59', outputPerMillion: -1 }, { provider: 'groq', model: 'llama', inputPerMillion: 9 }, { provider: '', model: 'x' }, { provider: 'gemini<script>', model: 'flash', inputPerMillion: 0.123456789 },
    { provider: 'deepseek', model: 'chat', inputPerMillion: 0.3, cachedPerMillion: '0.03', cacheWritePerMillion: '' }, { provider: 'anthropic', model: 'opus', inputPerMillion: 4, cachedPerMillion: 0, cacheWritePerMillion: -1 },
  ] })
  assert.deepEqual(policy.purposes.support, { dailyRequests: 120, dailyTokens: 0, cacheHours: 720, promptCache: false }, 'only true turns the prompt cache on')
  assert.equal(policy.purposes.pages.promptCache, true)
  assert.equal(policy.purposes.nonsense, undefined)
  assert.deepEqual(policy.prices, [{ provider: 'groq', model: 'llama', inputPerMillion: 0.59, outputPerMillion: 0 }, { provider: 'geminiscript', model: 'flash', inputPerMillion: 0.1235, outputPerMillion: 0 },
    { provider: 'deepseek', model: 'chat', inputPerMillion: 0.3, outputPerMillion: 0, cachedPerMillion: 0.03 }, { provider: 'anthropic', model: 'opus', inputPerMillion: 4, outputPerMillion: 0, cachedPerMillion: 0 }], 'a cache price left empty or invalid is «not given», 0 is free')
})

test('AI usage: the recommended values fill only what the owner left empty; ceilings count requests then tokens', () => {
  const mine = usage.normalizeUsagePolicy({ purposes: { support: { dailyRequests: 50 }, seo: { cacheHours: 2 } } })
  const filled = usage.withRecommended(mine)
  assert.deepEqual([filled.purposes.support.dailyRequests, filled.purposes.seo.cacheHours, filled.purposes.seo.dailyRequests, filled.purposes.production.dailyRequests, filled.purposes.editor.cacheHours], [50, 2, 300, 300, 0], 'own choices stay; «write again» tools are not cached')
  assert.deepEqual([filled.purposes.support.promptCache, filled.purposes.production.promptCache, filled.purposes.editor.promptCache], [true, true, false], 'the prompt cache where one system prompt serves many requests')
  assert.deepEqual([usage.overCeiling({ dailyRequests: 3, dailyTokens: 0, cacheHours: 0, promptCache: false }, { requests: 3, tokens: 0 }), usage.overCeiling({ dailyRequests: 3, dailyTokens: 100, cacheHours: 0 }, { requests: 2, tokens: 100 }), usage.overCeiling({ dailyRequests: 0, dailyTokens: 0, cacheHours: 0 }, { requests: 1e9, tokens: 1e9 }), usage.overCeiling({ dailyRequests: 3, dailyTokens: 100, cacheHours: 0 }, { requests: 2, tokens: 99 })], ['requests', 'tokens', '', ''])
})

test('AI usage: the site day starts at midnight in Tehran; the same request is the same down to the prompt', () => {
  assert.equal(usage.siteDayStart(new Date('2026-11-11T20:31:00Z')).toISOString(), '2026-11-11T20:30:00.000Z', 'just past midnight local: a new day')
  assert.equal(usage.siteDayStart(new Date('2026-11-11T10:00:00Z')).toISOString(), '2026-11-10T20:30:00.000Z')
  assert.equal(usage.siteDayStart(new Date('2026-11-11T10:00:00Z'), 'UTC').toISOString(), '2026-11-11T00:00:00.000Z')
  const base = { purpose: 'seo', provider: 'groq', model: 'm', baseUrl: '', system: 's', user: 'u', maxTokens: 100, json: false }
  assert.equal(usage.cacheIdentity(base), usage.cacheIdentity({ ...base }))
  for (const change of [{ purpose: 'pages' }, { model: 'm2' }, { user: 'u ' }, { system: 'S' }, { maxTokens: 101 }, { json: true }, { baseUrl: 'http://x' }]) assert.notEqual(usage.cacheIdentity(base), usage.cacheIdentity({ ...base, ...change }), JSON.stringify(change))
})

test('AI usage cost: owner prices against reported tokens, unpriced counted not guessed, totals without a split approximate', () => {
  const prices = [{ provider: 'deepseek', model: 'flash', inputPerMillion: 0.3, outputPerMillion: 1.2 }, { provider: 'groq', model: 'free', inputPerMillion: 0, outputPerMillion: 0 }]
  const cost = usage.estimateCost([
    { purpose: 'support', provider: 'deepseek', model: 'flash', inputTokens: 2_000_000, outputTokens: 500_000, totalTokens: 2_500_000 },
    { purpose: 'seo', provider: 'deepseek', model: 'flash', inputTokens: 0, outputTokens: 0, totalTokens: 1_000_000 },
    { purpose: 'admin', provider: 'groq', model: 'free', inputTokens: 900_000, outputTokens: 100_000, totalTokens: 1_000_000 },
    { purpose: 'admin', provider: 'anthropic', model: 'claude', inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  ], prices)
  assert.deepEqual(cost, { total: 1.5, unpricedTokens: 15, approximate: true, saved: 0, cachedInputTokens: 0, byPurpose: [{ purpose: 'support', cost: 1.2, tokens: 2_500_000 }, { purpose: 'seo', cost: 0.3, tokens: 1_000_000 }, { purpose: 'admin', cost: 0, tokens: 1_000_000 }] })
})

test('AI prompt cache: what each service reports is read the same way, within the input it belongs to', () => {
  const { providerUsage } = loadSource()('src/modules/ai/domain/telemetry.ts')
  assert.deepEqual(providerUsage({ prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } }), { inputTokens: 1000, outputTokens: 50, totalTokens: 1050, cachedInputTokens: 800 }, 'OpenAI, Gemini, Qwen, OpenRouter')
  assert.deepEqual(providerUsage({ prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050, prompt_cache_hit_tokens: 640, prompt_cache_miss_tokens: 360 }), { inputTokens: 1000, outputTokens: 50, totalTokens: 1050, cachedInputTokens: 640 }, 'DeepSeek')
  assert.deepEqual(providerUsage({ input_tokens: 20, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }, 'anthropic'), { inputTokens: 920, outputTokens: 30, totalTokens: 950, cachedInputTokens: 900 }, 'Claude counts the cache apart from input_tokens: the input is all of it')
  assert.deepEqual(providerUsage({ input_tokens: 20, output_tokens: 30, cache_creation_input_tokens: 900 }, 'anthropic'), { inputTokens: 920, outputTokens: 30, totalTokens: 950, cacheWriteTokens: 900 })
  assert.deepEqual(providerUsage({ prompt_tokens: 10, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 11 } }), { inputTokens: 10, outputTokens: 1, totalTokens: 11 }, 'a cached count larger than the input is not believed')
  assert.deepEqual(providerUsage({ prompt_tokens: 10, completion_tokens: 1, prompt_tokens_details: { cached_tokens: '5' } }), { inputTokens: 10, outputTokens: 1, totalTokens: 11 })
})

test('AI prompt cache cost: cached input at the cache price and its saving; without a cache price, input price and approximate', () => {
  const row = { purpose: 'support', provider: 'anthropic', model: 'opus', inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000, cachedInputTokens: 600_000, cacheWriteTokens: 200_000 }
  const priced = usage.estimateCost([row], [{ provider: 'anthropic', model: 'opus', inputPerMillion: 4, outputPerMillion: 20, cachedPerMillion: 0.2, cacheWritePerMillion: 5 }])
  assert.deepEqual([priced.total, priced.saved, priced.cachedInputTokens, priced.approximate], [1.92, 2.28, 600_000, false], '200k at $4, 600k at $0.20, 200k written at $5; saved 600k × $3.80')
  const unpriced = usage.estimateCost([row], [{ provider: 'anthropic', model: 'opus', inputPerMillion: 4, outputPerMillion: 20 }])
  assert.deepEqual([unpriced.total, unpriced.saved, unpriced.approximate], [4, 0, true], 'no cache price: an upper bound, said so')
  const free = usage.estimateCost([{ ...row, cacheWriteTokens: 0 }], [{ provider: 'anthropic', model: 'opus', inputPerMillion: 4, outputPerMillion: 20, cachedPerMillion: 0 }])
  assert.deepEqual([free.total, free.saved, free.approximate], [1.6, 2.4, false], 'a free cache read is 0, not «not given»')
  const readOnly = usage.estimateCost([{ ...row, cacheWriteTokens: 0 }], [{ provider: 'anthropic', model: 'opus', inputPerMillion: 4, outputPerMillion: 20, cacheWritePerMillion: 5 }])
  assert.deepEqual([readOnly.total, readOnly.approximate], [4, true], 'cached input without a read price: approximate, even when the write price is given')
})
