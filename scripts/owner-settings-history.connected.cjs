// Seven more settings owners in the existing section history: delivery, storefront, returns policy, watermark, SEO,
// registration fields and trust seals. All setting/revision keys map to stamped rows; no site configuration is replaced.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = 'ownerhistory' + Date.now() + process.pid + ':'
let actor, permissions = [], fault = ''
const rewritten = (value, kind, field = '') => Array.isArray(value) ? value.map(item => rewritten(item, kind, field)) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritten(item, kind, key === 'key' || key === 'entityType' ? key : field)])) : typeof value === 'string' && (kind === 'setting' && field === 'key' || kind === 'contentRevision' && field === 'entityType') ? stamp + value : value
function wrap(client) { return new Proxy(client, { get(target, key) {
  if (key === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
  if (['setting', 'contentRevision', 'auditLog'].includes(key)) return new Proxy(target[key], { get(model, method) {
    if (typeof model[method] !== 'function') return model[method]
    return async args => {
      if (fault === key && method === 'create') throw Error('injected ' + key)
      const result = await model[method](['setting', 'contentRevision'].includes(key) ? rewritten(args, key) : args)
      const clean = row => row && typeof row === 'object' ? { ...row, ...(key === 'setting' && typeof row.key === 'string' ? { key: row.key.slice(stamp.length) } : {}), ...(key === 'contentRevision' && typeof row.entityType === 'string' ? { entityType: row.entityType.slice(stamp.length) } : {}) } : row
      return Array.isArray(result) ? result.map(clean) : clean(result)
    }
  } })
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} }) }
const db = wrap(prisma), states = {}, load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db }, '@/platform/cache/kv': { cached: async (_key, _ttl, work) => work(), invalidate: async () => {} },
  '@/platform/observability/logger': { logEvent: () => {}, requestIdFrom: () => stamp }, react: { ...require('react'), cache: fn => fn },
  '@/modules/identity/server/admin-guard': { adminGuard: async (_req, module, perms) => states[module] === false || !perms.some(perm => permissions.includes(perm)) ? { response: new Response('', { status: 403 }) } : { admin: actor } },
  '@/modules/identity/server/access': { requirePerm: async (_req, perm) => (permissions.includes(perm) ? actor : null), requireUser: async () => null },
  '@/extensions/server/modules': { isModuleEnabled: async name => states[name] !== false, getModuleStates: async () => states, getModuleSettings: async () => ({}), moduleGuard: async () => null },
})
const history = load('src/modules/content/server/http/history.ts'), { sectionSettingsRevision } = load('src/modules/settings/server/section-history.ts')
const req = (path, body, headers = {}, method) => new NextRequest('http://localhost:3000' + path, { method: method || (body ? 'POST' : 'GET'), headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
const flip = value => (typeof value === 'boolean' ? !value : value)
// [name, owner file, read, save, state export, key, permission, module, field, value, other field, audit action, audit target]
const owners = [
  ['delivery', 'src/modules/shipping/server/shipping.ts', 'getDeliverySettings', 'saveDeliverySettings', 'deliverySettingsState', 'store.delivery.v1', 'orders.manage', 'store', 'leadDays', 3, 'feeRial', 'store.delivery.update', '0'],
  ['storefront', 'src/modules/store/server/catalog.ts', 'getStoreSettings', 'saveStoreSettings', 'storefrontSettingsState', 'store.merchandising.v1', 'cms.products', 'store', 'lowStockDefault', 7, 'showBrands', 'store.settings.update', '0'],
  ['returns', 'src/modules/store/server/returns.ts', 'getReturnSettings', 'saveReturnSettings', 'returnSettingsState', 'store.returns.v1', 'orders.manage', 'store', 'windowDays', 21, 'requirePhotos', 'store.returns.settings', 'store.returns.v1'],
  ['watermark', 'src/modules/watermark/server/watermark.ts', 'getWatermark', 'saveWatermark', 'watermarkSettingsState', 'media.watermark.v1', 'settings.manage', null, 'opacity', 40, 'shadow', 'watermark.update', 'media.watermark.v1'],
  ['profile-fields', 'src/modules/identity/server/profile-fields.ts', 'getFieldsConfig', 'saveFieldsConfig', 'profileFieldsSettingsState', 'profile.fields.v1', 'users.manage', null, 'usernamePrefix', 'stampuser', 'enforce', 'profile_fields.update', 'profile.fields.v1'],
  ['trust-seals', 'src/modules/site/config/store.ts', 'getTrustSeals', 'saveTrustSeals', 'trustSealsSettingsState', 'site.trust-seals.v1', 'settings.manage', null, 'enabled', null, null, 'trust_seals.update', 'site.trust-seals.v1'],
  ['seo', 'src/modules/seo/server/config.ts', 'getSeoConfig', 'saveSeoConfig', 'seoSettingsState', 'seo.config.v1', 'settings.manage', null, 'homeTitle', 'stamp home', 'allowAiCrawlers', 'seo.config.update', 'seo.config.v1'],
]
async function main() { try {
  actor = await prisma.user.create({ data: { email: stamp.replace(':', '') + '@example.invalid', passwordHash: 'unused' } })
  for (const [name, file, readName, saveName, stateName, key, permission, module, field, rawValue, other, action, target] of owners) {
    permissions = [permission]
    const owner = load(file), read = owner[readName], save = owner[saveName], state = owner[stateName], entity = 'settings-' + name
    const initial = await read(), value = rawValue === null ? flip(initial[field]) : rawValue
    assert.notDeepEqual(initial[field], value, 'fixture changes a real field: ' + name)
    await db.setting.create({ data: { key, value: JSON.stringify({ ...initial, futureSecret: 'never-in-history' }) } })
    const baseline = await state(), context = { req: req('/api/admin/' + name), actor }
    // A save with an actor records baseline + edit and the owner's existing audit envelope, in one transaction.
    const saved = await save({ [field]: value, arbitrarySecret: 'not-allowed' }, { ...context, expected: sectionSettingsRevision(initial) })
    assert.deepEqual(saved[field], value, name)
    const rows = await db.contentRevision.findMany({ where: { entityType: entity, entityId: 1 }, orderBy: { version: 'asc' } })
    assert.deepEqual(rows.map(row => [row.version, row.source]), [[1, 'baseline'], [2, 'edit']], name)
    assert.ok(rows.every(row => !row.snapshot.includes('never-in-history') && !row.snapshot.includes('arbitrarySecret')), name)
    const audit = await prisma.auditLog.findFirst({ where: { actorUserId: actor.id, action }, orderBy: { id: 'desc' } })
    assert.ok(audit, 'existing action name kept: ' + name); assert.equal(audit.targetType, 'setting'); assert.equal(audit.targetId, target)
    let stored = JSON.parse((await db.setting.findUnique({ where: { key } })).value)
    assert.equal(stored.futureSecret, 'never-in-history', 'unknown stored fields survive: ' + name)
    // A stale form is refused and nothing changes.
    const before = (await db.setting.findUnique({ where: { key } })).value
    await assert.rejects(() => save({ [field]: initial[field] }, { ...context, expected: sectionSettingsRevision(initial) }), error => error.status === 409)
    assert.equal((await db.setting.findUnique({ where: { key } })).value, before)
    // A failing revision or audit write rolls the setting back.
    for (const injected of ['contentRevision', 'auditLog']) {
      fault = injected
      await assert.rejects(() => save({ [field]: initial[field] }, context))
      fault = ''; assert.equal((await db.setting.findUnique({ where: { key } })).value, before, injected + ' ' + name)
    }
    // Two different fields saved at once both land.
    if (other) {
      const otherValue = flip(initial[other]) === initial[other] ? initial[other] + 5 : flip(initial[other])
      await Promise.all([save({ [field]: initial[field] }, context), save({ [other]: otherValue }, context)])
      const now = await read(); assert.deepEqual(now[field], initial[field], name); assert.deepEqual(now[other], otherValue, name)
    }
    // History: the guard is the form's own; restoring version 1 brings back exactly the first state.
    permissions = ['journal.author']
    assert.equal((await history.GET_history(req(`/api/admin/history?type=${entity}&id=1`))).status, 403, name)
    permissions = [permission]
    if (module) { states[module] = false; assert.equal((await history.GET_history(req(`/api/admin/history?type=${entity}&id=1`))).status, 403, name); delete states[module] }
    const listed = await (await history.GET_history(req(`/api/admin/history?type=${entity}&id=1`))).json()
    assert.ok(listed.versions.length >= 2, name)
    const restored = await history.POST_history(req('/api/admin/history', { type: entity, id: 1, version: 1 }))
    assert.equal(restored.status, 200, await restored.clone().text()); assert.deepEqual(await state(), baseline, 'restore: ' + name)
    assert.equal(JSON.parse((await db.setting.findUnique({ where: { key } })).value).futureSecret, 'never-in-history', name)
    // A corrupt stored value is never overwritten.
    await db.setting.update({ where: { key }, data: { value: '{corrupt' } })
    await assert.rejects(() => save({ [field]: value }, context))
    assert.equal((await db.setting.findUnique({ where: { key } })).value, '{corrupt', name)
    await db.setting.delete({ where: { key } })
  }
  // SEO on a site that still has only the older single settings: they are written into its key before the first version.
  permissions = ['settings.manage']
  const seo = load('src/modules/seo/server/config.ts')
  await db.contentRevision.deleteMany({ where: { entityType: 'settings-seo' } })
  await db.setting.create({ data: { key: 'seoDescription', value: 'legacy description kept' } })
  await seo.saveSeoConfig({ homeTitle: 'after legacy' }, { req: req('/api/admin/seo'), actor })
  const seoStored = JSON.parse((await db.setting.findUnique({ where: { key: 'seo.config.v1' } })).value)
  assert.equal(seoStored.description, 'legacy description kept'); assert.equal(seoStored.homeTitle, 'after legacy')
  assert.match(seoStored.indexNow.key, /^[a-f0-9]{32}$/, 'an IndexNow key is made once')
  const keyBefore = seoStored.indexNow.key
  await seo.saveSeoConfig({ homeTitle: 'again', indexNow: { enabled: true, key: '' } }, { req: req('/api/admin/seo'), actor })
  assert.equal(JSON.parse((await db.setting.findUnique({ where: { key: 'seo.config.v1' } })).value).indexNow.key, keyBefore, 'a blank key from the form keeps the existing one')
  const seoBaseline = await db.contentRevision.findFirst({ where: { entityType: 'settings-seo', entityId: 1, source: 'baseline' }, orderBy: { version: 'desc' } })
  assert.match(seoBaseline.snapshot, /legacy description kept/, 'the first version is what the site showed')
  // One route end to end: Origin, If-Match, answer shape and the 409 that keeps the form's input.
  permissions = ['settings.manage']
  const seals = load('src/modules/site/server/http/admin/trust-seals.ts')
  let response = await seals.GET_seals(req('/api/admin/trust-seals')), data = await response.json()
  assert.equal(response.status, 200); assert.ok(data.config && data.settingsRevision)
  const revision = data.settingsRevision, config = { ...data.config, enabled: !data.config.enabled }
  assert.equal((await seals.PUT_seals(req('/api/admin/trust-seals', { config }, { origin: '' }, 'PUT'))).status, 403)
  response = await seals.PUT_seals(req('/api/admin/trust-seals', { config }, { 'if-match': revision }, 'PUT')); data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data)); assert.equal(data.config.enabled, config.enabled); assert.equal(data.settingsRevision, sectionSettingsRevision(data.config))
  response = await seals.PUT_seals(req('/api/admin/trust-seals', { config: { ...config, enabled: !config.enabled } }, { 'if-match': revision }, 'PUT'))
  assert.equal(response.status, 409); assert.equal((await load('src/modules/site/config/store.ts').getTrustSeals()).enabled, config.enabled)
  console.log('Seven owner settings (SEO with its one-time legacy seed): owner/API/history transactions, audit envelopes, stale refusal, rollback, restore, corruption and guards passed.')
} finally {
  await prisma.contentRevision.deleteMany({ where: { entityType: { startsWith: stamp } } })
  await prisma.setting.deleteMany({ where: { key: { startsWith: stamp } } })
  if (actor) { await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } }); await prisma.user.deleteMany({ where: { id: actor.id } }) }
  await prisma.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
