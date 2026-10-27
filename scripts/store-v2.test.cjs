const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

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

test('advanced filters: specifications, rating, instant; one store half alone is its front page', () => {
  const q = store.parseShopQuery({ s_platform: ['Windows', 'Steam', 'Windows'], 's_Bad-Key': 'x', s_region: ' جهانی ', s_empty: '', rating: '4', instant: '1', kind: 'virtual' })
  assert.deepEqual(q.specs, { platform: ['Windows', 'Steam'], region: ['جهانی'] }, 'valid keys, distinct values, empty dropped')
  assert.equal(q.rating, 4)
  assert.equal(q.instant, true)
  assert.equal(store.parseShopQuery({ rating: '5' }).rating, 0, 'only 3 or 4')
  // repeated parameters survive the trip through a URL
  const params = new URLSearchParams(store.shopQueryString(q).slice(1)), grouped = {}
  for (const [key, value] of params) grouped[key] = key in grouped ? [].concat(grouped[key], value) : value
  assert.deepEqual(store.parseShopQuery(grouped), q)
  assert.equal(store.isFiltered(store.parseShopQuery({ s_platform: 'Windows' })), true)
  assert.equal(store.isStoreFront(store.parseShopQuery({ kind: 'VIRTUAL' })), true, '?kind= alone is the store front')
  assert.equal(store.isStoreFront(store.parseShopQuery({ kind: 'VIRTUAL', instant: '1' })), false, 'any filter is a listing')
  assert.equal(store.isStoreFront(store.parseShopQuery({})), false)
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
  assert.match(catalog, /if \(path\.has\(node\.id\)\) return new Set\(\)/, 'a loop in the category tree cannot hang the page')
  // Since 2026-10-27 a product may sit in further categories; a branch counts each product once.
  assert.match(catalog, /function branchSets\(members: Map<number, Set<number>>\)/)
  assert.match(catalog, /if \(found\) where\.AND = \[inCategories\(subtreeIds\(found\.node\)\)\]/, 'a listing finds products by main and further categories')
  // Every link of a half keeps the shopper inside that half.
  assert.match(front, /base = `\/products\?kind=\$\{division\.kind\}`/)
  assert.match(front, /href=\{`\$\{base\}&category=\$\{encodeURIComponent\(category\.slug\)\}`\}/)
  assert.match(front, /href=\{`\$\{base\}&category=\$\{encodeURIComponent\(child\.slug\)\}`\}/)
  assert.match(front, /const shown = divisions\.filter\(\(division\) => division\.total > 0\)/, 'an empty half is not drawn')
  // Since 2026-10-27 the front opens on two doors (ShopHome StoreDoors), each half a store of its own (?kind=…).
  const home = read('src/components/store/ShopHome.tsx')
  assert.match(page, /<StoreDoors divisions=\{divisions\} \/>/)
  assert.match(home, /division\.total > 0\)/, 'an empty door is not drawn')
  assert.match(home, /href=\{`\$\{href\}&category=\$\{encodeURIComponent\(category\.slug\)\}`\}/, 'a door\'s categories stay in its half')
  assert.match(page, /<CategoryGrid categories=\{grid\} base=\{base\} \/>/, 'a store\'s category cards stay in its half')
  // The landing, the listing and (since 2026-10-27, owner) the cart and checkout take the width of the site header.
  assert.match(css, /\.sx-landing\.container, \.sx-listing\.container, \.sx-cart-page\.container, \.sh-checkout-page\.container \{ width: var\(--mb-chrome, min\(1680px, 100% - 48px\)\);/)
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
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
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
  assert.match(route, /if \(e instanceof CategoryKindError \|\| e instanceof ProductCategoryError\) return err\(e\.message, e\.status\)/)
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

const asked = load('src/modules/store/domain/order-inputs')

test('a product asks its buyer only what the chosen option needs, and keeps a password as typed', () => {
  const fields = asked.validateOrderFields([
    { key: 'email', label: 'ایمیل حساب', kind: 'email', required: true, options: ['اختصاصی روی اکانت شما'] },
    { key: 'password', label: 'رمز حساب', kind: 'secret', required: true, options: ['اختصاصی روی اکانت شما'] },
    { key: 'note', label: 'توضیحات', kind: 'textarea', required: false },
  ])
  assert.deepEqual(asked.fieldsFor(fields, 'اختصاصی پیش ساخته').map((field) => field.key), ['note'])
  assert.deepEqual(asked.fieldsFor(fields, 'اختصاصی روی اکانت شما').map((field) => field.key), ['email', 'password', 'note'])
  // The ready-made option asks for nothing required; the own-account option refuses a missing login.
  assert.deepEqual(asked.validateAnswers(fields, 'اختصاصی پیش ساخته', {}), [])
  assert.throws(() => asked.validateAnswers(fields, 'اختصاصی روی اکانت شما', { email: 'a@b.co' }), /رمز حساب/)
  assert.throws(() => asked.validateAnswers(fields, 'اختصاصی روی اکانت شما', { email: 'not-an-email', password: 'x' }), /ایمیل معتبر/)
  const answers = asked.validateAnswers(fields, 'اختصاصی روی اکانت شما', { email: ' a@b.co ', password: ' p a ss ', unknown: 'dropped' })
  assert.deepEqual(answers.map((answer) => [answer.key, answer.value]), [['email', 'a@b.co'], ['password', ' p a ss ']])
  assert.equal(asked.answersComplete(fields, 'اختصاصی روی اکانت شما', answers), true)
  assert.equal(asked.answersComplete(fields, 'اختصاصی روی اکانت شما', []), false)
  assert.equal(asked.answersComplete(fields, 'اختصاصی پیش ساخته', []), true)
  // Nobody but the handling staff gets the password back.
  assert.deepEqual(asked.maskAnswers(answers).map((answer) => answer.value), ['a@b.co', asked.SECRET_MASK])
  // The admin's list is checked: unique latin keys, a known kind, a label, at most twelve.
  assert.throws(() => asked.validateOrderFields([{ key: 'a', label: 'x' }, { key: 'a', label: 'y' }]), /یکتا/)
  assert.throws(() => asked.validateOrderFields([{ key: 'Bad Key', label: 'x' }]), /یکتا/)
  assert.throws(() => asked.validateOrderFields([{ key: 'a', label: 'x', kind: 'file' }]), /نوع فیلد/)
  assert.throws(() => asked.validateOrderFields(Array.from({ length: 13 }, (_, index) => ({ key: 'k' + index, label: 'x' }))), /حداکثر/)
  assert.deepEqual(asked.readOrderFields('{broken'), [])
  assert.throws(() => asked.validateAnswers(asked.validateOrderFields([{ key: 'site', label: 'سایت', kind: 'url', required: true }]), '', { site: 'javascript:alert(1)' }), /نشانی یک سایت/)
  assert.equal(asked.validateAnswers(asked.validateOrderFields([{ key: 'site', label: 'سایت', kind: 'url', required: true }]), '', { site: 'example.com/pay' })[0].value, 'https://example.com/pay')
})

test('a typed foreign amount is read in cents and held to the product limits', () => {
  const rule = { openAmount: true, openCurrencies: 'USD, eur', openMinMinor: 500n, openMaxMinor: 200000n, fxCurrency: 'USD' }
  assert.deepEqual(asked.openCurrenciesOf(rule), ['USD', 'EUR'])
  assert.deepEqual(asked.openCurrenciesOf({ ...rule, openCurrencies: '' }), ['USD'])
  assert.deepEqual(asked.parseOpenAmount(rule, { amount: '49.99', currency: 'usd' }), { amountMinor: 4999n, currency: 'USD' })
  assert.deepEqual(asked.parseOpenAmount(rule, { amount: '۱٬۲۰۰', currency: 'EUR' }), { amountMinor: 120000n, currency: 'EUR' })
  assert.throws(() => asked.parseOpenAmount(rule, { amount: '4.99', currency: 'USD' }), /حداقل/)
  assert.throws(() => asked.parseOpenAmount(rule, { amount: '2000.01', currency: 'USD' }), /حداکثر/)
  assert.throws(() => asked.parseOpenAmount(rule, { amount: '10', currency: 'GBP' }), /مجاز نیست/)
  for (const bad of ['', '-5', '1e3', '10.999', 'abc', '0']) assert.throws(() => asked.parseOpenAmount(rule, { amount: bad, currency: 'USD' }), asked.OrderInputError, bad)
})

test('buyer answers stay encrypted from cart to order, and only an audited staff click reads a password', () => {
  const cart = read('src/modules/store/server/cart.ts')
  const checkout = read('src/modules/checkout/server/checkout.ts')
  const orders = read('src/modules/store/server/orders.ts')
  const routes = read('src/modules/store/server/http/routes.ts')
  const sealed = read('src/modules/store/server/order-inputs.ts')
  assert.match(sealed, /answers\.length \? encryptDigitalDelivery\(JSON\.stringify\(answers\)\) : ''/)
  // The cart checks and seals what was typed, prices a typed amount itself, and never sends a password back.
  assert.match(cart, /const answers = validateAnswers\(fields, variantName, input\.inputs\)/)
  assert.match(cart, /detail = \{ inputs: sealAnswers\(answers\)/)
  assert.match(cart, /inputs: maskAnswers\(answers\)\.map/)
  assert.match(cart, /await openAmountPrice\(row\.product, row\.openAmountMinor, row\.openCurrency\)/)
  assert.match(cart, /quantity: line\.quantity, inputs: line\.inputs, openAmountMinor: line\.openAmountMinor, openCurrency: line\.openCurrency \}/, 'a guest line keeps its answers through sign-in')
  // Checkout refuses a line without its required answers, prices a typed amount again and keeps the rate.
  assert.match(checkout, /if \(!answersComplete\(readOrderFields\(product\.orderFields\), variant\?\.name \|\| '', openAnswers\(sealed\)\)\) return fail\(409, 'INPUT_REQUIRED'/)
  assert.match(checkout, /const quote = await openAmountPrice\(product, openAmountMinor, openCurrency\)/)
  assert.match(checkout, /openRate = String\(quote\.rate\)/)
  assert.match(checkout, /orderLines\.some\(\(line\) => line\.openAmountMinor > 0n\)\) return fail\(409, 'PROMOTION_NOT_APPLICABLE'/)
  // Every order view masks; the full answer leaves only through the recorded action.
  assert.match(orders, /inputs: maskAnswers\(openAnswers\(line\.inputs\)\)\.map/)
  assert.match(routes, /const inputs = await revealOrderInputs\(id, lineId\)[\s\S]{0,160}action: 'store\.order\.inputs_reveal'[\s\S]{0,200}return ok\(\{ lineId, inputs \}\)/)
  assert.match(routes, /action: 'store\.order\.inputs_erase'/)
  assert.match(routes.slice(routes.indexOf('export async function POST_order'), routes.indexOf('export async function GET_products')), /const g = await orderAdmin\(req\)/)
  // A week after the order is done the answers go by themselves.
  assert.match(orders, /export const ORDER_INPUT_KEEP_DAYS = 7/)
  assert.match(read('src/modules/fulfillment/server/worker.ts'), /await eraseFinishedOrderInputs\(\)\.catch\(failedStep\('orderInputs', -1\)\)/)
  // A seller cannot make a product that collects logins or a typed amount.
  assert.doesNotMatch(read('src/modules/marketplace/server/marketplace/products.ts').match(/const SELLER_FIELDS = \[[^\]]+\]/)[0], /orderFields|openAmount|openCurrencies|openMin|openMax/)
  // The buy box sends no direct purchase for such a product.
  assert.match(read('src/components/store/BuyBox.tsx'), /props\.kind !== 'PHYSICAL' && !open && !\(props\.orderFields \|\| \[\]\)\.length &&/)
  const sql = read('prisma/migrations/20261227120000_order_inputs_open_amount/migration.sql')
  assert.match(sql, /"orderFields"/)
  assert.match(sql, /"inputsErasedAt"/)
  assert.match(read('prisma/release-manifest.json'), /"20261227120000_order_inputs_open_amount"/)
})

test('the ready category tree: unique, valid addresses; every child in its parent\'s half', () => {
  const template = load('src/modules/catalog/domain/category-template.ts')
  const rows = template.templateRows()
  assert.ok(rows.length >= 80, 'a professional tree, not a handful')
  assert.equal(new Set(rows.map((row) => row.slug)).size, rows.length, 'no address twice')
  for (const row of rows) {
    assert.match(row.slug, /^[a-z0-9][a-z0-9-]{0,79}$/, row.slug)
    assert.ok(row.name && row.nameEn, row.slug)
    if (row.parent) assert.equal(row.kind, rows.find((item) => item.slug === row.parent).kind, `${row.slug} follows ${row.parent}`)
  }
  assert.deepEqual([...new Set(template.CATEGORY_TEMPLATE.map((root) => root.kind))].sort(), ['PHYSICAL', 'VIRTUAL'], 'both stores get a tree')
  assert.ok(template.CATEGORY_TEMPLATE.every((root) => root.description), 'every top category has a description for its page')
})
