const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const seo = load('src/modules/seo/domain/seo.ts')

test('SEO settings are normalized: templates, tokens, URLs and IndexNow keys', () => {
  const config = seo.normalizeSeoConfig({
    titleTemplate: 'no placeholder', description: '  a  b  ', keywords: 'موبایل، لپ‌تاپ, موبایل',
    verification: { google: '<meta name="google-site-verification" content="abc_DEF-123" />', bing: 'x"><script>' },
    sameAs: ['https://instagram.com/mobocom', 'javascript:alert(1)', 'not a url'],
    ogImage: '//evil.example/x.png', logo: '/images/logo.png', indexNow: { key: 'short' }, allowAiCrawlers: false,
    organization: { email: 'a@b.ir<script>', phone: '+98 21 <b>1234' },
  })
  assert.equal(config.titleTemplate, seo.DEFAULT_SEO.titleTemplate)
  assert.equal(config.description, 'a b')
  assert.deepEqual(config.keywords, ['موبایل', 'لپ‌تاپ'])
  assert.equal(config.verification.google, 'abc_DEF-123')
  assert.doesNotMatch(config.verification.bing, /[<>"]/)
  assert.deepEqual(config.sameAs, ['https://instagram.com/mobocom'])
  assert.equal(config.ogImage, '')
  assert.equal(config.logo, '/images/logo.png')
  assert.equal(config.indexNow.key, '')
  assert.equal(config.allowAiCrawlers, false)
  assert.doesNotMatch(config.organization.email + config.organization.phone, /[<>]/)
})

test('meta descriptions are trimmed at a word boundary without markup', () => {
  const long = '<p>' + 'کلمه '.repeat(80) + '</p>'
  const out = seo.metaDescription(long)
  assert.ok(out.length <= 155)
  assert.ok(out.endsWith('…'))
  assert.doesNotMatch(out, /<p>/)
  assert.equal(seo.metaDescription('کوتاه'), 'کوتاه')
})

test('content audit flags missing descriptions, images, thin pages and duplicate titles', () => {
  const issues = seo.auditContent([
    { kind: 'post', title: 'A', path: '/blog/a', description: '', image: '', words: 40 },
    { kind: 'product', title: 'A', path: '/products/a', description: 'x'.repeat(80), image: '/i.png', words: 0 },
  ])
  const codes = issues.map((issue) => `${issue.path}:${issue.code}`)
  for (const code of ['/blog/a:description-missing', '/blog/a:image-missing', '/blog/a:thin-content', '/blog/a:title-duplicate', '/products/a:title-duplicate']) assert.ok(codes.includes(code), code)
  assert.equal(codes.some((code) => code.startsWith('/products/a:description')), false)
})

test('llms.txt and RSS are well formed and escape user content', () => {
  const llms = seo.buildLlmsTxt({ name: 'موبوکام', summary: 'فروشگاه\nدیجیتال', details: ['جزئیات'], sections: [{ title: 'بخش‌ها', links: [{ title: 'فروشگاه [ویژه]', url: 'https://x.ir/products', note: 'کالا' }] }, { title: 'خالی', links: [] }] })
  assert.match(llms, /^# موبوکام\n\n> فروشگاه دیجیتال\n/)
  assert.match(llms, /- \[فروشگاه ویژه\]\(https:\/\/x\.ir\/products\): کالا/)
  assert.doesNotMatch(llms, /## خالی/)
  const rss = seo.buildRss({ title: 'M & Co', url: 'https://x.ir', description: '<b>', language: 'fa-IR', items: [{ title: 'a<script>', url: 'https://x.ir/blog/a', description: '"q"', date: new Date(0) }] })
  assert.match(rss, /<title>M &amp; Co<\/title>/)
  assert.match(rss, /a&lt;script&gt;/)
  assert.match(rss, /&quot;q&quot;/)
  assert.match(rss, /Thu, 01 Jan 1970/)
})

test('AI crawlers and private paths are declared', () => {
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.ok(seo.AI_CRAWLERS.includes(bot), bot)
  for (const path of ['/admin', '/dashboard', '/api/']) assert.ok(seo.PRIVATE_PATHS.includes(path), path)
})
