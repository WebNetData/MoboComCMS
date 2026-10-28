const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

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

const layout = load('src/shared/section-layout')
const cinema = load('src/modules/cinema/domain/cinema')
const music = load('src/modules/music/domain/music')

test('rails keep admin order, drop unknown/duplicate keys and append new blocks enabled', () => {
  const rails = layout.normalizeRails([{ key: 'movies', enabled: false }, { key: 'hero' }, { key: 'bogus' }, { key: 'movies' }], cinema.CINEMA_RAILS)
  assert.deepEqual(rails.slice(0, 2), [{ key: 'movies', enabled: false }, { key: 'hero', enabled: true }])
  assert.equal(rails.length, Object.keys(cinema.CINEMA_RAILS).length)
  assert.ok(rails.slice(2).every((rail) => rail.enabled))
  assert.deepEqual(layout.railOrder([{ key: 'a', enabled: true }, { key: 'b', enabled: false }, { key: 'c', enabled: true }]), ['a', 'c'])
})

test('cinema settings are bounded and tolerate junk', () => {
  assert.deepEqual(cinema.normalizeCinemaSettings(null), cinema.DEFAULT_CINEMA_SETTINGS)
  const s = cinema.normalizeCinemaSettings({ heroIds: [3, '3', -1, 'x', 9, 1, 2, 4, 5, 6, 7, 8], shelfSize: 999, genreShelfCount: -4, topRatedMin: 7.26, showImdb: false })
  assert.deepEqual(s.heroIds, [3, 9, 1, 2, 4, 5, 6, 7])
  assert.equal(s.shelfSize, 24)
  assert.equal(s.genreShelfCount, 0)
  assert.equal(s.topRatedMin, 7.3)
  assert.equal(s.showImdb, false)
  assert.equal(cinema.normalizeCinemaSettings('{"shelfSize":8}').shelfSize, 8)
  assert.equal(cinema.normalizeCinemaSettings({ topRatedMin: 'abc' }).topRatedMin, 0)
})

test('cinema health: movies need links, series need episodes with links', () => {
  const base = { kind: 'MOVIE', poster: 'p.jpg', backdrop: 'b.jpg', summary: 'x'.repeat(50), imdbRating: 8, trailerUrl: 't', genres: 'درام', links: 1, seasons: 0, episodes: 0, episodesWithoutLinks: 0 }
  assert.deepEqual(cinema.cinemaIssues(base), [])
  assert.deepEqual(cinema.cinemaIssues({ ...base, links: 0, poster: ' ', imdbRating: null }), ['poster', 'links', 'imdb'])
  assert.deepEqual(cinema.cinemaIssues({ ...base, kind: 'SERIES', links: 0 }), ['seasons'])
  assert.deepEqual(cinema.cinemaIssues({ ...base, kind: 'SERIES', links: 0, seasons: 1, episodes: 8, episodesWithoutLinks: 2 }), ['episodeLinks'])
  assert.deepEqual(cinema.cinemaIssues({ ...base, summary: 'کوتاه' }), ['summary'])
})

test('music settings bound sizes and only accept known chart sources', () => {
  assert.deepEqual(music.normalizeMusicSettings(undefined), music.DEFAULT_MUSIC_SETTINGS)
  const s = music.normalizeMusicSettings({ chartSource: 'downloads', chartSize: 2, latestSize: 100, heroTrackIds: [1, 2, 3, 4, 5, 6], showLyrics: false })
  assert.equal(s.chartSource, 'downloads')
  assert.equal(s.chartSize, 5)
  assert.equal(s.latestSize, 30)
  assert.deepEqual(s.heroTrackIds, [1, 2, 3, 4, 5])
  assert.equal(s.showLyrics, false)
  assert.equal(music.normalizeMusicSettings({ chartSource: 'hacker' }).chartSource, 'plays')
  assert.equal(music.normalizeMusicSettings({ chartSource: 'constructor' }).chartSource, 'plays')
})

test('track health uses the album cover as a fallback', () => {
  const t = { audioUrl: 'a.mp3', audioHqUrl: '', cover: '', albumCover: 'c.jpg', duration: 200, lyrics: '', genre: 'پاپ' }
  assert.deepEqual(music.trackIssues(t), ['hq', 'lyrics'])
  assert.deepEqual(music.trackIssues({ ...t, albumCover: '', audioUrl: '', duration: 0 }), ['audio', 'hq', 'cover', 'duration', 'lyrics'])
})

