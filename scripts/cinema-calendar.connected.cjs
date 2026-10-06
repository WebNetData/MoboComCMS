// Real PostgreSQL series, seasons and episodes. The calendar query only sees this script's series.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `cal-${Date.now()}`
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mine = where => ({ AND: [where || {}, { season: { title: { slug: { startsWith: seed } } } }] })
const episodes = new Proxy(prisma.cinemaEpisode, { get: (target, key) => key === 'findMany' || key === 'count' ? args => target[key]({ ...args, where: mine(args.where) }) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const db = new Proxy(prisma, { get: (target, key) => key === 'cinemaEpisode' ? episodes : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
function load(file, real = {}) {
  const stub = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : () => { throw new Error(`test double called: ${String(key)}`) } })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compile(file))(name => name === '@/platform/database/prisma' ? { db } : Object.hasOwn(real, name) ? real[name] : name.startsWith('@/') ? stub : require(name), mod, mod.exports)
  return mod.exports
}
const now = new Date(), at = hours => new Date(now.getTime() + hours * 3_600_000)

async function main() {
  const queries = load('src/modules/media/server/queries.ts', { '@/modules/cinema/domain/calendar': load('src/modules/cinema/domain/calendar.ts') })
  const title = (name, data) => prisma.cinemaTitle.create({ data: { slug: `${seed}-${name}`, title: name, kind: 'SERIES', poster: `/p/${name}.jpg`, ...data } })
  const season = (row, number, list) => prisma.cinemaSeason.create({ data: { titleId: row.id, number, episodes: { create: list } } })
  const open = await title('open', {}), vip = await title('vip', { access: 'MEMBERS' })
  const draft = await title('draft', { status: 'DRAFT' }), scheduled = await title('scheduled', { publishedAt: at(48) }), movie = await title('movie', { kind: 'MOVIE' })
  await season(open, 1, [{ number: 1, title: 'aired long ago', airDate: at(-24 * 40) }, { number: 2, title: 'aired yesterday', airDate: at(-26) }, { number: 3, title: 'airs in two days', airDate: at(50) }, { number: 4, title: 'no date' }])
  await season(open, 2, [{ number: 1, title: 'airs soon', airDate: at(3), access: 'MEMBERS' }])
  await season(vip, 1, [{ number: 1, title: 'members series', airDate: at(30) }, { number: 2, title: 'members aired', airDate: at(-2) }])
  for (const hidden of [draft, scheduled, movie]) await season(hidden, 1, [{ number: 1, title: 'hidden', airDate: at(5) }, { number: 2, title: 'hidden', airDate: at(-5) }])

  // The titles were published a moment ago, so the calendar is asked as of now, not as of the start of this script.
  const moment = new Date()
  const flat = result => result.days.flatMap(day => day.episodes.map(item => [item.series.title, item.season, item.number, item.members]))
  const upcoming = await queries.episodeCalendar({}, moment)
  assert.deepEqual(flat(upcoming), [['open', 2, 1, true], ['vip', 1, 1, true], ['open', 1, 3, false]], 'soonest first; unpublished, scheduled and film titles and undated episodes are left out')
  assert.deepEqual([upcoming.when, upcoming.total, upcoming.upcomingTotal, upcoming.page, upcoming.pages], ['upcoming', 3, 3, 1, 1])
  assert.equal(upcoming.days[0].episodes[0].series.poster, '/p/open.jpg')
  assert.ok(upcoming.days.every(day => day.episodes.every(item => new Date(item.at) > moment)))

  const recent = await queries.episodeCalendar({ when: 'recent' }, moment)
  assert.deepEqual(flat(recent), [['vip', 1, 2, true], ['open', 1, 2, false], ['open', 1, 1, false]], 'latest first')
  assert.deepEqual([recent.when, recent.total, recent.upcomingTotal], ['recent', 3, 3])
  // The moment decides the side: what airs in three hours has aired four hours from now.
  assert.deepEqual(flat(await queries.episodeCalendar({ when: 'recent' }, new Date(moment.getTime() + 4 * 3_600_000))).slice(0, 1), [['open', 2, 1, true]])

  // Paging: more than one page of episodes on one series.
  const long = await title('long', {})
  await season(long, 1, Array.from({ length: 35 }, (_, i) => ({ number: i + 1, airDate: at(100 + i) })))
  const later = new Date()
  const first = await queries.episodeCalendar({ page: 1 }, later), second = await queries.episodeCalendar({ page: '2' }, later)
  assert.deepEqual([first.total, first.pages, flat(first).length, flat(second).length], [38, 2, 30, 8])
  assert.equal(new Set([...flat(first), ...flat(second)].map(String)).size, 38, 'no episode is repeated or lost between pages')
  console.log('PostgreSQL episode calendar: upcoming and recent episodes of published series only, in order, with member flags and paging passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try { await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } }) } finally { await prisma.$disconnect() }
})
