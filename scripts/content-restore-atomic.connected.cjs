// Exercise the actual history HTTP composition and owner transactions, with real PostgreSQL rollback.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = 'restoreatomic' + Date.now() + process.pid
let fault = '', actor, allowed = true
const events = [], owned = []
function wrap(client) { return new Proxy(client, { get(target, key) {
 if (key === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
 if (['auditLog', 'contentRevision'].includes(key)) return new Proxy(target[key], { get(model, method) {
  if (method === 'create') return args => { if (fault === key) throw Error('injected ' + key); return model.create(args) }
  return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
 } })
 return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} }) }
const load = require('./connected-source-loader.cjs')({
 '@/platform/database/prisma': { db: wrap(prisma) }, '@/platform/observability/logger': { logEvent: () => {}, requestIdFrom: () => stamp },
 '@/modules/content/server/events': { contentChanged: ref => events.push(ref), MEDIA_RESOURCE_TYPE: { 'cinema-titles': 'title' } },
 '@/modules/identity/server/admin-guard': { adminGuard: async () => allowed ? { admin: actor } : { response: new Response('', { status: 403 }) } },
 '@/extensions/server/modules': { isModuleEnabled: async () => true, getModuleStates: async () => ({}), getModuleSettings: async () => ({}) },
 react: { ...require('react'), cache: fn => fn },
})
const history = load('src/modules/content/server/http/history.ts'), revisions = load('src/modules/content/server/revisions.ts')
const req = (body, origin = true) => new NextRequest('http://localhost:3000/api/admin/history', { method: 'POST', headers: { host: 'localhost:3000', ...(origin ? { origin: 'http://localhost:3000' } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) })
async function main() { try {
 actor = await prisma.user.create({ data: { email: stamp + '@example.invalid', passwordHash: 'unused' } })
 const rows = [
  ['posts', 'post', await prisma.post.create({ data: { slug: stamp, title: 'original', content: 'body', authorId: actor.id } }), load('src/modules/site/server/revision-state.ts').postRevisionState, 'title'],
  ['pages', 'page', await prisma.page.create({ data: { slug: stamp, title: 'original', content: 'body' } }), id => prisma.page.findUnique({ where: { id } }), 'title'],
  ['products', 'product', await prisma.product.create({ data: { slug: stamp, name: 'original', priceMinor: 500n, price: 5, stock: 3 } }), load('src/modules/catalog/server/revision-state.ts').productRevisionState, 'name'],
  ['cinema-titles', 'cinemaTitle', await prisma.cinemaTitle.create({ data: { slug: stamp, title: 'original', kind: 'MOVIE' } }), id => load('src/modules/media/server/admin.ts').mediaItemRow('cinema-titles', id), 'title'],
 ]
 owned.push(...rows.map(([type, model, row]) => ({ type, model, id: row.id })))
 for (const [type, model, row, state, field] of rows) {
  await revisions.recordRevision({ entityType: type, entityId: row.id, before: null, after: await state(row.id), actor, strict: true })
  await prisma[model].update({ where: { id: row.id }, data: { [field]: 'changed' } })
  await revisions.recordRevision({ entityType: type, entityId: row.id, before: null, after: await state(row.id), actor, strict: true })
  const body = { type, id: row.id, version: 1 }
  assert.equal((await history.POST_history(req(body, false))).status, 403)
  allowed = false; assert.equal((await history.POST_history(req(body))).status, 403); allowed = true
  for (const injected of ['contentRevision', 'auditLog']) {
   fault = injected; events.length = 0
   const oldError = console.error; console.error = () => {}
   try { assert.equal((await history.POST_history(req(body))).status, 500) } finally { console.error = oldError; fault = '' }
   assert.equal((await prisma[model].findUnique({ where: { id: row.id } }))[field], 'changed', type + ' content rolls back')
   assert.equal(await prisma.contentRevision.count({ where: { entityType: type, entityId: row.id } }), 2, type + ' revisions roll back')
   assert.equal(await prisma.auditLog.count({ where: { actorUserId: actor.id } }), 0, 'no partial audit')
   assert.equal(events.length, 0, 'no pre-commit event')
  }
  assert.equal((await history.POST_history(req(body))).status, 200)
  assert.equal((await prisma[model].findUnique({ where: { id: row.id } }))[field], 'original')
  assert.equal((await prisma.contentRevision.findFirst({ where: { entityType: type, entityId: row.id }, orderBy: { version: 'desc' } })).source, 'restore')
  const log = await prisma.auditLog.findFirstOrThrow({ where: { actorUserId: actor.id, targetType: type } })
  assert.deepEqual(JSON.parse(log.metadata), { version: 1, newVersion: 3 })
  await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } })
 }
 console.log('Atomic history: posts/pages/catalogue/media restore, strict revision/audit fault rollback, denied requests and post-commit events passed')
} finally {
 fault = ''
 for (const row of owned.reverse()) { await prisma.contentRevision.deleteMany({ where: { entityType: row.type, entityId: row.id } }); await prisma[row.model].deleteMany({ where: { id: row.id } }) }
 if (actor) { await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } }); await prisma.user.delete({ where: { id: actor.id } }) }
 await prisma.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
