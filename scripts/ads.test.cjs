const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const a = load('src/modules/ads/domain/ads.ts')

const NOW = new Date('2026-10-01T10:00:00Z')
const campaign = (extra = {}) => ({ id: 1, status: 'ACTIVE', priority: 5, startsAt: null, endsAt: null, placements: ['sidebar'], devices: 'ALL', audience: 'ALL', includePaths: [], excludePaths: [], languages: [], hours: '', maxImpressions: 0, maxClicks: 0, dailyImpressions: 0, dailyClicks: 0, impressions: 0, clicks: 0, ...extra })
const ctx = (extra = {}) => ({ placement: 'sidebar', device: 'DESKTOP', path: '/blog/post', language: 'fa', signedIn: false, vip: false, now: NOW, hour: 14, todayImpressions: 0, todayClicks: 0, ...extra })

test('destination addresses cannot carry scripts', () => {
  assert.equal(a.safeUrl('https://example.com/x?a=1'), 'https://example.com/x?a=1')
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com', '//evil.com', 'https://a.com/"><script>', 'not a url']) assert.throws(() => a.safeUrl(bad), a.AdsError, bad)
  assert.equal(a.safeUrl('/uploads/a.png', { allowPath: true }), '/uploads/a.png')
  assert.throws(() => a.safeUrl('/uploads/a.png'), a.AdsError)
  assert.throws(() => a.safeUrl('//evil.com/a.png', { allowPath: true }), a.AdsError)
})

test('eligibility: status, period, placement, device, audience, paths, language, hours', () => {
  assert.equal(a.ineligible(campaign(), ctx()), '')
  assert.equal(a.ineligible(campaign({ status: 'PAUSED' }), ctx()), 'status')
  assert.equal(a.ineligible(campaign({ status: 'PENDING' }), ctx()), 'status')
  assert.equal(a.ineligible(campaign({ startsAt: new Date('2026-10-02T00:00:00Z') }), ctx()), 'not-started')
  assert.equal(a.ineligible(campaign({ endsAt: new Date('2026-09-30T00:00:00Z') }), ctx()), 'ended')
  assert.equal(a.ineligible(campaign(), ctx({ placement: 'footer-banner' })), 'placement')
  assert.equal(a.ineligible(campaign({ devices: 'MOBILE' }), ctx()), 'device')
  assert.equal(a.ineligible(campaign({ audience: 'GUEST' }), ctx({ signedIn: true })), 'audience')
  assert.equal(a.ineligible(campaign({ audience: 'MEMBER' }), ctx()), 'audience')
  assert.equal(a.ineligible(campaign({ audience: 'NON_VIP' }), ctx({ signedIn: true, vip: true })), 'audience')
  assert.equal(a.ineligible(campaign({ includePaths: ['/blog'] }), ctx()), '')
  assert.equal(a.ineligible(campaign({ includePaths: ['/blog'] }), ctx({ path: '/blogger' })), 'path', 'a prefix matches whole segments only')
  assert.equal(a.ineligible(campaign({ excludePaths: ['/blog/post'] }), ctx()), 'path')
  assert.equal(a.ineligible(campaign({ includePaths: ['/'] }), ctx({ path: '/blog' })), 'path', '"/" targets only the home page')
  assert.equal(a.ineligible(campaign({ languages: ['en'] }), ctx()), 'language')
  assert.equal(a.ineligible(campaign({ hours: '9-17' }), ctx({ hour: 20 })), 'hours')
  assert.equal(a.ineligible(campaign({ hours: '22-6' }), ctx({ hour: 2 })), '', 'overnight windows wrap around midnight')
  assert.equal(a.ineligible(campaign({ hours: '22-6' }), ctx({ hour: 12 })), 'hours')
})

test('caps stop a campaign, daily caps only for today', () => {
  assert.equal(a.ineligible(campaign({ maxImpressions: 100, impressions: 100 }), ctx()), 'cap')
  assert.equal(a.ineligible(campaign({ maxClicks: 5, clicks: 5 }), ctx()), 'cap')
  assert.equal(a.ineligible(campaign({ dailyImpressions: 10 }), ctx({ todayImpressions: 10 })), 'daily-cap')
  assert.equal(a.ineligible(campaign({ dailyClicks: 2 }), ctx({ todayClicks: 1 })), '')
  assert.equal(a.shouldEnd(campaign({ endsAt: new Date('2026-09-30T00:00:00Z') }), NOW), true)
  assert.equal(a.shouldEnd(campaign({ maxImpressions: 10, impressions: 10 }), NOW), true)
  assert.equal(a.shouldEnd(campaign({ maxImpressions: 10, impressions: 9 }), NOW), false)
})

