// Real PostgreSQL/Prisma and production crypto/settings/routing; upstream AI is recorded, never billed.
const assert = require('node:assert/strict'), crypto = require('node:crypto'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), keys = ['ai.config.v1', 'egress.proxy.v2'], before = new Map(), last = new Map()
const priorKey = process.env.PANEL_CREDENTIAL_KEY
const sourceLoader = require('./connected-source-loader.cjs')
async function main() {
  try {
    for (const key of keys) before.set(key, await db.setting.findUnique({ where: { key } }))
    process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
    const readJsonSetting = async key => { const row = await db.setting.findUnique({ where: { key } }); return row ? JSON.parse(row.value) : undefined }
    const routeLoad = sourceLoader({ '@/modules/settings/server': { readJsonSetting } })
    const egress = routeLoad('src/modules/social/server/egress.ts'), sent = []
    const load = sourceLoader({
      '@/platform/database/prisma': { db },
      '@/modules/social/server/egress': { ...egress, egressFetch: async (url, init) => {
        sent.push({ url, route: await egress.egressRoute(url), init })
        return new Response('{"choices":[{"message":{"content":"آماده‌ام"}}]}')
      } },
    })
    const client = load('src/modules/ai/server/client.ts'), credentials = load('src/modules/providers/server/panel-credentials.ts')
    const put = async (key, value) => { const raw = JSON.stringify(value); await db.setting.upsert({ where: { key }, create: { key, value: raw }, update: { value: raw } }); last.set(key, raw); egress.forgetSocialProxySetting() }
    await put(keys[0], {})
    await put(keys[1], { profiles: [{ id: 'p1', link: 'synthetic-fixture-only' }], routes: { ai: 'p1' } })
    const apiKey = 'owned-synthetic-ai-key-'.padEnd(400, 'x')
    const saved = await client.saveAiConfig({ provider: 'gemini', apiKey }); last.set(keys[0], (await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value)
    assert(saved.apiKey.length > 400); assert(!last.get(keys[0]).includes(apiKey))
    const read = await client.getAiConfig(); assert.equal(read.apiKey, saved.apiKey); assert.equal(credentials.decryptPanelCredential(read.apiKey), apiKey)
    await client.saveAiConfig({ ...client.publicAiConfig(read), apiKey: '' }); last.set(keys[0], (await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value)
    assert.equal((await client.getAiConfig()).apiKey, saved.apiKey)
    const prompt = { system: 'فارسی', user: 'سلام', maxTokens: 200 }
    assert.equal((await client.generate(prompt)).text, 'آماده‌ام')
    assert.equal(sent[0].route, 'proxy'); assert.equal(sent[0].init.headers.Authorization, `Bearer ${apiKey}`)
    assert.equal(JSON.parse(sent[0].init.body).reasoning_effort, 'none')
    assert.equal(await egress.egressRoute('https://evilgenerativelanguage.googleapis.com/'), 'direct')
    assert.equal(await egress.egressRoute('https://storage.googleapis.com/'), 'direct')
    await put(keys[1], { profiles: [{ id: 'p1', link: 'synthetic-fixture-only' }], routes: {} })
    await client.generate(prompt); assert.equal(sent[1].route, 'direct')
    await db.setting.update({ where: { key: keys[0] }, data: { value: '{broken' } }); last.set(keys[0], '{broken')
    await assert.rejects(client.saveAiConfig({ provider: 'gemini', apiKey: 'replacement' }), /تنظیمات/)
    assert.equal((await db.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value, '{broken')
    console.log('AI connection PostgreSQL passed: encrypted long-key retention, masked resave, Gemini short output, exact host routing, direct opt-out and corrupt-read preservation')
  } finally {
    try {
      for (const [key, value] of last) {
        const old = before.get(key)
        const result = old ? await db.setting.updateMany({ where: { key, value }, data: { value: old.value } }) : await db.setting.deleteMany({ where: { key, value } })
        assert.equal(result.count, 1, 'Concurrent settings are preserved for operator review')
      }
    } finally { if (priorKey === undefined) delete process.env.PANEL_CREDENTIAL_KEY; else process.env.PANEL_CREDENTIAL_KEY = priorKey; await db.$disconnect() }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
