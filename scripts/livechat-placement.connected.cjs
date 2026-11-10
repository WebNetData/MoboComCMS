// Real PostgreSQL canonical Settings and livechat application functions; external services are boundaries only.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client'), db = new PrismaClient(), cache = new Map()
const key = 'livechat.v1'
let cachedReads = 0
const mocks = {
  '@/platform/database/prisma': { db },
  '@/platform/cache/kv': { cached: async (key, ttl, work) => { cachedReads++; return work() }, invalidate: async () => {} },
  '@/platform/observability/logger': { logEvent: () => {} },
  '@/modules/notifications/server/inbox': { createInboxEvent: async () => { throw Error('unexpected notification') } },
  '@/platform/realtime/bus': { publish: async () => { throw Error('unexpected chat event') } },
  '@/extensions/server/modules': { isModuleEnabled: async () => true },
}
function load(relative) {
  const file = path.resolve(relative)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
      // JSON manifests (the extension catalog) are data, not modules.
      if (base.endsWith('.json')) return JSON.parse(fs.readFileSync(base, 'utf8'))
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  let original, captured = false, finalValue
  try {
    original = await db.setting.findUnique({ where: { key } }); captured = true
    const service = load('src/modules/livechat/server/livechat.ts')
    const { chatShownOn } = load('src/modules/livechat/domain/livechat.ts')
    // Keep all pre-existing stored fields; own sentinel verifies forward-compatible preservation.
    const prior = original ? JSON.parse(original.value) : {}
    await db.setting.upsert({ where: { key }, create: { key, value: JSON.stringify({ ...prior, places: ['store'], ownedPlacementProbe: true }) }, update: { value: JSON.stringify({ ...prior, places: ['store'], ownedPlacementProbe: true }) } })
    assert.deepEqual((await service.getChatSettings()).places, ['store'])
    assert.deepEqual((await service.visitorState(null, null)).places, ['store'], 'visitor receives canonical selection')
    assert.equal(cachedReads, 0, 'placement reads current storage instead of an older route cache')
    const settingsOwner = load('src/modules/settings/server.ts')
    await settingsOwner.readJsonSetting(key)
    assert.equal(cachedReads, 1, 'existing unqualified Settings readers keep their cached behavior')
    assert.equal(chatShownOn((await service.getChatSettings()).places, '/products/test'), true)
    assert.equal(chatShownOn((await service.getChatSettings()).places, '/music'), false)
    await service.saveChatSettings({ botName: 'Owned placement probe' })
    assert.deepEqual((await service.getChatSettings()).places, ['store'], 'older clients retain omitted places')
    await Promise.all([service.saveChatSettings({ places: ['music', 'games'] }), service.saveChatSettings({ welcome: 'Owned concurrent greeting' })])
    let current = await service.getChatSettings()
    assert.deepEqual(current.places, ['music', 'games']); assert.equal(current.welcome, 'Owned concurrent greeting')
    assert.equal(JSON.parse((await db.setting.findUniqueOrThrow({ where: { key } })).value).ownedPlacementProbe, true)
    assert.equal(chatShownOn(current.places, '/games/a'), true); assert.equal(chatShownOn(current.places, '/cart'), false)
    await service.saveChatSettings({ places: [] })
    assert.deepEqual((await service.getChatSettings()).places, [])
    for (const route of ['/', '/products', '/music']) assert.equal(chatShownOn((await service.getChatSettings()).places, route), true)
    await assert.rejects(service.saveChatSettings(null), /معتبر نیست/)
    finalValue = (await db.setting.findUniqueOrThrow({ where: { key } })).value
    console.log('Livechat placement: real Settings/visitor projection/store/multiple/all/omitted fields/concurrent patches/unknown field retention passed')
  } finally {
    try {
      if (captured) {
        // No concurrent owner edit should be silently overwritten by fixture cleanup.
        const current = await db.setting.findUnique({ where: { key } })
        if (finalValue && current?.value !== finalValue) throw Error('Livechat setting changed outside fixture; refusing cleanup overwrite')
        if (original) await db.setting.upsert({ where: { key }, create: original, update: { value: original.value } })
        else await db.setting.deleteMany({ where: { key } })
      }
    } finally { await db.$disconnect() }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
