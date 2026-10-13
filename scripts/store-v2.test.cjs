const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Minimal TS loader with "@/" path mapping (domain modules only import each other).
const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const store = load('src/modules/store/domain/store')
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')

test('fulfilment workflow allows forward moves and blocks invalid ones', () => {
  assert.equal(store.canMoveTo('PENDING', 'PROCESSING'), true)
  assert.equal(store.canMoveTo('PROCESSING', 'SHIPPED'), true)
  assert.equal(store.canMoveTo('SHIPPED', 'DELIVERED'), true)
  assert.equal(store.canMoveTo('DELIVERED', 'RETURNED'), true)
  assert.equal(store.canMoveTo('PENDING', 'RETURNED'), false, 'nothing to return before shipping')
  assert.equal(store.canMoveTo('SHIPPED', 'CANCELLED'), false, 'a shipped parcel is returned, not cancelled')
  assert.equal(store.canMoveTo('CANCELLED', 'PROCESSING'), false, 'cancelled is final')
  assert.equal(store.canMoveTo('DELIVERED', 'DELIVERED'), false)
  assert.equal(store.canMoveTo('BOGUS', 'PROCESSING'), false)
  assert.deepEqual(store.nextStatuses('RETURNED'), [])
  assert.equal(store.trackingIndex('SHIPPED'), 3)
  assert.equal(store.trackingIndex('unknown'), 0)
})

test('discounts are floored and list prices expire with the offer', () => {
  assert.equal(store.discountPercent(801n, 890n), 10)
  assert.equal(store.discountPercent(100n, 100n), 0)
  assert.equal(store.discountPercent(120n, 100n), 0)
  const now = new Date('2026-01-01T00:00:00Z')
  assert.equal(store.listPriceActive(80n, 100n, null, now), true)
  assert.equal(store.listPriceActive(80n, 100n, new Date('2026-01-02T00:00:00Z'), now), true)
  assert.equal(store.listPriceActive(80n, 100n, new Date('2025-12-31T00:00:00Z'), now), false)
  assert.equal(store.listPriceActive(100n, 90n, null, now), false)
})

test('cart line limits respect stock, variant stock and per-order caps', () => {
  assert.equal(store.lineLimit(-1, null, 0), store.MAX_LINE_QUANTITY)
  assert.equal(store.lineLimit(3, null, 0), 3)
  assert.equal(store.lineLimit(-1, 2, 0), 2)
  assert.equal(store.lineLimit(10, 8, 5), 5)
  assert.equal(store.lineLimit(0, null, 0), 0)
  assert.equal(store.normalizeQuantity('۰'), 0)
  assert.equal(store.normalizeQuantity('۳'), 3)
  assert.throws(() => store.normalizeQuantity(-1))
  assert.throws(() => store.normalizeQuantity(store.MAX_LINE_QUANTITY + 1))
})

test('shop query parsing is strict and round-trips', () => {
  const q = store.parseShopQuery({ q: ' گوشی <b> ', category: 'Mobile!', brand: 'samsung,apple,samsung', min: '۵۰۰٬۰۰۰', max: '100000', available: '1', sort: 'hack', page: '-3', kind: 'physical' })
  assert.equal(q.q, 'گوشی b')
  assert.equal(q.category, 'mobile')
  assert.deepEqual(q.brands, ['samsung', 'apple'])
  assert.equal(q.min, 100000, 'swapped when min > max')
  assert.equal(q.max, 500000)
  assert.equal(q.available, true)
  assert.equal(q.sort, 'newest')
  assert.equal(q.page, 1)
  assert.equal(q.kind, 'PHYSICAL')
  const again = store.parseShopQuery(Object.fromEntries(new URLSearchParams(store.shopQueryString(q).slice(1))))
  assert.deepEqual(again, q)
  assert.equal(store.isFiltered(store.parseShopQuery({})), false)
  assert.equal(store.shopQueryString(q, { page: 3 }).includes('page=3'), true)
  assert.equal(store.shopQueryString(q, { sort: 'cheap' }).includes('page='), false, 'changing a filter resets paging')
})

