// Real PostgreSQL series, episodes, follows and announcement rows. Only the inbox write is a test double;
// the job only sees this script's series.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `air-${Date.now()}`
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const scoped = new Proxy(prisma.cinemaEpisodeAirNotification, { get: (target, key) => key === 'findMany' ? args => target.findMany({ ...args, where: { AND: [args.where || {}, { title: { slug: { startsWith: seed } } }] } }) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const db = new Proxy(prisma, { get: (target, key) => key === 'cinemaEpisodeAirNotification' ? scoped : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const inbox = { events: [], failFor: 0 }
function load(file, real) {
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compile(file))(name => name === '@/platform/database/prisma' ? { db } : Object.hasOwn(real, name) ? real[name] : require(name), mod, mod.exports)
  return mod.exports
}
const calendar = load('src/modules/cinema/domain/calendar.ts', {})
const alerts = load('src/modules/cinema/server/episode-notifications.ts', {
  '@/modules/cinema/domain/calendar': calendar,
  '@/modules/notifications/server/inbox': { createInboxEvent: async event => { if (inbox.failFor === event.userId) { inbox.failFor = 0; throw new Error('inbox unavailable') } inbox.events.push(event) } },
})
const start = new Date(), at = hours => new Date(start.getTime() + hours * 3_600_000)
let users = 0
const member = () => prisma.user.create({ data: { email: `${seed}-${users++}@example.invalid`, passwordHash: 'test-only' } })
const follow = (user, series, data = {}) => prisma.itemFavorite.create({ data: { userId: user.id, itemType: 'title', itemId: series.id, createdAt: at(-24 * 30), ...data } })
const series = (name, data = {}) => prisma.cinemaTitle.create({ data: { slug: `${seed}-${name}`, title: `series ${name}`, kind: 'SERIES', publishedAt: at(-24 * 60), ...data } })
// Saves the season tree the way the series editor does (rebuilt on every save) and registers the airings.
async function save(row, episodes, now = new Date()) {
  await prisma.$transaction(async tx => {
    await tx.cinemaSeason.deleteMany({ where: { titleId: row.id } })
    const season = await tx.cinemaSeason.create({ data: { titleId: row.id, number: 1 } })
    for (const item of episodes) await tx.cinemaEpisode.create({ data: { seasonId: season.id, number: item.number, title: item.title || '', airDate: item.airDate || null } })
    await alerts.scheduleEpisodeAirings(tx, row.id, episodes.map(item => ({ season: 1, number: item.number, airDate: item.airDate || null })), now)
  })
}
const rows = row => prisma.cinemaEpisodeAirNotification.findMany({ where: { titleId: row.id }, orderBy: { episode: 'asc' } })
const sentTo = (row, episode) => inbox.events.filter(event => event.dedupeKey.startsWith(`title:${row.id}:s1e${episode}:`)).map(event => event.userId)

async function main() {
  const [early, silent, late] = [await member(), await member(), await member()]
  const show = await series('show')
  await follow(early, show); await follow(silent, show, { notify: false }); await follow(late, show, { createdAt: at(-1) })
  const tree = [{ number: 1, airDate: at(-24 * 40) }, { number: 2, title: 'just aired', airDate: at(-2) }, { number: 3, airDate: at(50) }, { number: 4 }]
  await save(show, tree)
  assert.deepEqual((await rows(show)).map(row => row.episode), [2, 3], 'old and undated episodes are not announced')

  // ---- an aired episode reaches the members who followed with alerts on before it aired
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 1, sent: 1 })
  assert.deepEqual(sentTo(show, 2), [early.id])
  const event = inbox.events[0]
  assert.deepEqual([event.kind, event.href, event.titleFa], ['FOLLOWED_UPDATE', `/cinema/${seed}-show`, 'قسمت تازهٔ series show'])
  assert.match(event.bodyFa, /«just aired»/); assert.match(event.bodyEn, /^S01E02 /)
  assert.ok((await rows(show))[0].completedAt)
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 0, sent: 0 }, 'announced once')

  // ---- saving the series again neither repeats an announcement nor loses a pending one; a new date moves it
  await save(show, tree)
  assert.deepEqual((await rows(show)).map(row => [row.episode, Boolean(row.completedAt)]), [[2, true], [3, false]])
  // An episode already announced stays announced even when its date is edited afterwards.
  await save(show, tree.map(item => item.number === 2 ? { ...item, airDate: at(5) } : item))
  assert.deepEqual([(await rows(show))[0].dueAt.getTime(), Boolean((await rows(show))[0].completedAt)], [at(-2).getTime(), true])
  await save(show, tree.map(item => item.number === 3 ? { ...item, airDate: at(10) } : item))
  assert.equal((await rows(show))[1].dueAt.getTime(), at(10).getTime())
  assert.deepEqual(await alerts.processEpisodeAirNotifications(at(9)), { checked: 0, sent: 0 }, 'not before it airs')
  assert.deepEqual(await alerts.processEpisodeAirNotifications(at(11)), { checked: 1, sent: 2 })
  assert.deepEqual(sentTo(show, 3), [early.id, late.id], 'whoever followed before this episode aired; never the member who turned alerts off')
  assert.deepEqual(sentTo(show, 2), [early.id])

  // ---- an episode that was removed or lost its date loses its pending announcement
  await save(show, [...tree, { number: 5, airDate: at(70) }, { number: 6, airDate: at(80) }])
  await save(show, [...tree, { number: 6 }])
  assert.deepEqual((await rows(show)).map(row => row.episode), [2, 3])

  // ---- a stopped run continues after the last member it reached
  const stop = await series('stop')
  await follow(early, stop); await follow(late, stop, { createdAt: at(-24 * 30) })
  await save(stop, [{ number: 1, airDate: at(-1) }])
  inbox.failFor = late.id
  await assert.rejects(alerts.processEpisodeAirNotifications(new Date()), /inbox unavailable/)
  assert.deepEqual([(await rows(stop))[0].lastUserId, (await rows(stop))[0].completedAt], [early.id, null])
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 1, sent: 1 })
  assert.deepEqual(sentTo(stop, 1), [early.id, late.id], 'nobody twice, nobody skipped')

  // ---- more followers than one run handles
  const busy = await series('busy')
  await prisma.user.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ email: `${seed}-crowd-${i}@example.invalid`, passwordHash: 'test-only' })) })
  const crowd = await prisma.user.findMany({ where: { email: { startsWith: `${seed}-crowd-` } }, select: { id: true } })
  await prisma.itemFavorite.createMany({ data: crowd.map(user => ({ userId: user.id, itemType: 'title', itemId: busy.id, createdAt: at(-24 * 30) })) })
  await save(busy, [{ number: 1, airDate: at(-1) }])
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 1, sent: 50 })
  assert.equal((await rows(busy))[0].completedAt, null)
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 1, sent: 5 })
  assert.equal(new Set(sentTo(busy, 1)).size, 55)
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 0, sent: 0 })

  // ---- a series that is not public announces nothing; rows that no longer match their episode do not block the queue
  const draft = await series('draft', { status: 'DRAFT' })
  await follow(early, draft); await save(draft, [{ number: 1, airDate: at(-1) }])
  const moved = await series('moved')
  await follow(early, moved); await save(moved, [{ number: 1, airDate: at(-1) }, { number: 2, airDate: at(-1) }])
  await prisma.cinemaEpisode.updateMany({ where: { number: 1, season: { titleId: moved.id } }, data: { airDate: at(200) } })
  await prisma.cinemaEpisode.deleteMany({ where: { number: 2, season: { titleId: moved.id } } })
  const before = inbox.events.length
  assert.deepEqual(await alerts.processEpisodeAirNotifications(new Date()), { checked: 2, sent: 0 })
  assert.equal(inbox.events.length, before)
  assert.deepEqual((await rows(moved)).map(row => [row.episode, row.dueAt.getTime()]), [[1, at(200).getTime()]], 'the postponed one waits for its new date, the removed one is dropped')
  assert.equal((await rows(draft))[0].completedAt, null)
  console.log('PostgreSQL episode alerts: followers with alerts on hear once about each newly aired episode; re-saves, date changes, removals, stopped runs and large audiences passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
