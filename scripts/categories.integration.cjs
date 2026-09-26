// Disposable fixtures only. Run against a local test server using the same DATABASE_URL.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const db = new PrismaClient()
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Localhost only')
const marker = `category-qa-${Date.now()}`
const categories = [], posts = []
async function main() {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  assert.ok(admin)
  const cookie = `next-auth.session-token=${await encode({ secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-me', token: { uid: String(admin.id), role: 'ADMIN', roleId: null, email: admin.email }, maxAge: 600 })}`
  async function request(type, method, body, id) {
    const response = await fetch(`${base}/api/admin/cms?type=${type}${id ? `&id=${id}` : ''}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json() }
  }
  async function category(name, parentId) {
    const result = await request('postcats', 'POST', { slug: `${marker}-${name}`, name, parentId })
    assert.equal(result.status, 200, JSON.stringify(result.data)); categories.push(result.data.id); return result.data
  }
  const root = await category('Root'), child = await category('Child', root.id), leaf = await category('Leaf', child.id), other = await category('Other')
  for (const parentId of [root.id, child.id, leaf.id]) assert.equal((await request('postcats', 'PATCH', { id: root.id, parentId })).status, 400)
  const create = await request('posts', 'POST', { slug: marker, title: marker, content: '<p>Test article</p>', categoryIds: [leaf.id, other.id, leaf.id] })
  assert.equal(create.status, 200, JSON.stringify(create.data)); const post = create.data; posts.push(post.id)
  assert.equal(await db.postCategoryAssignment.count({ where: { postId: post.id } }), 2)
  const list = await request('posts', 'GET')
  assert.deepEqual(list.data.find(item => item.id === post.id).categoryIds.sort(), [String(leaf.id), String(other.id)].sort())
  for (const cat of [root, child, leaf, other]) {
    const result = await fetch(`${base}/api/public/cms?type=posts&category=${cat.slug}`)
    assert.equal(result.status, 200)
    assert.ok((await result.json()).some(item => item.id === post.id))
    const page = await fetch(`${base}/blog?category=${cat.slug}`)
    assert.equal(page.status, 200); assert.ok((await page.text()).includes(marker))
  }
  const detail = await fetch(`${base}/blog/${marker}`); const html = await detail.text()
  assert.equal(detail.status, 200); assert.ok(html.includes(`category=${leaf.slug}`)); assert.ok(html.includes(`category=${other.slug}`))
  assert.equal((await request('posts', 'PATCH', { id: post.id, title: marker + '-edited' })).status, 200)
  assert.equal(await db.postCategoryAssignment.count({ where: { postId: post.id } }), 2)
  assert.equal((await request('posts', 'PATCH', { id: post.id, categoryIds: [2147483647] })).status, 400)
  assert.equal(await db.postCategoryAssignment.count({ where: { postId: post.id } }), 2)
  assert.equal((await request('postcats', 'DELETE', null, child.id)).status, 200)
  assert.equal((await db.postCategory.findUnique({ where: { id: leaf.id } })).parentId, null)
  assert.equal((await request('postcats', 'DELETE', null, leaf.id)).status, 200)
  assert.equal(await db.postCategoryAssignment.count({ where: { postId: post.id } }), 1)
  assert.ok(await db.post.findUnique({ where: { id: post.id } }))
  assert.equal((await request('posts', 'PATCH', { id: post.id, categoryIds: [] })).status, 200)
  assert.equal(await db.postCategoryAssignment.count({ where: { postId: post.id } }), 0)
  assert.equal((await db.post.findUnique({ where: { id: post.id } })).categoryId, null)
  assert.equal((await request('posts', 'PATCH', { id: post.id, categoryId: other.id })).status, 200)
  assert.equal(await db.postCategoryAssignment.count({ where: { postId: post.id } }), 1)
  const denied = await fetch(`${base}/api/admin/cms?type=postcats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Denied', slug: marker + '-denied' }) })
  assert.equal(denied.status, 403)
  console.log('PASS: nested categories, cycle rejection, multiple assignments, public ancestor filters, partial updates, rollback, deletion, clearing, legacy compatibility and authorization')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.post.deleteMany({ where: { id: { in: posts } } })
  await db.postCategory.deleteMany({ where: { id: { in: categories } } })
  await db.$disconnect()
})

