const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function load(file, mocks = {}, cache = new Map()) {
  const key = file.replace(/\\/g, '/')
  if (cache.has(key)) return cache.get(key).exports
  const absolute = path.join(__dirname, '..', key)
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }; cache.set(key, mod)
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) {
      const base = 'src/' + name.slice(2)
      for (const candidate of [base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx']) if (fs.existsSync(path.join(__dirname, '..', candidate))) return load(candidate, mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

test('attribute groups isolate physical colors from virtual account types and validate variants', () => {
  const config = load('src/modules/catalog/server/product-config.ts', {
    '@/platform/database/prisma': { db: {} },
    '@/shared/content/sanitize': { cleanRichText: value => value },
  })
  const account = config.validateFields([{ key: 'account_type', label: 'نوع حساب', labelEn: 'Account type', kind: 'select', options: ['Plus', 'Pro'], required: true, variant: true }, { key: 'duration', label: 'مدت', kind: 'text', required: true }])
  const color = config.validateFields([{ key: 'color', label: 'رنگ', kind: 'color', options: ['Blue', 'Black'], required: true, variant: true }])
  assert.equal(account[0].key, 'account_type')
  assert.equal(color[0].key, 'color')
  assert.equal(config.validateSpecifications({ duration: '30 days' }, account.filter(x => !x.variant)), '{"duration":"30 days"}')
  assert.throws(() => config.validateSpecifications({ color: 'Blue' }, account.filter(x => !x.variant)))
  assert.throws(() => config.validateSpecifications({ color: 'Red' }, color))
  assert.throws(() => config.validateFields([{ key: 'color', label: 'رنگ', kind: 'text' }, { key: 'color', label: 'رنگ', kind: 'text' }]))
  const variants = config.validateVariants([{ sku: 'AI-PLUS', name: 'Plus', price: 15, stock: 2, attributes: { account_type: 'Plus' } }], account, 'USD')
  assert.equal(variants[0].stock, 2)
  assert.throws(() => config.validateVariants([{ sku: 'AI-PLUS', name: 'Plus', price: 15, stock: 2, attributes: { color: 'Blue' } }], account, 'USD'))
})

test('reviews require a paid purchase; member questions are open', async () => {
  let purchased = false, reviewCreated = false, questionCreated = false, reviewWhere
  const route = load('src/modules/catalog/server/http/product-feedback/route.ts', {
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/identity/server/access': { requireUser: async () => ({ id: 9 }) },
    '@/platform/http/rate-limit': { clientIp: () => '127.0.0.1', rateLimitHit: () => ({ ok: true }) },
    '@/platform/database/prisma': { db: {
      product: { findUnique: async () => ({ id: 4, active: true, approval: 'APPROVED' }) },
      order: { findFirst: async ({ where }) => { reviewWhere = where; return purchased ? { id: 1 } : null } },
      productReview: { findUnique: async () => null, create: async () => { reviewCreated = true; return { id: 1, status: 'PENDING' } } },
      productQuestion: { create: async () => { questionCreated = true; return { id: 2, status: 'PENDING' } } },
    } },
  })
  const submit = kind => route.POST(new NextRequest('http://localhost/api/products/any/feedback', { method: 'POST', body: JSON.stringify({ kind, body: 'A useful and detailed comment', rating: 5 }) }), { params: Promise.resolve({ slug: 'any' }) })
  assert.equal((await submit('review')).status, 403)
  assert.equal(reviewCreated, false)
  assert.equal(reviewWhere.userId, 9)
  assert.deepEqual(reviewWhere.OR, [
    { lines: { some: { productId: 4, quantity: { gt: 0 }, sellerStatus: { not: 'CANCELLED' } } } },
    { productId: 4, lines: { none: {} } },
  ])
  assert.equal(reviewWhere.status, 'PAID')
  assert.equal(reviewWhere.invoice.status, 'PAID')
  assert.equal((await submit('question')).status, 201)
  assert.equal(questionCreated, true)
  purchased = true
  assert.equal((await submit('review')).status, 201)
  assert.equal(reviewCreated, true)
})

test('verified purchase lookup rejects invalid identities and products before reading orders', async () => {
  let reads = 0
  const { hasVerifiedProductPurchase } = load('src/modules/catalog/server/purchase-eligibility.ts', {
    '@/platform/database/prisma': { db: { order: { findFirst: async ({ select }) => { reads++; assert.deepEqual(select, { id: true }); return { id: 1 } } } } },
  })
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(await hasVerifiedProductPurchase(value, 4), false)
    assert.equal(await hasVerifiedProductPurchase(9, value), false)
  }
  assert.equal(reads, 0)
  assert.equal(await hasVerifiedProductPurchase(9, 4), true)
  assert.equal(reads, 1)
})

test('product dimensions include all approved reviews through bounded pages', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, criteria: JSON.stringify({ quality: index < 500 ? 1 : 5, value: '4' }) }))
  rows.push({ id: 1002, criteria: 'not-json' }, { id: 1003, criteria: 'null' }, { id: 1004, criteria: '[5]' }, { id: 1005, criteria: '{"quality":8,"usability":3}' })
  const cursors = []
  const { productReviewCriteria } = load('src/modules/catalog/server/review-criteria.ts', {
    '@/platform/database/prisma': { db: { productReview: { findMany: async ({ where, take, orderBy, select }) => {
      assert.equal(where.productId, 4); assert.equal(where.status, 'APPROVED'); assert.equal(take, 500)
      assert.deepEqual(orderBy, { id: 'asc' }); assert.deepEqual(select, { id: true, criteria: true })
      cursors.push(where.id.gt); return rows.filter(row => row.id > where.id.gt).slice(0, take)
    } } } },
  })
  assert.deepEqual(await productReviewCriteria(4), { quality: 3, value: 4, usability: 3 })
  assert.deepEqual(cursors, [0, 500, 1000])
  rows.length = 0
  assert.deepEqual(await productReviewCriteria(4), { quality: 0, value: 0, usability: 0 })
})

