const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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
