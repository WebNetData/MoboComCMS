// Edit proposals of published articles on real PostgreSQL through the real cms route (docs/specs/journal-review/SPEC.md,
// slice 2): with review on, an author's save of their published article is kept as its proposal (only what changes; never
// status, time or address; the live article untouched; a newer one replaces it); the manager sees it in the list and on
// the article, applies it in one step (fields, categories, version, audit, notice) or sets it aside with a note; a
// decision on a gone or replaced proposal is refused; with review off an author edits as before.
// Owns its users, role, categories, posts and the journal setting it changes (restored afterwards).
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = `jprop-${Date.now().toString(36)}`, started = new Date()
const SETTING = 'journal.home.v1'
let viewer, original
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: prisma },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => (viewer ? { uid: viewer.id, authAt: started.toISOString() } : null) },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, requireModule: async () => {}, moduleGuard: async () => null, getModuleStates: async () => ({ journal: true }), getModuleSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), rateLimitHit: async () => ({ ok: true }) },
  '@/modules/seo/server/indexnow': { publicPathFor: () => null, queueIndexNow: async () => {} },
  react: { ...require('react'), cache: (fn) => fn },
})
const cms = load('src/modules/site/server/http/admin/cms/route.ts')
const req = (method, body, query = '') => new NextRequest(`http://site.invalid/api/admin/cms?type=posts${query}`, { method, headers: { host: 'site.invalid', origin: 'http://site.invalid', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
const call = async (method, body, query) => { const response = await cms[method](req(method, body, query)); return { status: response.status, body: await response.json().catch(() => null) } }
const post = (id) => prisma.post.findUniqueOrThrow({ where: { id }, include: { categories: true, editProposal: true } })
const setReview = async (on) => prisma.setting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: JSON.stringify({ reviewAuthorPosts: on }) }, update: { value: JSON.stringify({ ...JSON.parse((await prisma.setting.findUnique({ where: { key: SETTING } }))?.value || '{}'), reviewAuthorPosts: on }) } })
const rowOf = async (id) => (await call('GET', null, `&paged=1&limit=50&q=${stamp}`)).body.rows.find((row) => row.id === id)

