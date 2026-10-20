// Role default templates: a section manager sets the full template each writing role starts from; a new, empty item
// opens from it, nothing else does; removing the template or the role removes the default; changes are audited.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const db = new PrismaClient(), stamp = `roletpl-${Date.now()}`
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
const defaults = load('src/modules/editor/server/role-templates.ts'), documents = load('src/modules/editor/server/http/documents.ts')
const headers = (origin = true) => ({ host: 'site.invalid', 'content-type': 'application/json', ...(origin ? { origin: 'http://site.invalid' } : {}) })
const table = (method = 'GET', body, entity = 'posts', origin = true) => defaults.roleTemplates(new NextRequest(`http://site.invalid/api/admin/editor/role-templates?entity=${entity}`, { method, headers: headers(origin), ...(body ? { body: JSON.stringify(body) } : {}) }))
const opened = async (id, entity = 'posts') => { const response = await documents.GET(new NextRequest(`http://site.invalid/api/admin/editor/${entity}/${id}`, { headers: headers() }), { params: Promise.resolve({ entity, id: String(id) }) }); assert.equal(response.status, 200, await response.clone().text()); return response.json() }
const doc = (text) => JSON.stringify({ version: 1, blocks: [{ id: 'h_start', type: 'content.heading', version: 1, props: { text, level: 2 } }] })
const ids = { users: [], roles: [] }

