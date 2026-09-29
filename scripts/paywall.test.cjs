const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const p = load('src/modules/paywall/domain/paywall')

const rule = (extra = {}) => ({ priceMinor: 150000n, currency: 'IRT', vipAccess: 'FREE', memberPriceMinor: null, active: true, ...extra })

test('content keys parse only known item types with positive ids', () => {
  assert.deepEqual(p.parseContentKey('post:12'), { ownerType: 'post', ownerId: 12 })
  assert.deepEqual(p.parseContentKey('software:3'), { ownerType: 'software', ownerId: 3 })
  assert.deepEqual(p.parseContentKey('link:5'), { ownerType: 'link', ownerId: 5 })
  for (const bad of ['user:1', 'post:0', 'post:-1', 'post:abc', 'post:1:2', '', null, 'POST:1', 'link:0']) assert.equal(p.parseContentKey(bad), null, String(bad))
  assert.equal(p.contentKey('album', 4), 'album:4')
})

test('admin price input: toman, Persian digits, separators, VIP discount rules', () => {
  const plain = p.normalizePaidInput({ price: '۱۵۰,۰۰۰', currency: 'IRT' })
  assert.equal(plain.priceMinor, 150000n)
  assert.equal(plain.vipAccess, 'FREE')
  assert.equal(plain.memberPriceMinor, null)
  assert.equal(plain.active, true)
  assert.equal(p.normalizePaidInput({ price: '9.99', currency: 'USD' }).priceMinor, 999n)
  assert.equal(p.normalizePaidInput({ price: '100000', currency: 'XYZ' }).currency, 'IRT')
  const discount = p.normalizePaidInput({ price: '150000', vipAccess: 'DISCOUNT', memberPrice: '90000' })
  assert.equal(discount.memberPriceMinor, 90000n)
  assert.throws(() => p.normalizePaidInput({ price: '' }), /قیمت/)
  assert.throws(() => p.normalizePaidInput({ price: '0' }), /قیمت/)
  assert.throws(() => p.normalizePaidInput({ price: '12a' }), /معتبر/)
  assert.throws(() => p.normalizePaidInput({ price: '100000', vipAccess: 'DISCOUNT', memberPrice: '100000' }), /کمتر/)
  assert.throws(() => p.normalizePaidInput({ price: '100000', vipAccess: 'DISCOUNT' }), /کمتر/)
  assert.equal(p.normalizePaidInput({ price: '5', active: false }).active, false)
})

test('access decision: free, VIP free, purchased, and who pays what', () => {
  assert.deepEqual(p.decideAccess(null, { member: false, purchased: false }), { open: true, reason: 'free' })
  assert.deepEqual(p.decideAccess(rule({ active: false }), { member: false, purchased: false }), { open: true, reason: 'free' })
  assert.deepEqual(p.decideAccess(rule(), { member: true, purchased: false }), { open: true, reason: 'vip' })
  assert.deepEqual(p.decideAccess(rule({ vipAccess: 'NONE' }), { member: false, purchased: true }), { open: true, reason: 'purchased' })

  const guest = p.decideAccess(rule(), { member: false, purchased: false })
  assert.equal(guest.open, false)
  assert.equal(guest.priceMinor, 150000n)
  assert.equal(guest.vipFree, true)

  const vipNone = p.decideAccess(rule({ vipAccess: 'NONE' }), { member: true, purchased: false })
  assert.equal(vipNone.open, false)
  assert.equal(vipNone.priceMinor, 150000n)
  assert.equal(vipNone.memberPrice, false)

  const discounted = rule({ vipAccess: 'DISCOUNT', memberPriceMinor: 90000n })
  const vip = p.decideAccess(discounted, { member: true, purchased: false })
  assert.equal(vip.priceMinor, 90000n)
  assert.equal(vip.listPriceMinor, 150000n)
  assert.equal(vip.memberPrice, true)
  const other = p.decideAccess(discounted, { member: false, purchased: false })
  assert.equal(other.priceMinor, 150000n)
  assert.equal(other.vipPriceMinor, 90000n)
  assert.equal(other.memberPrice, false)
})

test('the item price wins over its parent; inactive rules are skipped', () => {
  const rows = [
    { ...rule({ priceMinor: 500000n }), ownerType: 'album', ownerId: 2 },
    { ...rule({ priceMinor: 30000n }), ownerType: 'track', ownerId: 9 },
    { ...rule({ active: false }), ownerType: 'track', ownerId: 10 },
  ]
  assert.equal(p.pickRule(rows, [{ ownerType: 'track', ownerId: 9 }, { ownerType: 'album', ownerId: 2 }]).priceMinor, 30000n)
  assert.equal(p.pickRule(rows, [{ ownerType: 'track', ownerId: 10 }, { ownerType: 'album', ownerId: 2 }]).priceMinor, 500000n)
  assert.equal(p.pickRule(rows, [{ ownerType: 'track', ownerId: 11 }]), null)
})

test('prices display in toman, rial or dollars and round-trip to the admin form', () => {
  assert.equal(p.formatPrice(150000n, 'IRT'), '۱۵۰٬۰۰۰ تومان')
  assert.equal(p.formatPrice(1500000n, 'IRR'), '۱٬۵۰۰٬۰۰۰ ریال')
  assert.equal(p.formatPrice(999n, 'USD'), '$9.99')
  assert.equal(p.priceInput(999n, 'USD'), '9.99')
  assert.equal(p.priceInput(150000n, 'IRT'), '150000')
  assert.equal(p.priceInput(null, 'IRT'), '')
})

test('every gate asks the paywall: pages, download links, player, articles and checkout', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  const links = read('src/modules/media/server/links.ts')
  assert.match(links, /async function gate\(/)
  assert.equal((links.match(/await gate\(viewer/g) || []).length, 3, 'download link, track and watch player')
  assert.match(links, /status: 402/)
  for (const page of ['src/app/software/[slug]/page.tsx', 'src/app/games/[slug]/page.tsx', 'src/app/cinema/[slug]/page.tsx', 'src/app/music/track/[slug]/page.tsx', 'src/app/music/album/[slug]/page.tsx', 'src/modules/site/server/pages/blog/[slug]/page.tsx']) {
    assert.match(read(page), /paywallView\(/, page)
    assert.match(read(page), /<BuyContent /, page)
  }
  assert.match(read('src/modules/site/server/http/public/cms/route.ts'), /accessFor\(viewer/)
  const checkout = read('src/modules/checkout/server/checkout.ts')
  assert.match(checkout, /quoteContent\(content/)
  assert.match(checkout, /content \? 'GRANT_CONTENT'/)
  const jobs = read('src/modules/fulfillment/server/jobs.ts')
  assert.match(jobs, /meta\.kind === 'content'/)
  assert.match(jobs, /fulfillContentOrder\(job\.orderId\)/)
})
