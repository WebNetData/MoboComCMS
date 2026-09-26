// Local-only disposable fixtures. No purchases or existing content changes.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const db = new PrismaClient()
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Localhost only')
const marker = `content-qa-${Date.now()}`
let category, page, product
const posts = []
async function get(path) { const res = await fetch(base + path); return { status: res.status, html: await res.text() } }
async function main() {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  assert.ok(admin)
  const cookie = `next-auth.session-token=${await encode({ secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-me', token: { uid: String(admin.id), role: 'ADMIN', roleId: null, email: admin.email }, maxAge: 600 })}`
  const patch = async body => fetch(base + '/api/admin/cms?type=pages', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  category = await db.postCategory.create({ data: { slug: marker, name: marker } })
  for (let i = 0; i < 11; i++) posts.push(await db.post.create({ data: { slug: `${marker}-${i}`, title: `${marker}-title-${i}`, content: '<h2>Overview</h2><p>Disposable content.</p><h2>Details</h2>', categoryId: category.id, publishedAt: new Date(2026, 0, i + 1) } }))
  const first = await get(`/blog?category=${marker}&q=${marker}`)
  assert.equal(first.status, 200)
  assert.ok(first.html.includes(`${marker}-title-10`))
  assert.ok(!first.html.includes(`${marker}-title-0`))
  const second = await get(`/blog?category=${marker}&q=${marker}&page=2`)
  assert.equal(second.status, 200)
  assert.ok(second.html.includes(`${marker}-title-0`))
  assert.ok(!second.html.includes(`${marker}-title-10`))
  const missing = await get(`/blog?q=${marker}-no-match`)
  assert.equal(missing.status, 200)
  assert.ok(missing.html.includes('empty-state'))
  assert.equal((await get(`/blog?category=${marker}&page=invalid`)).status, 200)
  assert.ok((await get(`/blog/${posts[0].slug}`)).html.includes('content-reading'))
  await db.post.update({ where: { id: posts[0].id }, data: { status: 'DRAFT' } })
  assert.equal((await get(`/blog/${posts[0].slug}`)).status, 404)
  page = await db.page.create({ data: { slug: marker, title: marker, content: '<h2>First</h2><p>Content</p><h2>Second</h2>' } })
  assert.ok((await get(`/p/${marker}`)).html.includes('content-reading'))
  assert.equal((await patch({ id: page.id, pageLayout: 'reading', pageFrame: 'card', pageTitle: 'hide' })).status, 200)
  const customized = await get(`/p/${marker}`)
  assert.ok(customized.html.includes('managed-page-reading'))
  assert.ok(customized.html.includes('sr-only'))
  assert.equal((await patch({ id: page.id, pageLayout: 'arbitrary-css' })).status, 400)
  assert.ok((await get(`/p/${marker}`)).html.includes('managed-page-reading'))
  const plan = await db.plan.findFirst({ where: { active: true } })
  if (plan) {
    const checkout = await get(`/checkout?planId=${plan.id}`)
    assert.equal(checkout.status, 200)
    assert.ok(checkout.html.includes('subscription-name'))
    assert.ok(checkout.html.includes('checkout-steps'))
  }
  assert.equal((await get('/checkout?planId=invalid')).status, 404)
  await db.page.update({ where: { id: page.id }, data: { status: 'DRAFT' } })
  assert.equal((await get(`/p/${marker}`)).status, 404)
  product = await db.product.create({ data: { slug: marker, name: marker, description: '<p>Plain product summary</p>', price: 5 } })
  const shop = await get('/products')
  if (shop.status === 200) {
    assert.ok(shop.html.includes(`/products/${marker}`))
    assert.ok(shop.html.includes('Plain product summary'))
    assert.ok((await get(`/products/${marker}`)).html.includes('content-art-product'))
  } else {
    assert.equal(shop.status, 404)
    assert.equal((await get(`/products/${marker}`)).status, 404)
  }
  await db.product.update({ where: { id: product.id }, data: { active: false } })
  assert.equal((await get(`/products/${marker}`)).status, 404)
  console.log('PASS: searchable paginated articles, invalid page input, empty results, shared detail layouts, product links and unpublished content protection')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.post.deleteMany({ where: { id: { in: posts.map(p => p.id) } } })
  if (category) await db.postCategory.delete({ where: { id: category.id } })
  if (page) await db.page.delete({ where: { id: page.id } })
  if (page) await db.setting.deleteMany({ where: { key: `page.layout.${page.id}` } })
  if (product) await db.product.delete({ where: { id: product.id } })
  await db.$disconnect()
})
