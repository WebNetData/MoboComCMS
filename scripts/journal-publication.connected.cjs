// Local Docker: node scripts/journal-publication.connected.cjs inside the app container.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const seed = `codex-journal-${Date.now()}`
const base = 'http://127.0.0.1:3000'
const postIds = []
let categoryId

async function get(path) {
  return fetch(`${base}${path}`, { signal: AbortSignal.timeout(60_000), headers: { 'cache-control': 'no-cache' } })
}

async function main() {
  const category = await db.postCategory.create({ data: { slug: seed, name: `${seed} category` } })
  categoryId = category.id
  const live = await db.post.create({ data: { slug: `${seed}-live`, title: `${seed} live story`, content: '<p>Public article</p>', categoryId, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86_400_000) } })
  const scheduled = await db.post.create({ data: { slug: `${seed}-scheduled`, title: `${seed} scheduled story`, content: '<p>Scheduled article</p>', categoryId, status: 'PUBLISHED', publishedAt: new Date(Date.now() + 86_400_000) } })
  const draft = await db.post.create({ data: { slug: `${seed}-draft`, title: `${seed} draft story`, content: '<p>Draft article</p>', categoryId, status: 'DRAFT', publishedAt: new Date(Date.now() - 86_400_000) } })
  postIds.push(live.id, scheduled.id, draft.id)

  const listing = await get(`/blog?category=${seed}&q=${seed}`)
  assert.equal(listing.status, 200)
  const html = await listing.text()
  assert.ok(html.includes(live.title), 'live article appears in the journal search/category listing')
  assert.ok(!html.includes(scheduled.title) && !html.includes(draft.title), 'scheduled and draft articles stay out of the listing')

  const posts = await get(`/api/public/cms?type=posts&category=${seed}`)
  assert.equal(posts.status, 200)
  const publicPosts = JSON.stringify(await posts.json())
  assert.ok(publicPosts.includes(live.title) && !publicPosts.includes(scheduled.title) && !publicPosts.includes(draft.title), 'public CMS list applies the same publication gate')

  for (const hidden of [scheduled, draft]) {
    assert.equal((await get(`/blog/${hidden.slug}`)).status, 404, 'hidden article detail is closed')
    assert.equal((await get(`/api/public/cms?type=post&slug=${hidden.slug}`)).status, 404, 'hidden CMS detail is closed')
    assert.equal((await get(`/api/blog/${hidden.slug}/comments`)).status, 404, 'hidden comments are closed')
  }
  const liveDetail = await get(`/blog/${live.slug}`)
  assert.equal(liveDetail.status, 200)
  assert.ok(!(await liveDetail.text()).includes(scheduled.title), 'related and adjacent links exclude scheduled stories')
  const sitemap = await (await get('/sitemap.xml')).text()
  assert.ok(sitemap.includes(`/blog/${live.slug}`), 'live story is indexed')
  assert.ok(!sitemap.includes(`/blog/${scheduled.slug}`) && !sitemap.includes(`/blog/${draft.slug}`), 'hidden stories are not indexed')
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: scheduled.id } })).views, 0, 'hidden article reads do not increment views')

  await db.post.update({ where: { id: scheduled.id }, data: { publishedAt: new Date(Date.now() - 60_000) } })
  assert.equal((await get(`/blog/${scheduled.slug}`)).status, 200, 'scheduled article opens once due without deployment')
  assert.equal((await get(`/api/public/cms?type=post&slug=${scheduled.slug}`)).status, 200)
  assert.equal((await get(`/api/blog/${scheduled.slug}/comments`)).status, 200)
  console.log('Journal publication: listing, API, detail, comments and sitemap gates OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (postIds.length) await db.post.deleteMany({ where: { id: { in: postIds } } })
  if (categoryId) await db.postCategory.delete({ where: { id: categoryId } })
  await db.$disconnect()
})