test('store settings drop unsafe links and images', () => {
  const settings = store.normalizeStoreSettings({
    slides: [{ image: 'javascript:alert(1)', title: 'x', href: '//evil.example' }, { image: '/uploads/a.jpg', title: 'ok', href: '/products?x=1' }, { image: 'http://insecure/a.png' }],
    banners: [{ image: 'https://cdn.example/b.jpg', href: 'https://shop.example/x' }, { image: '' }],
    lowStockDefault: -5, badges: ['a', '', 'b'], cartNote: '<script>',
  })
  assert.equal(settings.slides.length, 2)
  assert.equal(settings.slides[0].image, '')
  assert.equal(settings.slides[0].href, '')
  assert.equal(settings.slides[1].href, '/products?x=1')
  assert.equal(settings.banners.length, 1)
  assert.equal(settings.lowStockDefault, store.DEFAULT_STORE_SETTINGS.lowStockDefault)
  assert.deepEqual(settings.badges, ['a', 'b'])
  assert.ok(!settings.cartNote.includes('<'))
})

test('brand validation', () => {
  assert.throws(() => store.validateBrand({ name: 'S', slug: 'samsung' }))
  assert.throws(() => store.validateBrand({ name: 'Samsung', slug: 'Samsung Co' }))
  const brand = store.validateBrand({ name: 'سامسونگ', slug: 'samsung', logo: 'data:image/png;base64,xx', featured: true })
  assert.equal(brand.logo, '')
  assert.equal(brand.featured, true)
})

test('checkout and inventory handle multi-line orders', () => {
  const checkout = read('src/modules/checkout/server/checkout.ts')
  assert.match(checkout, /tx\.orderLine\.create/, 'order lines are written inside the order transaction')
  assert.match(checkout, /MIXED_CURRENCY/)
  assert.match(checkout, /QUANTITY_LIMIT/)
  const inventory = read('src/modules/catalog/server/inventory.ts')
  assert.match(inventory, /orderStockLines/, 'reservations cover every order line')
  assert.match(inventory, /class OutOfStock/, 'a failing line rolls back the whole reservation')
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /@@unique\(\[orderId, line\]\)/)
})

