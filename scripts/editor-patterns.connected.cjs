const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), stamp = `pattern-${Date.now()}`
let viewer, on = true, auditFault = false
const may = (actor, key) => actor && (actor.roleId == null || actor.permissions?.includes(key))
let load
load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/extensions/server/modules': { isModuleEnabled: async () => on, getModuleStates: async () => ({}) },
  '@/modules/content/server/events': { contentChanged() {} },
  '@/modules/identity/server/access': {
    requireContentScope: async (_req, manager, author) => may(viewer, manager) || author && may(viewer, author) ? { admin: viewer, authorId: may(viewer, manager) ? null : viewer.id } : null,
    requirePerm: async (_req, key) => may(viewer, key) ? viewer : null,
  },
  '@/platform/audit/server': { auditAdminStrict: async (...args) => { if (auditFault) throw Error('injected audit outage'); return load('src/platform/audit/server.ts').auditAdminStrict(...args) } },
})
const patterns = load('src/modules/editor/server/patterns.ts'), editor = load('src/modules/editor/server/documents.ts'), adapter = load('src/modules/editor/adapters/gutenberg/convert.ts'), structure = load('src/modules/editor/domain/structure.ts')
const req = (method, body, entity = 'posts', origin = 'http://site.invalid') => new NextRequest(`http://site.invalid/api/admin/editor/patterns?entity=${entity}`, { method, headers: { host: 'site.invalid', origin, 'content-type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) })
const block = (id, lock) => ({ id, type: 'content.heading', version: 1, props: { text: id }, ...(lock ? { lock } : {}) }), doc = (...blocks) => ({ version: 1, blocks })
async function main() { try {
  const admin = await db.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'unused', role: 'ADMIN' } })
  viewer = { ...admin, permissions: null }
  const author = { ...admin, roleId: 1234, permissions: ['journal.author'] }
  const page = await db.post.create({ data: { slug: stamp, title: stamp, content: '', authorId: admin.id } })
  const locked = doc(block('locked_first', { move: true, remove: true }), block('sibling_second'))
  assert.equal((await patterns.editorPatterns(req('POST', { title: stamp, kind: 'template', document: locked }))).status, 410, 'article templates are retired')
  let response = await patterns.editorPatterns(req('POST', { title: stamp, kind: 'pattern', document: locked }))
  assert.equal(response.status, 201, await response.clone().text())
  const pattern = await response.json()
  response = await patterns.editorPatterns(req('GET')); assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const rows = (await response.json()).patterns, saved = rows.find(row => row.id === pattern.id)
  assert.ok(saved.document.blocks[0].lock.remove)
  const instance = structure.instantiatePattern(saved.document)
  assert.notEqual(instance.blocks[0].id, saved.document.blocks[0].id)
  const converted = adapter.fromEngineBlocks(adapter.toEngineBlocks(saved.document, editor.editorRegistry()), editor.editorRegistry())
  assert.deepEqual(converted.blocks[0].lock, { move: true, remove: true }, 'lock survives the engine adapter')
  let row = await db.post.findUniqueOrThrow({ where: { id: page.id } })
  await editor.saveDocument({ entity: 'posts', id: page.id, document: locked, expectedUpdatedAt: row.updatedAt.toISOString(), actor: viewer })
  viewer = author
  assert.equal((await patterns.editorPatterns(req('GET'))).status, 200)
  assert.equal((await patterns.editorPatterns(req('POST', { title: 'bypass', kind: 'pattern', document: locked }))).status, 403)
  assert.equal((await patterns.editorPatterns(req('DELETE', { id: pattern.id, updatedAt: pattern.updatedAt }))).status, 403)
  assert.equal((await patterns.editorPatterns(req('GET', null, 'pages'))).status, 403)
  row = await db.post.findUniqueOrThrow({ where: { id: page.id } })
  const attempt = async value => editor.saveDocument({ entity: 'posts', id: page.id, document: value, expectedUpdatedAt: row.updatedAt.toISOString(), actor: author })
  for (const value of [doc(locked.blocks[1]), doc(locked.blocks[1], locked.blocks[0]), doc({ ...locked.blocks[0], lock: {} }, locked.blocks[1])]) await assert.rejects(attempt(value), error => error.code === 'STRUCTURE_LOCKED')
  const editable = structuredClone(locked); editable.blocks[0].props.text = 'author text remains editable'
  editable.blocks.push(...instance.blocks)
  await attempt(editable)
  assert.match((await db.post.findUniqueOrThrow({ where: { id: page.id } })).content, /author text remains editable/)
  viewer = { ...admin, permissions: null }
  assert.equal((await patterns.editorPatterns(req('DELETE', { id: pattern.id, updatedAt: '2000-01-01T00:00:00.000Z' }))).status, 409)
  assert.equal((await patterns.editorPatterns(req('POST', { title: stamp, kind: 'pattern', document: locked }, 'posts', ''))).status, 403)
  auditFault = true
  assert.equal((await patterns.editorPatterns(req('DELETE', { id: pattern.id, updatedAt: pattern.updatedAt }))).status, 500)
  assert.equal(await db.editorPattern.count({ where: { id: pattern.id } }), 1, 'audit failure rolls back deletion')
  assert.equal((await patterns.editorPatterns(req('POST', { title: `${stamp}-fault`, kind: 'pattern', document: locked }))).status, 500)
  assert.equal(await db.editorPattern.count({ where: { title: `${stamp}-fault` } }), 0)
  auditFault = false; on = false
  assert.equal((await patterns.editorPatterns(req('GET'))).status, 404)
  on = true
  assert.equal((await patterns.editorPatterns(req('DELETE', { id: pattern.id, updatedAt: pattern.updatedAt }))).status, 200)
  console.log('Editor patterns: canonical roundtrip, independent identities, exact section/author guards, structural tamper refusal, editable fields, approved locked insertion, plugin off, CAS and atomic audit rollback passed.')
} finally {
  const users = await db.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } }), ids = users.map(row => row.id)
  const posts = await db.post.findMany({ where: { slug: stamp }, select: { id: true } })
  await db.contentRevision.deleteMany({ where: { entityType: 'posts', entityId: { in: posts.map(row => row.id) } } })
  const owned = await db.editorPattern.findMany({ where: { createdById: { in: ids } }, select: { id: true } })
  await db.contentRevision.deleteMany({ where: { entityType: { in: ['patterns-posts', 'patterns-pages'] }, entityId: { in: owned.map(row => row.id) } } })
  await db.editorPattern.deleteMany({ where: { createdById: { in: ids } } }); await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } })
  await db.post.deleteMany({ where: { slug: stamp } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
