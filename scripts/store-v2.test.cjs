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