test('store admin APIs are guarded and audited', () => {
  const routes = read('src/modules/store/server/http/routes.ts')
  for (const name of ['GET_orders', 'POST_order', 'GET_products', 'POST_products', 'POST_inventory', 'POST_brands', 'PATCH_brand', 'DELETE_brand', 'POST_storeSettings', 'GET_customers', 'GET_dashboard']) {
    const start = routes.indexOf(`export async function ${name}(`)
    assert.ok(start >= 0, name)
    const body = routes.slice(start, routes.indexOf('\nexport', start + 10) === -1 ? undefined : routes.indexOf('\nexport', start + 10))
    assert.match(body, /Admin\(req\)|adminGuard\(/, `${name} is guarded`)
    if (name.startsWith('POST') || name.startsWith('PATCH') || name.startsWith('DELETE')) assert.match(body, /auditAdmin/, `${name} is audited`)
  }
  assert.match(routes, /httpOnly: true/, 'cart cookie is httpOnly')
})

test('the shop home shows its two halves — shipped goods and products delivered online — each with its own categories', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const catalog = read('src/modules/store/server/catalog.ts'), front = read('src/components/store/Storefront.tsx'), page = read('src/modules/catalog/server/pages/products/page.tsx'), css = read('src/app/store-front.css')
  // The halves come from the kind of the products themselves (no second list of categories to keep in step), counted per kind.
  assert.match(catalog, /export async function shopDivisions\(\): Promise<ShopDivision\[\]>/)
  assert.match(catalog, /\(\['PHYSICAL', 'VIRTUAL'\] as const\)\.map\(async \(kind\) =>/)
  assert.match(catalog, /const where = \{ active: true, approval: 'APPROVED', kind \}/, 'only products a shopper can buy are counted')
  assert.match(catalog, /\.filter\(\(node, index\) => node\.total > 0 && /, 'a category with nothing of this kind is not offered under it')
  assert.match(catalog, /if \(seen\.has\(node\.id\)\) return 0/, 'a loop in the category tree cannot hang the page')
  // Every link of a half keeps the shopper inside that half.
  assert.match(front, /base = `\/products\?kind=\$\{division\.kind\}`/)
  assert.match(front, /href=\{`\$\{base\}&category=\$\{encodeURIComponent\(category\.slug\)\}`\}/)
  assert.match(front, /href=\{`\$\{base\}&category=\$\{encodeURIComponent\(child\.slug\)\}`\}/)
  assert.match(front, /const shown = divisions\.filter\(\(division\) => division\.total > 0\)/, 'an empty half is not drawn')
  assert.match(page, /<DivisionPanels divisions=\{divisions\} \/>/)
  // The landing and the listing take the width of the site header; the cart and checkout keep their own.
  assert.match(css, /\.sx-landing\.container, \.sx-listing\.container \{ width: var\(--mb-chrome, min\(1680px, 100% - 48px\)\);/)
  assert.doesNotMatch(css, /\.sx-page > \.container \{/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.sx-world,/)
})

test('a product tells its whole path — home, the shop, its half, its categories, its name — and the page takes the width of the header', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const page = read('src/modules/catalog/server/pages/products/[slug]/page.tsx'), css = read('src/app/store-front.css'), front = read('src/components/store/Storefront.tsx')
  assert.match(page, /const half = product\.kind === 'PHYSICAL' \? \{[^}]*href: '\/products\?kind=PHYSICAL' \} : \{[^}]*href: '\/products\?kind=VIRTUAL' \}/)
  assert.match(page, /findCategory\(await categoryTree\(\), product\.category\.slug\)\?\.chain \|\| \[\]/)
  assert.match(page, /href: `\$\{half\.href\}&category=\$\{encodeURIComponent\(node\.slug\)\}`/, 'a category step keeps the shopper inside the half')
  assert.match(page, /breadcrumbJsonLd\(base, \[\.\.\.trail\.map/, 'search engines get the same path')
  assert.match(page, /<Crumbs items=\{\[\.\.\.trail, \{ label: name \}\]\} \/>/)
  assert.match(css, /main\.container\.sx-product \{ width: var\(--mb-chrome, min\(1680px, 100% - 48px\)\); max-width: none;/)
  // Rules added after the old media queries must bring their own, or a phone would get the desktop grid.
  assert.match(css, /@media \(max-width: 720px\) \{ \.sx-phero \{ grid-template-columns: minmax\(0, 1fr\); padding: 14px; \} \}/)
  // The half of online products promises online delivery, never instant delivery, which only some of them have.
  assert.doesNotMatch(front.slice(front.indexOf('const DIVISION_COPY'), front.indexOf('export function DivisionPanels')), /تحویل آنی|بلافاصله/)
})

test('a product category belongs to one half of the shop: a root decides, everything under it follows, and nothing of the other half may stay in it', () => {
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(read('src/modules/catalog/domain/category-kind.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(require, mod, mod.exports)
  const kinds = mod.exports
  // What the admin sends is a half or "not decided"; anything else is refused, not read as "not decided".
  assert.deepEqual([kinds.parseCategoryKind('physical'), kinds.parseCategoryKind(' VIRTUAL '), kinds.parseCategoryKind(''), kinds.parseCategoryKind(null)], ['PHYSICAL', 'VIRTUAL', '', ''])
  assert.throws(() => kinds.parseCategoryKind('BOTH'), /Invalid half/)
  // The subtree of a category, even when stored data loops.
  const nodes = [{ id: 1, parentId: null }, { id: 2, parentId: 1 }, { id: 3, parentId: 2 }, { id: 4, parentId: null }, { id: 5, parentId: 6 }, { id: 6, parentId: 5 }]
  assert.deepEqual(kinds.categorySubtree(nodes, 1).sort(), [1, 2, 3])
  assert.deepEqual(kinds.categorySubtree(nodes, 4), [4])
  assert.deepEqual(kinds.categorySubtree(nodes, 5).sort(), [5, 6])
  // A half is refused while products of the other half, or an attribute group made for the other half, are in the subtree.
  assert.equal(kinds.kindConflict('PHYSICAL', { otherProducts: 0, groups: [{ name: 'عمومی', appliesTo: 'ANY' }, { name: 'ابعاد', appliesTo: 'PHYSICAL' }] }), null)
  assert.match(kinds.kindConflict('PHYSICAL', { otherProducts: 3, groups: [] }), /۳ محصول از «محصولات مجازی»/)
  assert.match(kinds.kindConflict('VIRTUAL', { otherProducts: 0, groups: [{ name: 'ابعاد و وزن', appliesTo: 'PHYSICAL' }] }), /گروه مشخصات «ابعاد و وزن»/)
  assert.equal(kinds.kindConflict('', { otherProducts: 9, groups: [{ name: 'x', appliesTo: 'PHYSICAL' }] }), null, 'an undecided category holds anything, as before')
  // A product may be filed under a category of its own half, or under one not decided yet.
  assert.deepEqual([kinds.productFitsCategory('PHYSICAL', 'PHYSICAL'), kinds.productFitsCategory('VIRTUAL', 'PHYSICAL'), kinds.productFitsCategory('VIRTUAL', '')], [true, false, true])

  // The saves use those rules inside one transaction, and a child never keeps a half of its own.
  const server = read('src/modules/catalog/server/category-kind.ts'), route = read('src/modules/site/server/http/admin/cms/route.ts'), input = read('src/modules/catalog/server/product-input.ts')
  assert.match(server, /if \(input\.parentId != null\) \{\n    const parent = await tx\.productCategory\.findUnique/)
  assert.match(route, /const kind = await kindForCategory\(tx, \{ parentId, asked: b\?\.kind \}\)\n        await assertKindFits\(tx, \{ kind, attributeGroupId \}\)/)
  assert.match(route, /await assertKindFits\(tx, \{ id, kind, attributeGroupId: data\.attributeGroupId as number \| null \| undefined \}\)/)
  assert.match(route, /if \(kind !== current\.kind\) await cascadeCategoryKind\(tx, id, kind\)/)
  assert.match(route, /if \(e instanceof CategoryKindError\) return err\(e\.message, e\.status\)/)
  assert.match(input, /if \(!productFitsCategory\(kind, category\.categoryKind\)\) throw Error\(/)
  // What is stored is sorted once by the migration, and the storefront reads the column.
  const sql = read('prisma/migrations/20261226120000_product_category_kind/migration.sql')
  assert.match(sql, /ADD COLUMN "kind" TEXT NOT NULL DEFAULT ''/)
  assert.match(sql, /CHECK \("kind" IN \('', 'PHYSICAL', 'VIRTUAL'\)\)/)
  assert.match(sql, /HAVING COUNT\(DISTINCT p\."kind"\) = 1/, 'a root that holds both kinds stays undecided')
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) assert.match(read(schema), /model ProductCategory \{[\s\S]{0,900}\n  kind      String @default\(""\)/, schema)
  assert.match(read('src/modules/store/server/catalog.ts'), /tree\[index\]\.kind === '' \|\| tree\[index\]\.kind === kind/)
  assert.match(read('prisma/release-manifest.json'), /"20261226120000_product_category_kind"/)
})