test('selection: highest priority tier wins, rotation inside it, creatives by weight', () => {
  const list = [{ id: 1, priority: 5 }, { id: 2, priority: 9 }, { id: 3, priority: 9 }]
  assert.deepEqual([a.pickCampaign(list, 0)?.id, a.pickCampaign(list, 0.99)?.id], [2, 3])
  assert.equal(a.pickCampaign([], 0.5), null)
  const creatives = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }]
  assert.equal(a.pickCreative(creatives, 0.1).id, 'a')
  assert.equal(a.pickCreative(creatives, 0.5).id, 'b')
  let b = 0
  for (let i = 0; i < 1000; i++) if (a.pickCreative(creatives, i / 1000).id === 'b') b++
  assert.equal(b, 750)
})

test('campaign form is validated and cleaned', () => {
  const known = ['sidebar', 'home-top']
  const ok = a.normalizeCampaign({ name: ' Test ', placements: ['sidebar', 'nope'], hours: '9-23', includePaths: '/blog, /shop javascript:x', maxImpressions: '5000' }, known)
  assert.equal(ok.name, 'Test')
  assert.deepEqual(ok.placements, ['sidebar'])
  assert.deepEqual(ok.includePaths, ['/blog', '/shop'])
  assert.equal(ok.maxImpressions, 5000)
  assert.throws(() => a.normalizeCampaign({ name: '', placements: ['sidebar'] }, known), a.AdsError)
  assert.throws(() => a.normalizeCampaign({ name: 'x', placements: ['nope'] }, known), /جایگاه/)
  assert.throws(() => a.normalizeCampaign({ name: 'x', placements: ['sidebar'], startsAt: '2026-02-02', endsAt: '2026-01-01' }, known), /پایان/)
  assert.throws(() => a.normalizeCampaign({ name: 'x', placements: ['sidebar'], hours: '25-30' }, known), /ساعت/)
})

test('creatives: images need a picture and a destination; only admins may add HTML', () => {
  const image = a.normalizeCreative({ kind: 'IMAGE', imageUrl: '/uploads/b.png', linkUrl: 'https://x.com', title: 'Hello' }, { admin: false })
  assert.equal(image.alt, 'Hello')
  assert.throws(() => a.normalizeCreative({ kind: 'IMAGE', linkUrl: 'https://x.com' }, { admin: false }), a.AdsError)
  assert.throws(() => a.normalizeCreative({ kind: 'IMAGE', imageUrl: '/u.png' }, { admin: false }), a.AdsError)
  assert.throws(() => a.normalizeCreative({ kind: 'HTML', html: '<b>x</b>' }, { admin: false }), /HTML/)
  assert.equal(a.normalizeCreative({ kind: 'HTML', html: '<b>x</b>' }, { admin: true }).kind, 'HTML')
  assert.throws(() => a.normalizeCreative({ kind: 'IMAGE', imageUrl: 'javascript:alert(1)', linkUrl: 'https://x.com' }, { admin: true }), a.AdsError)
})

test('placements and packages: keys, prices and placements are checked', () => {
  assert.equal(a.normalizePlacement({ key: 'Blog-Side', name: 'Side', width: 300, height: 250 }).key, 'blog-side')
  assert.throws(() => a.normalizePlacement({ key: 'a b', name: 'x' }), a.AdsError)
  assert.throws(() => a.normalizePlacement({ key: 'ok-key', name: '' }), a.AdsError)
  const pkg = a.normalizePackage({ name: 'Gold', placements: ['sidebar'], price: '۱۲۰٬۰۰۰', days: 30 }, ['sidebar'])
  assert.equal(pkg.priceMinor, 120000n)
  assert.equal(pkg.currency, 'IRT')
  assert.throws(() => a.normalizePackage({ name: 'x', placements: ['sidebar'], price: '0' }, ['sidebar']), /قیمت/)
  assert.throws(() => a.normalizePackage({ name: 'x', placements: ['other'], price: '10' }, ['sidebar']), /جایگاه/)
})

