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

const fa = load('src/shared/text/persian')
const items = load('src/modules/content/domain/items')
const dl = load('src/modules/downloads/domain/downloads')
const rv = load('src/modules/reviews/domain/reviews')
const social = load('src/modules/social/domain/social')
const an = load('src/modules/analytics/domain/analytics')
const cr = load('src/modules/copyright/domain/copyright')

test('Persian normalization unifies letters, digits, joiners and case', () => {
  assert.equal(fa.normalizePersian('نرم‌افزار ويندوز ١١'), 'نرم افزار ویندوز 11')
  assert.equal(fa.normalizePersian('كتابخانهٔ  Photoshop!'), 'کتابخانه photoshop')
  assert.equal(fa.normalizePersian('آنتی‌ویروس'), 'انتی ویروس')
  assert.equal(fa.compactPersian('نرم افزار'), fa.compactPersian('نرم‌افزار'))
  assert.deepEqual(fa.searchTokens('  دانلود   دانلود ویندوز ۱۰ a '), ['دانلود', 'ویندوز', '10'])
})

test('search relevance requires every token and ranks title matches first', () => {
  const tokens = fa.searchTokens('ویندوز 11')
  const text = fa.searchableText('ویندوز ۱۱ پرو', 'سیستم عامل')
  assert.ok(fa.relevance(tokens, 'ویندوز ۱۱ پرو', text) > fa.relevance(tokens, 'راهنمای نصب', fa.searchableText('راهنمای نصب', 'ویندوز 11')))
  assert.equal(fa.relevance(fa.searchTokens('مک'), 'ویندوز', fa.searchableText('ویندوز')), 0)
  // "نرم‌افزار" typed with a space still matches the compact title.
  assert.ok(fa.relevance(fa.searchTokens('نرم افزار'), 'نرم‌افزار حسابداری', fa.searchableText('نرم‌افزار حسابداری')) > 0)
})

test('item paths round-trip and keys are validated', () => {
  assert.equal(items.itemPath('software', { slug: 'vlc', id: 3 }), '/software/vlc')
  assert.equal(items.itemPath('thread', { id: 9 }), '/forum/t/9')
  assert.deepEqual(items.parseItemPath('https://mobocom.ir/games/elden-ring?x=1'), { type: 'game', slug: 'elden-ring' })
  assert.deepEqual(items.parseItemPath('/forum/t/42/slug'), { type: 'thread', slug: '42', id: 42 })
  assert.equal(items.parseItemPath('/software/browse'), null)
  assert.equal(items.parseItemPath('javascript:alert(1)'), null)
  assert.deepEqual(items.parseItemKey('title:7'), { type: 'title', id: 7 })
  for (const bad of ['user:1', 'software:0', 'software:-1', 'software:1.5', '', 'software']) assert.equal(items.parseItemKey(bad), null, bad)
})

test('download settings are clamped, hosts validated and secrets kept', () => {
  const previous = { ...dl.DEFAULT_DOWNLOAD_SETTINGS, hosts: [{ host: 'dl.example.com', method: 'nginx', secret: 'enc:old', ttlMinutes: 60, expression: '{expires}{uri} {secret}', tokenParam: 'md5', expiresParam: 'expires' }] }
  const next = dl.normalizeDownloadSettings({ tokenTtlMinutes: 1, guestDaily: -5, hosts: [{ host: 'https://DL.example.com/files', secret: '' }, { host: 'not a host' }, { host: '*.cdn.example.org', method: 'hmac', secret: 's3', expression: 'no secret here' }] }, previous)
  assert.equal(next.tokenTtlMinutes, 10)
  assert.equal(next.guestDaily, 0)
  assert.equal(next.hosts.length, 2)
  assert.equal(next.hosts[0].secret, 'enc:old')
  assert.equal(next.hosts[1].method, 'hmac')
  assert.equal(next.hosts[1].tokenParam, 'token')
  assert.ok(dl.hostMatches('*.cdn.example.org', 'a.cdn.example.org'))
  assert.ok(!dl.hostMatches('*.cdn.example.org', 'evilcdn.example.org'))
  assert.equal(dl.nginxExpression('{expires}{uri}{ip} {secret}', { expires: 99, uri: '/f.zip', ip: '1.2.3.4', secret: 'k' }), '99/f.zip1.2.3.4 k')
  assert.equal(dl.dailyLimit({ ...dl.DEFAULT_DOWNLOAD_SETTINGS, guestDaily: 5, memberDaily: 20, vipDaily: 0 }, { userId: null, member: false }), 5)
  assert.equal(dl.dailyLimit({ ...dl.DEFAULT_DOWNLOAD_SETTINGS, vipDaily: 0 }, { userId: 3, member: true }), 0)
  assert.deepEqual(dl.splitToken(`${(1_900_000_000).toString(36)}.abcdefghijklmnopqrstuvwxyz0`), { expires: 1_900_000_000, signature: 'abcdefghijklmnopqrstuvwxyz0' })
  for (const bad of ['', 'x', 'zz.short', '1.<script>abcdefghijklmnop']) assert.equal(dl.splitToken(bad), null, bad)
  assert.notEqual(dl.tokenPayload('l1', 5, 7), dl.tokenPayload('l1', 5, null))
})