test('guest questions are moderated and review criteria are server-derived', async () => {
  const { reviewScore } = load('src/modules/catalog/domain/review-score.ts')
  assert.deepEqual(reviewScore({ criteria: { quality: 5, value: 3, usability: 4 } }), {
    rating: 4, criteria: { quality: 5, value: 3, usability: 4 },
  })
  assert.equal(reviewScore({ criteria: { quality: 5, value: 8, usability: 4 } }), null)
  let question
  const route = load('src/modules/catalog/server/http/product-feedback/route.ts', {
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/identity/server/access': { requireUser: async () => null },
    '@/platform/http/rate-limit': { clientIp: () => '127.0.0.1', rateLimitHit: () => ({ ok: true }) },
    '@/platform/database/prisma': { db: {
      product: { findUnique: async () => ({ id: 4, active: true, approval: 'APPROVED' }) },
      productQuestion: { create: async ({ data }) => { question = data; return { id: 3, status: 'PENDING' } } },
    } },
  })
  const submit = input => route.POST(new NextRequest('http://localhost/api/products/any/feedback', { method: 'POST', body: JSON.stringify(input) }), { params: Promise.resolve({ slug: 'any' }) })
  assert.equal((await submit({ kind: 'question', body: 'Can this work with my device?', guestName: 'Ali' })).status, 201)
  assert.equal(question.userId, null)
  assert.equal(question.guestName, 'Ali')
  assert.equal((await submit({ kind: 'question', body: 'Can this work with my device?', guestName: '<script>' })).status, 400)
  assert.equal((await submit({ kind: 'review', body: 'A useful and detailed comment', rating: 5 })).status, 401)
})

test('variant inventory reservation rejects sold-out options without consuming product stock', async () => {
  let productDecrements = 0
  const inventory = load('src/modules/catalog/server/inventory.ts', {
    '@/platform/database/prisma': { db: { $transaction: async fn => { try { return await fn({
      orderLine: { findMany: async () => [] },
      order: { findUnique: async () => ({ productId: 1, meta: JSON.stringify({ variantId: 3 }) }) },
      inventoryReservation: { findMany: async () => [], create: async ({ data }) => data },
      product: { findUnique: async () => ({ id: 1, active: true, stock: 4 }), updateMany: async () => { productDecrements++; return { count: 1 } } },
      productVariant: { findFirst: async () => ({ id: 3, stock: 0 }), updateMany: async () => ({ count: 0 }) },
    }) } catch (error) { productDecrements = 0; throw error } } } },
  })
  const result = await inventory.reserveInventory({ orderId: 5 })
  assert.equal(result.ok, false)
  assert.equal(result.message, 'out of stock')
  assert.equal(productDecrements, 0) // the transaction rolls back the earlier product decrement
})

test('virtual product delivery details are encrypted and authenticated', () => {
  const previous = process.env.STORE_DELIVERY_KEY
  process.env.STORE_DELIVERY_KEY = 'b'.repeat(64)
  try {
    const { encryptDigitalDelivery, decryptDigitalDelivery } = load('src/modules/catalog/server/digital-delivery.ts')
    const encrypted = encryptDigitalDelivery('account@example.com\nprivate-code')
    assert.ok(encrypted.startsWith('store:v1:'))
    assert.ok(!encrypted.includes('private-code'))
    assert.equal(decryptDigitalDelivery(encrypted), 'account@example.com\nprivate-code')
    assert.throws(() => decryptDigitalDelivery(encrypted.slice(0, -2) + 'zz'))
  } finally {
    if (previous === undefined) delete process.env.STORE_DELIVERY_KEY
    else process.env.STORE_DELIVERY_KEY = previous
  }
})

