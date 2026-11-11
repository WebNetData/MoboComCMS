// Ceilings, the answer cache and cost of the site's paid AI on real PostgreSQL, through the real generateApi, usage
// owner, telemetry and settings. The AI service is a double behind the egress boundary, so every real request is counted;
// nothing leaves the machine. The usage policy is put back as it was.
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'ai-usage-check'
const assert = require('node:assert/strict'), loadSource = require('./connected-source-loader.cjs'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), seed = `aiusage${Date.now()}`, started = new Date()
const sent = []
// A check that stops early (a promise left hanging) has not passed.
let finished = false
process.on('exit', () => { if (!finished && !process.exitCode) { console.error('stopped before the end'); process.exitCode = 1 } })
const egress = {
  egressRoute: async () => 'direct',
  egressFetch: async (url, init) => {
    const body = JSON.parse(init.body)
    sent.push(body.messages.map(m => m.content).join('|'))
    return new Response(JSON.stringify({ choices: [{ message: { content: `answer ${sent.length}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 } }), { headers: { 'content-type': 'application/json' } })
  },
}
const load = loadSource({ '@/platform/database/prisma': { db: prisma }, '@/modules/social/server/egress': egress })
const client = load('src/modules/ai/server/client.ts'), usage = load('src/modules/ai/server/usage.ts')
const config = { provider: 'custom', baseUrl: 'http://ai.double.invalid/v1', model: `${seed}-model`, apiKey: '', voice: '', botName: '' }
const ask = (purpose, user = 'same question') => client.generateApi({ system: 'be brief', user: `${seed} ${user}`, maxTokens: 50 }, config, { purpose })
const req = new NextRequest('http://site.invalid/api/admin/ai/usage', { method: 'PUT', headers: { origin: 'http://site.invalid' } })

async function main() {
  const before = await prisma.setting.findUnique({ where: { key: 'ai.usage.v1' } })
  const actor = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  try {
    const at = async purpose => (await usage.usageToday(purpose)).requests
    const base = { seo: await at('seo'), pages: await at('pages'), journal: await at('journal') }
    await usage.saveUsagePolicy({ purposes: { seo: { dailyRequests: base.seo + 2 }, pages: { dailyTokens: (await usage.usageToday('pages')).tokens + 150 }, prompts: { cacheHours: 1 } }, prices: [{ provider: 'custom', model: config.model, inputPerMillion: 1, outputPerMillion: 2 }] }, { req, actor })
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'ai.usage.update', actorUserId: actor.id } }), 'the change is audited')

    // ---- a daily request ceiling: what is over it is refused before anything is sent, and not counted as use
    assert.equal((await ask('seo', 'one')).text, 'answer 1')
    assert.equal((await ask('seo', 'two')).text, 'answer 2')
    await assert.rejects(ask('seo', 'three'), e => e.status === 429 && /سقف روزانهٔ درخواست/.test(e.message))
    await assert.rejects(ask('seo', 'four'), e => e.status === 429)
    assert.equal(sent.length, 2, 'nothing sent over the ceiling')
    assert.equal(await at('seo'), base.seo + 2, 'refusals are not use')
    assert.equal(await prisma.aiInvocation.count({ where: { purpose: 'seo', errorKind: 'limit', startedAt: { gte: started } } }), 2, 'each refusal is noted for monitoring')
    assert.equal((await ask('journal', 'other')).text, 'answer 3', 'another purpose has its own day')

    // ---- a daily token ceiling counts the tokens the service reported
    await ask('pages', 'a'); await ask('pages', 'b')
    await assert.rejects(ask('pages', 'c'), e => e.status === 429 && /توکن/.test(e.message))
    assert.equal(sent.length, 5)

    // ---- the cache: the same request within its time is answered without a request; any change asks again
    const first = await ask('prompts', 'improve this')
    const again = await ask('prompts', 'improve this')
    assert.deepEqual([again.text, sent.length], [first.text, 6], 'no second request for the same request')
    await ask('prompts', 'improve that')
    assert.equal(sent.length, 7, 'another prompt is another request')
    await ask('editor', 'polish'); await ask('editor', 'polish')
    assert.equal(sent.length, 9, 'a purpose without cache asks every time («write again» gets a new answer)')
    assert.equal(await prisma.aiInvocation.count({ where: { purpose: 'prompts', transport: 'cache', startedAt: { gte: started } } }), 1, 'a cache answer is noted, free')

    // ---- cost at the owner's price: 60 input + 40 output tokens per real request, $1 and $2 per million
    const cost = await usage.usageCost(started)
    const real = await prisma.aiInvocation.count({ where: { model: config.model, transport: 'api', status: 'SUCCEEDED', startedAt: { gte: started } } })
    assert.equal(real, 9)
    assert.equal(cost.total, Math.round(real * (60 * 1 + 40 * 2) / 1e6 * 10_000) / 10_000)
    assert.ok(cost.cachedAnswers >= 1 && cost.refusedByCeiling >= 3)
    assert.ok(cost.byPurpose.some(row => row.purpose === 'seo' && row.tokens >= 200))

    // ---- a lookup that does not answer in time never holds up a request
    const t0 = Date.now()
    assert.equal(await usage.bounded(new Promise(() => {}), undefined, 60), null)
    assert.ok(Date.now() - t0 < 1000)
    const aborted = AbortSignal.abort()
    assert.equal(await usage.bounded(new Promise(() => {}), aborted), null, 'the caller gave up: no wait at all')
    assert.equal(await usage.bounded(Promise.reject(Error('db down'))), null, 'an unreadable policy: no ceiling, no cache')
    assert.equal(await usage.bounded(Promise.resolve(7)), 7)
    finished = true
    console.log('PostgreSQL AI usage: request and token ceilings refuse before sending and are not use, per-purpose days, audited policy, the answer cache (hit, miss, purposes without cache), cost at owner prices and bounded lookups passed')
  } finally {
    if (before) await prisma.setting.update({ where: { key: 'ai.usage.v1' }, data: { value: before.value } }); else await prisma.setting.deleteMany({ where: { key: 'ai.usage.v1' } })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.aiInvocation.deleteMany({ where: { startedAt: { gte: started }, model: config.model } })
    await prisma.auditLog.deleteMany({ where: { actorEmail: { startsWith: seed } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