test('reviews: ratings, text rules and summaries', () => {
  assert.equal(rv.normalizeRating(4), 4)
  for (const bad of [0, 6, 2.5, '5x', null]) assert.throws(() => rv.normalizeRating(bad), rv.ReviewError)
  assert.equal(rv.normalizeReviewBody('  <b>عالی</b>   بود و کار کرد  '), 'عالی بود و کار کرد')
  assert.throws(() => rv.normalizeReviewBody('کوتاه'), /۱۰ حرف/)
  assert.equal(rv.normalizeReviewBody(''), '')
  assert.equal(rv.initialReviewStatus('', true), 'APPROVED')
  assert.equal(rv.initialReviewStatus('متن کافی برای نظر', true), 'PENDING')
  assert.equal(rv.initialReviewStatus('متن کافی برای نظر', false), 'APPROVED')
  assert.deepEqual(rv.summarize([5, 4, 4, 1, 9]), { average: 3.5, count: 4, distribution: [1, 0, 0, 2, 1] })
  assert.deepEqual(rv.summarize([]), { average: null, count: 0, distribution: [0, 0, 0, 0, 0] })
  assert.deepEqual(rv.summarizeDistribution([1, 0, 0, 1, 1]), { average: 3.3, count: 3, distribution: [1, 0, 0, 1, 1] })
})

test('social posts escape HTML, respect limits and tag links', () => {
  const vars = { type: 'software', title: 'Tool <b>&', subtitle: 'نسخهٔ ۲', summary: 'a'.repeat(900), url: 'https://m.ir/software/t?a=1&b=2', hashtags: '#موبوکام' }
  const html = social.renderPost('{icon} {title}\n{subtitle}\n\n\n\n{summary}\n{url}', vars, { html: true, max: 1024 })
  assert.match(html, /<b>Tool &lt;b&gt;&amp;<\/b>/)
  assert.match(html, /https:\/\/m\.ir\/software\/t\?a=1&amp;b=2/)
  assert.doesNotMatch(html, /\n{3,}/)
  assert.ok(html.length <= 1024)
  assert.ok(!social.renderPost('{title} <script>', vars, { html: true }).includes('<script>'))
  assert.equal(social.renderPost('{title}', vars), 'Tool <b>&')
  assert.equal(social.normalizeChannel('https://t.me/mobocom_ir'), '@mobocom_ir')
  assert.equal(social.normalizeChannel('-1001234567890'), '-1001234567890')
  assert.equal(social.normalizeChannel('bad channel!'), '')
  assert.equal(social.withUtm('https://m.ir/a?x=1', 'TELEGRAM', true), 'https://m.ir/a?x=1&utm_source=telegram&utm_medium=social')
  assert.equal(social.withUtm('https://m.ir/a', 'PUSH', false), 'https://m.ir/a')
  assert.equal(social.hashtag('نرم افزار کاربردی'), '#نرم_افزار_کاربردی')
  const kept = social.normalizeSocialSettings({ instagram: { accessToken: '' }, telegram: { channel: '@okchannel' }, delayMinutes: 99999 }, { ...social.DEFAULT_SOCIAL, instagram: { ...social.DEFAULT_SOCIAL.instagram, accessToken: 'enc:x' } })
  assert.equal(kept.instagram.accessToken, 'enc:x')
  assert.equal(kept.telegram.channel, '@okchannel')
  assert.equal(kept.delayMinutes, 1440)
  assert.ok(social.retryDelayMs(3) > social.retryDelayMs(1))
})

