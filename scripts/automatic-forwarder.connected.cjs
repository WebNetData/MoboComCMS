// Real PostgreSQL/Identity/Settings CAS/strict audit; only physical fixture setting keys are namespaced.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server'), { encode } = require('next-auth/jwt')
const prisma = new PrismaClient(), stamp = 'automatic-forwarder-' + Date.now() + '-' + process.pid, secret = 'owned-forwarder-fixture-not-a-credential', cache = new Map()
const keys = new Set(['forwarder.v1', 'extension.forwarder.state.v1', 'site.config.v1', 'security.policy.v1'])
const scoped = key => keys.has(key) ? stamp + '.' + key : key
let auditOutage = false
function wrap(client) { return new Proxy(client, { get(target, key) {
  if (key === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
  if (key === 'setting') return new Proxy(target.setting, { get(model, method) { return args => {
    const next = structuredClone(args)
    if (typeof next.where?.key === 'string') next.where.key = scoped(next.where.key)
    else if (next.where?.key?.in) next.where.key.in = next.where.key.in.map(scoped)
    if (next.data?.key) next.data.key = scoped(next.data.key)
    return model[method](next).then(result => Array.isArray(result) ? result.map(row => ({ ...row, key: row.key?.startsWith(stamp + '.') ? row.key.slice(stamp.length + 1) : row.key })) : result)
  } } })
  if (key === 'auditLog') return new Proxy(target.auditLog, { get(model, method) { if (method === 'create' && auditOutage) return () => { throw Error('owned audit outage') }; return typeof model[method] === 'function' ? model[method].bind(model) : model[method] } })
  return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} }) }
const db = wrap(prisma)
function load(file) {
  const base = path.resolve(file), full = fs.existsSync(base) && fs.statSync(base).isFile() ? base : ['.ts', '.tsx', '/index.ts'].map(ext => base + ext).find(fs.existsSync)
  if (!full) throw Error('Missing ' + file)
  if (cache.has(full)) return cache.get(full).exports
  if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'))
  const mod = { exports: {} }; cache.set(full, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/platform/config/env') return { authSecret: () => secret }
    if (name === '@/platform/observability/logger') return { logEvent: () => {}, requestIdFrom: () => stamp }
    if (name.startsWith('@/')) return load('src/' + name.slice(2))
    if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  const users = [], roles = []; let page
  const put = (key, value) => prisma.setting.upsert({ where: { key: scoped(key) }, create: { key: scoped(key), value: typeof value === 'string' ? value : JSON.stringify(value) }, update: { value: typeof value === 'string' ? value : JSON.stringify(value) } })
  try {
    for (const permissions of [['forwarder.manage'], ['music.manage'], ['settings.manage']]) roles.push(await prisma.role.create({ data: { name: stamp + '-' + roles.length, permissions: permissions.join(',') } }))
    for (const role of roles) users.push(await prisma.user.create({ data: { email: stamp + '-' + role.id + '@example.invalid', passwordHash: 'not-a-login-password', role: 'ADMIN', roleId: role.id } }))
    page = await prisma.page.create({ data: { slug: stamp, title: 'Owned automatic links', status: 'PUBLISHED', content: '<p><a href="https://outside.example/a%2Fb?q=a%26b#part">old link</a></p>' } })
    const before = await prisma.page.findUnique({ where: { id: page.id } })
    await put('extension.forwarder.state.v1', { enabled: true, settings: {} }); await put('security.policy.v1', { requireAdmin2fa: false })
    const owner = load('src/modules/forwarder/server/forwarder.ts'), route = load('src/modules/forwarder/server/http/routes.ts')
    const request = async (settings, user = users[0], origin = 'http://localhost') => {
      const token = user ? await encode({ secret, token: { uid: String(user.id), authAt: Date.now() }, maxAge: 600 }) : ''
      return new NextRequest('http://localhost/api/admin/forwarder', { method: settings ? 'PUT' : 'GET', headers: { ...(origin ? { Origin: origin } : {}), ...(user ? { Cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}` } : {}), 'Content-Type': 'application/json' }, ...(settings ? { body: JSON.stringify({ settings }) } : {}) })
    }
    assert.equal((await route.GET_admin(await request(null, null))).status, 403)
    assert.equal((await route.PUT_admin(await request({ autoExternalLinks: true }, users[1]))).status, 403)
    assert.equal((await route.PUT_admin(await request({ autoExternalLinks: true }, users[0], 'https://foreign.invalid'))).status, 403)
    assert.equal((await route.PUT_admin(await request({ autoExternalLinks: true }, users[0], ''))).status, 403)
    assert.equal((await route.PUT_admin(await request({ autoExternalLinks: 'true' }))).status, 422)
    // Race first creation with independent fields, then race existing aggregate updates.
    const first = await Promise.all([route.PUT_admin(await request({ autoExternalLinks: true })), route.PUT_admin(await request({ countdown: 9 }, users[2]))])
    assert(first.every(response => response.status === 200))
    let stored = JSON.parse((await prisma.setting.findUnique({ where: { key: scoped('forwarder.v1') } })).value)
    assert.equal(stored.autoExternalLinks, true); assert.equal(stored.countdown, 9)
    await put('forwarder.v1', { ...stored, futureMetadata: { retained: true } })
    await Promise.all([owner.saveForwarderSettings({ title: 'Owned title' }), owner.saveForwarderSettings({ message: 'Owned message' })])
    stored = JSON.parse((await prisma.setting.findUnique({ where: { key: scoped('forwarder.v1') } })).value)
    assert.equal(stored.title, 'Owned title'); assert.equal(stored.message, 'Owned message'); assert.deepEqual(stored.futureMetadata, { retained: true })
    assert.equal((await owner.getAutomaticForwarderPolicy()).enabled, true)
    await owner.saveForwarderSettings({ allowRawUrls: false })
    const target = 'https://outside.example/a%2Fb?q=a%26b&x=2#part'
    let result = await owner.resolveForward('', { count: false, automatic: true, rawTarget: target })
    assert.equal(result.url, target); assert.equal(result.bypass, false)
    assert.equal((await owner.resolveForward('', { count: false, rawTarget: target })).reason, 'raw-off')
    for (const patch of [{ autoExternalLinks: false }, { autoExternalLinks: true, enabled: false }]) {
      await owner.saveForwarderSettings(patch)
      assert.equal((await owner.getAutomaticForwarderPolicy()).enabled, false)
      result = await owner.resolveForward('', { count: false, automatic: true, rawTarget: target })
      assert.equal(result.ok, true); assert.equal(result.bypass, true); assert.equal(result.url, target)
    }
    await owner.saveForwarderSettings({ enabled: true, autoExternalLinks: true, blockedHosts: ['blocked.example'] })
    assert.equal((await owner.resolveForward('', { count: false, automatic: true, rawTarget: 'https://sub.blocked.example/a' })).reason, 'blocked')
    for (const url of ['javascript:alert(1)', 'http://127.0.0.1/a', 'https://u:p@outside.example']) assert.equal((await owner.resolveForward('', { count: false, automatic: true, rawTarget: url })).reason, 'invalid')
    await put('extension.forwarder.state.v1', { enabled: false, settings: {} })
    assert.equal((await owner.getAutomaticForwarderPolicy()).enabled, false)
    assert.equal((await owner.resolveForward('', { count: false, automatic: true, rawTarget: target })).bypass, true)
    assert.equal((await route.PUT_admin(await request({ countdown: 2 }))).status, 404)
    await put('extension.forwarder.state.v1', { enabled: true, settings: {} })
    const saved = (await prisma.setting.findUnique({ where: { key: scoped('forwarder.v1') } })).value
    auditOutage = true; await assert.rejects(route.PUT_admin(await request({ countdown: 2 })), /owned audit outage/); auditOutage = false
    assert.equal((await prisma.setting.findUnique({ where: { key: scoped('forwarder.v1') } })).value, saved)
    await put('forwarder.v1', '{broken')
    await assert.rejects(owner.saveForwarderSettings({ countdown: 3 }), /invalid stored JSON/)
    assert.equal((await prisma.setting.findUnique({ where: { key: scoped('forwarder.v1') } })).value, '{broken')
    assert.equal((await owner.getAutomaticForwarderPolicy()).enabled, false)
    assert.deepEqual(await prisma.page.findUnique({ where: { id: page.id } }), before)
    assert(await prisma.auditLog.count({ where: { actorUserId: { in: users.map(user => user.id) }, action: 'forwarder.settings' } }) >= 2)
    console.log('Automatic Forwarder PG: real guards/Origin, sparse first-row/existing-field CAS races, unknown fields, settings/extension disable and stale URL bypass, exact encoded URL, unsafe/blocked refusal, strict audit rollback, corrupt-state refusal and unchanged old content passed.')
  } finally {
    auditOutage = false
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users.map(user => user.id) } } })
    await prisma.setting.deleteMany({ where: { key: { startsWith: stamp + '.' } } })
    if (page) await prisma.page.delete({ where: { id: page.id } })
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); await prisma.role.deleteMany({ where: { id: { in: roles.map(role => role.id) } } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
