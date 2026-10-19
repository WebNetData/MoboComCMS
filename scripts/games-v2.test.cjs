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

const g = load('src/modules/games/domain/games')

test('jalali conversion round-trips known dates and month lengths', () => {
  assert.deepEqual(g.toJalali(new Date('2025-03-21T00:00:00Z')), { jy: 1404, jm: 1, jd: 1 })
  assert.equal(g.fromJalali(1404, 1, 1).toISOString().slice(0, 10), '2025-03-21')
  assert.equal(g.fromJalali(1403, 12, 30).toISOString().slice(0, 10), '2025-03-20')
  assert.equal(g.fromJalali(1404, 7, 1).toISOString().slice(0, 10), '2025-09-23')
  assert.equal(g.jalaliMonthLength(1403, 12), 30)
  assert.equal(g.jalaliMonthLength(1404, 12), 29)
  assert.equal(g.jalaliMonthLength(1404, 6), 31)
  for (let day = Date.UTC(2024, 0, 1); day < Date.UTC(2027, 0, 1); day += 86_400_000 * 7) {
    const { jy, jm, jd } = g.toJalali(new Date(day))
    assert.equal(g.fromJalali(jy, jm, jd).getTime(), day)
  }
})

test('calendar month parses Persian digits, wraps years and falls back to today', () => {
  const m = g.calendarMonth('۱۴۰۵-۰۱', new Date('2026-01-01T00:00:00Z'))
  assert.equal(m.key, '1405-01')
  assert.equal(m.prev, '1404-12')
  assert.equal(m.next, '1405-02')
  assert.equal(m.days, 31)
  assert.equal(m.end.getTime() - m.start.getTime(), 31 * 86_400_000)
  assert.equal(m.firstWeekday, (m.start.getUTCDay() + 1) % 7)
  assert.equal(g.calendarMonth('1404-12').next, '1405-01')
  assert.equal(g.calendarMonth('nope', new Date('2025-03-25T10:00:00Z')).key, '1404-01')
})

test('releases, store links and codes are cleaned', () => {
  assert.deepEqual(g.cleanReleases([{ platform: 'PS5', date: '2026-05-02' }, { platform: 'PC', date: '۲۰۲۶-۰۱-۰۱' }, { platform: 'pc', date: '2026-09-01' }, { platform: '', date: '2026-01-01' }]), [{ platform: 'PC', date: '2026-01-01' }, { platform: 'PS5', date: '2026-05-02' }])
  assert.throws(() => g.cleanReleases([{ platform: 'PC', date: '2026-02-30' }]), /نامعتبر/)
  assert.deepEqual(g.cleanStoreLinks([{ store: 'Steam', url: 'https://store.steampowered.com/app/1' }, { store: 'Steam', url: 'https://x.y' }]), [{ store: 'Steam', url: 'https://store.steampowered.com/app/1' }])
  assert.throws(() => g.cleanStoreLinks([{ store: 'Evil', url: 'javascript:alert(1)' }]), /http/)
  assert.equal(g.normalizeCodes('coop, single ,x', g.GAME_MODES), 'SINGLE, COOP')
  assert.equal(g.normalizeCodes(['fa_dub'], g.LOCALIZATIONS), 'FA_DUB')
  assert.deepEqual(g.codesOf('SINGLE, COOP'), ['SINGLE', 'COOP'])
  assert.equal(g.normalizeUpdateKind('dlc'), 'DLC')
  assert.equal(g.normalizeUpdateKind('hack'), 'UPDATE')
})

test('library status, hours and member score', () => {
  assert.equal(g.normalizeLibraryStatus('played'), 'PLAYED')
  assert.equal(g.normalizeLibraryStatus('owned'), null)
  assert.equal(g.cleanHours('۱۲'), 12)
  assert.equal(g.cleanHours(-4), 0)
  assert.deepEqual(g.memberScore({ average: 4.26, count: 3 }, 7.5), { value: 8.5, count: 3 })
  assert.deepEqual(g.memberScore({ average: 0, count: 0 }, 7.5), { value: 7.5, count: 0 })
})

test('release state counts Tehran days', () => {
  const now = new Date('2026-03-01T21:30:00Z') // 2 Mar 01:00 in Tehran
  assert.deepEqual(g.releaseState('2026-03-05T00:00:00Z', now), { state: 'upcoming', days: 3 })
  assert.equal(g.releaseState('2026-02-01T00:00:00Z', now).state, 'released')
  assert.deepEqual(g.releaseState(null, now), { state: 'tba', days: null })
})

test('content health skips review/score/links for upcoming games and requirements for consoles', () => {
  const base = { cover: '', backdrop: '', summary: '', content: '', score: null, requirements: '{}', screenshots: '[]', trailerUrl: '', platforms: 'PS5', releaseDate: new Date('2099-01-01'), links: 0 }
  assert.deepEqual(g.healthIssues(base), ['cover', 'backdrop', 'summary', 'screenshots', 'trailer'])
  const pc = { ...base, platforms: 'PC, PS5', releaseDate: new Date('2020-01-01') }
  assert.ok(g.healthIssues(pc).includes('requirements'))
  assert.ok(g.healthIssues(pc).includes('links'))
  assert.ok(!g.healthIssues({ ...pc, requirements: JSON.stringify({ min: { cpu: 'i5' } }) }).includes('requirements'))
})

test('portal settings keep known rails in order and fill the rest', () => {
  const s = g.normalizeGamesSettings({ heroIds: [3, '3', 'x', 5], rails: [{ key: 'news', enabled: false }, { key: 'bogus' }, { key: 'latest' }], newsKeywords: 'بازی، game\n' })
  assert.deepEqual(s.heroIds, [3, 5])
  assert.deepEqual(s.rails.slice(0, 2), [{ key: 'news', enabled: false }, { key: 'latest', enabled: true }])
  assert.equal(s.rails.length, Object.keys(g.HOME_RAILS).length)
  assert.deepEqual(s.newsKeywords, ['بازی', 'game'])
  assert.equal(g.normalizeGamesSettings(null).libraryEnabled, true)
})