test('analytics counts public pages only and classifies visitors', () => {
  assert.equal(an.normalizeTrackedPath('/software/vlc/?utm_source=x#top'), '/software/vlc')
  for (const skip of ['/admin/users', '/api/search', '/dashboard', '/_next/static/a.js', '/logo.png', '//evil.com', 'https://x', '/a<b>']) assert.equal(an.normalizeTrackedPath(skip), '', skip)
  assert.equal(an.classifyUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari').device, 'mobile')
  assert.equal(an.classifyUserAgent('Mozilla/5.0 (iPad; CPU OS 17) Safari').device, 'tablet')
  assert.ok(an.classifyUserAgent('Googlebot/2.1').bot)
  assert.ok(an.classifyUserAgent('').bot)
  assert.equal(an.sourceOf('https://www.google.com/search?q=x', 'mobocom.ir'), 'Google')
  assert.equal(an.sourceOf('https://t.me/s/channel', 'mobocom.ir'), 'Telegram')
  assert.equal(an.sourceOf('https://mobocom.ir/software', 'mobocom.ir'), 'مستقیم')
  assert.equal(an.sourceOf('', 'mobocom.ir'), 'مستقیم')
  assert.equal(an.campaignSource('Telegram'), 'Telegram')
  assert.equal(an.campaignSource('push'), 'اعلان مرورگر')
  assert.equal(an.campaignSource('<x>'), 'x')
  assert.equal(an.change(150, 100), 50)
  assert.equal(an.change(5, 0), null)
})

test('copyright reports are validated like a takedown notice', () => {
  const valid = { name: 'شرکت نمونه', email: 'Legal@Example.com', workTitle: 'نرم‌افزار نمونه', infringingUrls: 'https://mobocom.ir/software/x\nnot-a-url\nhttps://mobocom.ir/software/x', description: 'این نسخه بدون مجوز و با کرک منتشر شده است و حق ما را نقض می‌کند.', statement: true, signature: 'شرکت  نمونه' }
  const report = cr.validateReport(valid)
  assert.equal(report.email, 'legal@example.com')
  assert.deepEqual(report.infringingUrls, ['https://mobocom.ir/software/x'])
  assert.equal(report.role, 'OWNER')
  assert.throws(() => cr.validateReport({ ...valid, statement: false }), /حسن نیت/)
  assert.throws(() => cr.validateReport({ ...valid, signature: 'کس دیگر' }), /امضا/)
  assert.throws(() => cr.validateReport({ ...valid, infringingUrls: 'javascript:alert(1)' }), /نشانی/)
  assert.throws(() => cr.validateReport({ ...valid, email: 'bad' }), /ایمیل/)
  assert.throws(() => cr.validateReport({ ...valid, description: 'کوتاه' }), /۳۰ حرف/)
  assert.match(cr.trackingCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])), /^CR-[2-9A-HJ-NP-Z]{8}$/)
  assert.equal(cr.normalizeCode(' cr-abc '), 'CR-ABC')
  assert.equal(cr.parseUrlList(Array.from({ length: 30 }, (_, i) => `https://x.io/${i}`).join('\n')).length, 20)
})

test('short search tokens only match at word starts', () => {
  const tokens = fa.searchTokens('وی ال')
  assert.equal(fa.relevance(tokens, 'کلش رویال', fa.searchableText('کلش رویال', 'Android, iOS')), 0)
  assert.ok(fa.relevance(tokens, 'وی‌ال‌سی', fa.searchableText('وی‌ال‌سی', 'VideoLAN')) > 0)
})
