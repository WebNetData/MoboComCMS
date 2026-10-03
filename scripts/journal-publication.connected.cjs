// Local Docker: node scripts/journal-publication.connected.cjs inside the app container.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const seed = `codex-journal-${Date.now()}`
const base = 'http://127.0.0.1:3000'
const postIds = []
let categoryId
let productId
let pendingProductId
let originalStoreSetting
let cartToken

async function get(path) {
  return fetch(`${base}${path}`, { signal: AbortSignal.timeout(60_000), headers: { 'cache-control': 'no-cache' } })
}

async function main() {
  originalStoreSetting = await db.setting.findUnique({ where: { key: 'storeEnabled' } })
  if (originalStoreSetting?.value !== 'true') await db.setting.upsert({ where: { key: 'storeEnabled' }, create: { key: 'storeEnabled', value: 'true' }, update: { value: 'true' } })
  const category = await db.postCategory.create({ data: { slug: seed, name: `${seed} category` } })
  categoryId = category.id
  const live = await db.post.create({ data: { slug: `${seed}-live`, title: `${seed} live story`, content: '<p>Public article</p>', categoryId, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86_400_000) } })
  const scheduled = await db.post.create({ data: { slug: `${seed}-scheduled`, title: `${seed} scheduled story`, content: '<p>Scheduled article</p>', categoryId, status: 'PUBLISHED', publishedAt: new Date(Date.now() + 86_400_000) } })
  const draft = await db.post.create({ data: { slug: `${seed}-draft`, title: `${seed} draft story`, content: '<p>Draft article</p>', categoryId, status: 'DRAFT', publishedAt: new Date(Date.now() - 86_400_000) } })
  postIds.push(live.id, scheduled.id, draft.id)
  const product = await db.product.create({ data: { slug: `${seed}-product`, name: `${seed} product`, active: true, approval: 'APPROVED' } })
  productId = product.id
  const pendingProduct = await db.product.create({ data: { slug: `${seed}-pending-product`, name: `${seed} pending product`, active: true, approval: 'PENDING' } })
  pendingProductId = pendingProduct.id

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
  assert.ok(sitemap.includes(`/products/${product.slug}`) && !sitemap.includes(`/products/${pendingProduct.slug}`), 'only approved products are indexed')
  const homepage = await get('/')
  assert.equal(homepage.status, 200)
  const homepageHtml = await homepage.text()
  assert.ok(!homepageHtml.includes(scheduled.title) && !homepageHtml.includes(pendingProduct.slug), 'homepage data excludes scheduled posts and pending products')
  const cmsProducts = await get('/api/public/cms?type=products')
  assert.equal(cmsProducts.status, 200)
  const cmsProductsBody = JSON.stringify(await cmsProducts.json())
  assert.ok(cmsProductsBody.includes(product.slug) && !cmsProductsBody.includes(pendingProduct.slug), 'public CMS products apply approval')
  const llms = await (await get('/llms.txt')).text()
  assert.ok(llms.includes(`/products/${product.slug}`) && !llms.includes(`/products/${pendingProduct.slug}`), 'AI discovery applies product approval')
  const productPosts = await get(`/api/products/${product.slug}/tabs?tab=related-posts`)
  assert.equal(productPosts.status, 200)
  const productPostsBody = JSON.stringify(await productPosts.json())
  assert.ok(productPostsBody.includes(live.title) && !productPostsBody.includes(scheduled.title) && !productPostsBody.includes(draft.title), 'product related stories observe Journal publication')
  assert.equal((await get(`/api/products/${pendingProduct.slug}/tabs?tab=description`)).status, 404, 'pending products cannot be read through the tabs API')
  assert.equal((await get(`/checkout/product/${pendingProduct.slug}`)).status, 404, 'pending products cannot open direct checkout')
  const pendingFeedback = await fetch(`${base}/api/products/${pendingProduct.slug}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'question', body: 'Is this product available yet?', guestName: 'Test customer' }), signal: AbortSignal.timeout(60_000) })
  assert.equal(pendingFeedback.status, 404, 'pending products cannot receive public feedback')
  const pendingCart = await fetch(`${base}/api/cart`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: pendingProduct.id, quantity: 1 }), signal: AbortSignal.timeout(60_000) })
  assert.equal(pendingCart.status, 404, 'pending products cannot be added to the cart')
  const addedCart = await fetch(`${base}/api/cart`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: product.id, quantity: 1 }), signal: AbortSignal.timeout(60_000) })
  assert.equal(addedCart.status, 200, 'approved product can enter a guest cart')
  cartToken = (addedCart.headers.get('set-cookie') || '').match(/mc_cart=([^;]+)/)?.[1]
  assert.ok(cartToken, 'guest cart token is issued')
  const relatedProducts = await get(`/api/products/${product.slug}/tabs?tab=related-products`)
  assert.equal(relatedProducts.status, 200)
  assert.ok(!JSON.stringify(await relatedProducts.json()).includes(pendingProduct.slug), 'pending products are excluded from related products')
  await db.product.update({ where: { id: product.id }, data: { approval: 'PENDING' } })
  const revokedCart = await fetch(`${base}/api/cart`, { headers: { cookie: `mc_cart=${cartToken}` }, signal: AbortSignal.timeout(60_000) })
  assert.equal(revokedCart.status, 200)
  assert.match(JSON.stringify(await revokedCart.json()), /"blocked":true/, 'existing cart lines close after approval is revoked')
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: scheduled.id } })).views, 0, 'hidden article reads do not increment views')

  await db.post.update({ where: { id: scheduled.id }, data: { publishedAt: new Date(Date.now() - 60_000) } })
  assert.equal((await get(`/blog/${scheduled.slug}`)).status, 200, 'scheduled article opens once due without deployment')
  assert.equal((await get(`/api/public/cms?type=post&slug=${scheduled.slug}`)).status, 200)
  assert.equal((await get(`/api/blog/${scheduled.slug}/comments`)).status, 200)
  console.log('Journal and Store publication: listing, API, detail, comments, related items, approval, cart and sitemap gates OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (cartToken) await db.cart.deleteMany({ where: { token: cartToken } })
  if (productId) await db.product.delete({ where: { id: productId } })
  if (pendingProductId) await db.product.delete({ where: { id: pendingProductId } })
  if (postIds.length) await db.post.deleteMany({ where: { id: { in: postIds } } })
  if (categoryId) await db.postCategory.delete({ where: { id: categoryId } })
  if (originalStoreSetting === null) await db.setting.deleteMany({ where: { key: 'storeEnabled' } })
  else if (originalStoreSetting && originalStoreSetting.value !== 'true') await db.setting.update({ where: { key: 'storeEnabled' }, data: { value: originalStoreSetting.value } })
  await db.$disconnect()
})
