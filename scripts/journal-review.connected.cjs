// Magazine editorial review on real PostgreSQL through the real cms route, the review owner and the block-editor
// document store (docs/specs/journal-review/SPEC.md): with the setting off an author publishes as before; with it on an
// author can only draft or send for review (every writer refuses a publish and any change of a published article,
// writing nothing), the manager approves (publication time rule, version, audit, notice) or returns with a note,
// a second decision is refused, a batch approval keeps the time rule, and only the three form statuses pass.
// Owns its users, role, posts and the journal setting it changes (restored afterwards).
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = `jreview-${Date.now().toString(36)}`, started = new Date()
const SETTING = 'journal.home.v1'
let viewer
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: prisma },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => (viewer ? { uid: viewer.id, authAt: started.toISOString() } : null) },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, requireModule: async () => {}, moduleGuard: async () => null, getModuleStates: async () => ({ store: true, journal: true, cinema: true, music: true, games: true, software: true, forum: true }), getModuleSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), rateLimitHit: async () => ({ ok: true }) },
  '@/modules/seo/server/indexnow': { publicPathFor: () => null, queueIndexNow: async () => {} },
  react: { ...require('react'), cache: (fn) => fn },
})
const cms = load('src/modules/site/server/http/admin/cms/route.ts')
const editor = load('src/modules/editor/server/documents.ts')
const journal = load('src/modules/journal/server/admin.ts')
const req = (method, body, query = '') => new NextRequest(`http://site.invalid/api/admin/cms?type=posts${query}`, { method, headers: { host: 'site.invalid', origin: 'http://site.invalid', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: body ? JSON.stringify(body) : undefined })
const call = async (method, body, query) => { const response = await cms[method === 'BULK' ? 'BULK' : method](req(method === 'BULK' ? 'POST' : method, body, query)); return { status: response.status, body: await response.json().catch(() => null) } }
const post = (id) => prisma.post.findUniqueOrThrow({ where: { id } })
const setReview = async (on) => prisma.setting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: JSON.stringify({ reviewAuthorPosts: on }) }, update: { value: JSON.stringify({ ...JSON.parse((await prisma.setting.findUnique({ where: { key: SETTING } }))?.value || '{}'), reviewAuthorPosts: on }) } })
const doc = (text) => ({ version: 1, blocks: [{ id: 'blk_00001', type: 'content.heading', version: 1, props: { text, level: 2 } }] })
let original

