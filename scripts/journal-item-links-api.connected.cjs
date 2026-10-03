// Run inside the local app container after an authenticated E2E setup.
const assert = require('node:assert/strict')
const path = require('node:path')
const { request } = require('@playwright/test')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const slug = `journal-link-api-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let productId = 0
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
    assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).title, `${slug} edited`, 'invalid link rolls back post edit')
    assert.equal(await db.postItemLink.count({ where: { postId } }), 1)

    const related = await json(await guest.get(`/api/products/${slug}/tabs?tab=related-posts`), 200)
    assert.equal(related.items[0].id, postId, 'explicit article has priority')
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, publishedAt: new Date(Date.now() + 86_400_000).toISOString() } }), 200)
    const scheduled = await json(await guest.get(`/api/products/${slug}/tabs?tab=related-posts`), 200)
    assert.equal(scheduled.items.some((item) => item.id === postId), false, 'future article is hidden')

    await db.product.update({ where: { id: productId }, data: { approval: 'PENDING' } })
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, title: `${slug} withdrawn target`, itemLinks: [{ type: 'product', id: productId }] } }), 200)
    assert.equal(await db.postItemLink.count({ where: { postId } }), 1, 'existing withdrawn link stays editable')
    const picker = await json(await admin.get(`/api/admin/journal/link-products?ids=${productId}`), 200)
    assert.deepEqual(picker.selected, [], 'withdrawn product name is not disclosed by picker')
    await json(await admin.patch('/api/admin/cms?type=posts', { data: { id: postId, itemLinks: [] } }), 200)
    assert.equal(await db.postItemLink.count({ where: { postId } }), 0, 'explicit empty list removes links')
    assert.equal((await guest.get(`/api/products/${slug}/tabs?tab=related-posts`)).status(), 404, 'withdrawn product is hidden')
    console.log('Journal link CMS/API: save, old client, rollback, public priority, schedule, withdrawn target, clear and permission passed')
  } finally {
    if (postId) {
      const response = await admin.delete(`/api/admin/cms?type=posts&id=${postId}`).catch(() => null)
      if (!response?.ok()) await db.post.deleteMany({ where: { id: postId, slug } })
      await db.searchDocument.deleteMany({ where: { itemType: 'post', itemId: postId, url: `/blog/${slug}` } })
    }
    if (productId) await db.product.deleteMany({ where: { id: productId, slug } })
    await Promise.all([admin.dispose(), guest.dispose()])
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await db.$disconnect() })
