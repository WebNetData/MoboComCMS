// The magazine's admin list on real PostgreSQL through the real route: articles narrowed by state (live, scheduled,
// draft, trash), by category (its sub-categories and secondary placements included), featured and VIP access, the
// narrowing combined with search and paging, counts per state, and unknown values refused. Owns its posts and categories.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = `jfilter-${Date.now().toString(36)}`, started = new Date()
let viewer
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: prisma },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  'next-auth/jwt': { getToken: async () => (viewer ? { uid: viewer.id, authAt: started.toISOString() } : null) },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, requireModule: async () => {}, moduleGuard: async () => null, getModuleStates: async () => ({}), getModuleSettings: async () => ({}) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), rateLimitHit: async () => ({ ok: true }) },
  react: { ...require('react'), cache: (fn) => fn },
})
const cms = load('src/modules/site/server/http/admin/cms/route.ts')
const list = async (query = '') => {
  const response = await cms.GET(new NextRequest(`http://site.invalid/api/admin/cms?type=posts&paged=1&limit=50&q=${stamp}${query}`, { headers: { host: 'site.invalid' } }))
  return { status: response.status, body: await response.json() }
}
const titles = async (query) => { const { status, body } = await list(query); assert.equal(status, 200, JSON.stringify(body)); return body.rows.map((row) => row.title).sort() }

async function main() {
  viewer = await prisma.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'owned fixture', role: 'ADMIN' } })
  const parent = await prisma.postCategory.create({ data: { slug: `${stamp}-parent`, name: 'والد' } })
  const child = await prisma.postCategory.create({ data: { slug: `${stamp}-child`, name: 'فرزند', parentId: parent.id } })
  const other = await prisma.postCategory.create({ data: { slug: `${stamp}-other`, name: 'دیگر' } })
  const hour = 3_600_000, now = Date.now()
  const post = (name, data) => prisma.post.create({ data: { slug: `${stamp}-${name}`, title: `${stamp} ${name}`, content: '<p>متن</p>', ...data } })
  await post('live-child', { status: 'PUBLISHED', publishedAt: new Date(now - hour), categoryId: child.id, featured: true })
  await post('scheduled', { status: 'PUBLISHED', publishedAt: new Date(now + 24 * hour), categoryId: other.id })
  await post('draft', { status: 'DRAFT', categoryId: parent.id })
  await post('trashed', { status: 'TRASHED', trashedStatus: 'PUBLISHED', trashedAt: new Date(), trashedById: viewer.id, categoryId: other.id })
  const vip = await post('vip', { status: 'PUBLISHED', publishedAt: new Date(now - hour), categoryId: other.id, access: 'MEMBERS' })
  await prisma.postCategoryAssignment.create({ data: { postId: vip.id, categoryId: child.id } })
  const name = (...names) => names.map((n) => `${stamp} ${n}`).sort()

  // ---- each state is exactly its articles
  assert.deepEqual(await titles(''), name('live-child', 'scheduled', 'draft', 'trashed', 'vip'), 'no narrowing lists everything, the trash included')
  assert.deepEqual(await titles('&state=live'), name('live-child', 'vip'), 'live: published and due')
  assert.deepEqual(await titles('&state=scheduled'), name('scheduled'), 'scheduled: published for later, not live')
  assert.deepEqual(await titles('&state=draft'), name('draft'))
  assert.deepEqual(await titles('&state=trashed'), name('trashed'))

  // ---- a category takes in its sub-categories and secondary placements, never a sibling
  assert.deepEqual(await titles(`&category=${parent.id}`), name('draft', 'live-child', 'vip'), 'the parent covers its own, its child and an article placed there second')
  assert.deepEqual(await titles(`&category=${child.id}`), name('live-child', 'vip'))
  assert.deepEqual(await titles(`&category=${other.id}`), name('scheduled', 'trashed', 'vip'))

  // ---- featured, access and combinations narrow together; paging counts the narrowed list
  assert.deepEqual(await titles('&featured=1'), name('live-child'))
  assert.deepEqual(await titles('&access=MEMBERS'), name('vip'))
  assert.deepEqual(await titles(`&state=live&category=${other.id}`), name('vip'), 'state and category combine')
  const narrowed = await list(`&state=live&category=${parent.id}`)
  assert.equal(narrowed.body.total, 2, 'the page count follows the narrowed list')

  // ---- the state filter's counts and refused values
  const { body } = await list()
  for (const state of ['live', 'scheduled', 'draft', 'trashed']) assert.ok(body.counts.state[state] >= 1, `a ${state} count is given`)
  for (const bad of ['&state=published', '&category=abc', '&category=0', '&featured=yes', '&access=VIP']) assert.equal((await list(bad)).status, 400, `${bad} is refused`)
  console.log('PostgreSQL magazine admin filters: state (live/scheduled/draft/trash) exact, category with sub-categories and secondary placements, featured, VIP access, combined with search and paging, state counts given, unknown values refused.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.post.deleteMany({ where: { slug: { startsWith: stamp } } })
    await prisma.postCategory.deleteMany({ where: { slug: { startsWith: stamp }, parentId: { not: null } } })
    await prisma.postCategory.deleteMany({ where: { slug: { startsWith: stamp } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: stamp } } })
  } finally { await prisma.$disconnect() }
})