test('picked items keep the admin order and fall back when none survive', () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(music.pickInOrder([3, 9, 1], rows, [{ id: 7 }], 5).map((r) => r.id), [3, 1])
  assert.deepEqual(music.pickInOrder([9], rows, [{ id: 7 }, { id: 8 }], 1).map((r) => r.id), [7])
})

const software = load('src/modules/software/domain/software')
const journal = load('src/modules/journal/domain/journal')

test('software settings clamp sizes and keep editor picks unique', () => {
  assert.deepEqual(software.normalizeSoftwareSettings({}), software.DEFAULT_SOFTWARE_SETTINGS)
  const s = software.normalizeSoftwareSettings({ shelfSize: 1, categoryShelfCount: 99, newsCount: 7, suggestionIds: [5, 5, 2, 'x'], staleDays: 5 })
  assert.equal(s.shelfSize, 4)
  assert.equal(s.categoryShelfCount, 8)
  assert.equal(s.newsCount, 7)
  assert.deepEqual(s.suggestionIds, [5, 2])
  assert.equal(s.staleDays, 30)
})

test('software health flags gaps and stale versions', () => {
  const now = new Date('2026-09-28T00:00:00Z')
  const full = { icon: 'i.png', version: '1.0', summary: 'x'.repeat(40), content: '<p>' + 'y'.repeat(200) + '</p>', screenshots: '[{"src":"a.png"}]', platforms: 'Windows', size: '10 MB', links: 1, releasedAt: new Date('2026-08-01T00:00:00Z'), updatedAt: now }
  assert.deepEqual(software.softwareIssues(full, now, 180), [])
  assert.deepEqual(software.softwareIssues({ ...full, screenshots: '[{"src":" "}]', links: 0, releasedAt: new Date('2025-01-01T00:00:00Z') }, now, 180), ['screenshots', 'links', 'stale'])
  assert.deepEqual(software.softwareIssues({ ...full, screenshots: 'not json', content: '<b></b>' }, now, 180), ['content', 'screenshots'])
  assert.equal(software.isStale({ releasedAt: null, updatedAt: new Date('2026-09-01T00:00:00Z') }, now, 180), false)
})

test('journal settings and article health', () => {
  const s = journal.normalizeJournalSettings({ heroIds: [1, 2, 3, 4, 5, 6], editorIds: [9, 9, 8], blockCategoryIds: [3, 1, 2, 7], pageSize: 100, autoApproveComments: 'yes' })
  assert.deepEqual(s.heroIds, [1, 2, 3, 4, 5])
  assert.deepEqual(s.editorIds, [9, 8])
  assert.deepEqual(s.blockCategoryIds, [3, 1, 2])
  assert.equal(s.pageSize, 48)
  assert.equal(s.autoApproveComments, false, 'only a real boolean turns auto-approve on')
  assert.equal(journal.normalizeJournalSettings({ autoApproveComments: true }).autoApproveComments, true)
  assert.equal(journal.wordCount('<p>سلام <b>دنیا</b></p>'), 2)
  assert.deepEqual(journal.postIssues({ cover: '', excerpt: 'کوتاه', content: 'چند واژه', categories: 0 }), ['cover', 'excerpt', 'category', 'short'])
  assert.deepEqual(journal.postIssues({ cover: 'c.jpg', excerpt: 'x'.repeat(40), content: 'واژه '.repeat(200), categories: 1 }), [])
})

test('journal rails match the Liona home sections', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../src/components/journal/LionaHome.tsx'), 'utf8')
  const keys = src.match(/LIONA_SECTIONS = \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g).map((k) => k.slice(1, -1))
  assert.deepEqual(keys, Object.keys(journal.JOURNAL_RAILS))
})

const membership = load('src/modules/membership/domain/membership')

