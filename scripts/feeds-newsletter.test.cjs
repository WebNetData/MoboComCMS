const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const f = load('src/modules/store/domain/feeds')
const n = load('src/modules/mail/domain/newsletter')
const img = load('src/shared/media/image')

const product = {
  id: 7, title: 'گوشی سامسونگ A55', subtitle: 'Galaxy A55', url: 'https://mobocom.net/products/a55', image: 'https://mobocom.net/i/1.webp', images: ['https://mobocom.net/i/1.webp', 'https://mobocom.net/i/2.webp'],
  price: 21500000, oldPrice: 23000000, available: true, category: 'موبایل', categoryPath: ['کالای دیجیتال', 'موبایل'], brand: 'Samsung', description: 'توضیح <کوتاه> & ساده',
  guarantee: '۱۸ ماه', specs: { 'حافظه': '256GB' }, createdAt: new Date('2026-01-02T03:04:05Z'), updatedAt: new Date('2026-09-01T00:00:00Z'), sku: 'A55-256',
}

test('feeds: settings, toman conversion and Torob/Emalls shapes', () => {
  const s = f.normalizeFeeds({ torob: true, excludeCategories: 'Gift-Cards, bad/slug!, خدمات', emallsToken: 'short' })
  assert.equal(s.torob, true); assert.equal(s.emalls, false); assert.equal(s.includeOutOfStock, true)
  assert.deepEqual(s.excludeCategories, ['gift-cards', 'خدمات'])
  assert.equal(s.emallsToken, '')
  assert.equal(f.toToman(215000000n, 'IRR'), 21500000)
  assert.equal(f.toToman(5n, 'IRT'), 5)
  assert.equal(f.toToman(5n, 'USD'), null)
  const page = f.torobPage([product], 1, 250, 100)
  assert.equal(page.api_version, 'torob_api_v3'); assert.equal(page.max_pages, 3)
  const item = page.products[0]
  assert.equal(item.page_unique, '7'); assert.equal(item.current_price, 21500000); assert.equal(item.old_price, 23000000); assert.equal(item.availability, 'instock')
  assert.equal(item.date_added, '2026-01-02T03:04:05+00:00')
  const out = f.torobItem({ ...product, available: false })
  assert.equal(out.availability, 'outofstock'); assert.equal(out.current_price, 0)
  const emalls = f.emallsPage([product], 2, 150, 100)
  assert.equal(emalls.total_pages, 2); assert.equal(emalls.products[0].is_available, true); assert.equal(emalls.products[0].price, 21500000)
  const xml = f.xmlFeed([product], { title: 'فروشگاه & من', url: 'https://mobocom.net' })
  assert.match(xml, /<g:price>230000000 IRR<\/g:price>/); assert.match(xml, /<g:sale_price>215000000 IRR<\/g:sale_price>/)
  assert.match(xml, /توضیح &lt;کوتاه&gt; &amp; ساده/); assert.match(xml, /فروشگاه &amp; من/)
  assert.match(xml, /<g:product_type>کالای دیجیتال &gt; موبایل<\/g:product_type>/)
})

test('newsletter: validation, tracking and document', () => {
  assert.equal(n.normalizeEmail(' Ali@Example.COM '), 'ali@example.com')
  assert.equal(n.normalizeEmail('bad@@x.com'), '')
  assert.equal(n.normalizeEmail('a..b@x.com'), '')
  assert.throws(() => n.validateCampaign({ subject: '', html: '<p>x</p>' }), n.NewsletterError)
  assert.throws(() => n.validateCampaign({ subject: 's', html: '<p></p>' }), n.NewsletterError)
  const c = n.validateCampaign({ subject: 'سلام\nدنیا', html: '<p>متن</p>', audience: 'nope', scheduledAt: '2000-01-01' })
  assert.equal(c.subject, 'سلام دنیا'); assert.equal(c.audience, 'subscribers'); assert.equal(c.scheduledAt, null)
  const sign = (url) => `S(${url.length})`
  const html = n.trackLinks('<p><a href="/products/a?x=1&amp;y=2">محصول</a> <a href="mailto:a@b.c">ایمیل</a> <img src="/api/media/covers/1.webp"></p>', { base: 'https://mobocom.net', token: 'TOK', sign })
  assert.match(html, /href="https:\/\/mobocom\.net\/api\/newsletter\/c\/TOK\?u=https%3A%2F%2Fmobocom\.net%2Fproducts%2Fa%3Fx%3D1%26y%3D2&amp;s=S\(\d+\)"/)
  assert.match(html, /href="mailto:a@b\.c"/)
  assert.match(html, /src="https:\/\/mobocom\.net\/api\/media\/covers\/1\.webp"/)
  const doc = n.campaignDocument({ brand: 'موبوکام', base: 'https://mobocom.net', subject: 'موضوع', preheader: 'پیش', body: '<p>بدنه</p>', token: 'TOK', unsubscribeUrl: 'https://mobocom.net/newsletter/unsubscribe?t=TOK', name: 'علی' })
  assert.match(doc.html, /\/api\/newsletter\/o\/TOK\.gif/); assert.match(doc.html, /لغو عضویت/); assert.match(doc.html, /علی عزیز/)
  assert.match(doc.text, /بدنه/); assert.match(doc.text, /unsubscribe\?t=TOK/)
  assert.equal(n.batchSize(20, 500, 495), 5)
  assert.equal(n.batchSize(20, 0, 10000), 20)
  assert.equal(n.batchSize(20, 500, 600), 0)
})

test('images: only site images get resized addresses', () => {
  const own = '/api/media/covers/0f8fad5b-d9cb-469f-a165-70867728950e.webp'
  assert.equal(img.sized(own, 300), `${own}?w=320`)
  assert.equal(img.sized(own, 5000), `${own}?w=1280`)
  assert.equal(img.sized('https://x.com/a.jpg', 300), 'https://x.com/a.jpg')
  assert.equal(img.srcSet(own, 320), `${own}?w=320 1x, ${own}?w=640 2x`)
  assert.equal(img.srcSet('', 320), undefined)
  // Profile pictures resize the same way (served by their own route, never through the covers CDN).
  const face = '/api/profile/media/a8928ebb-0d46-41c4-8b2a-9f38ba286fbf.png'
  assert.equal(img.sized(face, 40), `${face}?w=160`)
  assert.equal(img.srcSet(face, 160), `${face}?w=160 1x, ${face}?w=320 2x`)
  assert.equal(img.sized('/api/profile/media/../x.png', 40), '/api/profile/media/../x.png')
})
