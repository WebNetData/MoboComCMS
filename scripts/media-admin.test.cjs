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
