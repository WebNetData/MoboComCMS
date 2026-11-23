// Connected recovery acceptance: real package owner, Identity, strict Audit and PostgreSQL.
// Run only against a disposable database whose name contains "_test_".
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto'), ts = require('typescript-api')
const { hostname } = require('node:os'), { spawnSync } = require('node:child_process')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')

const dbUrl = new URL(process.env.DATABASE_URL || 'invalid:')
assert.ok(decodeURIComponent(dbUrl.pathname.slice(1)).includes('_test_'), 'DATABASE_URL must name a disposable _test_ database')
assert.ok(!process.getuid || process.getuid() !== 0, 'run as a non-root user')
const prisma = new PrismaClient(), cache = new Map(), authAt = Date.now() - 5000
const id = `owned-apply-${randomUUID().replaceAll('-', '').slice(0, 16)}`
const themeId = `${id}-theme`, themeKey = `package.${themeId}.v1`, siteKey = 'site.config.v1'
const packageKey = `package.${id}.v1`, indexKey = 'packages.index.v1', policyKey = 'security.policy.v1', lockKey = 'packages.code-apply.v1'
const source = path.resolve('src/plugins', id), workspaceRoot = path.resolve('var/package-code-apply')
const generated = ['src/extensions/generated/catalog.ts', 'src/extensions/generated/client-registry.ts', 'src/extensions/generated/server-registry.ts', 'src/themes/generated/catalog.ts', 'src/themes/generated/client-registry.ts', 'src/themes/generated/server-registry.ts', 'src/themes/generated.css']
const savedGenerated = new Map(generated.map(name => [name, fs.readFileSync(name)]))
const savedEnv = Object.fromEntries(['PACKAGE_APPLY_MODE','PACKAGE_GIT_TOKEN','PACKAGE_GIT_REPO','PACKAGE_GIT_BRANCH','PACKAGE_GIT_API','PACKAGE_DEPLOY_WEBHOOK','PACKAGE_DEPLOY_TOKEN'].map(key => [key, process.env[key]]))
let actor, role, faultAction, fsHook, indexBefore, policyBefore, lockBefore, siteBefore, dependencyBefore, dependencyKey, sourceOwned = false, outsideReadHook
const operations = new Set()