test('bots are not counted, devices are told apart, paths are cleaned', () => {
  assert.equal(a.isBot('Googlebot/2.1'), true)
  assert.equal(a.isBot(''), true)
  assert.equal(a.isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/120'), false)
  assert.equal(a.deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile'), 'MOBILE')
  assert.equal(a.deviceOf('Mozilla/5.0 (X11; Linux x86_64)'), 'DESKTOP')
  assert.equal(a.cleanPath('/blog/x/?utm=1#top'), '/blog/x')
  assert.equal(a.cleanPath('javascript:x'), '/')
  assert.equal(a.ctr(1000, 25), 2.5)
  assert.equal(a.ctr(0, 0), 0)
})

test('reports fill missing days and packages become campaigns', () => {
  const rows = a.fillDays([{ day: '2026-10-02', impressions: 5, clicks: 1 }], '2026-10-03', 3)
  assert.deepEqual(rows.map((r) => [r.day, r.impressions]), [['2026-10-01', 0], ['2026-10-02', 5], ['2026-10-03', 0]])
  const plan = a.campaignFromPackage({ name: 'Gold', placements: ['sidebar'], days: 10, impressions: 500, clicks: 0 }, 'ACME', NOW)
  assert.equal(plan.endsAt.getTime() - NOW.getTime(), 10 * 86_400_000)
  assert.equal(plan.maxImpressions, 500)
})

test('wiring: routes, module manifest, schema, jobs and pages exist and stay safe', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  for (const route of ['serve', 'view', 'click', 'packages', 'mine', 'buy', 'media']) assert.ok(fs.existsSync(path.join(root, `src/app/api/promo/${route}/route.ts`)), route)
  const manifest = JSON.parse(read('src/plugins/ads/manifest.json'))
  assert.equal(manifest.id, 'ads')
  for (const item of manifest.adminMenu.items) assert.ok(item.permissions.includes('ads.manage'))
  for (const page of ['', 'campaigns', 'campaigns/[id]', 'placements', 'packages', 'advertisers', 'settings']) assert.ok(fs.existsSync(path.join(root, 'src/app/admin/ads', page, 'page.tsx')), page)
  assert.ok(fs.existsSync(path.join(root, 'src/app/advertise/page.tsx')))
  assert.ok(fs.existsSync(path.join(root, 'src/app/dashboard/ads/page.tsx')))
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) for (const model of ['AdPlacement', 'Advertiser', 'AdCampaign', 'AdCreative', 'AdStatDaily', 'AdPackage']) assert.match(read(schema), new RegExp(`model ${model} `), `${schema} ${model}`)
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /'ads'/)
  // External ad-network scripts stay blocked; HTML creatives render in a sandbox.
  assert.match(read('src/plugins/ads/PromoSlot.tsx'), /sandbox=/)
  // Every admin write goes through the permission guard.
  assert.match(read('src/modules/ads/server/http/admin.ts'), /ads\.manage/)
})

test('a banner keeps its own shape inside its place', () => {
  const slot = fs.readFileSync(path.resolve(root, 'src/plugins/ads/PromoSlot.tsx'), 'utf8')
  // The picture's width is capped by the place; its height follows the picture (a 3:1 picture in 728×90 was squeezed flat).
  assert.match(slot, /const picture = size\?\.width \? \{ maxWidth: size\.width, width: '100%', height: 'auto' \} : undefined/)
  assert.match(slot, /decoding="async" style=\{picture\} \/><\/picture>/)
  assert.doesNotMatch(slot.match(/<img [^>]+>/)[0], /style=\{ratio\}/)
  // The admin is told how a picture fits each place it will be shown in.
  assert.match(fs.readFileSync(path.resolve(root, 'src/app/admin/ads/campaigns/[id]/page.tsx'), 'utf8'), /<BannerSizeCheck url=\{form\.imageUrl\} places=\{places\} \/>/)
})

