// Real PostgreSQL films, people and credits through the cinema people service and the admin save path.
// People are named with this script's own word, and the backfill cursor (one row for the whole site) is kept
// in memory with the walk narrowed to this script's titles, so the local site's people and cursor are untouched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `cpeople${Date.now()}`
const state = { settings: new Map() }
const titles = new Proxy(prisma.cinemaTitle, { get: (target, key) => key === 'findMany' ? args => args?.orderBy?.id === 'asc' && args?.take ? target.findMany({ ...args, where: { AND: [args.where || {}, { slug: { startsWith: seed } }] } }) : target.findMany(args) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const db = new Proxy(prisma, { get: (target, key) => key === 'cinemaTitle' ? titles
  : key === 'setting' ? { findUnique: async ({ where }) => state.settings.has(where.key) ? { value: state.settings.get(where.key) } : (where.key === 'cinema.people.backfill' ? null : target.setting.findUnique({ where })), upsert: async ({ where, update }) => { state.settings.set(where.key, update.value) } }
  : key === '$transaction' ? work => target.$transaction(work) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/content/server/events') return { contentChanged: () => {}, MEDIA_RESOURCE_TYPE: {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const people = load('src/modules/cinema/server/people.ts'), rules = load('src/modules/cinema/domain/people.ts'), media = load('src/modules/media/server/admin.ts')
const N = name => `${seed} ${name}`
const personId = async name => (await prisma.cinemaPerson.findUnique({ where: { normalizedName: rules.normalizePersonName(N(name)) } }))?.id

async function main() {
  // ---- the rules: who a title's own fields name
  assert.deepEqual(rules.creditsOf({ director: 'Lana W., Lilly W. و Tom T & <b>X</b>', cast: JSON.stringify([{ name: 'Keanu', role: 'Neo', image: 'https://img.example.invalid/k.jpg' }, { name: 'keanu ', role: 'again' }, { name: 'A', role: 'too short' }, { name: 'Carrie', image: 'javascript:alert(1)' }, 'nonsense']) }).map(c => [c.name, c.role, c.character, c.image]),
    [['Lana W.', 'DIRECTOR', '', ''], ['Lilly W.', 'DIRECTOR', '', ''], ['Tom T', 'DIRECTOR', '', ''], ['bX/b', 'DIRECTOR', '', ''], ['Keanu', 'CAST', 'Neo', 'https://img.example.invalid/k.jpg'], ['Carrie', 'CAST', '', '']], 'several directors on one line; a name once per role; no markup; only real addresses for a picture')
  assert.deepEqual([rules.normalizePersonName('  كيانو‌ريوز '), rules.normalizePersonName('Keanu  REEVES'), rules.creditsOf({ director: '', cast: 'not json' })], ['کیانو ریوز', 'keanu reeves', []])

  // ---- saving a film through the admin path names its people
  const save = (body, id = null) => media.saveMediaItem('cinema-titles', body, id)
  const { row: one } = await save({ title: N('one'), slug: `${seed}-one`, kind: 'MOVIE', director: `${N('Dir')}، ${N('Second')}`, cast: [{ name: N('Star'), role: 'Hero', image: '/api/media/covers/star.webp' }, { name: N('Dir'), role: 'Cameo' }] })
  const { row: two } = await save({ title: N('two'), slug: `${seed}-two`, kind: 'SERIES', director: N('dir').toUpperCase(), cast: [{ name: N('Star') }] })
  const { row: draft } = await save({ title: N('draft'), slug: `${seed}-draft`, kind: 'MOVIE', status: 'DRAFT', director: N('Hidden'), cast: [{ name: N('Star') }] })
  const dir = await personId('Dir'), star = await personId('Star'), hidden = await personId('Hidden')
  assert.ok(dir && star && hidden && await personId('Second'))
  assert.equal(await prisma.cinemaPerson.count({ where: { normalizedName: { startsWith: seed } } }), 4, 'one person however the name is spelled, across films and roles')
  const credits = async title => (await prisma.cinemaCredit.findMany({ where: { titleId: title.id }, orderBy: { sortOrder: 'asc' }, include: { person: true } })).map(c => [c.person.name.replace(`${seed} `, ''), c.role, c.character])
  assert.deepEqual(await credits(one), [['Dir', 'DIRECTOR', ''], ['Second', 'DIRECTOR', ''], ['Star', 'CAST', 'Hero'], ['Dir', 'CAST', 'Cameo']])
  assert.equal((await prisma.cinemaPerson.findUnique({ where: { id: star } })).image, '/api/media/covers/star.webp')

  // ---- a person's page: published titles only, by role
  const page = await people.personPage(dir)
  assert.deepEqual([page.name, page.directed.sort(), page.acted, page.characters.get(one.id)], [N('Dir'), [one.id, two.id].sort(), [one.id], 'Cameo'])
  assert.deepEqual([(await people.personPage(star)).acted.sort(), await people.personPage(hidden), await people.personPage(2_000_000_000), await people.personPage(-1)], [[one.id, two.id].sort(), null, null, null], 'a draft is on nobody\'s page; a person with nothing public has no page')
  const links = await people.creditLinks(one.id)
  assert.deepEqual([links.get(rules.normalizePersonName(N('STAR'))), links.size], [star, 3], 'the film page finds the person behind a name it shows')

  // ---- the directory
  const listed = await people.peopleDirectory({ q: seed })
  assert.deepEqual(listed.people.map(p => [p.name.replace(`${seed} `, ''), p.titles, p.director, p.cast]), [['Dir', 2, true, true], ['Star', 2, false, true], ['Second', 1, true, false]], 'distinct published works; two roles on one film count once; nobody whose only title is a draft')
  assert.deepEqual([(await people.peopleDirectory({ q: `${seed} sta` })).people.map(p => p.id), (await people.peopleDirectory({ q: `${seed} nobody` })).total], [[star], 0])

  // ---- an edit: credits follow the title; a save that does not touch them leaves them
  await save({ summary: 'only the synopsis changed' }, one.id)
  assert.equal((await credits(one)).length, 4)
  await save({ director: N('Second'), cast: [{ name: N('Star'), role: 'Lead' }] }, one.id)
  assert.deepEqual([await credits(one), (await people.personPage(dir)).directed, await prisma.cinemaPerson.count({ where: { id: dir } })], [[['Second', 'DIRECTOR', ''], ['Star', 'CAST', 'Lead']], [two.id], 1], 'removed from one film, the person and their other credits stay')
  await prisma.cinemaTitle.update({ where: { id: draft.id }, data: { status: 'PUBLISHED' } })
  assert.deepEqual((await people.personPage(hidden)).directed, [draft.id], 'published later, the person appears')

  // ---- titles saved before people existed are read by the worker step, in batches, once
  await prisma.cinemaCredit.deleteMany({ where: { titleId: { in: [one.id, two.id, draft.id] } } })
  const old = await prisma.cinemaTitle.create({ data: { slug: `${seed}-old`, title: N('old'), kind: 'MOVIE', director: N('Veteran'), cast: JSON.stringify([{ name: N('Star') }]) } })
  assert.deepEqual([await people.backfillCredits(3), await people.backfillCredits(3), await people.backfillCredits(3)], [{ read: 3, done: false }, { read: 1, done: true }, { read: 0, done: true }])
  assert.deepEqual([(await credits(old)).map(c => c[0]), (await credits(one)).length, (await people.personPage(star)).acted.length, await prisma.cinemaPerson.count({ where: { normalizedName: { startsWith: seed } } })], [['Veteran', 'Star'], 2, 4, 5], 'the same people are found again, not made twice')
  await people.backfillCredits(3)
  assert.equal(await prisma.cinemaCredit.count({ where: { titleId: old.id } }), 2, 'repeating it changes nothing')
  console.log('PostgreSQL cinema people: credits read from a title\'s own fields, one person across spellings and roles, pages and directory of published titles only, edits followed, and older titles backfilled once passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try { await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.cinemaPerson.deleteMany({ where: { normalizedName: { startsWith: seed } } }) }
  finally { await prisma.$disconnect() }
})
