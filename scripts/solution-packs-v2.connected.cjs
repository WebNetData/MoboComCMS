// Real PostgreSQL owners, transactions and audit; JWT decoding/external cache only are doubled.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
if (!/(?:^|_)test(?:_|$)/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname.slice(1))) throw Error('Disposable test database required')
if (process.argv.includes('--single-connection')) { const u = new URL(process.env.DATABASE_URL); u.searchParams.set('connection_limit', '1'); process.env.DATABASE_URL = u.toString() }
const prisma = new PrismaClient(), id = `owned-v2-${Date.now()}`, packageKey = `package.${id}.v1`, indexKey = 'packages.index.v1', siteKey = 'site.config.v1', policyKey = 'security.policy.v1'
const slug = `${id}-draft`, otherSlug = `${id}-collision`, removedSlug = `${id}-removed`, renamedSlug = `${id}-renamed`, roleName = 'form-specialist'
const settings = [packageKey, indexKey, siteKey, policyKey, 'extension.block-editor.state.v1']
const snapshots = new Map(), cache = new Map(), authAt = Date.now() - 5000
let actor, limitedRole, ownedRole, ownedPage, collisionPage, signedIn = true, auditFault = false

function wrap(client) {
  return new Proxy(client, { get(target, name) {
    if (name === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
    if (name === 'auditLog') return new Proxy(target.auditLog, { get(model, method) {
      if (method === 'create') return args => { if (auditFault && args.data.action === 'package.solution.apply') throw Error('owned strict audit fault'); return model.create(args) }
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
    } })
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name]
  } })
}
const db = wrap(prisma)
function load(relative) {
  const base = path.resolve(relative)
  const file = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  if (!file) throw Error('Missing source ' + relative)
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'))
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === 'next-auth/jwt') return { getToken: async () => signedIn ? { uid: actor.id, authAt } : null }
    if (name === '@/platform/config/env') return { authSecret: () => 'owned-jwt-fixture' }
    if (name === 'react') return { cache: fn => fn }
    if (name === '@/platform/cache/kv') return { cached: async (_key, _ttl, fn) => fn(), invalidate: async () => undefined }
    if (name === '@/modules/catalog/server/storefront') return { isStoreEnabled: async () => false }
    if (name === '@/modules/public-api/server/availability') return { isPublicApiEnabled: async () => false }
    if (name === '@/platform/observability/logger') return { logEvent: () => {}, requestIdFrom: () => id }
    if (name.startsWith('@/') || name.startsWith('.')) return load(name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const put = (key, value) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
const docs = text => ({ version: 1, blocks: [{ id: 'owned-heading', type: 'content.heading', version: 1, props: { text, level: 2 } }] })

async function main() {
  try {
    for (const key of settings) snapshots.set(key, await prisma.setting.findUnique({ where: { key } }))
    assert.equal(await prisma.role.findUnique({ where: { name: roleName } }), null, 'fixture needs an empty test role namespace')
    assert.equal(await prisma.page.count({ where: { slug: { in: [slug, otherSlug, removedSlug, renamedSlug] } } }), 0)
    actor = await prisma.user.create({ data: { email: `${id}@example.invalid`, passwordHash: 'fixture-only', role: 'ADMIN' } })
    await put(policyKey, '{"requireAdmin2fa":false}')
    await put('extension.block-editor.state.v1', JSON.stringify({ enabled: false, settings: {} }))
    const store = load('src/modules/packages/server/store.ts'), solution = load('src/modules/packages/server/solution-packs.ts'), http = load('src/modules/packages/server/http/solution.ts')
    const req = new NextRequest(`http://owned.invalid/api/admin/packages/${id}/solution`, { headers: { origin: 'http://owned.invalid' } }), context = { req, actor }
    const upload = manifest => store.installEntries(new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))]]), actor.email)
    const post = token => http.POST(new NextRequest(req.url, { method: 'POST', headers: { origin: 'http://owned.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ token }) }), { params: Promise.resolve({ id }) })
    const manifest = { id, name: 'Owned v2', version: '1.0.0', kind: 'plugin', runtime: 'declarative', solutionPack: {
      apiVersion: 2, modules: [{ id: 'block-editor' }], theme: { id: 'noir' }, navigation: [{ label: 'Home', href: '/' }], roles: [roleName],
      starterContent: [{ key: 'first-page', slug, title: 'Initial draft', document: docs('Owned initial heading') }, { key: 'existing-page', slug: otherSlug, title: 'Do not overwrite', document: docs('Unused') }],
    } }
    collisionPage = await prisma.page.create({ data: { slug: otherSlug, title: 'Customer page', status: 'DRAFT', content: 'customer data' } })
    const siteOwner = load('src/modules/site/config/provision.ts')
    const defaultSite = load('src/modules/site/config/defaults.ts').defaultSite
    await put(siteKey, JSON.stringify({ ...defaultSite, themeId: 'aurora', navigation: [] }))
    const preservedSite = await prisma.$transaction(tx => siteOwner.planSiteDefaults({ theme: { id: 'noir' }, navigation: [{ label: 'Home', href: '/' }] }, tx))
    assert.equal(preservedSite.theme.action, 'preserve'); assert.equal(preservedSite.navigation.action, 'preserve')
    await assert.rejects(prisma.$transaction(tx => siteOwner.planSiteDefaults({ navigation: [{ label: 'Draft', href: `/p/${otherSlug}` }] }, tx)))
    await assert.rejects(prisma.$transaction(tx => siteOwner.planSiteDefaults({ navigation: [{ label: 'Draft', href: `https://owned.invalid/p/${otherSlug}` }] }, tx, 'owned.invalid')))
    await assert.rejects(prisma.$transaction(tx => siteOwner.planSiteDefaults({ navigation: [{ label: 'Unknown host', href: 'https://external.invalid/p/help' }] }, tx)), /.+/, 'without a host absolute page links are treated conservatively')
    await prisma.$transaction(tx => siteOwner.planSiteDefaults({ navigation: [{ label: 'External', href: 'https://external.invalid/p/help' }] }, tx, 'owned.invalid'))
    const hostRevision = await prisma.$transaction(tx => siteOwner.planSiteDefaults({ navigation: [{ label: 'Home', href: '/' }] }, tx, 'owned.invalid'))
    const otherHostRevision = await prisma.$transaction(tx => siteOwner.planSiteDefaults({ navigation: [{ label: 'Home', href: '/' }] }, tx, 'other.invalid'))
    assert.notEqual(hostRevision.revision, otherHostRevision.revision, 'host changes invalidate the reviewed plan')
    await prisma.setting.delete({ where: { key: siteKey } })
    await upload(manifest)
    let preview = await solution.previewSolutionPack(id, context)
    assert.equal(preview.composition.theme.action, 'set'); assert.equal(preview.composition.navigation.action, 'set')
    assert.equal(preview.composition.roles[0].action, 'create')
    assert.equal(preview.composition.starterContent.find(item => item.key === 'existing-page').action, 'preserve')
    assert.equal(await prisma.page.count({ where: { slug } }), 0, 'preview is inert')
    assert.equal(await prisma.role.findUnique({ where: { name: roleName } }), null)

    // A settings-only actor cannot create a role or page through the package owner.
    limitedRole = await prisma.role.create({ data: { name: `${id}-limited`, permissions: 'settings.manage' } })
    await prisma.user.update({ where: { id: actor.id }, data: { roleId: limitedRole.id } })
    assert.equal((await post(preview.token)).status, 403)
    await assert.rejects(solution.previewSolutionPack(id, context))
    await prisma.role.update({ where: { id: limitedRole.id }, data: { permissions: 'settings.manage,roles.manage,cms.pages' } })
    await assert.rejects(solution.previewSolutionPack(id, context), /.+/, 'role manager cannot grant forms.handle beyond their own permissions')
    assert.equal(await prisma.role.findUnique({ where: { name: roleName } }), null)
    await prisma.user.update({ where: { id: actor.id }, data: { roleId: null } })
    signedIn = false; assert.equal((await post(preview.token)).status, 403); signedIn = true

    // Freshly inserted role/page or SiteConfig change must invalidate a reviewed plan.
    await prisma.role.create({ data: { name: roleName, nameFa: 'Concurrent role', permissions: 'dashboard.view' } })
    assert.equal((await post(preview.token)).status, 409, 'concurrent role creation invalidates preview')
    await prisma.role.delete({ where: { name: roleName } })
    preview = await solution.previewSolutionPack(id, context)
    const transient = await prisma.page.create({ data: { slug, title: 'Concurrent customer draft', status: 'DRAFT' } })
    assert.equal((await post(preview.token)).status, 409, 'concurrent slug collision invalidates preview')
    await prisma.page.delete({ where: { id: transient.id } })
    preview = await solution.previewSolutionPack(id, context)
    await put(siteKey, JSON.stringify(defaultSite))
    assert.equal((await post(preview.token)).status, 409, 'concurrent site settings invalidate preview')
    await prisma.setting.delete({ where: { key: siteKey } })

    preview = await solution.previewSolutionPack(id, context)
    const beforeSettings = await prisma.setting.findMany({ where: { key: { in: settings } }, orderBy: { key: 'asc' } })
    const beforeUsers = await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, role: true, roleId: true, status: true } })
    const beforeAudit = await prisma.auditLog.count({ where: { actorUserId: actor.id } })
    const beforeRevisions = await prisma.contentRevision.count({ where: { actorId: actor.id } })
    const beforeLayouts = await prisma.setting.count({ where: { key: { startsWith: 'page.layout.' } } })
    auditFault = true; assert.notEqual((await post(preview.token)).status, 200); auditFault = false
    assert.deepEqual(await prisma.setting.findMany({ where: { key: { in: settings } }, orderBy: { key: 'asc' } }), beforeSettings, 'strict audit rolls back package, settings and extension')
    assert.equal(await prisma.role.findUnique({ where: { name: roleName } }), null)
    assert.equal(await prisma.page.findUnique({ where: { slug } }), null)
    assert.equal(await prisma.auditLog.count({ where: { actorUserId: actor.id } }), beforeAudit)
    assert.equal(await prisma.contentRevision.count({ where: { actorId: actor.id } }), beforeRevisions, 'site and page revisions roll back')
    assert.equal(await prisma.setting.count({ where: { key: { startsWith: 'page.layout.' } } }), beforeLayouts, 'page layout rolls back')

    const responses = process.argv.includes('--single-connection') ? [await post(preview.token)] : await Promise.all([post(preview.token), post(preview.token)])
    for (const response of responses) assert.equal(response.status, 200, await response.clone().text())
    const results = await Promise.all(responses.map(response => response.json()))
    assert.equal(results.filter(result => !result.alreadyApplied).length, 1)
    const receipt = results.find(result => !result.alreadyApplied).receipt
    ownedRole = await prisma.role.findUniqueOrThrow({ where: { name: roleName } })
    ownedPage = await prisma.page.findUniqueOrThrow({ where: { slug } })
    assert.equal(ownedPage.status, 'DRAFT'); assert.equal(ownedPage.showInNav, false); assert.equal(ownedPage.editorFormat, 'blocks-v1')
    assert.equal(JSON.parse(ownedPage.contentDocument).blocks[0].props.text, 'Owned initial heading')
    assert.equal((await prisma.page.findUniqueOrThrow({ where: { id: collisionPage.id } })).content, 'customer data')
    assert.ok(await prisma.contentRevision.count({ where: { entityType: 'pages', entityId: ownedPage.id } }))
    assert.ok(await prisma.setting.findUnique({ where: { key: `page.layout.${ownedPage.id}` } }))
    assert.deepEqual(await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, role: true, roleId: true, status: true } }), beforeUsers, 'no user assignment or standing change')
    assert.deepEqual(receipt.composition.roles, [{ template: roleName, roleId: ownedRole.id }])
    assert.deepEqual(receipt.composition.starterContent, [{ key: 'first-page', pageId: ownedPage.id }], 'customer collision is not adopted')
    const savedSite = JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: siteKey } })).value)
    assert.equal(savedSite.themeId, 'noir'); assert.equal(savedSite.navigation[0].href, '/')

    // Renamed customer-owned role/page retain their IDs; a later version cannot rewrite them.
    await prisma.role.update({ where: { id: ownedRole.id }, data: { name: `${id}-renamed-role`, permissions: 'dashboard.view' } })
    await prisma.page.update({ where: { id: ownedPage.id }, data: { slug: renamedSlug, title: 'Customer edited' } })
    const omitted = { ...manifest, version: '1.0.1', solutionPack: { apiVersion: 2, modules: [{ id: 'block-editor' }], theme: { id: 'noir' } } }
    await upload(omitted); preview = await solution.previewSolutionPack(id, context)
    const omittedResult = await solution.applySolutionPack(id, preview.token, context)
    assert.deepEqual(omittedResult.receipt.composition.roles, [{ template: roleName, roleId: ownedRole.id }])
    assert.deepEqual(omittedResult.receipt.composition.starterContent, [{ key: 'first-page', pageId: ownedPage.id }])
    const interimV1 = { ...manifest, version: '1.0.2', solutionPack: { apiVersion: 1, modules: [{ id: 'block-editor' }] } }
    await upload(interimV1); preview = await solution.previewSolutionPack(id, context)
    const interimResult = await solution.applySolutionPack(id, preview.token, context)
    assert.deepEqual(interimResult.receipt.composition.roles, [{ template: roleName, roleId: ownedRole.id }])
    assert.deepEqual(interimResult.receipt.composition.starterContent, [{ key: 'first-page', pageId: ownedPage.id }])
    const upgrade = { ...manifest, version: '1.0.3', solutionPack: { ...manifest.solutionPack, theme: { id: 'aurora' }, navigation: [{ label: 'Other', href: '/about' }], starterContent: [{ ...manifest.solutionPack.starterContent[0], slug: removedSlug }] } }
    await upload(upgrade); preview = await solution.previewSolutionPack(id, context)
    assert.equal(preview.composition.theme.action, 'preserve'); assert.equal(preview.composition.navigation.action, 'preserve')
    assert.equal(preview.composition.roles[0].roleId, ownedRole.id); assert.equal(preview.composition.roles[0].action, 'preserve')
    assert.equal(preview.composition.starterContent[0].pageId, ownedPage.id); assert.equal(preview.composition.starterContent[0].action, 'preserve')
    const upgraded = await solution.applySolutionPack(id, preview.token, context)
    assert.equal((await prisma.page.findUniqueOrThrow({ where: { id: ownedPage.id } })).title, 'Customer edited')
    assert.equal((await prisma.role.findUniqueOrThrow({ where: { id: ownedRole.id } })).permissions, 'dashboard.view')
    assert.equal((await prisma.setting.findUniqueOrThrow({ where: { key: siteKey } })).value, JSON.stringify(savedSite))
    assert.deepEqual(upgraded.receipt.composition.starterContent, [{ key: 'first-page', pageId: ownedPage.id }])

    await prisma.page.delete({ where: { id: ownedPage.id } })
    await prisma.role.delete({ where: { id: ownedRole.id } })
    const third = { ...upgrade, version: '1.0.4' }
    await upload(third); preview = await solution.previewSolutionPack(id, context)
    assert.equal(preview.composition.roles[0].action, 'removed'); assert.equal(preview.composition.starterContent[0].action, 'removed')
    await solution.applySolutionPack(id, preview.token, context)
    assert.equal(await prisma.page.findUnique({ where: { slug: removedSlug } }), null, 'deleted owned draft is not recreated')
    assert.equal(await prisma.role.findUnique({ where: { name: roleName } }), null, 'deleted owned role is not recreated')
    await store.deletePackage(id); await upload(third)
    assert.equal((await solution.previewSolutionPack(id, context)).applied, true, 'retained reinstall never reapplies')
    console.log('Actual PostgreSQL Solution Pack v2: atomic site/role/draft provisioning, stale plans, authority, strict audit rollback, concurrent replay and retained customer edits/deletions passed')
  } finally {
    auditFault = false; signedIn = true
    if (actor) await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } })
    // Also clean a fixture row created before an assertion/fault deliberately aborted the run.
    const fixturePages = actor ? await prisma.page.findMany({ where: { slug: { in: [slug, otherSlug, renamedSlug, removedSlug] } }, select: { id: true } }) : []
    const ownedPageIds = [...new Set([ownedPage?.id, collisionPage?.id, ...fixturePages.map(page => page.id)].filter(Boolean))]
    if (ownedPageIds.length) {
      await prisma.contentRevision.deleteMany({ where: { entityType: 'pages', entityId: { in: ownedPageIds } } })
      await prisma.setting.deleteMany({ where: { key: { in: ownedPageIds.map(pageId => `page.layout.${pageId}`) } } })
      await prisma.page.deleteMany({ where: { id: { in: ownedPageIds }, slug: { in: [slug, otherSlug, renamedSlug, removedSlug] } } })
    }
    if (ownedRole) await prisma.role.deleteMany({ where: { id: ownedRole.id } })
    if (actor) await prisma.role.deleteMany({ where: { name: roleName } })
    if (actor) await prisma.user.deleteMany({ where: { id: actor.id, email: actor.email } })
    if (limitedRole) await prisma.role.deleteMany({ where: { id: limitedRole.id } })
    if (actor) await prisma.contentRevision.deleteMany({ where: { entityType: 'settings-site', actorId: actor.id } })
    for (const [key, row] of snapshots) { if (row) await put(key, row.value); else await prisma.setting.deleteMany({ where: { key } }) }
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
