// Run inside the local app container after an authenticated E2E setup.
const assert = require('node:assert/strict')
const path = require('node:path')
const { request } = require('@playwright/test')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const slug = `journal-link-api-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let productId = 0
let gameId = 0
let postId = 0

async function json(response, expected) {
  assert.equal(response.status(), expected, await response.text())
  return response.json()
}

async function main() {
  const admin = await request.newContext({ baseURL: 'http://localhost:3000', storageState: path.resolve('e2e/.auth/admin.json') })
  const guest = await request.newContext({ baseURL: 'http://localhost:3000' })
  try {
    const product = await db.product.create({ data: { slug, name: `Link API ${slug}`, active: true, approval: 'APPROVED' } })
    productId = product.id
    const created = await json(await admin.post('/api/admin/cms?type=posts', { data: { slug, title: `Link API ${slug}`, content: '<p>check</p>', status: 'PUBLISHED', itemLinks: [{ type: 'product', id: productId }] } }), 200)
    postId = created.id
    const [row] = await json(await admin.get(`/api/admin/cms?type=posts&id=${postId}`), 200)
    assert.deepEqual(row.itemLinks, [{ type: 'product', id: productId }])

    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, title: `${slug} edited` } }), 200)
    assert.equal(await db.postItemLink.count({ where: { postId } }), 1, 'old client edit preserves links')

    const bad = await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, title: 'MUST NOT SAVE', itemLinks: [{ type: 'product', id: productId + 1_000_000 }] } })
    assert.equal(bad.status(), 400)
    const badType = await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, title: 'MUST NOT SAVE', itemLinks: [{ type: 'post', id: postId }] } })
    assert.equal(badType.status(), 400, 'article and thread refs are outside the linkable vocabulary')
    const listed = await json(await admin.get(`/api/admin/journal/link-items?type=product&q=${slug.slice(0, 8)}`), 200)
    assert.ok(listed.matches.some((match) => match.type === 'product' && match.id === productId && match.url === `/products/${slug}` && typeof match.title === 'string'), 'picker search returns the public product card')
    assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).title, `${slug} edited`, 'invalid link rolls back post edit')
    assert.equal(await db.postItemLink.count({ where: { postId } }), 1)

    const related = await json(await guest.get(`/api/products/${slug}/tabs?tab=related-posts`), 200)
    assert.equal(related.items[0].id, postId, 'explicit article has priority')
    const article = await guest.get(`/blog/${slug}`)
    assert.equal(article.status(), 200)
    assert.ok((await article.text()).includes(`/products/${slug}`), 'public article shows its linked product')
    const game = await db.gameTitle.create({ data: { slug, title: `Game ${slug}`, titleEn: `English game ${slug}`, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) } })
    gameId = game.id
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, itemLinks: [{ type: 'game', id: gameId }, { type: 'product', id: productId }] } }), 200)
    const games = await json(await admin.get(`/api/admin/journal/link-items?type=game&q=${slug}`), 200)
    assert.ok(games.matches.some(item => item.id === gameId && item.url === `/games/${slug}` && item.titleEn === game.titleEn))
    const mixedArticle = await guest.get(`/blog/${slug}`)
    assert.equal(mixedArticle.status(), 200)
    assert.ok((await mixedArticle.text()).includes(`/games/${slug}`), 'public article shows a real game reference')
    await db.gameTitle.update({ where: { id: gameId }, data: { status: 'DRAFT' } })
    assert.equal((await (await guest.get(`/blog/${slug}`)).text()).includes(`/games/${slug}`), false, 'draft game is hidden from article')
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, itemLinks: [{ type: 'product', id: productId }] } }), 200)
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, publishedAt: new Date(Date.now() + 86_400_000).toISOString() } }), 200)
    const scheduled = await json(await guest.get(`/api/products/${slug}/tabs?tab=related-posts`), 200)
    assert.equal(scheduled.items.some((item) => item.id === postId), false, 'future article is hidden')

    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, publishedAt: new Date(Date.now() - 60_000).toISOString() } }), 200)
    await db.product.update({ where: { id: productId }, data: { approval: 'PENDING' } })
    const withdrawnArticle = await guest.get(`/blog/${slug}`)
    assert.equal(withdrawnArticle.status(), 200)
    assert.equal((await withdrawnArticle.text()).includes(`/products/${slug}`), false, 'withdrawn product is hidden from article')
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, title: `${slug} withdrawn target`, itemLinks: [{ type: 'product', id: productId }] } }), 200)
    assert.equal(await db.postItemLink.count({ where: { postId } }), 1, 'existing withdrawn link stays editable')
    const picker = await json(await admin.get(`/api/admin/journal/link-products?ids=${productId}`), 200)
    assert.deepEqual(picker.selected, [], 'withdrawn product name is not disclosed by the legacy picker')
    const items = await json(await admin.get(`/api/admin/journal/link-items?type=product&refs=product:${productId}`), 200)
    assert.deepEqual(items.selected, [], 'withdrawn products stay hidden in the generic picker too')
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, itemLinks: [] } }), 200)
    assert.equal(await db.postItemLink.count({ where: { postId } }), 0, 'explicit empty list removes links')
    assert.equal((await guest.get(`/api/products/${slug}/tabs?tab=related-posts`)).status(), 404, 'withdrawn product is hidden')
    console.log('Journal link CMS/API: save, old client, rollback, registry vocabulary, picker search, public priority, article rail, schedule, withdrawn target, clear and permission passed')
  } finally {
    if (postId) {
      const response = await admin.delete(`/api/admin/cms?type=posts&id=${postId}`).catch(() => null)
      if (!response?.ok()) await db.post.deleteMany({ where: { id: postId, slug } })
      await db.searchDocument.deleteMany({ where: { itemType: 'post', itemId: postId, url: `/blog/${slug}` } })
    }
    if (productId) await db.product.deleteMany({ where: { id: productId, slug } })
    if (gameId) await db.gameTitle.deleteMany({ where: { id: gameId, slug } })
    await Promise.all([admin.dispose(), guest.dispose()])
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