test('VIP summary: active, joined, renewed, expiring and lapsed members', () => {
  const now = new Date('2026-09-28T12:00:00Z')
  const d = (days) => new Date(now.getTime() + days * 86_400_000)
  const row = (userId, source, from, to, extra = {}) => ({ userId, source, startsAt: d(from), endsAt: d(to), revokedAt: null, planId: 1, orderId: null, createdAt: d(from), ...extra })
  const s = membership.summarizeMemberships([
    row(1, 'PURCHASE', -10, 20),                          // joined recently, active
    row(2, 'PURCHASE', -100, -40), row(2, 'PURCHASE', -40, 3, { planId: 2 }), // renewed 40 days ago → not in window; expiring in 3 days
    row(3, 'PURCHASE', -60, -30), row(3, 'PURCHASE', -5, 25),               // renewed inside the window
    row(4, 'GIFT', -50, -10),                              // lapsed 10 days ago
    row(5, 'ADMIN', -5, 10, { revokedAt: d(-1) }),         // revoked → ignored
    row(6, 'PURCHASE', -200, -100),                        // lapsed long ago → not counted
  ], now)
  assert.equal(s.active, 3)
  assert.equal(s.joined, 1)
  assert.equal(s.renewed, 1)
  assert.equal(s.expiring, 1)
  assert.deepEqual(s.expiringUsers.map((u) => u.userId), [2])
  assert.equal(s.lapsed, 1)
  assert.deepEqual(s.bySource, { PURCHASE: 2 })
  assert.deepEqual(s.byPlan, [{ planId: 1, count: 2 }, { planId: 2, count: 1 }])
})

const plain = load('src/shared/text/plain')

test('plain text drops tags, separates blocks and decodes entities', () => {
  assert.equal(plain.plainText('<p><b>دارک</b> (Dark) با امتیاز 8.7&nbsp;&amp; 4K.</p><p>کیفیت 1080p</p>'), 'دارک (Dark) با امتیاز 8.7 & 4K. کیفیت 1080p')
  assert.equal(plain.plainText('خط اول<br/>خط دوم<script>alert(1)</script>'), 'خط اول خط دوم')
  assert.equal(plain.plainText('&laquo;تلقین&raquo; &#1601;&#x06CC;'), '«تلقین» فی')
  assert.equal(plain.plainText('متن ساده بدون تگ'), 'متن ساده بدون تگ')
  assert.equal(plain.plainText('<p>یک دو سه چهار</p>', 8), 'یک دو س…')
  assert.equal(plain.plainText(null), '')
})

