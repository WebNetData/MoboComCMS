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

test('links that leave the site use the public section address (renamed sections such as /magazine)', () => {
  const fs = require('node:fs'), path = require('node:path'), read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
  assert.match(read('src/modules/social/server/social.ts'), /absolute\(base, toPublicPath\(item\.url\)\)/, 'Telegram, Instagram and push links')
  assert.match(read('src/modules/seo/server/indexnow.ts'), /toPublicPath\(item\.startsWith\('\/'\)/, 'IndexNow submissions')
  assert.match(read('src/modules/site/server/seo.ts'), /item: `\$\{base\}\$\{toPublicPath\(t\.path\)\}`/, 'breadcrumb JSON-LD')
  assert.match(read('src/modules/site/server/section-seo.ts'), /sectionDisplayName\(moduleId/, 'the journal name comes from the central section names')
  for (const page of ['src/modules/site/server/pages/blog/page.tsx', 'src/modules/site/server/pages/blog/[slug]/page.tsx']) assert.match(read(page), /sectionName\('journal'/, page)
  assert.doesNotMatch(read('src/modules/site/server/pages/blog/page.tsx'), /<span>\{t\.blog\}<\/span>/, 'no fixed «وبلاگ» crumb')
})

test('every section name is managed in one place and shown everywhere', () => {
  const fs = require('node:fs'), path = require('node:path'), read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
  const ts = require('typescript-api'), src = read('src/modules/site/domain/section-names.ts')
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, mod = { exports: {} }
  new Function('exports', 'module', 'require', out)(mod.exports, mod, require)
  const { normalizeSectionNames: n, sectionLabel: label } = mod.exports
  assert.deepEqual(n({ journal: { fa: '  مجله  ', en: 'Magazine' }, games: { fa: '', en: '' }, 'Bad Id': { fa: 'x' }, store: { fa: '<b>فروشگاه</b>' }, x: 'str' }), { journal: { fa: 'مجله', en: 'Magazine' }, games: { fa: '', en: '' }, store: { fa: 'b فروشگاه /b', en: '' } }, 'an emptied name stays as an empty entry')
  assert.equal(n({ a1: { fa: 'ک'.repeat(90) } }).a1.fa.length, 60)
  const names = { journal: { fa: 'مجلهٔ فناوری', en: '' } }
  assert.equal(label(names, 'journal', true, { fa: 'مجله', en: 'Magazine' }), 'مجلهٔ فناوری')
  assert.equal(label(names, 'journal', false, { fa: 'مجله', en: 'Magazine' }), 'Magazine', 'English falls back to the built-in English name')
  assert.equal(label(names, 'games', true, { fa: 'بازی' }), 'بازی')
  assert.match(read('src/modules/site/server/section-names.ts'), /createSectionSettingsHistory\(KEY, 'settings-section-names'/, 'revisioned and audited')
  assert.match(read('src/modules/content/server/http/history.ts'), /type === 'settings-section-names'/, 'restorable from history')
  assert.match(read('src/modules/site/server/http/admin/sections/route.ts'), /saveSectionName\(id,/)
  assert.match(read('src/app/api/admin/extensions/navigation/route.ts'), /title: names\[row\.manifest\.id\]\?\.fa \|\|/, 'admin menu titles follow the name')
  assert.match(read('src/app/layout.tsx'), /<SectionNamesProvider names=\{sectionNames\}>/)
  for (const page of ['src/app/games/top/page.tsx', 'src/app/software/browse/page.tsx', 'src/app/cinema/[slug]/detail-view.tsx', 'src/components/forum/TopicView.tsx']) assert.match(read(page), /<SectionName id="/, page)
  assert.match(read('src/modules/catalog/server/pages/products/[slug]/page.tsx'), /sectionDisplayName\('store'/)
  assert.match(read('src/app/maintenance/page.tsx'), /sectionDisplayName\(entry\.plugin/)
})
