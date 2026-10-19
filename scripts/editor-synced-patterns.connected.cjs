// Synced patterns: one pattern, referenced by documents, rendered live; editing it in place changes every page at once.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), stamp = `synced-${Date.now()}`
let viewer, on = true, auditFault = false
const may = (actor, key) => actor && (actor.roleId == null || actor.permissions?.includes(key))
let load
load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/extensions/server/modules': { isModuleEnabled: async () => on, getModuleStates: async () => ({}) },
  '@/modules/content/server/events': { contentChanged() {} },
  '@/modules/performance/server/pagecache': { purgeSoon() {} },
  '@/modules/identity/server/access': {
    requireContentScope: async (_req, manager, author) => may(viewer, manager) || author && may(viewer, author) ? { admin: viewer, authorId: may(viewer, manager) ? null : viewer.id } : null,
    requirePerm: async (_req, key) => may(viewer, key) ? viewer : null,
  },
  '@/platform/audit/server': { auditAdminStrict: async (...args) => { if (auditFault) throw Error('injected audit outage'); return load('src/platform/audit/server.ts').auditAdminStrict(...args) } },
})
const patterns = load('src/modules/editor/server/patterns.ts'), editor = load('src/modules/editor/server/documents.ts')
const req = (method, body, entity = 'posts') => new NextRequest(`http://site.invalid/api/admin/editor/patterns?entity=${entity}`, { method, headers: { host: 'site.invalid', origin: 'http://site.invalid', 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })
const heading = (id, text) => ({ id, type: 'content.heading', version: 1, props: { text } }), doc = (...blocks) => ({ version: 1, blocks })
const ref = (id, pattern) => ({ id, type: 'content.pattern', version: 1, props: { pattern, title: 'x' } })
async function main() { try {
  const admin = await db.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'unused', role: 'ADMIN' } })
  viewer = { ...admin, permissions: null }
  // A synced pattern; one that would hold another synced pattern is refused.
  let response = await patterns.editorPatterns(req('POST', { title: stamp, kind: 'synced', document: doc(heading('h_one', `${stamp}-first`)) }))
  assert.equal(response.status, 201, await response.clone().text())
  let synced = await response.json()
  assert.equal((await patterns.editorPatterns(req('POST', { title: `${stamp}-nested`, kind: 'synced', document: doc(ref('r_nested', synced.id)) }))).status, 422)
  // A page of another section cannot borrow it; a missing id is refused as well.
  const other = await (await patterns.editorPatterns(req('POST', { title: `${stamp}-pages`, kind: 'synced', document: doc(heading('h_pages', 'pages')) }, 'pages'))).json()
  const post = await db.post.create({ data: { slug: stamp, title: stamp, content: '', authorId: admin.id } })
  const save = async (document, actor = viewer) => { const row = await db.post.findUniqueOrThrow({ where: { id: post.id } }); return editor.saveDocument({ entity: 'posts', id: post.id, document, expectedUpdatedAt: row.updatedAt.toISOString(), actor }) }
  await assert.rejects(save(doc(ref('r_other', other.id))), error => error.code === 'PATTERN_MISSING')
  await assert.rejects(save(doc(ref('r_none', 2147483000))), error => error.code === 'PATTERN_MISSING')
  // Referenced: the page shows the pattern's current blocks, wrapped without a box of its own.
  await save(doc(heading('h_page', `${stamp}-page`), ref('r_one', synced.id)))
  const html = async () => editor.publicBlocksHtml(await db.post.findUniqueOrThrow({ where: { id: post.id } }))
  let shown = await html()
  assert.match(shown, new RegExp(`${stamp}-first`)); assert.match(shown, /class="mcb mcb-content-pattern" data-pattern="/)
  // Edit in place: the page changes with no save of its own. A stale or audit-failing edit changes nothing.
  response = await patterns.editorPatterns(req('PATCH', { id: synced.id, updatedAt: synced.updatedAt, document: doc(heading('h_two', `${stamp}-second`)) }))
  assert.equal(response.status, 200, await response.clone().text())
  const edited = await response.json()
  shown = await html(); assert.match(shown, new RegExp(`${stamp}-second`)); assert.doesNotMatch(shown, new RegExp(`${stamp}-first`))
  assert.equal((await patterns.editorPatterns(req('PATCH', { id: synced.id, updatedAt: synced.updatedAt, title: 'stale' }))).status, 409)
  assert.equal((await patterns.editorPatterns(req('PATCH', { id: synced.id, updatedAt: edited.updatedAt, document: doc(ref('r_self', synced.id)) }))).status, 422)
  auditFault = true
  assert.equal((await patterns.editorPatterns(req('PATCH', { id: synced.id, updatedAt: edited.updatedAt, title: `${stamp}-renamed` }))).status, 500)
  auditFault = false
  assert.equal((await db.editorPattern.findUniqueOrThrow({ where: { id: synced.id } })).title, stamp, 'audit failure rolls back the edit')
  const audit = await db.auditLog.findFirst({ where: { actorUserId: admin.id, action: 'editor.pattern.update' } })
  assert.ok(audit); assert.equal(audit.targetType, 'EditorPattern')
  // An author may read the library and use it, never edit a pattern.
  viewer = { ...admin, roleId: 1234, permissions: ['journal.author'] }
  assert.equal((await patterns.editorPatterns(req('GET'))).status, 200)
  assert.equal((await patterns.editorPatterns(req('PATCH', { id: synced.id, updatedAt: edited.updatedAt, title: 'author' }))).status, 403)
  viewer = { ...admin, permissions: null }
  // In use: deletion is refused. Once no document points at it, it can go; a dangling reference then shows nothing.
  assert.equal((await patterns.editorPatterns(req('DELETE', { id: synced.id, updatedAt: edited.updatedAt }))).status, 409)
  await save(doc(heading('h_page', `${stamp}-page`)))
  assert.equal((await patterns.editorPatterns(req('DELETE', { id: synced.id, updatedAt: edited.updatedAt }))).status, 200)
  await db.post.update({ where: { id: post.id }, data: { contentDocument: JSON.stringify(doc(ref('r_gone', synced.id))) } })
  assert.doesNotMatch(await html(), new RegExp(stamp))
  // The editor plugin off: what was written keeps rendering (core block, not a plugin block).
  const live = await (await patterns.editorPatterns(req('POST', { title: `${stamp}-live`, kind: 'synced', document: doc(heading('h_live', `${stamp}-live`)) }))).json()
  await save(doc(ref('r_live', live.id)))
  on = false; assert.match(await html(), new RegExp(`${stamp}-live`)); on = true
  console.log('Synced patterns: live render, edit in place, stale/nested/foreign/missing refusal, audit rollback, author guard, delete-while-used refusal and plugin-off rendering passed.')
} finally {
  const users = await db.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } }), ids = users.map(row => row.id)
  const posts = await db.post.findMany({ where: { slug: stamp }, select: { id: true } })
  await db.contentRevision.deleteMany({ where: { entityType: 'posts', entityId: { in: posts.map(row => row.id) } } })
  await db.post.deleteMany({ where: { slug: stamp } })
  await db.editorPattern.deleteMany({ where: { createdById: { in: ids } } }); await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