test('a page asks for all its placements in one request: valid keys, each once, at most sixteen', () => {
  assert.deepEqual(a.parsePlacementList('header,sidebar,header, footer-wide'), ['header', 'sidebar', 'footer-wide'])
  assert.equal(a.parsePlacementList(''), null)
  assert.equal(a.parsePlacementList('header,../x'), null, 'one bad key refuses the list')
  assert.equal(a.parsePlacementList(Array.from({ length: 17 }, (_, i) => `slot-${i}`).join(',')), null)
  const client = fs.readFileSync(path.resolve(__dirname, '..', 'src/plugins/ads/PromoSlot.tsx'), 'utf8')
  assert.match(client, /new URLSearchParams\(\{ ps: placements\.join\(','\)/, 'the slots of a page share one request')
  assert.doesNotMatch(client, /new URLSearchParams\(\{ p: placement/, 'no request per slot')
})

test('player breaks: what fits a player slot, video creatives, pacing and mid-roll points', () => {
  // A break shows a video or a picture; over the film a picture or a line; pages never a video, the player never HTML.
  assert.deepEqual(['VIDEO', 'IMAGE', 'TEXT', 'HTML'].map(kind => a.creativeFits('PLAYER', kind)), [true, true, false, false])
  assert.deepEqual(['VIDEO', 'IMAGE', 'TEXT', 'HTML'].map(kind => a.creativeFits('OVERLAY', kind)), [false, true, true, false])
  assert.deepEqual(['VIDEO', 'IMAGE', 'TEXT', 'HTML'].map(kind => a.creativeFits('BANNER', kind)), [false, true, true, true])
  assert.deepEqual(a.BUILTIN_PLACEMENTS.filter(p => p.kind === 'PLAYER' || p.kind === 'OVERLAY').map(p => [p.key, p.kind]), [['player-preroll', 'PLAYER'], ['player-midroll', 'PLAYER'], ['player-overlay', 'OVERLAY']])
  assert.deepEqual(['PLAYER', 'OVERLAY', 'STICKY', 'FLOAT'].map(kind => a.normalizePlacement({ key: 'k-1', name: 'x', kind }).kind), ['PLAYER', 'OVERLAY', 'STICKY', 'BANNER'])

  const video = a.normalizeCreative({ kind: 'VIDEO', videoUrl: 'https://cdn.example.com/ad.mp4?v=2', skipAfter: 99, title: 'Spot' }, { admin: false })
  assert.deepEqual([video.kind, video.videoUrl, video.skipAfter, video.linkUrl], ['VIDEO', 'https://cdn.example.com/ad.mp4?v=2', 60, ''], 'an advertiser may send a video; the link is optional; skip is bounded')
  assert.equal(a.normalizeCreative({ kind: 'VIDEO', videoUrl: '/files/ads/spot.webm', skipAfter: 0 }, { admin: true }).skipAfter, 0, 'a site file; 0 = no skip')
  for (const bad of ['', 'https://x.com/ad.mkv', 'javascript:alert(1)//.mp4', 'https://x.com/ad.mp4"onerror=1', '//evil.com/a.mp4']) assert.throws(() => a.normalizeCreative({ kind: 'VIDEO', videoUrl: bad }, { admin: true }), a.AdsError, bad)
  assert.equal(a.normalizeCreative({ kind: 'IMAGE', imageUrl: '/u.png', linkUrl: 'https://x.com', seconds: 1 }, { admin: false }).seconds, 3, 'a picture in the player stays 3–30 seconds')
  assert.equal(a.normalizeCreative({ kind: 'IMAGE', imageUrl: '/u.png', linkUrl: 'https://x.com' }, { admin: false }).videoUrl, '', 'no video on anything else')
  const plain = a.normalizeCreative({ kind: 'VIDEO', videoUrl: '/files/a.mp4' }, { admin: true })
  assert.deepEqual([plain.skipAfter, plain.seconds, plain.weight], [5, 8, 1], 'what is not given is the default, not 0 (an unskippable ad by accident)')
  assert.equal(a.normalizeCampaign({ name: 'x', placements: ['side-a'] }, ['side-a']).priority, 5, 'a campaign without a priority is in the middle, not last')

  assert.deepEqual(a.normalizePlayerPacing({ gapMinutes: -5, midrollMinutes: 'x', midrollMinLength: 9999, overlayAfter: 30 }), { gapMinutes: 0, midrollMinutes: 20, midrollMinLength: 600, overlayAfter: 30 })
  assert.deepEqual(a.normalizePlayerPacing(null), a.DEFAULT_PLAYER_PACING)
  const pacing = { gapMinutes: 10, midrollMinutes: 20, midrollMinLength: 30, overlayAfter: 15 }
  assert.deepEqual(a.midrollPoints(100 * 60, pacing), [1200, 2400, 3600, 4800], 'every 20 minutes')
  assert.deepEqual(a.midrollPoints(61 * 60, pacing), [1200, 2400], 'never in the last two minutes (3600 > 3540)')
  assert.deepEqual([a.midrollPoints(29 * 60, pacing), a.midrollPoints(NaN, pacing), a.midrollPoints(7200, { ...pacing, midrollMinutes: 0 })], [[], [], []], 'short films, unknown length, switched off')
  assert.ok(a.midrollPoints(100 * 3600, { ...pacing, midrollMinutes: 1, midrollMinLength: 0 }).length <= 12, 'bounded')
  const done = new Set([1200])
  assert.deepEqual([a.crossedPoint([1200, 2400], 2399, 2400.2, new Set()), a.crossedPoint([1200, 2400], 1199, 1201, done), a.crossedPoint([1200, 2400], 100, 2500, new Set()), a.crossedPoint([1200, 2400], 2401, 2399, new Set())], [2400, null, null, null], 'crossed by playing, once; a seek past or back is not a crossing')
  const now = Date.UTC(2026, 10, 11, 12)
  assert.deepEqual([a.breakDue(0, now, pacing), a.breakDue(now - 9 * 60_000, now, pacing), a.breakDue(now - 10 * 60_000, now, pacing), a.breakDue(now + 60_000, now, pacing), a.breakDue(now, now, { ...pacing, gapMinutes: 0 })], [true, false, true, true, true], 'the gap between two breaks for one viewer; a clock moved back does not block forever')
})
