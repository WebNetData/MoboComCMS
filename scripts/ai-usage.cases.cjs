// Usage ceilings, the answer cache and cost estimates of the site's paid AI (ai/domain/usage).
const { test } = require('node:test'), assert = require('node:assert/strict'), loadSource = require('./connected-source-loader.cjs')
const usage = loadSource()('src/modules/ai/domain/usage.ts'), { AI_PURPOSES } = loadSource()('src/modules/ai/domain/routing.ts')

test('AI usage policy: every purpose present and bounded, unknown ones and junk ignored, prices unique', () => {
  const open = usage.normalizeUsagePolicy('junk')
  assert.deepEqual(Object.keys(open.purposes).sort(), AI_PURPOSES.map(p => p.id).sort())
  assert.ok(Object.values(open.purposes).every(v => v.dailyRequests === 0 && v.dailyTokens === 0 && v.cacheHours === 0), 'nothing limited or cached until the owner says so')
  const policy = usage.normalizeUsagePolicy({ purposes: { support: { dailyRequests: '120.9', dailyTokens: -5, cacheHours: 99999 }, nonsense: { dailyRequests: 1 } }, prices: [
    { provider: 'groq', model: 'llama', inputPerMillion: '0.59', outputPerMillion: -1 }, { provider: 'groq', model: 'llama', inputPerMillion: 9 }, { provider: '', model: 'x' }, { provider: 'gemini<script>', model: 'flash', inputPerMillion: 0.123456789 },
  ] })
  assert.deepEqual(policy.purposes.support, { dailyRequests: 120, dailyTokens: 0, cacheHours: 720 })
  assert.equal(policy.purposes.nonsense, undefined)
  assert.deepEqual(policy.prices, [{ provider: 'groq', model: 'llama', inputPerMillion: 0.59, outputPerMillion: 0 }, { provider: 'geminiscript', model: 'flash', inputPerMillion: 0.1235, outputPerMillion: 0 }])
})

test('AI usage: the recommended values fill only what the owner left empty; ceilings count requests then tokens', () => {
  const mine = usage.normalizeUsagePolicy({ purposes: { support: { dailyRequests: 50 }, seo: { cacheHours: 2 } } })
  const filled = usage.withRecommended(mine)
  assert.deepEqual([filled.purposes.support.dailyRequests, filled.purposes.seo.cacheHours, filled.purposes.seo.dailyRequests, filled.purposes.production.dailyRequests, filled.purposes.editor.cacheHours], [50, 2, 300, 300, 0], 'own choices stay; «write again» tools are not cached')
  assert.deepEqual([usage.overCeiling({ dailyRequests: 3, dailyTokens: 0, cacheHours: 0 }, { requests: 3, tokens: 0 }), usage.overCeiling({ dailyRequests: 3, dailyTokens: 100, cacheHours: 0 }, { requests: 2, tokens: 100 }), usage.overCeiling({ dailyRequests: 0, dailyTokens: 0, cacheHours: 0 }, { requests: 1e9, tokens: 1e9 }), usage.overCeiling({ dailyRequests: 3, dailyTokens: 100, cacheHours: 0 }, { requests: 2, tokens: 99 })], ['requests', 'tokens', '', ''])
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
  assert.deepEqual(cost, { total: 1.5, unpricedTokens: 15, approximate: true, byPurpose: [{ purpose: 'support', cost: 1.2, tokens: 2_500_000 }, { purpose: 'seo', cost: 0.3, tokens: 1_000_000 }, { purpose: 'admin', cost: 0, tokens: 1_000_000 }] })
})