// ---- codes a virtual product delivers by itself
test('pasted codes are split one per line, repeats are counted and anything doubtful refuses the whole paste', () => {
  const codes = load('src/modules/store/domain/digital-codes.ts')
  assert.deepEqual(codes.parseCodes('AAAA-1\r\n  BBBB-2  \n\n\nAAAA-1\nCC  CC'), { codes: ['AAAA-1', 'BBBB-2', 'CC CC'], repeated: 1 })
  assert.deepEqual(codes.parseCodes(''), { codes: [], repeated: 0 })
  assert.deepEqual(codes.parseCodes(null), { codes: [], repeated: 0 })
  assert.throws(() => codes.parseCodes('ok\n<script>x</script>'), /خط ۲/)
  assert.throws(() => codes.parseCodes(`ok\n${'x'.repeat(codes.MAX_CODE_LENGTH + 1)}`), /طولانی/)
  assert.throws(() => codes.parseCodes(Array.from({ length: codes.MAX_CODES_PER_REQUEST + 1 }, (_, i) => `c${i}`).join('\n')), /حداکثر/)
  assert.equal(codes.parseCodes(Array.from({ length: codes.MAX_CODES_PER_REQUEST }, (_, i) => `c${i}`).join('\n')).codes.length, codes.MAX_CODES_PER_REQUEST)
})

test('staff see a code masked, the buyer gets each item with its codes', () => {
  const codes = load('src/modules/store/domain/digital-codes.ts')
  assert.deepEqual(['ABCD-EFGH-1234', 'AB12', 'X', 'A'.repeat(40) + '9876'].map(codes.maskCode), ['••••••••••1234', '••••', '•', '••••••••••••9876'])
  assert.equal(codes.composeDelivery([{ name: 'گیفت کارت', variantName: '', codes: ['A', 'B'] }, { name: 'لایسنس', variantName: 'خانگی', codes: ['C'] }, { name: 'بدون کد', variantName: '', codes: [] }]), 'گیفت کارت\nA\nB\n\nلایسنس (خانگی)\nC')
  assert.deepEqual([codes.missingCodes(3, 1), codes.missingCodes(1, 1), codes.missingCodes(0, 0), codes.missingCodes(2, 5)], [2, 0, 1, 0])
  assert.deepEqual(['CODES', 'MANUAL', 'codes', undefined, 7].map(codes.normalizeDigitalMode), ['CODES', 'MANUAL', 'MANUAL', 'MANUAL', 'MANUAL'])
})

test('"instant delivery" is said only of a product that hands over a code by itself and has one', () => {
  const codes = load('src/modules/store/domain/digital-codes.ts')
  const says = (kind, digitalMode, stock) => codes.deliversInstantly({ kind, digitalMode, stock })
  assert.deepEqual([says('VIRTUAL', 'CODES', 3), says('VIRTUAL', 'CODES', 0), says('VIRTUAL', 'MANUAL', -1), says('VIRTUAL', 'MANUAL', 5), says('PHYSICAL', 'CODES', 3)], [true, false, false, false, false])
  // No screen prints the promise without asking.
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  for (const file of ['src/components/store/BuyBox.tsx', 'src/components/store/CartPage.tsx', 'src/components/store/CartCheckout.tsx', 'src/components/store/Storefront.tsx', 'src/modules/catalog/server/pages/products/[slug]/page.tsx', 'src/modules/compare/server/compare.ts']) {
    const source = read(file)
    for (const line of source.split('\n').filter((item) => item.includes('تحویل آنی'))) assert.ok(/instant|deliversInstantly/.test(line), `${file}: ${line.trim().slice(0, 90)}`)
  }
})

test('the same code is recognised again without being stored readable', () => {
  const previous = process.env.STORE_DELIVERY_KEY
  process.env.STORE_DELIVERY_KEY = 'cd'.repeat(32)
  try {
    const { digitalFingerprint } = load('src/modules/catalog/server/digital-delivery.ts')
    assert.equal(digitalFingerprint('AAAA-1111'), digitalFingerprint('  AAAA-1111 '))
    assert.notEqual(digitalFingerprint('AAAA-1111'), digitalFingerprint('AAAA-1112'))
    assert.match(digitalFingerprint('AAAA-1111'), /^[0-9a-f]{64}$/)
    assert.ok(!digitalFingerprint('AAAA-1111').includes('AAAA'))
    process.env.STORE_DELIVERY_KEY = 'ef'.repeat(32)
    const other = load('src/modules/catalog/server/digital-delivery.ts').digitalFingerprint('AAAA-1111')
    process.env.STORE_DELIVERY_KEY = 'cd'.repeat(32)
    assert.notEqual(other, digitalFingerprint('AAAA-1111'), 'keyed: not a plain hash anyone can compute')
  } finally {
    if (previous === undefined) delete process.env.STORE_DELIVERY_KEY
    else process.env.STORE_DELIVERY_KEY = previous
  }
})