async function main() {
  original = await prisma.setting.findUnique({ where: { key: SETTING } })
  const role = await prisma.role.create({ data: { name: stamp, permissions: 'dashboard.view,journal.author' } })
  const manager = await prisma.user.create({ data: { email: `${stamp}-manager@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN' } })
  const author = await prisma.user.create({ data: { email: `${stamp}-author@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
  const authorActor = { id: author.id, email: author.email, roleId: role.id, permissions: ['dashboard.view', 'journal.author'] }
  const article = (name, extra = {}) => ({ slug: `${stamp}-${name}`, title: `${stamp} ${name}`, content: '<p>متن</p>', ...extra })
  const count = () => prisma.post.count({ where: { slug: { startsWith: stamp } } })

  // ---- setting off: an author publishes as before
  await setReview(false)
  viewer = author
  let r = await call('POST', article('free', { status: 'PUBLISHED' }))
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal((await post(r.body.id)).status, 'PUBLISHED')
  const freeId = r.body.id

  // ---- setting on: every way to publish or to change a published article is refused, nothing written
  await setReview(true)
  const before = await count()
  for (const status of ['PUBLISHED', undefined]) {
    r = await call('POST', article(`pub-${status || 'none'}`, status ? { status } : {}))
    assert.equal(r.status, 403, `an author's create with status ${status} is refused`)
  }
  assert.equal(await count(), before, 'a refused create writes nothing')
  r = await call('PATCH', { id: freeId, title: 'changed' })
  assert.equal(r.status, 403, 'a published article is the editor\'s to change')
  r = await call('BULK', { ids: [freeId], action: 'draft' })
  assert.deepEqual(r.body?.failed?.map((f) => f.id), [freeId], 'a batch does not take a published article off the site')
  const live = await post(freeId)
  assert.deepEqual([live.status, live.title], ['PUBLISHED', `${stamp} free`])
  const lockedSave = await editor.saveDocument({ entity: 'posts', id: freeId, document: doc('تغییر'), expectedUpdatedAt: live.updatedAt.toISOString(), actor: authorActor }).then(() => null, (error) => error)
  assert.deepEqual([lockedSave?.status, lockedSave?.code], [403, 'REVIEW_LOCKED'], 'nor does the block editor change it')
  assert.equal((await post(freeId)).editorFormat, 'legacy')

  // ---- allowed for the author: a draft, sent for review, back to draft, sent again
  r = await call('POST', article('draft', { status: 'DRAFT' }))
  assert.equal(r.status, 200); const draftId = r.body.id
  r = await call('BULK', { ids: [draftId], action: 'publish' })
  assert.deepEqual(r.body?.failed?.map((f) => f.id), [draftId], 'a batch publish by an author is refused')
  assert.equal((await post(draftId)).status, 'DRAFT')
  r = await call('PATCH', { id: draftId, status: 'PENDING' }); assert.equal(r.status, 200)
  r = await call('PATCH', { id: draftId, status: 'PUBLISHED' }); assert.equal(r.status, 403, 'nor by saving')
  r = await call('PATCH', { id: draftId, review: 'approve' }); assert.equal(r.status, 403, 'an author does not decide')
  assert.equal((await post(draftId)).status, 'PENDING')
  // the article was written a week ago: an approval publishes it now, not with that date
  await prisma.post.update({ where: { id: draftId }, data: { publishedAt: new Date(Date.now() - 7 * 86_400_000) } })
  r = await call('POST', article('scheduled', { status: 'PENDING', publishedAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }))
  assert.equal(r.status, 200); const scheduledId = r.body.id
  r = await call('POST', article('returned', { status: 'PENDING' })); const returnedId = r.body.id
  r = await call('POST', article('batch', { status: 'PENDING' })); const batchId = r.body.id
  await prisma.post.update({ where: { id: batchId }, data: { publishedAt: new Date(Date.now() - 86_400_000) } })

  // ---- the manager's list, dashboard and overview see the waiting articles
  viewer = manager
  r = await call('GET', null, `&paged=1&limit=50&q=${stamp}&state=pending`)
  assert.deepEqual(r.body.rows.map((row) => row.id).sort((a, b) => a - b), [draftId, scheduledId, returnedId, batchId].sort((a, b) => a - b))
  assert.equal(r.body.reviewing, true); assert.ok(r.body.counts.state.pending >= 4)
  assert.ok((await journal.journalDashboard()).kpis.reviewWaiting >= 4, 'the dashboard counts them')

  // ---- decisions
  const t0 = Date.now()
  r = await call('PATCH', { id: draftId, review: 'approve' })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  let saved = await post(draftId)
  assert.equal(saved.status, 'PUBLISHED'); assert.ok(saved.publishedAt.getTime() >= t0 - 1000, 'an old publication time becomes now')
  r = await call('PATCH', { id: draftId, review: 'return' }); assert.equal(r.status, 409, 'a second decision is refused')
  r = await call('PATCH', { id: scheduledId, review: 'approve' }); assert.equal(r.status, 200)
  saved = await post(scheduledId)
  assert.ok(saved.publishedAt.getTime() > Date.now() + 2 * 86_400_000, 'a future publication time stays its schedule')
  r = await call('PATCH', { id: returnedId, review: 'return', note: 'منبع را اضافه کنید' }); assert.equal(r.status, 200)
  assert.equal((await post(returnedId)).status, 'DRAFT')
  r = await call('PATCH', { id: returnedId, review: 'maybe' }); assert.equal(r.status, 400)
  r = await call('BULK', { ids: [batchId], action: 'publish' }); assert.deepEqual([r.body?.changed, r.body?.failed], [1, []], JSON.stringify(r.body))
  saved = await post(batchId)
  assert.equal(saved.status, 'PUBLISHED'); assert.ok(saved.publishedAt.getTime() >= t0 - 1000, 'a batch approval keeps the time rule')

  // ---- versions, audit and the author's notices
  assert.ok(await prisma.contentRevision.count({ where: { entityType: 'posts', entityId: draftId } }) >= 3, 'the decision is a version')
  assert.deepEqual((await prisma.auditLog.findMany({ where: { targetType: 'posts', targetId: { in: [String(draftId), String(returnedId)] }, action: { startsWith: 'cms.posts.review.' } }, orderBy: { id: 'asc' } })).map((row) => row.action), ['cms.posts.review.approve', 'cms.posts.review.return'])
  const notices = await prisma.userNotification.findMany({ where: { userId: author.id, kind: 'POST_REVIEW' }, orderBy: { id: 'asc' } })
  assert.equal(notices.length, 4, 'approve, schedule approve, return and the batch approval each tell the author')
  assert.ok(notices.some((notice) => (notice.bodyFa || '').includes('منبع را اضافه کنید')), 'the note reaches the author')

  // ---- only the three form statuses
  for (const status of ['TRASHED', 'ARCHIVED', 'published']) assert.equal((await call('PATCH', { id: returnedId, status })).status, 400, `${status} is refused`)
  // ---- the setting off again: the author publishes as before
  await setReview(false); viewer = author
  r = await call('PATCH', { id: returnedId, status: 'PUBLISHED' }); assert.equal(r.status, 200)
  console.log('PostgreSQL magazine review: off = unchanged; on = an author drafts or sends for review only (create, save, batch, block editor refuse publishing or changing a live article, writing nothing); the manager approves (old time -> now, schedule kept, version, audit, notice) or returns with a note; a second decision 409; batch approval keeps the time rule; only DRAFT/PENDING/PUBLISHED accepted.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    if (original) await prisma.setting.update({ where: { key: SETTING }, data: { value: original.value } })
    else await prisma.setting.deleteMany({ where: { key: SETTING } })
    const ids = (await prisma.post.findMany({ where: { slug: { startsWith: stamp } }, select: { id: true } })).map((row) => row.id)
    await prisma.contentRevision.deleteMany({ where: { entityType: 'posts', entityId: { in: ids } } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ targetType: 'posts', targetId: { in: ids.map(String) } }, { actorEmail: { startsWith: stamp } }] } })
    await prisma.post.deleteMany({ where: { id: { in: ids } } })
    const users = (await prisma.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } })).map((row) => row.id)
    await prisma.userNotification.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.role.deleteMany({ where: { name: stamp } })
  } finally { await prisma.$disconnect() }
})