function wrap(target) {
  return new Proxy(target, { get(t, name) {
    if (name === '$transaction') return (work, options) => t.$transaction(tx => work(wrap(tx)), options)
    if (name === 'setting' && t === prisma) return new Proxy(t.setting, { get(model, method) {
      if (method === 'findUnique') return async args => {
        const row = await model.findUnique(args)
        if (outsideReadHook && args.where?.key === packageKey) { const hook = outsideReadHook; outsideReadHook = undefined; await hook(row) }
        return row
      }
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
    } })
    if (name === 'auditLog') return new Proxy(t.auditLog, { get(model, method) {
      if (method === 'create') return args => { if (args.data.action === faultAction) throw Error('injected strict audit failure'); return model.create(args) }
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
    } })
    return typeof t[name] === 'function' ? t[name].bind(t) : t[name]
  } })
}
const db = wrap(prisma)
const fileProxy = new Proxy(fs.promises, { get(target, name) {
  if (['writeFile','rename'].includes(name)) return async (...args) => { if (fsHook) await fsHook(name, ...args); return target[name](...args) }
  return typeof target[name] === 'function' ? target[name].bind(target) : target[name]
} })
function resolveLocal(base) {
  for (const candidate of [base, base + '.ts', base + '.tsx', base + '.json', path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  throw Error(`Cannot resolve ${base}`)
}
function load(filename) {
  const file = resolveLocal(path.resolve(filename))
  if (file.endsWith('.json')) return require(file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText
  const localRequire = name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === 'next-auth/jwt') return { getToken: async () => ({ uid: actor.id, authAt }) }
    if (name === '@/platform/config/env') return { authSecret: () => 'owned-fixture' }
    if (name === '@/platform/observability/logger') return { logEvent: () => {}, requestIdFrom: () => id }
    if (name === 'node:fs/promises') return fileProxy
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.startsWith('@/')) return load(path.resolve('src', name.slice(2)))
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name))
    return require(name)
  }
  try { new Function('require', 'module', 'exports', '__filename', '__dirname', compiled)(localRequire, mod, mod.exports, file, path.dirname(file)) }
  catch (error) { cache.delete(file); throw error }
  return mod.exports
}
function safeRemove(target, parent, expected) {
  const absolute = path.resolve(target)
  assert.equal(path.dirname(absolute), parent)
  assert.equal(path.basename(absolute), expected)
  fs.rmSync(absolute, { recursive: true, force: true })
}
async function restoreSetting(key, before) {
  if (before) await prisma.setting.upsert({ where: { key }, create: before, update: { value: before.value } })
  else await prisma.setting.deleteMany({ where: { key } })
}
async function main() {
  try {
    assert.equal(path.dirname(source), path.resolve('src/plugins'))
    assert.equal(fs.existsSync(source), false)
    indexBefore = await prisma.setting.findUnique({ where: { key: indexKey } })
    policyBefore = await prisma.setting.findUnique({ where: { key: policyKey } })
    lockBefore = await prisma.setting.findUnique({ where: { key: lockKey } })
    siteBefore = await prisma.setting.findUnique({ where: { key: siteKey } })
    assert.ok(!lockBefore || lockBefore.value === 'null', 'disposable DB must not contain an active apply lock')
    await prisma.setting.upsert({ where: { key: policyKey }, create: { key: policyKey, value: '{"requireAdmin2fa":false}' }, update: { value: '{"requireAdmin2fa":false}' } })
    role = await prisma.role.create({ data: { name: id, permissions: 'extensions.code' } })
    actor = await prisma.user.create({ data: { email: `${id}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
    const identity = load('src/modules/identity/server/access.ts'), store = load('src/modules/packages/server/store.ts')
    const apply = load('src/modules/packages/server/code-apply.ts')
    const req = new NextRequest(`http://owned.invalid/api/admin/packages/${id}/apply`, { method: 'POST', headers: { origin: 'http://owned.invalid' } })
    const currentActor = await identity.requirePerm(req, 'extensions.code')
    assert.ok(currentActor); assert.equal(await identity.requirePerm(req, 'settings.manage'), null)
    const context = { req, actor: currentActor }
    const manifest = { id, name: id, version: '1.0.0', kind: 'plugin', runtime: 'code', apiVersion: 1 }
    const entries = new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))], ['index.ts', Buffer.from('export const updated = true\n')]])
    await store.installEntries(entries, actor.email)
    fs.mkdirSync(source); sourceOwned = true
    fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify(manifest))
    fs.writeFileSync(path.join(source, 'index.ts'), 'export const original = true\n')
    process.env.PACKAGE_APPLY_MODE = 'local'; delete process.env.PACKAGE_DEPLOY_WEBHOOK
    const run = () => apply.applyCodePackage(id, actor.email, undefined, context)
    const track = async () => { const pkg = await store.loadPackage(id); if (pkg.codeApply) operations.add(pkg.codeApply.id); return pkg }
    const audits = action => prisma.auditLog.count({ where: { targetType: 'package', targetId: id, action } })
    const assertUnlocked = async () => assert.equal(JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: lockKey } })).value), null)
    const cancel = () => apply.cancelCodeApply(id, actor.email, undefined, context)

    faultAction = 'package.code.prepare'
    await assert.rejects(run, /injected strict audit failure/); faultAction = undefined
    assert.equal((await store.loadPackage(id)).codeApply, undefined)
    assert.deepEqual(await prisma.setting.findUnique({ where: { key: lockKey } }), lockBefore)
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /original/)
    console.log('ok prepare audit rollback')

    let revoked = false
    fsHook = async (name, file) => { if (!revoked && name === 'writeFile' && String(file).includes(`${path.sep}staged${path.sep}`)) { revoked = true; await prisma.user.update({ where: { id: actor.id }, data: { status: 'SUSPENDED' } }) } }
    await assert.rejects(run); fsHook = undefined; assert.ok(revoked)
    let pending = await track(); assert.notEqual(pending.codeApply.phase, 'applied')
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /original/)
    await prisma.user.update({ where: { id: actor.id }, data: { status: 'ACTIVE' } }); identity.clearAdminPolicyCache()
    console.log('ok staging authority revocation')

    const namespace = createHash('sha256').update(fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8') + fs.readlinkSync('/proc/self/ns/pid')).digest('hex')
    const staleLock = { packageId: id, operationId: pending.codeApply.id, runner: randomUUID(), until: Date.now() - 1000, namespace }
    const setLock = value => prisma.setting.update({ where: { key: lockKey }, data: { value: JSON.stringify(value) } })
    await setLock({ ...staleLock, host: hostname(), pid: process.pid })
    await assert.rejects(run, undefined, 'expired local runner belonging to live process cannot be stolen')
    await setLock({ ...staleLock, host: 'unverified-other-host.invalid', pid: process.pid })
    await assert.rejects(run, undefined, 'expired local runner on unknown host cannot be stolen')
    const child = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' })
    assert.equal(child.status, 0); assert.ok(child.pid > 0)
    assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH', 'fixture process must be proven dead')
    await setLock({ ...staleLock, host: hostname(), pid: child.pid, namespace: 'unverified-container' })
    await assert.rejects(run, undefined, 'same hostname does not prove the same process namespace')
    await setLock({ ...staleLock, host: hostname(), pid: child.pid })
    let crashed = false
    fsHook = async (name, from, to) => { if (!crashed && name === 'rename' && path.resolve(from) === source) { crashed = true; await fs.promises.rename(from, to); throw Error('injected rename crash') } }
    await assert.rejects(run, /injected rename crash/); fsHook = undefined; assert.ok(crashed)
    pending = await track(); const operationId = pending.codeApply.id
    assert.equal(fs.existsSync(source), false)
    assert.match(fs.readFileSync(path.join(workspaceRoot, operationId, 'previous', 'index.ts'), 'utf8'), /original/)
    await assert.rejects(() => store.writePackageFile(id, 'index.ts', 'edit', actor.email))
    await assert.rejects(() => store.installEntries(entries, actor.email))
    await assert.rejects(() => store.deletePackage(id))
    await run(); assert.equal((await track()).codeApply.id, operationId)
    await assertUnlocked()
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /updated/)
    assert.equal(await audits('package.code.apply'), 1)
    assert.equal((await store.loadPackage(id)).revisions.filter(rev => rev.note.includes(`code apply ${operationId}`)).length, 1)
    await run(); assert.equal(await audits('package.code.apply'), 1)
    console.log('ok local crash recovery and replay')
    console.log('ok expired local lease live, unknown and dead process fencing')

    await store.writePackageFile(id, 'index.ts', 'export const second = true\n', actor.email)
    faultAction = 'package.code.apply'; await assert.rejects(run, /injected strict audit failure/); faultAction = undefined
    pending = await track(); assert.equal(pending.codeApply.phase, 'effect')
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /second/)
    await run(); await run(); assert.equal(await audits('package.code.apply'), 2)
    await assertUnlocked()
    console.log('ok final audit recovery')

    await store.writePackageFile(id, 'index.ts', 'export const staleCancel = true\n', actor.email)
    const operationOwner = load('src/modules/packages/server/code-apply/operation.ts')
    const localTarget = createHash('sha256').update(JSON.stringify({ mode: 'local', destination: process.cwd(), webhook: '' })).digest('hex')
    const prepared = await operationOwner.beginApply(id, localTarget, 'local', actor.email, context)
    assert.equal(prepared.codeApply.phase, 'prepared'); assert.equal(prepared.codeApply.local, undefined)
    let raced = false
    outsideReadHook = async row => {
      assert.equal(JSON.parse(row.value).codeApply.id, prepared.codeApply.id)
      assert.equal(JSON.parse(row.value).codeApply.local, undefined)
      faultAction = 'package.code.apply'
      try { await assert.rejects(run, /injected strict audit failure/) } finally { faultAction = undefined }
      raced = true
      assert.equal((await track()).codeApply.phase, 'effect')
      assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /staleCancel/)
    }
    await cancel(); assert.ok(raced)
    pending = await track(); assert.equal(pending.codeApply.id, prepared.codeApply.id); assert.equal(pending.codeApply.phase, 'cancelled')
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /second/); await assertUnlocked()
    console.log('ok cancellation reloads receipt after concurrent apply')

    await store.writePackageFile(id, 'index.ts', 'export const cancelAudit = true\n', actor.email)
    faultAction = 'package.code.apply'; await assert.rejects(run, /injected strict audit failure/); faultAction = undefined
    const cancelOperation = (await track()).codeApply
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /cancelAudit/)
    faultAction = 'package.code.cancel'; await assert.rejects(cancel, /injected strict audit failure/); faultAction = undefined
    pending = await track(); assert.equal(pending.codeApply.id, cancelOperation.id); assert.equal(pending.codeApply.intent, 'cancel')
    assert.notEqual(pending.codeApply.phase, 'cancelled')
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /second/)
    await run(); pending = await track(); assert.equal(pending.codeApply.id, cancelOperation.id); assert.equal(pending.codeApply.phase, 'cancelled')
    await assertUnlocked(); assert.equal(await audits('package.code.cancel'), 2)
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /second/)
    const step = load('src/modules/packages/server/code-apply/operation.ts').applyStep
    await assert.rejects(() => step(id, cancelOperation, context, staleLock.runner, (_pkg, op) => { op.phase = 'effect'; return true }))
    assert.equal((await store.loadPackage(id)).codeApply.phase, 'cancelled')
    console.log('ok cancellation audit recovery and stale runner refusal')

    await store.writePackageFile(id, 'index.ts', 'export const cancelCrash = true\n', actor.email)
    faultAction = 'package.code.apply'; await assert.rejects(run, /injected strict audit failure/); faultAction = undefined
    const crashCancelId = (await track()).codeApply.id
    let cancelCrash = false
    fsHook = async (name, from, to) => {
      if (!cancelCrash && name === 'rename' && path.resolve(from) === source && path.basename(to) === 'withdrawn') {
        cancelCrash = true; await fs.promises.rename(from, to); throw Error('injected cancellation crash')
      }
    }
    await assert.rejects(cancel, /injected cancellation crash/); fsHook = undefined; assert.ok(cancelCrash)
    assert.equal(fs.existsSync(source), false)
    assert.match(fs.readFileSync(path.join(workspaceRoot, crashCancelId, 'withdrawn', 'index.ts'), 'utf8'), /cancelCrash/)
    assert.match(fs.readFileSync(path.join(workspaceRoot, crashCancelId, 'previous', 'index.ts'), 'utf8'), /second/)
    await run(); pending = await track(); assert.equal(pending.codeApply.id, crashCancelId); assert.equal(pending.codeApply.phase, 'cancelled')
    assert.match(fs.readFileSync(path.join(source, 'index.ts'), 'utf8'), /second/); await assertUnlocked()
    console.log('ok cancellation rename crash recovery')

    await store.writePackageFile(id, 'index.ts', 'export const third = true\n', actor.email)
    let release, entered
    const held = new Promise(resolve => { release = resolve }), reached = new Promise(resolve => { entered = resolve })
    fsHook = async (name, file) => { if (name === 'writeFile' && String(file).includes(`${path.sep}staged${path.sep}`)) { fsHook = undefined; entered(); await held } }
    const running = run(); await Promise.race([reached, running.then(() => { throw Error('apply finished before the concurrency barrier') })])
    try { await assert.rejects(run) } finally { release() }
    await running; await track()
    await assertUnlocked()
    console.log('ok concurrent apply refused')

    await store.writePackageFile(id, 'index.ts', 'export const git = true\n', actor.email)
    Object.assign(process.env, { PACKAGE_APPLY_MODE: 'git', PACKAGE_GIT_TOKEN: 'fixture-token', PACKAGE_GIT_REPO: 'owned/fixture', PACKAGE_GIT_BRANCH: 'main', PACKAGE_GIT_API: 'https://git.invalid', PACKAGE_DEPLOY_WEBHOOK: 'https://deploy.invalid/hook' })
    const oldHead = '1'.repeat(40), appliedCommit = '2'.repeat(40)
    let head = oldHead, commits = 0, patches = 0, hooks = 0, lost = true, diverged = false, refusePatch = false
    const response = value => ({ ok: true, status: 200, json: async () => value, text: async () => '' })
    const fetcher = async (url, init = {}) => {
      if (url === 'https://deploy.invalid/hook') { hooks++; throw Error('unknown webhook outcome') }
      assert.ok(url.startsWith('https://git.invalid/repos/owned/fixture/'), 'unexpected network target')
      const p = url.slice('https://git.invalid/repos/owned/fixture'.length), method = init.method
      if (method === 'GET' && p.startsWith('/git/ref/heads/')) return response({ object: { sha: head } })
      if (method === 'GET' && p.startsWith('/git/commits/')) return response({ tree: { sha: 'tree1' } })
      if (method === 'GET' && p.startsWith('/git/trees/')) return response({ tree: [] })
      if (method === 'POST' && p === '/git/blobs') return response({ sha: 'blob1' })
      if (method === 'POST' && p === '/git/trees') return response({ sha: 'tree2' })
      if (method === 'POST' && p === '/git/commits') { commits++; return response({ sha: commits === 1 ? appliedCommit : String(commits + 3).repeat(40) }) }
      if (method === 'GET' && p.startsWith('/compare/')) return response({ status: diverged ? 'diverged' : 'ahead' })
      if (method === 'PATCH' && p.startsWith('/git/refs/heads/')) {
        patches++; const body = JSON.parse(init.body); assert.equal(body.force, false)
        if (refusePatch) throw Error('PATCH failed before response')
        head = body.sha
        if (lost) { lost = false; throw Error('lost PATCH response') }
        return response({})
      }
      throw Error(`unexpected fake Git request ${method} ${p}`)
    }
    const gitRun = () => apply.applyCodePackage(id, actor.email, fetcher, context)
    await assert.rejects(gitRun, /lost PATCH response/); const gitPending = await track()
    assert.equal(commits, 1); assert.equal(patches, 1); assert.equal(head, appliedCommit)
    const gitCancel = () => apply.cancelCodeApply(id, actor.email, fetcher, context)
    await assert.rejects(gitCancel, undefined, 'published commit cannot be cancelled')
    process.env.PACKAGE_GIT_BRANCH = 'other'; await assert.rejects(gitRun); process.env.PACKAGE_GIT_BRANCH = 'main'
    faultAction = 'package.code.apply'; await assert.rejects(gitRun, /injected strict audit failure/); faultAction = undefined
    assert.equal((await track()).codeApply.deploy, 'unknown'); assert.equal(hooks, 1)
    const gitResult = await gitRun(); assert.equal(gitResult.deploy, 'unknown')
    assert.equal((await track()).codeApply.id, gitPending.codeApply.id)
    await gitRun(); assert.equal(commits, 1); assert.equal(patches, 1); assert.equal(hooks, 1)
    await assertUnlocked()
    console.log('ok Git lost response, drift, divergence and webhook replay')

    await store.writePackageFile(id, 'index.ts', 'export const gitCancel = true\n', actor.email)
    refusePatch = true
    await assert.rejects(gitRun, /PATCH failed before response/)
    const unconfirmed = (await track()).codeApply
    assert.equal(unconfirmed.git.head, head)
    await assert.rejects(gitCancel, undefined, 'old head cannot prove an uncertain publication never happened')
    assert.notEqual((await track()).codeApply.intent, 'cancel')
    head = '3'.repeat(40); diverged = true
    const patchesBeforeDivergence = patches
    await assert.rejects(gitRun); assert.equal(patches, patchesBeforeDivergence)
    await gitCancel(); pending = await track()
    assert.equal(pending.codeApply.id, unconfirmed.id); assert.equal(pending.codeApply.phase, 'cancelled'); await assertUnlocked()
    await store.writePackageFile(id, 'index.ts', 'export const gitAfterCancel = true\n', actor.email)
    refusePatch = false; diverged = false
    faultAction = 'package.code.deploy.request'; await assert.rejects(gitRun, /injected strict audit failure/); faultAction = undefined
    pending = await track(); assert.equal(pending.codeApply.phase, 'effect'); assert.equal(pending.codeApply.deploy, undefined)
    assert.equal(hooks, 1, 'failed deploy claim cannot send webhook')
    await gitRun(); pending = await track(); assert.equal(hooks, 2)
    assert.notEqual(pending.codeApply.id, unconfirmed.id); assert.equal(pending.codeApply.phase, 'applied'); await assertUnlocked()
    console.log('ok Git ambiguous, published and diverged cancellation')
    const github = load('src/modules/packages/domain/github.ts'), patchesBeforeNoChange = patches
    await github.publishDirectoryCommit({ token: 'fixture-token', repo: 'owned/fixture', branch: 'main', apiBase: 'https://git.invalid' },
      { head: oldHead, commit: oldHead, changed: false }, fetcher)
    assert.equal(patches, patchesBeforeNoChange, 'no-change ancestor reconciliation never updates ref')
    console.log('ok unchanged Git plan ancestor reconciliation')

    const originalPackage = await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } })
    const originalIndex = await prisma.setting.findUniqueOrThrow({ where: { key: indexKey } })
    const catalog = load('src/extensions/generated/catalog.ts').extensionCatalog
    const module = catalog.find(item => item.kind === 'module')
    assert.ok(module, 'actual catalog must contain a module')
    const absentCapability = ['ui','admin','api','events','jobs','settings','storage'].find(value => !(module.capabilities || []).includes(value))
    assert.ok(absentCapability, 'fixture needs a capability absent from a real module')
    const incompatible = [
      { requiresCore: '^999999.0.0' },
      { requires: [module.id], dependencyVersions: { [module.id]: '^999999.0.0' } },
      { requires: [module.id], requiresCapabilities: { [module.id]: [absentCapability] } },
    ]
    for (const extra of incompatible) {
      const bad = new Map(entries); bad.set('manifest.json', Buffer.from(JSON.stringify({ ...manifest, ...extra })))
      await assert.rejects(() => store.installEntries(bad, actor.email))
      assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } }), originalPackage)
      assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: indexKey } }), originalIndex)
    }
    // Simulate an older stored package whose requirements are now incompatible.
    // Restore the exact original row even if an activation assertion fails.
    await prisma.role.update({ where: { id: role.id }, data: { permissions: 'extensions.code,settings.manage' } })
    identity.clearAdminPolicyCache()
    const settingsActor = await identity.requirePerm(req, 'settings.manage'); assert.ok(settingsActor)
    try {
      for (const extra of incompatible) {
        const stored = JSON.parse(originalPackage.value); stored.manifest = { ...stored.manifest, runtime: 'declarative', ...extra }; delete stored.codeStatus; delete stored.codeApply
        await prisma.setting.update({ where: { key: packageKey }, data: { value: JSON.stringify(stored) } })
        const before = await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } })
        await assert.rejects(() => store.patchPackage(id, { enabled: true }, { req, actor: settingsActor }))
        assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: packageKey } }), before)
        assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: indexKey } }), originalIndex)
      }
    } finally { await prisma.setting.update({ where: { key: packageKey }, data: { value: originalPackage.value } }) }
    console.log('ok actual core, module version and capability compatibility')

    const dependency = catalog.find(item => item.kind === 'module' && !item.stateSetting)
    assert.ok(dependency, 'actual catalog must contain a module without a mirrored state')
    dependencyKey = `extension.${dependency.id}.state.v1`
    dependencyBefore = await prisma.setting.findUnique({ where: { key: dependencyKey } })
    await prisma.setting.upsert({ where: { key: dependencyKey }, create: { key: dependencyKey, value: '{"enabled":false,"settings":{}}' }, update: { value: '{"enabled":false,"settings":{}}' } })
    const state = load('src/extensions/server/state.ts')
    assert.equal((await state.getExtensionState(dependency.id)).enabled, false)
    const defaultSite = load('src/modules/site/config/defaults.ts').defaultSite
    await prisma.setting.upsert({ where: { key: siteKey }, create: { key: siteKey, value: JSON.stringify(defaultSite) }, update: { value: JSON.stringify(defaultSite) } })
    const theme = { ...JSON.parse(fs.readFileSync('docs/packages/examples/ocean-theme/manifest.json', 'utf8')), id: themeId }
    const themeEntries = new Map([['manifest.json', Buffer.from(JSON.stringify(theme))], ['theme.css', fs.readFileSync('docs/packages/examples/ocean-theme/theme.css')]])
    await store.installEntries(themeEntries, actor.email)
    await store.activateTheme(themeId)
    const themeBefore = await prisma.setting.findUniqueOrThrow({ where: { key: themeKey } })
    const themeIndexBefore = await prisma.setting.findUniqueOrThrow({ where: { key: indexKey } })
    const activeSiteBefore = await prisma.setting.findUniqueOrThrow({ where: { key: siteKey } })
    assert.equal(JSON.parse(themeBefore.value).enabled, false)
    assert.equal(JSON.parse(activeSiteBefore.value).themeId, themeId)
    await assert.rejects(() => store.writePackageFile(themeId, 'manifest.json', JSON.stringify({ ...theme, requires: [dependency.id] }), actor.email))
    assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: themeKey } }), themeBefore)
    assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: indexKey } }), themeIndexBefore)
    assert.deepEqual(await prisma.setting.findUniqueOrThrow({ where: { key: siteKey } }), activeSiteBefore)
    console.log('ok active theme refuses newly disabled dependency')
  } finally {
    fsHook = undefined; faultAction = undefined; outsideReadHook = undefined
    if (actor) {
      const row = await prisma.setting.findUnique({ where: { key: packageKey } })
      if (row) { const operation = JSON.parse(row.value).codeApply; if (operation?.id) operations.add(operation.id) }
    }
    if (actor) await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } })
    await prisma.setting.deleteMany({ where: { key: { in: [packageKey, themeKey] } } })
    if (indexBefore !== undefined) await restoreSetting(indexKey, indexBefore)
    if (policyBefore !== undefined) await restoreSetting(policyKey, policyBefore)
    if (lockBefore !== undefined) await restoreSetting(lockKey, lockBefore)
    if (siteBefore !== undefined) await restoreSetting(siteKey, siteBefore)
    if (dependencyKey && dependencyBefore !== undefined) await restoreSetting(dependencyKey, dependencyBefore)
    if (actor) await prisma.user.deleteMany({ where: { id: actor.id } })
    if (role) await prisma.role.deleteMany({ where: { id: role.id } })
    if (sourceOwned) safeRemove(source, path.resolve('src/plugins'), id)
    for (const op of operations) { assert.match(op, /^[0-9a-f-]{36}$/); safeRemove(path.join(workspaceRoot, op), workspaceRoot, op) }
    for (const [file, bytes] of savedGenerated) fs.writeFileSync(file, bytes)
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