async function main() {
  original = await prisma.setting.findUnique({ where: { key: SETTING } })
  const role = await prisma.role.create({ data: { name: stamp, permissions: 'dashboard.view,journal.author' } })
  const manager = await prisma.user.create({ data: { email: `${stamp}-manager@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN' } })
  const author = await prisma.user.create({ data: { email: `${stamp}-author@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
  const news = await prisma.postCategory.create({ data: { slug: `${stamp}-news`, name: 'خبر' } })
  const guides = await prisma.postCategory.create({ data: { slug: `${stamp}-guides`, name: 'آموزش' } })
  const doomed = await prisma.postCategory.create({ data: { slug: `${stamp}-doomed`, name: 'رفتنی' } })
  const live = await prisma.post.create({ data: { slug: `${stamp}-live`, title: `${stamp} live`, excerpt: 'خلاصه', content: '<p>متن</p>', status: 'PUBLISHED', authorId: author.id, categoryId: news.id, categories: { create: [{ categoryId: news.id }] } } })
  const blocks = await prisma.post.create({ data: { slug: `${stamp}-blocks`, title: `${stamp} blocks`, content: '<h2>x</h2>', editorFormat: 'blocks-v1', contentDocument: JSON.stringify({ version: 1, blocks: [] }), status: 'PUBLISHED', authorId: author.id } })
  await setReview(true)

  // ---- the author's save of a published article is a proposal; the live article is untouched
  viewer = author
  let r = await call('PATCH', { id: live.id, title: `${stamp} better`, excerpt: 'خلاصه', status: 'DRAFT', slug: `${stamp}-moved`, publishedAt: '', categoryIds: [String(news.id)] })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.deepEqual([r.body.proposed, r.body.fields], [true, ['title']], 'only what changes is proposed; status, address and time never')
  let stored = await post(live.id)
  assert.deepEqual([stored.title, stored.status, stored.slug, stored.updatedAt.getTime()], [`${stamp} live`, 'PUBLISHED', `${stamp}-live`, live.updatedAt.getTime()], 'the live article is untouched')
  assert.equal(stored.editProposal.baseUpdatedAt.getTime(), live.updatedAt.getTime())
  r = await call('PATCH', { id: live.id, title: `${stamp} live`, excerpt: 'خلاصه' }); assert.equal(r.status, 400, 'a save that changes nothing proposes nothing')
  // a newer proposal replaces the open one
  r = await call('PATCH', { id: live.id, title: `${stamp} best`, categoryIds: [String(guides.id), String(news.id)] })
  assert.deepEqual(r.body.fields, ['title', 'categoryIds'])
  assert.equal(await prisma.postEditProposal.count({ where: { postId: live.id } }), 1, 'one proposal per article')
  const firstAt = (await rowOf(live.id))?.proposal?.at
  r = await call('PATCH', { id: live.id, proposalDecision: 'apply' }); assert.equal(r.status, 403, 'an author does not decide')
  // an article written in blocks: its body is not proposed here
  r = await call('PATCH', { id: blocks.id, content: '<p>نه</p>' }); assert.equal(r.status, 400)

  // ---- the manager sees it in the list and on the article
  viewer = manager
  r = await call('GET', null, `&paged=1&limit=50&q=${stamp}&state=proposed`)
  assert.deepEqual(r.body.rows.map((row) => row.id), [live.id])
  assert.ok(r.body.counts.state.proposed >= 1)
  let row = await rowOf(live.id)
  assert.deepEqual([row.proposal.changes.title, row.proposal.changes.categoryIds, row.proposal.stale], [`${stamp} best`, [guides.id, news.id], false])
  assert.equal(row.editProposal, undefined, 'the raw row is not sent')
  // the author replaces it after the manager read it: a decision on the older one is refused
  viewer = author
  await call('PATCH', { id: live.id, title: `${stamp} final`, categoryIds: [String(guides.id), String(news.id)] })
  viewer = manager
  r = await call('PATCH', { id: live.id, proposalDecision: 'apply', proposalAt: firstAt }); assert.equal(r.status, 409, 'the proposal the manager read was replaced')
  // the manager edits the live article meanwhile: the proposal says so
  await call('PATCH', { id: live.id, excerpt: 'خلاصهٔ سردبیر' })
  row = await rowOf(live.id)
  assert.equal(row.proposal.stale, true)

  // ---- apply: the fields and categories, a version, the audit row, the notice; a second decision is refused
  const versions = await prisma.contentRevision.count({ where: { entityType: 'posts', entityId: live.id } })
  r = await call('PATCH', { id: live.id, proposalDecision: 'apply', proposalAt: row.proposal.at }); assert.equal(r.status, 200, JSON.stringify(r.body))
  stored = await post(live.id)
  assert.deepEqual([stored.title, stored.excerpt, stored.status, stored.categoryId, stored.categories.map((c) => c.categoryId).sort()], [`${stamp} final`, 'خلاصهٔ سردبیر', 'PUBLISHED', guides.id, [guides.id, news.id].sort()], 'proposed fields applied; the manager\'s own edit kept')
  assert.equal(stored.editProposal, null)
  assert.equal(await prisma.contentRevision.count({ where: { entityType: 'posts', entityId: live.id } }), versions + 1)
  r = await call('PATCH', { id: live.id, proposalDecision: 'apply' }); assert.equal(r.status, 409, 'nothing left to decide')

  // ---- reject with a note: the live article stays
  viewer = author
  await call('PATCH', { id: live.id, title: `${stamp} rejected` })
  viewer = manager
  r = await call('PATCH', { id: live.id, proposalDecision: 'reject', note: 'عنوان فعلی بهتر است' }); assert.equal(r.status, 200)
  stored = await post(live.id)
  assert.deepEqual([stored.title, stored.editProposal], [`${stamp} final`, null])
  r = await call('PATCH', { id: live.id, proposalDecision: 'maybe' }); assert.equal(r.status, 400)

  // ---- a proposed category deleted before the decision: nothing is applied, the proposal stays
  viewer = author
  await call('PATCH', { id: live.id, categoryIds: [String(doomed.id)] })
  await prisma.postCategory.delete({ where: { id: doomed.id } })
  viewer = manager
  r = await call('PATCH', { id: live.id, proposalDecision: 'apply' }); assert.equal(r.status, 400)
  assert.notEqual((await post(live.id)).editProposal, null, 'a failed apply keeps the proposal')
  await call('PATCH', { id: live.id, proposalDecision: 'reject' })

  // ---- audit and notices
  assert.deepEqual((await prisma.auditLog.findMany({ where: { targetType: 'posts', targetId: String(live.id), action: { startsWith: 'cms.posts.proposal.' } }, orderBy: { id: 'asc' } })).map((a) => a.action),
    ['cms.posts.proposal.submit', 'cms.posts.proposal.submit', 'cms.posts.proposal.submit', 'cms.posts.proposal.apply', 'cms.posts.proposal.submit', 'cms.posts.proposal.reject', 'cms.posts.proposal.submit', 'cms.posts.proposal.reject'])
  assert.equal(await prisma.userNotification.count({ where: { userId: author.id, kind: 'POST_REVIEW' } }), 0, 'proposal decisions queue delivery atomically')
  await require('./connected-editorial-notices.cjs')(load, prisma, author.id)
  const notices = await prisma.userNotification.findMany({ where: { userId: author.id, kind: 'POST_REVIEW' }, orderBy: { id: 'asc' } })
  assert.deepEqual(notices.map((n) => n.titleFa), ['پیشنهاد ویرایش شما اعمال شد', 'پیشنهاد ویرایش شما پذیرفته نشد', 'پیشنهاد ویرایش شما پذیرفته نشد'])
  assert.ok(notices[1].bodyFa.includes('عنوان فعلی بهتر است'), 'the note reaches the author')

  // ---- review off: the author edits their published article directly, as before; deleting an article removes its proposal
  viewer = author
  await call('PATCH', { id: blocks.id, title: `${stamp} blocks 2` }).then((res) => assert.equal(res.status, 200))
  await setReview(false)
  r = await call('PATCH', { id: live.id, title: `${stamp} direct` }); assert.equal(r.status, 200)
  assert.deepEqual([(await post(live.id)).title, (await post(live.id)).editProposal], [`${stamp} direct`, null])
  assert.equal(await prisma.postEditProposal.count({ where: { postId: blocks.id } }), 1)
  await prisma.post.delete({ where: { id: blocks.id } })
  assert.equal(await prisma.postEditProposal.count({ where: { postId: blocks.id } }), 0, 'an article\'s proposal goes with it')
  console.log('PostgreSQL edit proposals: an author\'s save of a published article (review on) is its proposal (changed fields only, never status/time/address; live untouched; one per article, newer replaces); listed and shown with a stale flag; apply (fields, categories, version, audit, notice) or reject with a note; replaced/decided proposals refused; a deleted category keeps the proposal; review off = direct edit; cascade on delete.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    if (original) await prisma.setting.update({ where: { key: SETTING }, data: { value: original.value } })
    else await prisma.setting.deleteMany({ where: { key: SETTING } })
    const ids = (await prisma.post.findMany({ where: { slug: { startsWith: stamp } }, select: { id: true } })).map((row) => row.id)
    await prisma.contentRevision.deleteMany({ where: { entityType: 'posts', entityId: { in: ids } } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ targetType: 'posts', targetId: { in: ids.map(String) } }, { actorEmail: { startsWith: stamp } }] } })
    await prisma.post.deleteMany({ where: { id: { in: ids } } })
    await prisma.postCategory.deleteMany({ where: { slug: { startsWith: stamp } } })
    const users = (await prisma.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } })).map((row) => row.id)
    await prisma.userNotification.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.role.deleteMany({ where: { name: stamp } })
  } finally { await prisma.$disconnect() }
})