async function main() { try {
  const owner = await db.user.create({ data: { email: `${stamp}-owner@example.invalid`, passwordHash: 'unused', role: 'ADMIN' } }); ids.users.push(owner.id)
  const writerRole = await db.role.create({ data: { name: `${stamp}-writer`, nameFa: 'نویسنده', permissions: 'journal.author' } })
  const editorRole = await db.role.create({ data: { name: `${stamp}-editor`, nameFa: 'سردبیر', permissions: 'cms.posts' } })
  const formsRole = await db.role.create({ data: { name: `${stamp}-forms`, permissions: 'forms.handle' } })
  ids.roles.push(writerRole.id, editorRole.id, formsRole.id)
  const writer = await db.user.create({ data: { email: `${stamp}-writer@example.invalid`, passwordHash: 'unused', role: 'ADMIN', roleId: writerRole.id } }); ids.users.push(writer.id)
  const manager = { ...owner, roleId: editorRole.id, permissions: ['cms.posts'] }
  const asWriter = { ...writer, permissions: ['journal.author'] }
  const template = await db.editorPattern.create({ data: { entity: 'posts', kind: 'template', title: `${stamp} مقاله`, contentDocument: doc(`${stamp}-start`), createdById: owner.id } })
  const piece = await db.editorPattern.create({ data: { entity: 'posts', kind: 'pattern', title: `${stamp} تکه`, contentDocument: doc('piece'), createdById: owner.id } })
  const pagesTemplate = await db.editorPattern.create({ data: { entity: 'pages', kind: 'template', title: `${stamp} برگه`, contentDocument: doc('page'), createdById: owner.id } })

  // The manager's table lists the roles that write in the section and this section's full templates only.
  viewer = manager
  let state = await (await table()).json()
  const listed = state.roles.map(role => role.id)
  assert.ok(listed.includes(writerRole.id) && listed.includes(editorRole.id), 'authors and managers of the section are listed')
  assert.ok(!listed.includes(formsRole.id), 'a role that cannot write here is not')
  assert.ok(state.templates.some(row => row.id === template.id)); assert.ok(!state.templates.some(row => row.id === piece.id || row.id === pagesTemplate.id))

  // Refusals: a plain pattern, another section's template, a role that does not write here, no Origin, not a manager.
  for (const body of [{ roleId: writerRole.id, patternId: piece.id }, { roleId: writerRole.id, patternId: pagesTemplate.id }, { roleId: formsRole.id, patternId: template.id }, { roleId: writerRole.id, patternId: 2147483000 }]) assert.equal((await table('PUT', body)).status, 422, JSON.stringify(body))
  assert.equal((await table('PUT', { roleId: writerRole.id, patternId: template.id }, 'posts', false)).status, 403)
  viewer = asWriter
  assert.equal((await table()).status, 403, 'an author does not see the table'); assert.equal((await table('PUT', { roleId: writerRole.id, patternId: template.id })).status, 403)
  viewer = manager
  // An audit outage leaves no default behind.
  auditFault = true
  await assert.rejects(table('PUT', { roleId: writerRole.id, patternId: template.id }), /injected audit outage/)
  auditFault = false
  assert.equal(await db.editorRoleTemplate.count({ where: { roleId: writerRole.id } }), 0)
  // Set; audited with before/after.
  assert.equal((await table('PUT', { roleId: writerRole.id, patternId: template.id })).status, 200)
  state = await (await table()).json()
  assert.equal(state.assignments[writerRole.id], template.id)
  const audit = await db.auditLog.findFirst({ where: { action: 'editor.role-template.set', targetId: String(writerRole.id) } })
  assert.ok(audit); assert.deepEqual(JSON.parse(audit.metadata), { entity: 'posts', from: null, to: template.id })

  // A writer's new, empty article opens from it; an article with a body, or already in blocks, does not.
  viewer = asWriter
  const fresh = await db.post.create({ data: { slug: `${stamp}-fresh`, title: stamp, content: '', authorId: writer.id } })
  let body = await opened(fresh.id)
  assert.equal(body.startTemplate?.id, template.id); assert.equal(body.startTemplate.document.blocks[0].props.text, `${stamp}-start`)
  assert.equal(body.document.blocks.length, 0, 'the stored item is untouched')
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: fresh.id } })).editorFormat, 'legacy', 'nothing is saved by opening')
  const written = await db.post.create({ data: { slug: `${stamp}-written`, title: stamp, content: '<p>old</p>', authorId: writer.id } })
  assert.equal((await opened(written.id)).startTemplate, null, 'an item with a body opens as it is')
  const blocks = await db.post.create({ data: { slug: `${stamp}-blocks`, title: stamp, content: '', editorFormat: 'blocks-v1', contentDocument: JSON.stringify({ version: 1, blocks: [] }), authorId: writer.id } })
  assert.equal((await opened(blocks.id)).startTemplate, null, 'an item already saved in blocks, even emptied, opens as it is')
  // The owner (no role) and a role without a default start blank.
  viewer = { ...owner, permissions: null }
  assert.equal((await opened(fresh.id)).startTemplate, null)
  viewer = manager
  assert.equal((await opened(fresh.id)).startTemplate, null)

  // Removing the default, the template or the role takes the default away.
  assert.equal((await table('PUT', { roleId: writerRole.id, patternId: null })).status, 200)
  assert.equal(await db.editorRoleTemplate.count({ where: { roleId: writerRole.id } }), 0)
  assert.equal((await table('PUT', { roleId: writerRole.id, patternId: template.id })).status, 200)
  assert.equal((await table('PUT', { roleId: editorRole.id, patternId: template.id })).status, 200)
  await db.editorPattern.delete({ where: { id: template.id } })
  assert.equal(await db.editorRoleTemplate.count({ where: { patternId: template.id } }), 0, 'deleting the template removes its defaults')
  viewer = asWriter
  assert.equal((await opened(fresh.id)).startTemplate, null)
  viewer = manager
  const second = await db.editorPattern.create({ data: { entity: 'posts', kind: 'template', title: `${stamp} دوم`, contentDocument: doc('second'), createdById: owner.id } })
  assert.equal((await table('PUT', { roleId: formsRole.id, patternId: second.id })).status, 422)
  assert.equal((await table('PUT', { roleId: writerRole.id, patternId: second.id })).status, 200)
  await db.user.update({ where: { id: writer.id }, data: { roleId: null } })
  await db.role.delete({ where: { id: writerRole.id } })
  assert.equal(await db.editorRoleTemplate.count({ where: { patternId: second.id } }), 0, 'deleting the role removes its default')

  // With the block editor off the table is not there.
  on = false
  assert.equal((await table()).status, 404)
  on = true
  console.log('PostgreSQL role default templates: listed roles/templates, refusals, audit outage rollback, audited set, only new empty items start from it, owner/no-default blank, cascade on template and role removal, editor switch passed')
} finally {
  await db.post.deleteMany({ where: { slug: { startsWith: stamp } } })
  await db.editorPattern.deleteMany({ where: { title: { startsWith: stamp } } })
  await db.auditLog.deleteMany({ where: { action: 'editor.role-template.set', actorUserId: { in: ids.users } } })
  await db.user.updateMany({ where: { id: { in: ids.users } }, data: { roleId: null } })
  await db.role.deleteMany({ where: { id: { in: ids.roles } } })
  await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
