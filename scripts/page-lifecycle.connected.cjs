// Real PostgreSQL, actual Page/CMS/editor/history owners. Only namespaced fixtures are removed.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), stamp = `page-life-${Date.now().toString(36)}`, started = new Date(), switches = {}
let viewer
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: started.toISOString() } : null },
  '@/extensions/server/modules': { isModuleEnabled: async id => switches[id] !== false, requireModule: async () => {}, moduleGuard: async () => null, getModuleStates: async () => ({ ...switches }), getModuleSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), rateLimitHit: async () => ({ ok: true }) },
  '@/modules/seo/server/indexnow': { publicPathFor: () => null, queueIndexNow: async () => {} },
  react: { ...require('react'), cache: fn => fn },
})
const cms = load('src/modules/site/server/http/admin/cms/route.ts'), commands = load('src/modules/site/server/page-commands.ts')
const history = load('src/modules/content/server/revisions.ts'), state = load('src/modules/site/server/revision-state.ts')
const layouts = load('src/modules/site/server/page-layout.ts'), editor = load('src/modules/editor/server/documents.ts')
const { pageDescription } = load('src/modules/site/server/page-description.ts'), domain = load('src/modules/site/domain/builder.ts')
const call = async (method, body, origin = true) => {
  const req = new NextRequest('http://site.invalid/api/admin/cms?type=pages', { method: method === 'BULK' ? 'POST' : method, headers: { host: 'site.invalid', ...(origin ? { origin: 'http://site.invalid' } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const r = await cms[method](req); return { status: r.status, body: await r.json() }
}
const row = id => db.page.findUniqueOrThrow({ where: { id } })
const settings = id => db.setting.findUnique({ where: { key: `page.layout.${id}` } })
const revisions = id => db.contentRevision.findMany({ where: { entityType: 'pages', entityId: id }, orderBy: { version: 'asc' } })
const failure = async promise => promise.then(() => null, error => error)
const restore = (id, snapshot, actor) => state.restorePageRevision(id, snapshot, async (tx, before, after) => {
  await history.recordRevision({ entityType: 'pages', entityId: id, before, after, actor, source: 'restore', client: tx, strict: true })
})
const document = text => ({ version: 1, blocks: [{ id: 'blk_00001', type: 'content.heading', version: 1, props: { text, level: 2 } }] })

async function main() {
  assert.match(new URL(process.env.DATABASE_URL).protocol, /^postgres(?:ql)?:$/, 'real PostgreSQL required; fixtures are namespaced and cleaned')
  const role = await db.role.create({ data: { name: stamp, permissions: 'dashboard.view,cms.pages' } })
  const limitedRole = await db.role.create({ data: { name: `${stamp}-limited`, permissions: 'dashboard.view,cms.posts' } })
  const manager = await db.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
  const limited = await db.user.create({ data: { email: `${stamp}-limited@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: limitedRole.id } })
  const actor = { ...manager, permissions: ['dashboard.view', 'cms.pages'] }
  const input = name => ({ slug: `${stamp}-${name}`, title: name, content: '<p>متن اولیه</p>' })
  viewer = limited; assert.equal((await call('POST', input('forbidden'))).status, 403)
  viewer = null; assert.equal((await call('POST', input('visitor'))).status, 403)
  // Origin enforcement belongs to the HTTP middleware, exercised by the browser/API check.
  viewer = manager
  const created = await call('POST', input('draft')); assert.equal(created.status, 200, JSON.stringify(created.body))
  const id = created.body.id; assert.equal((await row(id)).status, 'DRAFT'); assert.equal((await revisions(id)).length, 1)
  const published = await call('POST', { ...input('live'), status: 'PUBLISHED' }); assert.equal(published.status, 200)
  assert.equal((await row(published.body.id)).status, 'PUBLISHED', 'explicit legacy publication remains supported')
  const layoutA = { ...layouts.pageLayoutDefaults, companyPanel: 'about', cover: '/uploads/cover-a.jpg', pageFrame: 'card', formSlug: 'owned-form' }
  await db.setting.update({ where: { key: `page.layout.${id}` }, data: { value: JSON.stringify({ ...layoutA, futureSetting: { private: stamp } }) } })
  const saved = await call('PATCH', { id, ...layoutA, title: 'before restore', expectedUpdatedAt: (await row(id)).updatedAt.toISOString() }); assert.equal(saved.status, 200, JSON.stringify(saved.body))
  const snapshot = await history.revisionSnapshot('pages', id, 2)
  assert.deepEqual(JSON.parse(snapshot.__relations), { version: 1, pageLayout: layoutA }); assert.doesNotMatch(snapshot.__relations, /futureSetting|private/)
  const builder = { ...domain.emptyDoc(), mode: 'code', code: { html: '<h1>شرح زنده</h1><p>متن صفحه‌ساز</p>', css: '', js: '', advanced: false } }
  for (const [key, value] of [[`page.builder.${id}`, JSON.stringify(builder)], [`page.builder.draft.${id}`, JSON.stringify({ ...builder, code: { ...builder.code, html: '<p>PRIVATE_PREVIEW</p>' } })]]) await db.setting.create({ data: { key, value } })
  await commands.updatePage(id, { companyPanel: 'contact', pageLayout: 'reading', cover: '', formSlug: '' }, { title: 'after', content: '<p>پس از تغییر</p>', status: 'PUBLISHED' }, actor)
  await restore(id, snapshot, actor)
  assert.deepEqual([(await row(id)).title, (await row(id)).content, (await row(id)).status], ['before restore', '<p>متن اولیه</p>', 'DRAFT'])
  assert.deepEqual((await layouts.readPageLayout(id)).layout, layoutA)
  assert.deepEqual(JSON.parse((await settings(id)).value).futureSetting, { private: stamp })
  assert.equal((await db.setting.findUnique({ where: { key: `page.builder.${id}` } })).value, JSON.stringify(builder), 'Page restore leaves independent builder history intact')
  const old = { ...snapshot }; delete old.__relations
  await commands.updatePage(id, { companyPanel: 'legal' }, { title: 'new' }, actor)
  await restore(id, old, actor); assert.equal((await layouts.readPageLayout(id)).layout.companyPanel, 'legal', 'old snapshots keep current layout')
  const before = await row(id), beforeSetting = (await settings(id)).value, beforeCount = (await revisions(id)).length
  for (const relation of [{ version: 2, pageLayout: layoutA }, { version: 1, pageLayout: { companyPanel: 'about' } }, { version: 1, pageLayout: { ...layoutA, cover: 'javascript:alert(1)' } }]) {
    assert.equal((await failure(restore(id, { ...snapshot, title: 'must not change', __relations: JSON.stringify(relation) }, actor)))?.status, 422)
    assert.deepEqual(await row(id), before); assert.equal((await settings(id)).value, beforeSetting)
  }
  const fault = await failure(commands.updatePage(id, { companyPanel: 'contact' }, { title: 'audit fault' }, actor, async () => { throw Error('owned audit fault') }))
  assert.match(fault?.message, /owned audit fault/); assert.deepEqual(await row(id), before); assert.equal((await settings(id)).value, beforeSetting); assert.equal((await revisions(id)).length, beforeCount)
  // Fail the actual revision INSERT through Prisma's transaction client; content/settings must roll back too.
  const faultDb = db.$extends({ query: { contentRevision: { async create() { throw Error('owned revision fault') } } } })
  const faultCommands = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: faultDb }, '@/platform/observability/logger': { logEvent() {} } })('src/modules/site/server/page-commands.ts')
  assert.match((await failure(faultCommands.updatePage(id, { companyPanel: 'contact' }, { title: 'revision fault' }, actor)))?.message, /owned revision fault/)
  assert.deepEqual(await row(id), before); assert.equal((await settings(id)).value, beforeSetting)
  const race = await Promise.all(['first', 'second'].map((title, n) => failure(commands.updatePage(id, { expectedUpdatedAt: before.updatedAt.toISOString(), pageFrame: n ? 'plain' : 'card' }, { title }, actor))))
  assert.deepEqual(race.map(error => error?.status || 200).sort(), [200, 409]); assert.ok((await row(id)).updatedAt > before.updatedAt)
  await editor.saveDocument({ entity: 'pages', id, document: document('متن بلوکی معتبر'), expectedUpdatedAt: (await row(id)).updatedAt.toISOString(), actor })
  const canonical = (await revisions(id)).at(-1); assert.ok(JSON.parse(canonical.snapshot).__relations, 'block editor retains Page layout metadata')
  assert.equal(await pageDescription(await row(id), 'fa', 'none'), 'شرح زنده متن صفحه‌ساز متن بلوکی معتبر', 'metadata uses the same canonical Page renderer')
  assert.equal((await call('PATCH', { id, content: 'overwrite blocks' })).status, 409)
  await restore(id, snapshot, actor); assert.equal((await row(id)).editorFormat, 'legacy')
  let r = await call('BULK', { ids: [id], action: 'publish' }); assert.equal(r.status, 200); assert.equal((await row(id)).status, 'PUBLISHED')
  assert.equal(JSON.parse((await revisions(id)).at(-1).snapshot).status, 'PUBLISHED')
  r = await call('BULK', { ids: [id], action: 'draft' }); assert.equal(r.status, 200); assert.equal((await row(id)).status, 'DRAFT')
  assert.equal(await pageDescription(await row(id), 'fa', 'none'), 'شرح زنده متن صفحه‌ساز متن اولیه')
  assert.equal(await pageDescription(await row(id), 'fa', 'about'), 'متن اولیه شرح زنده متن صفحه‌ساز')
  switches['page-builder'] = false; assert.equal(await pageDescription(await row(id), 'fa', 'none'), 'متن اولیه'); switches['page-builder'] = true
  console.log('Page lifecycle PostgreSQL passed: draft defaults, explicit publication, permissions, atomic content/layout/history/audit, old snapshots, invalid metadata, concurrent edits, canonical editor, bulk status and live-source SEO.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await db.page.findMany({ where: { slug: { startsWith: stamp } }, select: { id: true } })).map(row => row.id)
    await db.contentRevision.deleteMany({ where: { entityType: 'pages', entityId: { in: ids } } })
    await db.setting.deleteMany({ where: { key: { in: ids.flatMap(id => [`page.layout.${id}`, `page.builder.${id}`, `page.builder.draft.${id}`]) } } })
    await db.page.deleteMany({ where: { id: { in: ids } } })
    await db.auditLog.deleteMany({ where: { actorEmail: { startsWith: stamp } } })
    await db.user.deleteMany({ where: { email: { startsWith: stamp } } }); await db.role.deleteMany({ where: { name: { startsWith: stamp } } })
  } finally { await db.$disconnect() }
})