// ---- episode calendar (cinema)
const calendarRoot = path.resolve(__dirname, '..')
const calendarSource = ts.transpileModule(fs.readFileSync(path.join(calendarRoot, 'src/modules/cinema/domain/calendar.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const calendar = { exports: {} }
new Function('require', 'module', 'exports', calendarSource)(require, calendar, calendar.exports)
const c = calendar.exports
const episode = (id, at) => ({ id, at, season: 1, number: id, title: '', titleEn: '', members: false, series: { slug: 's', title: 's', titleEn: '', poster: '' } })

test('range and page come from the address and fall back safely', () => {
  assert.deepEqual(['recent', 'upcoming', undefined, 'x', ['recent']].map(c.normalizeWhen), ['recent', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
  assert.deepEqual(['3', 0, -2, 'abc', 501, 2.9, undefined].map(c.calendarPage), [3, 1, 1, 1, 1, 2, 1])
})

test('an episode belongs to the calendar day of its air time in Tehran', () => {
  // 21:00 UTC is already the next day in Tehran (+03:30).
  assert.equal(c.tehranDay('2026-10-06T21:00:00.000Z'), '2026-10-07')
  assert.equal(c.tehranDay('2026-10-06T20:29:00.000Z'), '2026-10-06')
  assert.equal(c.tehranDay('2026-10-06T00:00:00.000Z'), '2026-10-06', 'a date entered without a time stays on its day')
})

test('episodes are grouped by day in the order they arrive', () => {
  const groups = c.groupByDay([episode(1, '2026-10-06T08:00:00.000Z'), episode(2, '2026-10-06T19:00:00.000Z'), episode(3, '2026-10-06T21:30:00.000Z'), episode(4, '2026-10-09T08:00:00.000Z')])
  assert.deepEqual(groups.map((group) => [group.day, group.episodes.map((item) => item.id)]), [['2026-10-06', [1, 2]], ['2026-10-07', [3]], ['2026-10-09', [4]]])
  assert.deepEqual(c.groupByDay([]), [])
})

test('distance is counted in calendar days, not in 24-hour spans', () => {
  const now = new Date('2026-10-06T19:00:00.000Z') // 22:30 in Tehran
  assert.equal(c.daysAway('2026-10-06T05:00:00.000Z', now), 0)
  assert.equal(c.daysAway('2026-10-06T21:00:00.000Z', now), 1, 'two hours later, but tomorrow')
  assert.equal(c.daysAway('2026-10-05T19:30:00.000Z', now), -1)
  assert.equal(c.daysAway('2026-10-16T08:00:00.000Z', now), 10)
})

test('episode code and wiring', () => {
  assert.deepEqual([c.episodeCode(1, 2), c.episodeCode(12, 104)], ['S01E02', 'S12E104'])
  assert.match(fs.readFileSync(path.join(calendarRoot, 'src/components/media/nav.ts'), 'utf8'), /key: 'calendar', href: '\/cinema\/calendar'/)
  const page = fs.readFileSync(path.join(calendarRoot, 'src/app/cinema/calendar/page.tsx'), 'utf8')
  assert.match(page, /await requireModule\('cinema'\)/)
  for (const schema of ['prisma/schema.postgresql.prisma', 'prisma/schema.prisma']) assert.match(fs.readFileSync(path.join(calendarRoot, schema), 'utf8'), /model CinemaEpisode \{[\s\S]*?@@index\(\[airDate\]\)[\s\S]*?\n\}/)
})

test('library metadata keeps folder identities unambiguous and bounds reusable labels', () => {
 const lib=load('src/modules/media/domain/library')
 assert.equal(lib.folderId(''),null);assert.equal(lib.folderId('12'),12)
 for(const value of [-1,1.2,Infinity,'../private'])assert.throws(()=>lib.folderId(value))
 assert.equal(lib.folderKey(null,' Example '), '0: example ')
 assert.notEqual(lib.folderKey(1,'same'),lib.folderKey(2,'same'))
 assert.deepEqual(lib.libraryTags('آموزش، آموزش, محصول'),['آموزش','محصول'])
 assert.throws(()=>lib.libraryName(' '));assert.throws(()=>lib.libraryName('x'.repeat(121)))
 assert.equal(lib.libraryKind('video/mp4','a.mp4'),'video')
 assert.equal(lib.libraryKind('application/zip','a.zip'),'archive')
})
test('new import media decisions preserve explicit opt-out and legacy image behavior', () => {
 const opts=load('src/modules/imports/domain/media-options')
 assert.equal(opts.copiesImages(opts.importMediaOptions({})),true)
 assert.equal(opts.copiesFiles(opts.importMediaOptions({})),false)
 const off=opts.importMediaOptions({copyAssets:false,mediaTransferMode:'evil'})
 assert.equal(opts.copiesImages(off),false);assert.equal(opts.copiesFiles(off),false)
 assert.equal(off.mediaTransferMode,'immediate')
 assert.equal(opts.copiesFiles(opts.importMediaOptions({copyAssets:true})),true)
})

test('media JSON bodies enforce streamed size and object shape, without trusting Content-Length', async () => {
 const {readJsonObject,JsonBodyError}=load('src/platform/http/read-json')
 assert.deepEqual(await readJsonObject(new Request('https://example.invalid',{method:'POST',body:'{"name":"عکس"}'})),{name:'عکس'})
 for(const body of ['null','[]','1','{broken'])await assert.rejects(readJsonObject(new Request('https://example.invalid',{method:'POST',body})),JsonBodyError)
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"name":"'));controller.enqueue(new TextEncoder().encode('x'.repeat(100)));controller.close()}})
 await assert.rejects(readJsonObject(new Request('https://example.invalid',{method:'POST',body:stream,duplex:'half'}),32),e=>e.status===413)
 await assert.rejects(readJsonObject(new Request('https://example.invalid',{method:'POST',headers:{'content-length':'1000'},body:'{}'}),32),e=>e.status===413)
})

test('HTML media discovery includes playable files and posters, deduplicates and preserves unrelated links', () => {
 const {findAssets,rewriteAssets}=load('src/modules/downloads/domain/localize')
 const html='<video src="https://cdn.example/v.mp4" poster="https://cdn.example/p.jpg"><source src="https://cdn.example/v.mp4"></video><audio src="https://cdn.example/a.mp3"></audio><img src="/local.jpg"><a href="https://cdn.example/page">page</a>'
 const assets=findAssets(html,'mobocom.example')
 assert.deepEqual(assets,[{url:'https://cdn.example/v.mp4',kind:'file'},{url:'https://cdn.example/a.mp3',kind:'file'},{url:'https://cdn.example/p.jpg',kind:'image'}])
 const replaced=rewriteAssets(html,new Map([['https://cdn.example/v.mp4','/api/media/transfers/fixture']]))
 assert.equal((replaced.match(/\/api\/media\/transfers\/fixture/g)||[]).length,2)
 assert.ok(replaced.includes('https://cdn.example/page'));assert.ok(replaced.includes('https://cdn.example/p.jpg'))
 assert.equal(findAssets('<img src="https://mobocom.example/p.jpg"><img src="https://cdn.mobocom.example/p.jpg">','mobocom.example').length,0)
})

test('a mobile app keeps a dotted package id, its oldest system and one http(s) page per app store', () => {
  const app = load('src/modules/software/domain/app')
  assert.equal(app.cleanPackageId(' com.example.app '), 'com.example.app')
  assert.equal(app.cleanPackageId(''), '')
  for (const bad of ['example', 'com..x', '1com.x', 'com.example app', 'com.x<script>']) assert.throws(() => app.cleanPackageId(bad), app.AppFieldError, bad)
  assert.equal(app.cleanMinOs('  Android\n 8.0  '), 'Android 8.0')
  assert.deepEqual(app.cleanAppStores([{ store: 'Myket', url: 'https://myket.ir/app/x' }, { store: 'Myket', url: 'https://myket.ir/other' }, { store: '', url: 'https://x.invalid' }, { store: 'Cafe Bazaar', url: '' }]), [{ store: 'Myket', url: 'https://myket.ir/app/x' }], 'one page per store; rows without both are dropped')
  assert.deepEqual(app.cleanAppStores('[{"store":"App Store","url":"https://apps.apple.com/app/id1"}]'), [{ store: 'App Store', url: 'https://apps.apple.com/app/id1' }], 'the stored JSON reads back')
  assert.deepEqual(app.cleanAppStores('not json'), [])
  for (const url of ['javascript:alert(1)', '/relative/page', 'https://x.invalid/a b']) assert.throws(() => app.cleanAppStores([{ store: 'Myket', url }]), app.AppFieldError, url)
  assert.equal(app.cleanAppStores(Array.from({ length: 12 }, (_, index) => ({ store: `S${index}`, url: `https://x.invalid/${index}` }))).length, 8, 'at most eight stores')
  const lists = load('src/modules/software/domain/vocabulary')
  const entries = [{ code: 'Windows', family: 'DESKTOP' }, { code: 'Android', family: 'MOBILE' }, { code: 'Other', family: '' }]
  assert.deepEqual([...lists.platformFamilies('windows، Android | Other, Nope', entries)].sort(), ['DESKTOP', 'MOBILE'])
  assert.deepEqual([...lists.platformFamilies(['Other'], entries)], [], 'a platform without a family decides nothing')
  assert.ok(lists.SOFTWARE_LISTS.find((list) => list.list === 'PLATFORM').seeds.every(([, , , family]) => ['DESKTOP', 'MOBILE'].includes(family)), 'every seeded platform has a family')
})

test('a song credit is a role code and an artist id, without repeats, at most thirty', () => {
  const music = load('src/modules/music/domain/vocabulary')
  assert.deepEqual(music.cleanCredits([{ role: 'composer', artistId: '3' }, { role: 'COMPOSER', artistId: 3 }, { role: 'LYRICIST', artistId: 3 }, { role: 'bad role!', artistId: 4 }, { role: 'ARRANGER', artistId: 0 }, { role: 'ARRANGER', artistId: 'x' }, null]),
    [{ role: 'COMPOSER', artistId: 3 }, { role: 'LYRICIST', artistId: 3 }], 'one artist may hold several roles; bad rows are dropped')
  assert.deepEqual(music.cleanCredits('nope'), [])
  assert.equal(music.cleanCredits(Array.from({ length: 40 }, (_, index) => ({ role: 'FEATURED', artistId: index + 1 }))).length, 30)
  const lists = music.MUSIC_LISTS.map((list) => list.list)
  assert.deepEqual(lists, ['GENRE', 'ALBUM_TYPE', 'CREDIT_ROLE'])
  assert.equal(music.MUSIC_LISTS.find((list) => list.list === 'GENRE').codeRule, 'name', 'genres are stored by name, as songs already have them')
})

test('a magazine post format keeps its family\'s facts, validated, and the form edits them as flat fields', () => {
  const formats = load('src/modules/journal/domain/formats')
  const merged = formats.mergeFormatData('{}', { fmtScore: '۸٫۵', fmtPros: 'باتری قوی\n\n  صفحهٔ روشن  ', fmtCons: '', fmtVerdict: 'خرید <b>خوب</b>', fmtVideoUrl: 'https://www.aparat.com/v/abc' })
  assert.deepEqual(JSON.parse(merged), { score: 8.5, pros: ['باتری قوی', 'صفحهٔ روشن'], verdict: 'خرید b خوب /b', videoUrl: 'https://www.aparat.com/v/abc' }, 'Persian digits, one item per line, markup stripped, empty lists left out')
  assert.deepEqual(JSON.parse(formats.mergeFormatData(merged, { fmtScore: '' })), { pros: ['باتری قوی', 'صفحهٔ روشن'], verdict: 'خرید b خوب /b', videoUrl: 'https://www.aparat.com/v/abc' }, 'an emptied fact is removed; the rest are kept')
  for (const [key, value] of [['fmtScore', '11'], ['fmtScore', 'ten'], ['fmtVideoUrl', 'javascript:alert(1)'], ['fmtSourceUrl', 'https://x.invalid/a b']]) assert.throws(() => formats.mergeFormatData('{}', { [key]: value }), formats.PostFormatError, `${key}=${value}`)
  assert.equal(formats.hasFormatFields({ title: 'x' }), false)
  assert.equal(formats.hasFormatFields({ fmtGuestName: '' }), true)
  assert.deepEqual(formats.formatFormValues(merged).fmtPros, 'باتری قوی\nصفحهٔ روشن')
  assert.deepEqual(formats.readFormatData('{"score":99,"guestName":"x","junk":1}'), { guestName: 'x' }, 'stored facts are read leniently: a bad one is left out')
  assert.deepEqual(formats.factsFor('VIDEO', merged), { videoUrl: 'https://www.aparat.com/v/abc' }, 'a page shows only its own family\'s facts')
  assert.deepEqual(formats.factsFor('UNKNOWN', merged), {})
  assert.match(formats.describeFormatData(merged), /امتیاز: |نقاط قوت: باتری قوی، صفحهٔ روشن/)
  const lists = load('src/modules/journal/domain/vocabulary')
  assert.ok(lists.JOURNAL_LISTS[0].seeds.every(([, , , family]) => formats.FORMAT_FAMILIES.some(([code]) => code === family)), 'every seeded format has a known family')
  const journal = load('src/modules/journal/domain/journal')
  assert.ok(journal.PROPOSAL_TEXT_FIELDS.includes('format') && journal.PROPOSAL_TEXT_FIELDS.includes('formatData'), 'an author proposes a format change like the text')
})

test('games pick genres and engines from name lists; usage reads both', () => {
  const lists = load('src/modules/games/domain/vocabulary').GAME_LISTS
  assert.deepEqual(lists.filter((list) => ['GENRE', 'ENGINE'].includes(list.list)).map((list) => list.codeRule), ['name', 'name'])
  const usage = load('src/modules/games/server/vocabulary')
  const game = { platforms: '', modes: '', localization: '', storeLinks: '[]', releases: '[]', genres: 'اکشن، نقش‌آفرینی', engine: 'Unity' }
  assert.deepEqual([usage.gameUses(game, 'GENRE', 'نقش‌آفرینی'), usage.gameUses(game, 'GENRE', 'ورزشی'), usage.gameUses(game, 'ENGINE', 'Unity'), usage.gameUses(game, 'ENGINE', 'Unit')], [true, false, true, false], 'either comma; whole names only')
})

test('film genres, countries and languages are name lists whose English names map imports', () => {
  const lists = load('src/modules/cinema/domain/vocabulary').CINEMA_LISTS
  assert.deepEqual(lists.map((list) => [list.list, list.codeRule]), [['GENRE', 'name'], ['COUNTRY', 'name'], ['LANGUAGE', 'name']])
  for (const list of lists) {
    assert.ok(list.seeds.every(([code, , english]) => code && english && !code.includes(',')), `${list.list}: every seed has an English name for imports`)
    const english = list.seeds.map(([, , name]) => name.toLowerCase())
    assert.equal(new Set(english).size, english.length, `${list.list}: English names are unique`)
  }
})

test('a scored review linked to a reviewable item gets review structured data; otherwise none', () => {
  const formats = load('src/modules/journal/domain/formats')
  const items = [{ type: 'person', title: 'X', url: '/cinema/person/1', image: '' }, { type: 'game', title: 'Elden Ring', url: '/games/elden-ring', image: '/uploads/er.jpg' }]
  const ld = formats.reviewJsonLd({ facts: { score: 9, verdict: 'شاهکار' }, items, url: 'https://s.test/blog/r', author: 'سارا', published: '2026-10-27T00:00:00.000Z', base: 'https://s.test' })
  assert.deepEqual(ld.itemReviewed, { '@type': 'VideoGame', name: 'Elden Ring', url: 'https://s.test/games/elden-ring', image: 'https://s.test/uploads/er.jpg' }, 'the first reviewable item, with absolute addresses')
  assert.deepEqual(ld.reviewRating, { '@type': 'Rating', ratingValue: 9, bestRating: 10, worstRating: 0 })
  assert.equal(ld.reviewBody, 'شاهکار')
  assert.equal(formats.reviewJsonLd({ facts: { verdict: 'x' }, items, url: '', base: 'https://s.test' }), null, 'no score, no stars')
  assert.equal(formats.reviewJsonLd({ facts: { score: 7 }, items: [items[0]], url: '', base: 'https://s.test' }), null, 'a review must name a reviewable item')
})

test('a VIP plan perk line names a listed perk by code (its text comes from the list) or is free text', () => {
  const membership = load('src/modules/membership/domain/membership')
  assert.deepEqual(membership.parsePerks(JSON.stringify([{ code: 'hq_music' }, { icon: '⭐', fa: 'خط ویژه', en: 'Own line' }, { code: 'bad code!' }, {}])), [{ icon: '★', fa: '', en: '', code: 'HQ_MUSIC' }, { icon: '⭐', fa: 'خط ویژه', en: 'Own line' }], 'a listed perk may come without text; a bad code without text is dropped')
  const perks = load('src/modules/membership/server/perks')
  const entries = [{ code: 'HQ_MUSIC', name: 'موسیقی ۳۲۰', nameEn: '320 kbps', icon: '🎧' }]
  assert.deepEqual(perks.resolvePerks([{ icon: '★', fa: 'متن قدیمی', en: '', code: 'HQ_MUSIC' }, { icon: '⭐', fa: 'خط ویژه', en: '' }], []), [{ icon: '★', fa: 'متن قدیمی', en: '' }, { icon: '⭐', fa: 'خط ویژه', en: '' }], 'without its entry a listed line falls back to its snapshot')
  assert.deepEqual(perks.resolvePerks([{ icon: '★', fa: 'متن قدیمی', en: '', code: 'HQ_MUSIC' }, { icon: '★', fa: '', en: '', code: 'GONE' }], entries), [{ icon: '🎧', fa: 'موسیقی ۳۲۰', en: '320 kbps' }], 'a listed line shows the entry\'s current text; one with nothing to show is left out')
})

// ---- article page styles (owner, 2026-10-28): designed styles, the owner's own, per format and per article
const postStyles = load('src/modules/journal/domain/post-styles')

test('article style settings keep only real styles and well-formed choices', () => {
  const own = { id: 'psc-abcd1234', name: '  نقد ویژه  ', base: 'cinematic', accent: '#FACC15', align: 'center', width: 'narrow', leadIn: true, corners: 'sharp' }
  const s = postStyles.normalizePostStyleSettings({
    defaultId: 'psc-abcd1234',
    byFormat: { REVIEW: 'ps-cinematic', NEWS: 'tpl-single-1', VIDEO: 'ps-nope', 'bad code!': 'ps-split', INTERVIEW: 'psc-missing1' },
    custom: [own, { ...own, name: 'copy' }, { id: 'nope', base: 'split' }, { id: 'psc-ffff9999', base: 'weird', accent: 'red', width: 'huge' }],
  })
  assert.equal(s.defaultId, 'psc-abcd1234')
  assert.deepEqual(s.byFormat, { REVIEW: 'ps-cinematic', NEWS: 'tpl-single-1' })
  assert.deepEqual(s.custom.map((style) => style.id), ['psc-abcd1234', 'psc-ffff9999'])
  assert.equal(s.custom[0].name, 'نقد ویژه')
  assert.equal(s.custom[0].accent, '#facc15')
  assert.deepEqual([s.custom[1].base, s.custom[1].accent, s.custom[1].width, s.custom[1].corners], ['classic', '', 'wide', 'round'])
  assert.equal(postStyles.normalizePostStyleSettings({ defaultId: 'psc-gone1234' }).defaultId, '')
  assert.equal(postStyles.normalizePostStyleSettings({ custom: Array.from({ length: 40 }, (_, i) => ({ id: `psc-x${String(i).padStart(4, '0')}` })) }).custom.length, postStyles.MAX_CUSTOM_POST_STYLES)
  assert.deepEqual(journal.normalizeJournalSettings({}).postStyle, postStyles.DEFAULT_POST_STYLE_SETTINGS)
  assert.equal(journal.normalizeJournalSettings({ postStyle: { defaultId: 'ps-split' } }).postStyle.defaultId, 'ps-split')
})

test('any accent the owner picks stays readable in both themes', () => {
  for (const hex of ['#facc15', '#22d3ee', '#ffffff', '#000000', '#2563eb', '#16a34a', '#f472b6']) {
    const accent = postStyles.readableAccent(hex)
    assert.ok(postStyles.contrast(accent.light, postStyles.LIGHT_SURFACE) >= 4.5, `${hex} light ${accent.light}`)
    assert.ok(postStyles.contrast(accent.dark, postStyles.DARK_SURFACE) >= 4.5, `${hex} dark ${accent.dark}`)
    assert.ok(postStyles.contrast(accent.light, accent.on) >= 4.5, `${hex} on ${accent.on}`)
  }
  assert.equal(postStyles.readableAccent('#2563eb').light, '#2563eb')
  assert.equal(postStyles.readableAccent('red'), null)
})

test('a style becomes attributes on the article page; classic leaves the page as it was', () => {
  const settings = postStyles.normalizePostStyleSettings({ custom: [{ id: 'psc-abcd1234', name: 'x', base: 'split', accent: '#facc15', align: 'center', width: 'standard', leadIn: true, corners: 'soft' }] })
  assert.deepEqual(postStyles.postStyleAttributes(postStyles.resolvePostStyle('ps-classic', settings)), { attrs: {}, vars: {} })
  assert.equal(postStyles.resolvePostStyle('tpl-single-1', settings), null)
  assert.equal(postStyles.resolvePostStyle('ps-nope', settings), null)
  const editorial = postStyles.postStyleAttributes(postStyles.resolvePostStyle('ps-editorial', settings))
  assert.deepEqual(editorial.attrs, { 'data-post-style': 'editorial', 'data-ps-align': 'center', 'data-ps-width': 'narrow', 'data-ps-corners': 'soft', 'data-ps-lead': '' })
  const own = postStyles.postStyleAttributes(postStyles.resolvePostStyle('psc-abcd1234', settings))
  assert.equal(own.attrs['data-post-style'], 'split')
  assert.equal(own.attrs['data-ps-accent'], '')
  assert.deepEqual(Object.keys(own.vars).sort(), ['--ps-accent-dark', '--ps-accent-light', '--ps-on-accent'])
})

test('the article page, its editor and the builder share one style choice', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  const page = read('src/modules/site/server/pages/blog/[slug]/page.tsx')
  assert.match(page, /resolvePostPresentation\(\{ postId: post\.id, format: post\.format/)
  assert.match(page, /journal-post-solo" \{\.\.\.dress\.attrs\}/)
  // order: asked in the address, the article's own, its format's, theme rules, the magazine's default
  const presentation = read('src/modules/site/server/post-presentation.ts')
  const order = ['askedStyle', "getEntityTemplateId('post'", 'settings.byFormat', "resolveThemeTemplate('single-post'", 'settings.defaultId'].map((needle) => presentation.indexOf(needle))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.ok(order.every((at) => at > 0))
  assert.match(read('src/modules/site/server/http/builder/post-template.ts'), /isStyleId\(templateId\)\s*\n?\s*\? !!resolvePostStyle/)
  assert.match(read('src/app/layout.tsx'), /import '\.\/journal-post-styles\.css'/)
  assert.match(read('src/app/admin/posts/page.tsx'), /<PostStylePanel /)
  assert.match(read('src/app/admin/journal/shared.tsx'), /\/admin\/journal\/styles/)
})
