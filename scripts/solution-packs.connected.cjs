// Disposable fixture: real PostgreSQL package, extension, Identity and strict Audit owners.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
if (process.argv.includes('--single-connection')) { const url = new URL(process.env.DATABASE_URL); url.searchParams.set('connection_limit', '1'); process.env.DATABASE_URL = url.toString() }
const prisma = new PrismaClient(), id = `owned-solution-${Date.now()}`, packageKey = `package.${id}.v1`, indexKey = 'packages.index.v1', policyKey = 'security.policy.v1', siteKey = 'site.config.v1'
const stateKeys = ['extension.store.state.v1', 'storeEnabled', 'extension.reviews.state.v1', 'extension.businesses.state.v1', 'extension.mobocom-pay.state.v1', 'billing.mobocom-pay.v1']
const cache = new Map(), authAt = Date.now() - 5000, snapshots = new Map(); let actor, payRole, auditFault = false, signedIn = true
const catalog = ['store', 'reviews', 'businesses', 'mobocom-pay'].map(name => require(`../src/plugins/${name}/manifest.json`))
// A synthetic secret definition exercises the real owner's secret exclusion without
// introducing a secret-bearing production manifest or storing a real credential.
catalog.find(item => item.id === 'store').settings.push({ key: 'owned.secret', label: 'Fixture secret', type: 'secret' })
function wrap(client) {
  return new Proxy(client, { get(target, name) {
    if (name === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
    if (name === 'auditLog') return new Proxy(target.auditLog, { get(model, method) {
      if (method === 'create') return args => { if (auditFault) throw Error('owned audit failure'); return model.create(args) }
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
    } })
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name]
  } })
}
const db = wrap(prisma)
function load(relative) {
  const file = path.resolve(relative)
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'))
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === 'next-auth/jwt') return { getToken: async () => signedIn ? { uid: actor.id, authAt } : null }
    if (name === '@/platform/config/env') return { authSecret: () => 'owned-jwt-decoder-fixture' }
    if (name === '@/extensions/generated/catalog') return { extensionCatalog: catalog, extensionById: new Map(catalog.map(item => [item.id, item])), extensionPermissionIds: [] }
    if (name === '@/extensions/generated/server-registry') return { serverPlugins: {} }
    if (name === '@/themes/generated/catalog') return { codeThemeCatalog: [] }
    if (name === '@/themes/registry') return { bundledThemes: [] }
    if (name === 'react') return { cache: fn => fn }
    if (name === '@/modules/catalog/server/storefront') return { isStoreEnabled: async () => false }
    if (name === '@/modules/public-api/server/availability') return { isPublicApiEnabled: async () => false }
    if (name === '@/platform/observability/logger') return { logEvent: () => {}, requestIdFrom: () => id }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const p = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
      return load(path.extname(p) ? p : fs.existsSync(p + '.ts') ? p + '.ts' : path.join(p, 'index.ts'))
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function put(key, value) { await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }) }
async function main() {
  try {
    for (const key of [packageKey, indexKey, policyKey, siteKey, ...stateKeys]) snapshots.set(key, await prisma.setting.findUnique({ where: { key } }))
    actor = await prisma.user.create({ data: { email: `${id}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN' } })
    await put(policyKey, '{"requireAdmin2fa":false}')
    await put(stateKeys[0], JSON.stringify({ enabled: false, settings: { 'seo.title': 'existing customer title' } }))
    await put(stateKeys[1], 'false')
    await put(stateKeys[2], JSON.stringify({ enabled: false, settings: {} }))
    await put(stateKeys[3], JSON.stringify({ enabled: false, settings: {} }))
    await put(stateKeys[4], JSON.stringify({ enabled: false, settings: {} }))
    await put(stateKeys[5], JSON.stringify(load('src/modules/billing/domain/pay-policy.ts').defaults()))
    const store = load('src/modules/packages/server/store.ts'), solution = load('src/modules/packages/server/solution-packs.ts'), http = load('src/modules/packages/server/http/solution.ts')
    const manifest = { id, name: 'Owned solution', version: '1.0.0', kind: 'plugin', runtime: 'declarative', solutionPack: { apiVersion: 1, modules: [
      { id: 'businesses' }, { id: 'reviews' }, { id: 'store', defaults: { 'seo.title': 'do not overwrite', 'seo.description': 'suggested description' } },
    ], recommendations: ['promo-banner'] } }
    const upload = value => store.installEntries(new Map([['manifest.json', Buffer.from(JSON.stringify(value))]]), actor.email)
    await upload(manifest)
    const req = new NextRequest('http://owned.invalid/api/admin/packages/' + id + '/solution', { headers: { origin: 'http://owned.invalid' } }), context = { req, actor }
    const params = { params: Promise.resolve({ id }) }, get = () => http.GET(req, params)
    const post = (token, origin = 'http://owned.invalid') => http.POST(new NextRequest(req.url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token }) }), params)
    for (const modules of [
      [{ id: 'unknown-module' }],
      [{ id: 'businesses' }], // reviews is off and must not be silently enabled
      [{ id: 'reviews' }, { id: 'businesses', defaults: { 'allow-claims': true } }], // specialized owner
      [{ id: 'store', version: '^99.0.0' }],
      [{ id: 'store', defaults: { 'unknown.secret': 'value' } }],
      [{ id: 'store', defaults: { 'owned.secret': 'fixture-only' } }],
    ]) {
      await upload({ ...manifest, solutionPack: { apiVersion: 1, modules } })
      const states = await prisma.setting.findMany({ where: { key: { in: stateKeys } }, orderBy: { key: 'asc' } })
      await assert.rejects(solution.previewSolutionPack(id, context), 'invalid module, version, dependency or settings must refuse')
      assert.deepEqual(await prisma.setting.findMany({ where: { key: { in: stateKeys } }, orderBy: { key: 'asc' } }), states, 'refused preview never changes extension states')
    }
    await upload(manifest)
    const rows = () => prisma.setting.findMany({ where: { key: { in: [packageKey, indexKey, ...stateKeys] } }, orderBy: { key: 'asc' } })
    const audits = () => prisma.auditLog.findMany({ where: { actorUserId: actor.id }, orderBy: { id: 'asc' } })
    const before = await rows(), auditBefore = await audits()
    assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } })).value).enabled, false)
    const preview = await solution.previewSolutionPack(id, context)
    assert.deepEqual(preview.modules.map(item => item.id), ['reviews', 'businesses', 'store'])
    assert.deepEqual(preview.modules[2].preserved, ['seo.title'])
    assert.deepEqual(preview.modules[2].defaults, { 'seo.description': 'suggested description' })
    assert.deepEqual(await rows(), before, 'installation and preview do not apply configuration')
    assert.deepEqual(await audits(), auditBefore, 'preview produces no audit writes')
    signedIn = false; assert.equal((await get()).status, 403); signedIn = true
    assert.equal((await post(preview.token, 'http://foreign.invalid')).status, 403)
    await upload({ ...manifest, description: 'new package bytes' })
    assert.equal((await post(preview.token)).status, 409, 'changed artifact requires a new preview')
    await upload(manifest)
    const sameSource = await solution.previewSolutionPack(id, context)
    await put(stateKeys[0], JSON.stringify({ enabled: false, settings: { 'seo.title': 'changed concurrently' } }))
    assert.equal((await post(sameSource.token)).status, 409, 'stale settings require a new preview')
    await put(stateKeys[0], JSON.stringify({ enabled: false, settings: { 'seo.title': 'existing customer title' } }))
    const fresh = await solution.previewSolutionPack(id, context), rollbackRows = await rows(), rollbackAudits = await audits()
    auditFault = true; assert.equal((await post(fresh.token)).status, 500); auditFault = false
    assert.deepEqual(await rows(), rollbackRows, 'audit failure rolls back every module, index and receipt')
    assert.deepEqual(await audits(), rollbackAudits)
    await prisma.user.update({ where: { id: actor.id }, data: { status: 'SUSPENDED' } })
    assert.equal((await post(fresh.token)).status, 403, 'current Identity standing is required')
    await prisma.user.update({ where: { id: actor.id }, data: { status: 'ACTIVE' } })
    const responses = process.argv.includes('--single-connection') ? [await post(fresh.token)] : await Promise.all([post(fresh.token), post(fresh.token)])
    for (const response of responses) assert.equal(response.status, 200, 'concurrent applies reconcile')
    const results = await Promise.all(responses.map(response => response.json()))
    assert.equal(results.filter(item => !item.alreadyApplied).length, 1, 'only one apply creates a receipt')
    if (results.length === 2) assert.equal(results.filter(item => item.alreadyApplied).length, 1)
    const result = results.find(item => !item.alreadyApplied)
    const state = JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[0] } })).value)
    assert.equal(state.enabled, true); assert.equal(state.settings['seo.title'], 'existing customer title'); assert.equal(state.settings['seo.description'], 'suggested description')
    assert.equal((await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[1] } })).value, 'true', 'legacy module mirror updated')
    assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[2] } })).value).enabled, true)
    assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[3] } })).value).enabled, true)
    assert.equal((await audits()).filter(row => row.action === 'package.solution.apply').length, 1)
    assert.equal((await (await post(fresh.token)).json()).alreadyApplied, true)
    assert.equal((await audits()).filter(row => row.action === 'package.solution.apply').length, 1, 'repeat retains one receipt/audit')
    const installed = await store.loadPackage(id); assert.deepEqual(installed.solutionApply, result.receipt)
    const plain = { id, name: 'Owned ordinary plugin', version: '1.0.0', kind: 'plugin', runtime: 'declarative' }
    await upload(plain); await store.setPackageEnabled(id, true)
    assert.equal((await store.loadPackage(id)).enabled, true)
    await upload(manifest)
    assert.equal((await store.loadPackage(id)).enabled, false, 'upgrading an enabled ordinary plugin to a solution pack deactivates it')
    assert.deepEqual((await store.loadPackage(id)).solutionApply, result.receipt, 'upgrade keeps previous receipt')
    await upload(plain); await store.setPackageEnabled(id, true)
    await store.writePackageFile(id, 'manifest.json', JSON.stringify(manifest), actor.email, context)
    assert.equal((await store.loadPackage(id)).enabled, false, 'editing an enabled ordinary plugin into a solution pack deactivates it')
    assert.deepEqual((await store.loadPackage(id)).solutionApply, result.receipt, 'manifest edit keeps previous receipt')
    await store.deletePackage(id); await upload(manifest)
    assert.deepEqual((await store.loadPackage(id)).solutionApply, result.receipt, 'uninstall/reinstall retains receipt')
    assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[0] } })).value).settings['seo.title'], 'existing customer title')
    const dependentPack = { ...manifest, version: '1.0.1', solutionPack: { apiVersion: 1, modules: [{ id: 'businesses' }] } }
    await upload(dependentPack)
    const dependentPlan = await solution.previewSolutionPack(id, context)
    const dependentApply = await solution.applySolutionPack(id, dependentPlan.token, context)
    assert.equal(dependentApply.alreadyApplied, false)
    await put(stateKeys[2], JSON.stringify({ enabled: false, settings: {} }))
    await put(stateKeys[3], JSON.stringify({ enabled: false, settings: {} }))
    const afterOff = await rows(), auditAfterOff = await audits()
    const replay = await solution.applySolutionPack(id, dependentPlan.token, context)
    assert.equal(replay.alreadyApplied, true)
    assert.deepEqual(replay.receipt, dependentApply.receipt, 'identical artifact returns historical receipt')
    assert.deepEqual(await rows(), afterOff, 'replay never re-enables target or undeclared disabled dependency')
    assert.deepEqual(await audits(), auditAfterOff, 'replay creates no new audit')

    // MoboComPay uses the same extension owner, but its financial settings and
    // Pay-specific permissions remain owned by Billing and Identity respectively.
    const payPack = { ...manifest, version: '1.0.2', solutionPack: { apiVersion: 1, modules: [{ id: 'mobocom-pay', version: '^1.0.0' }] } }
    await assert.rejects(upload({ ...payPack, solutionPack: { apiVersion: 1, modules: [{ id: 'mobocom-pay', defaults: { incomingEnabled: true } }] } }), /invalid default key/, 'financial camelCase fields are not a module default contract')
    await upload({ ...payPack, solutionPack: { apiVersion: 1, modules: [{ id: 'mobocom-pay', defaults: { 'incoming.enabled': true } }] } })
    const payBeforeInvalid = await rows()
    await assert.rejects(solution.previewSolutionPack(id, context), 'a pack cannot alter Pay incoming configuration via an undeclared default')
    assert.deepEqual(await rows(), payBeforeInvalid, 'invalid Pay defaults never change module or billing settings')
    await upload(payPack)
    const payRowsBefore = await rows(), payAuditsBefore = await audits()
    const paySettingsBefore = await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[5] } })
    const paySettings = JSON.parse(paySettingsBefore.value)
    assert.equal(paySettings.incomingEnabled, false); assert.equal(paySettings.providerId, '')
    const payPlan = await solution.previewSolutionPack(id, context)
    assert.equal(payPlan.modules.find(item => item.id === 'mobocom-pay').enabled, false)
    assert.deepEqual(await rows(), payRowsBefore, 'install and preview never enable MoboComPay or change its settings')
    assert.deepEqual(await audits(), payAuditsBefore)

    payRole = await prisma.role.create({ data: { name: `${id}-pay-only`, permissions: 'mobocom-pay.manage' } })
    await prisma.user.update({ where: { id: actor.id }, data: { roleId: payRole.id } })
    try {
      assert.equal((await get()).status, 403, 'Pay management alone cannot preview a Solution Pack')
      assert.equal((await post(payPlan.token)).status, 403, 'Pay management alone cannot apply a Solution Pack')
      await assert.rejects(solution.applySolutionPack(id, payPlan.token, context), /forbidden/, 'the transactional owner rechecks current settings.manage')
      assert.deepEqual(await rows(), payRowsBefore, 'refused Pay-only actor cannot change the plan or settings')
    } finally { await prisma.user.update({ where: { id: actor.id }, data: { roleId: null } }) }

    const usersBeforePay = await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, role: true, roleId: true } })
    const rolesBeforePay = await prisma.role.findMany({ orderBy: { id: 'asc' }, select: { id: true, permissions: true } })
    const merchantsBeforePay = await prisma.payMerchant.count()
    const payApply = await solution.applySolutionPack(id, payPlan.token, context)
    assert.equal(payApply.alreadyApplied, false)
    assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[4] } })).value).enabled, true)
    assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: stateKeys[5] } }), paySettingsBefore, 'provisioning does not activate incoming or modify canonical Pay settings')
    assert.equal(await prisma.payMerchant.count(), merchantsBeforePay, 'module provisioning creates no merchants')
    assert.deepEqual(await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, role: true, roleId: true } }), usersBeforePay, 'module provisioning grants no user roles')
    assert.deepEqual(await prisma.role.findMany({ orderBy: { id: 'asc' }, select: { id: true, permissions: true } }), rolesBeforePay, 'module provisioning grants no role permissions')
    const extensionOwner = load('src/extensions/server/state.ts')
    await extensionOwner.saveExtensionState('mobocom-pay', { enabled: false })
    const payAfterDisable = await rows(), auditsAfterDisable = await audits()
    const payReplay = await solution.applySolutionPack(id, payPlan.token, context)
    assert.equal(payReplay.alreadyApplied, true)
    assert.deepEqual(payReplay.receipt, payApply.receipt, 'receipt is retained after disabling Pay')
    assert.deepEqual(await rows(), payAfterDisable, 'replay never re-enables Pay or changes billing settings')
    assert.deepEqual(await audits(), auditsAfterDisable, 'Pay replay creates no new audit')

    const bad = JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } })).value); bad.solutionApply = { fingerprint: 'broken' }
    await put(packageKey, JSON.stringify(bad)); await assert.rejects(solution.previewSolutionPack(id, context), /invalid stored data/)
    assert.equal((await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } })).value, JSON.stringify(bad), 'corrupt receipt preserved')
    console.log('Actual PG Solution Pack: inert install/preview, dependency order, preserved defaults, stale preview, Identity/Origin, strict Audit rollback, mirrors, idempotent apply and retained receipt; MoboComPay settings/permissions remain separate.')
  } finally {
    auditFault = false; signedIn = true
    if (actor) await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } })
    for (const [key, row] of snapshots) { if (row) await put(key, row.value); else await prisma.setting.deleteMany({ where: { key } }) }
    if (actor) await prisma.user.deleteMany({ where: { id: actor.id, email: actor.email } })
    if (payRole) await prisma.role.deleteMany({ where: { id: payRole.id, name: payRole.name } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
