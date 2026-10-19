// Run on the isolated integration database. Restore exact original settings and remove only owned versions/audits.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = `config-history-${Date.now()}`, started = new Date(), keys = ['site.config.v1','site.megamenu.v1','media.library.v1','notifications.policy.v1','extension.businesses.state.v1']
let viewer, fault = false
const historyType = type => `${stamp}:settings-${type}`
const scopedHistory = value => Array.isArray(value) ? value.map(scopedHistory) : value && typeof value === 'object' && !(value instanceof Date) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'entityType' ? typeof item === 'string' ? `${stamp}:${item}` : { in: item.in.map(type => `${stamp}:${type}`) } : scopedHistory(item)])) : value
const wrap = target => new Proxy(target, { get(object, key) {
  if (key === '$transaction') return (work, options) => object.$transaction(tx => work(wrap(tx)), options)
  if (key === 'auditLog') return new Proxy(object.auditLog, { get(model, method) { return method === 'create' ? args => { if (fault) throw Error('injected audit outage'); return model.create(args) } : model[method].bind(model) } })
  if (key === 'contentRevision') return new Proxy(object.contentRevision, { get(model, method) { return typeof model[method] === 'function' ? args => model[method](scopedHistory(args)) : model[method] } })
  return typeof object[key] === 'function' ? object[key].bind(object) : object[key]
} })
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: wrap(prisma) },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: started.toISOString() } : null },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, requireModule: async () => {}, moduleGuard: async () => null, getModuleStates: async () => ({}), getModuleSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
  react: { ...require('react'), cache: fn => fn },
})
const site = load('src/modules/site/server/http/admin/site/route.ts'), nav = load('src/modules/navigation/server/http/routes.ts'), media = load('src/modules/media/server/library/http.ts'), notifications = load('src/modules/notifications/server/http/admin/policy/route.ts'), business = load('src/modules/businesses/server/settings-history.ts'), history = load('src/modules/content/server/http/history.ts')
const req = (path, method = 'GET', body, headers = {}) => new NextRequest('http://site.invalid'+path, { method, headers: { host: 'site.invalid', origin: 'http://site.invalid', 'content-type': 'application/json', ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) })
const restore = (type, version) => history.POST_history(req('/api/admin/history', 'POST', { type: `settings-${type}`, id: 1, version }))
async function main() {
 const original = await prisma.setting.findMany({ where: { key: { in: keys } } })
 try {
  viewer = await prisma.user.create({ data: { email: stamp+'@example.invalid', passwordHash: 'unused', role: 'ADMIN' } })
  let response = await site.GET(req('/api/admin/site')), opened = await response.json(), config = structuredClone(opened.config)
  config.copy = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['fixture'+i, { fa: 'x'.repeat(3500), en: 'y'.repeat(3500) }]))
  config.brand = 'history A'
  config.futureMetadata = { apiKey: 'owned-private-marker' }
  response = await site.PUT(req('/api/admin/site','PUT',config, { 'if-match': opened.revision })); assert.equal(response.status, 200, await response.clone().text())
  const versionA = await prisma.contentRevision.findFirstOrThrow({ where: { entityType: historyType('site'), actorId: viewer.id }, orderBy: { version: 'desc' } })
  assert.ok(JSON.parse(versionA.snapshot).configurationDocument.length > 200000, 'configuration JSON is never truncated')
  assert.ok(!versionA.snapshot.includes('owned-private-marker'), 'unknown and secret configuration never enters presentation history')
  config.brand = 'history B'; delete config.copy
  assert.equal((await site.PUT(req('/api/admin/site','PUT',config))).status, 200)
  const newer = JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value)
  newer.navigation[0].futureMetadata = { owned: 'newer nested metadata' }
  await prisma.setting.update({ where: { key: keys[0] }, data: { value: JSON.stringify(newer) } })
  assert.equal((await restore('site', versionA.version)).status, 200)
  assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value).copy.fixture29.en.length, 3500)
  assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: keys[0] } })).value).navigation[0].futureMetadata.owned, 'newer nested metadata')
  const current = await load('src/modules/navigation/server/megamenu.ts').getMegaConfig(true)
  current.sections.blog.showSearch = !current.sections.blog.showSearch
  response = await nav.POST(req('/api/admin/mega-menu','POST',current)); assert.equal(response.status, 200, await response.clone().text())
  assert.ok(await prisma.contentRevision.findFirst({ where: { entityType: historyType('navigation'), actorId: viewer.id } }))
  let library = await (await media.GET(req('/api/admin/media/library?view=settings'))).json()
  response = await media.POST(req('/api/admin/media/library','POST',{ action: 'settings.save', ...library, value: { ...library.value, maxFileMB: 333 } })); assert.equal(response.status, 200, await response.clone().text())
  assert.equal((await media.POST(req('/api/admin/media/library','POST',{ action: 'settings.save', ...library }))).status, 409)
  const policy = { readDays: 0, unreadDays: 0, digest: { enabled: false, hour: 8 } }
  response = await notifications.PUT(req('/api/admin/notifications','PUT',{ policy })); assert.equal(response.status, 200, await response.clone().text())
  const revision = (await response.json()).revision
  assert.equal((await notifications.PUT(req('/api/admin/notifications','PUT',{ policy: { ...policy, readDays: 5 } }, { 'if-match': 'stale' }))).status, 409)
  await business.saveBusinessSettings(req('/api/admin/extensions','PATCH',{}), viewer, { settings: { 'allow-reports': false } })
  const businessVersion = await prisma.contentRevision.findFirstOrThrow({ where: { entityType: historyType('businesses'), actorId: viewer.id }, orderBy: { version: 'desc' } })
  const safe = JSON.parse(businessVersion.snapshot); assert.equal(safe['allow-reports'], false); assert.ok(!Object.hasOwn(safe, 'enabled'))
  // Restore each owner's baseline through the actual existing history address.
  for (const type of ['navigation','media','notifications','businesses']) {
    const baseline = await prisma.contentRevision.findFirstOrThrow({ where: { entityType: historyType(type) }, orderBy: { version: 'asc' } })
    response = await restore(type, baseline.version); assert.equal(response.status, 200, `${type}: ${await response.clone().text()}`)
  }
  const before = (await prisma.setting.findUniqueOrThrow({ where: { key: keys[3] } })).value
  fault = true
  assert.equal((await notifications.PUT(req('/api/admin/notifications','PUT',{ policy: { ...policy, readDays: 17 } }))).status, 500)
  fault = false
  assert.equal((await prisma.setting.findUniqueOrThrow({ where: { key: keys[3] } })).value, before, 'audit outage rolls configuration back')
  assert.equal((await site.PUT(req('/api/admin/site','PUT',config,{ origin: '' }))).status, 403)
  const manager = await prisma.role.create({ data: { name: stamp, permissions: JSON.stringify(['cms.posts']) } })
  await prisma.user.update({ where: { id: viewer.id }, data: { roleId: manager.id } })
  assert.equal((await restore('site', versionA.version)).status, 403, 'a magazine manager cannot restore site settings')
  await prisma.user.update({ where: { id: viewer.id }, data: { roleId: null } }); await prisma.role.delete({ where: { id: manager.id } })
  console.log('Configuration history: five existing owners, full JSON beyond200k, typed restore, exact permissions, Origin, stale writes and atomic audit rollback passed.')
 } finally {
  for (const key of keys) { const old = original.find(row => row.key === key); if (old) await prisma.setting.upsert({ where: { key }, create: { key, value: old.value }, update: { value: old.value } }); else await prisma.setting.deleteMany({ where: { key } }) }
  if (viewer) {
    await prisma.contentRevision.deleteMany({ where: { entityType: { startsWith: stamp+':' } } })
    await prisma.auditLog.deleteMany({ where: { actorUserId: viewer.id } }); await prisma.user.deleteMany({ where: { email: stamp+'@example.invalid' } })
  }
  await prisma.$disconnect()
 }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
