// Native PostgreSQL; only external inference is doubled. No real provider calls.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), stamp = 'ownedground' + Date.now(), ids = [], users = [], observations = []
assert(/test|check/.test(new URL(process.env.DATABASE_URL).pathname))
let modules = true, allowed = true, mode = 'success', lastPrompt, calls = 0, indexed = new Date().toISOString(), sourceId
const wrapped = new Proxy(db, { get(target, key) {
  if (key === 'setting') return new Proxy(target.setting, { get(model, method) {
    if (method === 'findUnique') return async args => args.where.key === 'search.indexedAt' ? { key: 'search.indexedAt', value: indexed } : model.findUnique(args)
    return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
  } })
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} })
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: wrapped }, '@/platform/observability/logger': { logEvent: () => {} },
  '@/platform/cache/kv': { cached: async (key, ttl, work) => work(), invalidate: async () => {} },
  '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  '@/extensions/server/modules': { isModuleEnabled: async () => modules, getModuleStates: async () => ({}), moduleGuard: async () => modules ? null : new Response('{}', { status: 423 }) },
  '@/modules/settings/server': { getSettings: async () => ({ brandName: 'Owned' }) },
  '@/modules/identity/server/access': { requirePerm: async () => allowed ? { id: users[0] } : null, resolveCurrentUser: async id => db.user.findFirst({ where: { id, status: 'ACTIVE' } }) },
  '@/modules/ai/server/generation': { generate: async prompt => {
    calls++; lastPrompt = prompt
    if (mode === 'private') await db.post.update({ where: { id: sourceId }, data: { access: 'MEMBERS' } })
    if (mode === 'changed') await db.post.update({ where: { id: sourceId }, data: { excerpt: 'changed authoritative facts' } })
    return { text: '[MOBOCOM] راهنمای همین سایت [S2]', model: 'owned-test' }
  } },
})
const sources = load('src/modules/livechat/server/knowledge.ts'), assistant = load('src/modules/livechat/server/assistant.ts'), settingsOwner = load('src/modules/livechat/server/settings.ts'), metrics = load('src/modules/ai/server/telemetry.ts'), monitoring = load('src/modules/ai/server/monitoring.ts'), api = load('src/modules/ai/server/http/monitoring.ts')
const config = { enabled: true, types: ['post'], maxSources: 3 }
async function main() {
  const previous = await db.setting.findUnique({ where: { key: 'livechat.v1' } })
  try {
    for (const name of ['own-private-name', 'other-private-name']) users.push((await db.user.create({ data: { email: stamp + name + '@invalid.test', passwordHash: 'unused', name } })).id)
    for (const [suffix, data] of [['public', {}], ['vip', { access: 'MEMBERS' }], ['draft', { status: 'DRAFT' }], ['group', { audienceGroups: '["private"]' }], ['future', { publishedAt: new Date(Date.now() + 86400000) }]]) {
      const post = await db.post.create({ data: { slug: stamp + suffix, title: stamp + ' راهنمای سفارش', content: 'current-public-body-' + suffix, excerpt: 'current-public-summary-' + suffix, publishedAt: new Date(Date.now() - 5000), ...data } })
      ids.push(post.id)
      await db.searchDocument.create({ data: { itemType: 'post', itemId: post.id, title: post.title, text: stamp + ' indexed-private-stale-secret', url: '/blog/' + post.slug, publishedAt: new Date(Date.now() - 5000) } })
    }
    sourceId = ids[0]
    let found = await sources.supportSources(stamp, '', config)
    assert.equal(found.filter(s => s.ref).length, 1, 'VIP/draft/group/future content excluded')
    assert(found.some(s => s.text.includes('current-public-summary-public')))
    assert(!JSON.stringify(found).includes('indexed-private-stale-secret'), 'stale SearchDocument text never enters prompt')
    await db.post.update({ where: { id: sourceId }, data: { views: { increment: 1 } } })
    assert(await sources.sourcesStillPublic(found), 'view-only timestamp changes do not reject a reply')
    modules = false; assert.equal((await sources.supportSources(stamp, '', config)).filter(s => s.ref).length, 0); modules = true
    const value = JSON.stringify({ grounding: config, botEnabled: true, knowledge: '' })
    await db.setting.upsert({ where: { key: 'livechat.v1' }, create: { key: 'livechat.v1', value }, update: { value } })
    const chat = await db.chatConversation.create({ data: { token: stamp, userId: users[0] } })
    try {
      await db.chatMessage.create({ data: { conversationId: chat.id, sender: 'VISITOR', body: stamp } })
      let answer = await assistant.answerSupport(chat, await settingsOwner.getChatSettings())
      assert.equal(answer.outcome, 'grounded'); assert(answer.body.includes('/blog/' + stamp + 'public'))
      assert(lastPrompt.user.includes('own-private-name')); assert(!lastPrompt.user.includes('other-private-name')); assert(!lastPrompt.system.includes('own-private-name'))
      mode = 'private'; answer = await assistant.answerSupport(chat, await settingsOwner.getChatSettings()); assert.equal(answer.outcome, 'source_changed'); assert(!answer.body.includes('current-public'))
      await db.post.update({ where: { id: sourceId }, data: { access: 'PUBLIC' } })
      mode = 'changed'; answer = await assistant.answerSupport(chat, await settingsOwner.getChatSettings()); assert.equal(answer.outcome, 'source_changed')
      const count = calls; await db.user.update({ where: { id: users[0] }, data: { status: 'BANNED' } }); assert.equal(await assistant.answerSupport(chat, await settingsOwner.getChatSettings()), null); assert.equal(calls, count)
    } finally { await db.chatConversation.delete({ where: { id: chat.id } }) }
    const success = await metrics.observeAi({ purpose: 'support', provider: 'owned-test', model: 'owned-model' }, async (attempt, usage) => { attempt(); attempt(); usage({ inputTokens: 4, outputTokens: 6, totalTokens: 10 }); return 'private-response-not-stored' })
    observations.push(success.observationId); await metrics.supportOutcome(success.observationId, 'grounded')
    let row = await db.aiInvocation.findUniqueOrThrow({ where: { id: success.observationId } }); assert.equal(row.attempts, 2); assert.equal(row.totalTokens, 10); assert.equal(row.status, 'SUCCEEDED'); assert(!JSON.stringify(row).includes('private-response'))
    const unknown = await metrics.observeAi({ purpose: 'support', provider: 'owned-test', model: 'owned-model' }, async attempt => { attempt(); return 'ok' }); observations.push(unknown.observationId)
    assert.equal((await db.aiInvocation.findUniqueOrThrow({ where: { id: unknown.observationId } })).totalTokens, null)
    await assert.rejects(metrics.observeAi({ purpose: 'support', provider: 'owned-failure', model: 'owned-model' }, async attempt => { attempt(); throw Object.assign(Error('secret-key-and-private-prompt'), { status: 429, credentialReason: 'quota' }) }))
    row = await db.aiInvocation.findFirstOrThrow({ where: { provider: 'owned-failure' }, orderBy: { startedAt: 'desc' } }); observations.push(row.id); assert.equal(row.status, 'FAILED'); assert.equal(row.errorKind, 'quota'); assert(!JSON.stringify(row).includes('secret-key'))
    const report = await monitoring.aiMonitoring({ days: 1, purpose: 'support' }); assert(report.knownUsage >= 1); assert(report.recent.length <= 50); assert(report.recent.some(r => r.totalTokens === null))
    const req = new NextRequest('https://owned.test/api/admin/ai/monitoring'); assert.equal((await api.GET(req)).status, 200); allowed = false; assert.equal((await api.GET(req)).status, 403); allowed = true; modules = false; assert.equal((await api.GET(req)).status, 423)
    let attempts = 0
    const unavailable = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: { aiInvocation: { create: async () => { throw Error('db unavailable') } } } }, '@/platform/observability/logger': { logEvent: () => {} } })('src/modules/ai/server/telemetry.ts')
    assert.equal((await unavailable.observeAi({ provider: 'owned', model: 'test' }, async attempt => { attempt(); attempts++; return 'ok' })).value, 'ok'); assert.equal(attempts, 1, 'telemetry outage never replays inference')
    console.log('Native PG grounded support: canonical search/cards privacy, stale-index exclusion, source-change guard, own-user isolation, citations; durable sanitized metrics, unknown usage, permission/module guards and fail-open recording passed')
  } finally {
    await db.aiInvocation.deleteMany({ where: { id: { in: observations.filter(Boolean) } } }); await db.searchDocument.deleteMany({ where: { itemType: 'post', itemId: { in: ids } } }); await db.post.deleteMany({ where: { id: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: users } } })
    if (previous) await db.setting.upsert({ where: { key: 'livechat.v1' }, create: previous, update: { value: previous.value } }); else await db.setting.deleteMany({ where: { key: 'livechat.v1' } })
    await db.$disconnect()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
