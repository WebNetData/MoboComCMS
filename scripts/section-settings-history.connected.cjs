// All logical settings/revision keys map to owned rows; no site configuration is replaced.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = 'sectionhistory' + Date.now() + process.pid + ':'
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
  '@/extensions/server/modules': { isModuleEnabled: async name => states[name] !== false, getModuleStates: async () => states, getModuleSettings: async () => ({}) },
})
const history = load('src/modules/content/server/http/history.ts'), { sectionSettingsRevision } = load('src/modules/settings/server/section-history.ts')
const req = (path, body, headers = {}) => new NextRequest('http://localhost:3000' + path, { method: body ? 'POST' : 'GET', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
const owners = [
  ['journal', 'Journal', 'admin', 'journal.home.v1', 'cms.posts', 'pageSize', 36, 'autoApproveComments', true],
  ['cinema', 'Cinema', 'admin', 'cinema.portal.v1', 'cinema.manage', 'shelfSize', 18, 'showImdb', false],
  ['music', 'Music', 'admin', 'music.portal.v1', 'music.manage', 'latestSize', 30, 'showLyrics', false],
  ['games', 'Games', 'portal', 'games.portal.v1', 'games.manage', 'libraryEnabled', false, 'showMemberScore', false],
  ['software', 'Software', 'admin', 'software.portal.v1', 'software.manage', 'shelfSize', 12, 'staleDays', 120],
]
async function main() { try {
  actor = await prisma.user.create({ data: { email: stamp.replace(':', '') + '@example.invalid', passwordHash: 'unused' } })
  for (const [name, title, address, key, permission, field, value, other, otherValue] of owners) {
    permissions = [permission]
    const owner = load(`src/modules/${name}/server/${address}.ts`), api = load(`src/modules/${name}/server/http/routes.ts`), save = owner['save' + title + 'Settings'], get = owner['get' + title + 'Settings']
    const entity = 'settings-' + name, url = '/api/admin/' + name + '/settings', initial = await get(true)
    assert.notEqual(initial[field], value, 'fixture changes a real field: ' + name)
    await db.setting.create({ data: { key, value: JSON.stringify({ ...initial, futureSecret: 'never-in-history', rails: initial.rails.map(row => ({ ...row, futureMetadata: 'never-in-history' })) }) } })
    let response = await api.GET_settings(req(url)), data = await response.json()
    assert.equal(response.status, 200); assert.equal(data.settingsRevision, sectionSettingsRevision(initial))
    const stale = data.settingsRevision
    response = await api.POST_settings(req(url, { [field]: value, arbitrarySecret: 'not-allowed' }, { 'if-match': stale }))
    assert.equal(response.status, 200, await response.clone().text()); data = await response.json()
    assert.equal(data.settings[field], value)
    const audit = await prisma.auditLog.findFirst({ where: { actorUserId: actor.id, action: name + '.settings.update' }, orderBy: { id: 'desc' } })
    assert.ok(audit, 'existing action name remains compatible'); assert.equal(audit.targetType, 'setting'); assert.equal(audit.targetId, '0')
    assert.deepEqual(JSON.parse(audit.metadata), { ...(name === 'games' ? { hero: data.settings.heroIds.length } : {}), rails: data.settings.rails.filter(row => row.enabled).length })
    const rows = await db.contentRevision.findMany({ where: { entityType: entity, entityId: 1 }, orderBy: { version: 'asc' } })
    assert.deepEqual(rows.map(row => [row.version, row.source]), [[1, 'baseline'], [2, 'edit']])
    assert.ok(rows.every(row => !row.snapshot.includes('never-in-history') && !row.snapshot.includes('arbitrarySecret')))
    let stored = JSON.parse((await db.setting.findUnique({ where: { key } })).value)
    assert.equal(stored.futureSecret, 'never-in-history'); assert.ok(stored.rails.every(row => row.futureMetadata === 'never-in-history'))
    const before = (await db.setting.findUnique({ where: { key } })).value
    assert.equal((await api.POST_settings(req(url, { [other]: otherValue }, { 'if-match': stale }))).status, 409)
    assert.equal((await db.setting.findUnique({ where: { key } })).value, before)
    for (const injected of ['contentRevision', 'auditLog']) {
      fault = injected
      response = await api.POST_settings(req(url, { [other]: otherValue }, { 'if-match': data.settingsRevision }))
      fault = ''; assert.equal(response.status, 500); assert.equal((await db.setting.findUnique({ where: { key } })).value, before)
      assert.equal(await db.contentRevision.count({ where: { entityType: entity } }), 2)
    }
    // Simultaneous sparse changes and first-row creation retain both fields, including strict history writes.
    const context = { req: req(url), actor }
    await Promise.all([save({ [field]: initial[field] }, context), save({ [other]: otherValue }, context)])
    assert.equal((await get(true))[field], initial[field]); assert.equal((await get(true))[other], otherValue)
    stored = JSON.parse((await db.setting.findUnique({ where: { key } })).value)
    const reordered = [...(await get(true)).rails].reverse()
    await save({ rails: reordered }, context)
    assert.ok(JSON.parse((await db.setting.findUnique({ where: { key } })).value).rails.every(row => row.futureMetadata === 'never-in-history'))
    response = await history.POST_history(req('/api/admin/history', { type: entity, id: 1, version: 1 }))
    assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual(await get(true), initial)
    assert.equal(JSON.parse((await db.setting.findUnique({ where: { key } })).value).futureSecret, stored.futureSecret)
    const restored = (await db.setting.findUnique({ where: { key } })).value
    assert.equal((await api.POST_settings(req(url, { [field]: value }, { origin: '' }))).status, 403)
    assert.equal((await api.POST_settings(req(url, { [field]: value }, { origin: 'https://unrelated.invalid' }))).status, 403)
    permissions = ['journal.author', name === 'journal' ? 'cinema.manage' : 'cms.posts']
    assert.equal((await api.POST_settings(req(url, { [field]: value }))).status, 403)
    assert.equal((await history.GET_history(req(`/api/admin/history?type=${entity}&id=1`))).status, 403)
    permissions = ['settings.manage'] // Retain the existing configuration-manager fallback.
    assert.equal((await api.POST_settings(req(url, {}))).status, 200)
    states[name] = false
    assert.equal((await history.GET_history(req(`/api/admin/history?type=${entity}&id=1`))).status, 403)
    delete states[name]; permissions = [permission]
    await db.setting.update({ where: { key }, data: { value: '{corrupt' } })
    assert.equal((await api.GET_settings(req(url))).status, 409)
    assert.equal((await api.POST_settings(req(url, { [field]: value }))).status, 409)
    assert.equal((await db.setting.findUnique({ where: { key } })).value, '{corrupt')
    await db.setting.delete({ where: { key } })
    await Promise.all([save({ [field]: value }, context), save({ [other]: otherValue }, context)])
    assert.equal((await get(true))[field], value); assert.equal((await get(true))[other], otherValue)
    assert.ok(restored.length > 0)
  }
  console.log('Five section settings: actual owner/API/history transactions, compatibility, claims, corruption, permissions and rollback passed.')
} finally {
  await prisma.contentRevision.deleteMany({ where: { entityType: { startsWith: stamp } } })
  await prisma.setting.deleteMany({ where: { key: { startsWith: stamp } } })
  if (actor) { await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } }); await prisma.user.deleteMany({ where: { id: actor.id } }) }
  await prisma.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
