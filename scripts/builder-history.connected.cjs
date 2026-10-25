// Page-builder document history on real PostgreSQL through the real routes: a save of the live design is versioned
// atomically (an unchanged save adds nothing), its versions are listed, an earlier one is put back (and the stale
// draft goes), a version that adds advanced code needs the script permission to come back, and a failure while
// saving or restoring leaves the design and its history untouched. Owns one page id, two users and one role.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = `bhist-${Date.now().toString(36)}`, started = new Date(), pageId = stamp, type = `builder:${pageId}`
let viewer, fault = ''
const wrap = (target) => new Proxy(target, { get(object, key) {
  if (key === '$transaction') return (work, options) => (typeof work === 'function' ? object.$transaction((tx) => work(wrap(tx)), options) : object.$transaction(work, options))
  if (key === 'auditLog' || key === 'contentRevision') return new Proxy(object[key], { get(model, method) { return method === 'create' ? (args) => { if (fault === key) throw Error(`injected ${key} outage`); return model.create(args) } : typeof model[method] === 'function' ? model[method].bind(model) : model[method] } })
  return typeof object[key] === 'function' ? object[key].bind(object) : object[key]
} })
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: wrap(prisma) },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => (viewer ? { uid: viewer.id, authAt: started.toISOString() } : null) },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, requireModule: async () => {}, moduleGuard: async () => null, getModuleStates: async () => ({}), getModuleSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), rateLimitHit: async () => ({ ok: true }) },
  react: { ...require('react'), cache: (fn) => fn },
})
const builderRoute = load('src/modules/site/server/http/admin/page-builder/route.ts'), history = load('src/modules/content/server/http/history.ts')
const builder = load('src/modules/site/server/builder.ts'), domain = load('src/modules/site/domain/builder.ts')
const req = (path, method = 'GET', body) => new NextRequest('http://site.invalid' + path, { method, headers: { host: 'site.invalid', origin: 'http://site.invalid', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
const docWith = (html, script = '') => {
  const doc = domain.emptyDoc(), section = domain.createSection(1), widget = domain.createWidget('html')
  widget.props.html = html
  if (script) { widget.props.advanced = '1'; widget.props.js = script }
  section.columns[0].widgets.push(widget); doc.sections.push(section)
  return doc
}
const save = async (doc) => (await builderRoute.PUT(req('/api/admin/page-builder', 'PUT', { pageId, doc }))).status
const versions = async () => (await (await history.GET_history(req(`/api/admin/history?type=${encodeURIComponent(type)}&id=1`))).json()).versions || []
const restore = async (version) => history.POST_history(req('/api/admin/history', 'POST', { type, id: 1, version }))
const liveHtml = async () => (await builder.getBuilderDoc(pageId))?.sections[0]?.columns[0]?.widgets[0]?.props.html

async function main() {
  const role = await prisma.role.create({ data: { name: stamp, permissions: 'dashboard.view,cms.pages' } })
  const owner = await prisma.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN' } })
  const editor = await prisma.user.create({ data: { email: `${stamp}-editor@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
  viewer = owner

  // ---- saving versions the live design; an unchanged save adds nothing
  const first = docWith('<p>A</p>')
  assert.equal(await save(first), 200)
  assert.equal(await save(structuredClone(first)), 200)
  assert.equal(await save(docWith('<p>B</p>')), 200)
  let list = await versions()
  assert.deepEqual(list.map((v) => v.version), [2, 1], 'two versions, the repeated save added none')
  assert.equal(list[0].by, owner.email, 'the version names who saved it')
  const detail = await (await history.GET_history(req(`/api/admin/history?type=${encodeURIComponent(type)}&id=1&version=2`))).json()
  assert.ok(detail.diff.some((row) => row.field === 'configurationDocument'), 'a version shows what changed')

  // ---- putting version 1 back: the live design is A again, the stale draft is gone, the restore is a version
  await builder.saveBuilderDraft(pageId, docWith('<p>draft</p>'))
  let response = await restore(1)
  assert.equal(response.status, 200, await response.text())
  assert.equal(await liveHtml(), '<p>A</p>')
  assert.equal((await builder.getBuilderDraft(pageId)).present, false, 'the unsaved draft of the replaced design is cleared')
  list = await versions()
  assert.deepEqual([list[0].version, list[0].source], [3, 'restore'])

  // ---- a version that adds advanced code comes back only with the script permission
  assert.equal(await save(docWith('<p>S</p>', 'console.log(1)')), 200, 'the owner may save script code')
  const scripted = (await versions())[0].version
  assert.equal(await save(docWith('<p>C</p>')), 200)
  viewer = editor
  assert.equal(await save(docWith('<p>X</p>', 'alert(1)')), 403, 'an editor cannot add script code by saving')
  response = await restore(scripted)
  assert.equal(response.status, 403, 'nor by putting a scripted version back')
  assert.equal(await liveHtml(), '<p>C</p>')
  response = await restore(1)
  assert.equal(response.status, 200, 'an editor may put back a version without script code')
  assert.equal(await liveHtml(), '<p>A</p>')
  viewer = owner

  // ---- a failure while restoring or saving leaves the design and its history as they were
  const count = (await versions()).length
  fault = 'auditLog'
  response = await restore(2)
  assert.equal(response.status, 500)
  fault = ''
  assert.deepEqual([await liveHtml(), (await versions()).length], ['<p>A</p>', count], 'a failed restore changes nothing')
  fault = 'contentRevision'
  await assert.rejects(save(docWith('<p>lost</p>')), /injected contentRevision outage/)
  fault = ''
  assert.deepEqual([await liveHtml(), (await versions()).length], ['<p>A</p>', count], 'a save whose version fails is not kept')

  // ---- only well-formed builder types are owners
  assert.equal((await history.GET_history(req('/api/admin/history?type=builder:../x&id=1'))).status, 400)
  assert.equal((await restore(999)).status, 404)
  console.log('PostgreSQL page-builder history: saves versioned atomically (unchanged saves add none), versions listed with their author and diff, restore puts the design back and clears the stale draft, a scripted version needs the script permission to return, failed saves and restores change nothing.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.setting.deleteMany({ where: { key: { in: [builder.builderKey(pageId), builder.draftKey(pageId)] } } })
    await prisma.contentRevision.deleteMany({ where: { entityType: type } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ targetType: type }, { targetId: pageId }, { actorEmail: { startsWith: stamp } }] } })
    await prisma.user.deleteMany({ where: { email: { startsWith: stamp } } })
    await prisma.role.deleteMany({ where: { name: stamp } })
  } finally { await prisma.$disconnect() }
})
