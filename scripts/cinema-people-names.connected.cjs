// Film people with two names on real PostgreSQL: the real title save, people service, catalogue search, artist
// profiles, the import's naming step and the pass over earlier titles. Wikidata and the site's AI are test doubles;
// nothing is fetched from the network. Run on a database copy (the list clean-up of the migration is replayed).
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'cinema-people-names-check'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `cnames${Date.now()}`, startedAt = new Date()
// Persian names carry their own Persian marker (Persian digits): a Persian name is only Persian letters.
const pseed = 'آزمون' + seed.slice(6).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])
const state = { wikidata: { titles: new Map(), labels: new Map(), down: false }, asked: [], ai: { names: new Map(), calls: 0, fail: false }, credentials: { persianNames: true, persianNamesAi: true } }
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/content/server/events') return { contentChanged: () => {}, MEDIA_RESOURCE_TYPE: {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === '@/modules/media/server/queries/music') return { allOrEmpty: async work => work() }
    if (name === '@/modules/recommendations/server/contextual') return { relatedCinema: async () => [] }
    if (name === '@/modules/cinema/server/metadata/config' || name === './config' && full.endsWith(path.join('metadata', 'people-names.ts'))) return { metadataCredentials: async () => ({ ...state.credentials }) }
    if (name === '@/modules/ai/server/client') return { generate: async prompt => {
      state.ai.calls++
      if (state.ai.fail) throw new Error('no AI')
      const asked = [...prompt.user.matchAll(/^- (.+)$/gm)].map(m => m[1])
      return { text: JSON.stringify({ names: asked.filter(n => state.ai.names.has(n)).map(n => ({ en: n, fa: state.ai.names.get(n) })) }), model: 'test' }
    } }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
// Wikidata: the title's cast and directors (role + English label → IMDb person) and each IMDb person's Persian label.
global.fetch = async url => {
  const query = new URL(String(url)).searchParams.get('query') || ''
  state.asked.push(query.includes('VALUES') ? 'labels' : 'title')
  if (state.wikidata.down) throw new Error('offline')
  let bindings = []
  if (query.includes('VALUES')) bindings = [...query.matchAll(/"(nm\d+)"/g)].map(m => m[1]).filter(id => state.wikidata.labels.has(id)).map(id => ({ imdb: { value: id }, fa: { value: state.wikidata.labels.get(id) } }))
  else {
    const title = /wdt:P345 "(tt\d+)"/.exec(query)?.[1]
    // The title's people: role, English label, IMDb person and (when Wikidata has one) Persian label.
    bindings = (state.wikidata.titles.get(title) || []).map(([role, label, imdb]) => ({ role: { value: role }, pLabel: { value: label }, ...(imdb ? { imdb: { value: imdb } } : {}), ...(state.wikidata.labels.has(imdb) ? { fa: { value: state.wikidata.labels.get(imdb) } } : {}) }))
  }
  return new Response(JSON.stringify({ results: { bindings } }), { headers: { 'content-type': 'application/sparql-results+json' } })
}
const rules = load('src/modules/cinema/domain/people.ts'), people = load('src/modules/cinema/server/people.ts'), media = load('src/modules/media/server/admin.ts')
const { browseCinema } = load('src/modules/media/server/queries/cinema.ts'), admin = load('src/modules/cinema/server/person-admin.ts')
const celebrities = load('src/modules/celebrities/server/celebrities.ts'), profile = load('src/modules/celebrities/server/celebrities/profile.ts')
const naming = load('src/modules/cinema/server/metadata/people-names.ts'), { suggestedCelebritySlug } = load('src/modules/celebrities/domain/celebrities.ts')
const L = name => `${seed} ${name}`, P = name => `${name} ${pseed}`, key = rules.normalizePersonName
const save = (body, id = null) => media.saveMediaItem('cinema-titles', body, id)
const person = id => prisma.cinemaPerson.findUniqueOrThrow({ where: { id } })
const creditOf = async (title, role) => (await prisma.cinemaCredit.findFirst({ where: { titleId: title.id, role }, orderBy: { sortOrder: 'asc' } })).personId
const mine = () => prisma.cinemaPerson.count({ where: { OR: [{ normalizedName: { contains: seed } }, { displayNameKey: { contains: seed } }, { normalizedName: { contains: pseed } }, { displayNameKey: { contains: pseed } }] } })
const ids = list => list.titles.map(t => t.id).sort((a, b) => a - b)

async function main() {
  // ---- a person first saved in English, then named in Persian by an import: one person with both names
  const { row: alpha } = await save({ title: L('alpha'), slug: `${seed}-alpha`, kind: 'MOVIE', director: L('Chris Nolan'), cast: [{ name: L('Matt Mac'), role: 'Cooper' }] })
  const nolanId = await creditOf(alpha, 'DIRECTOR'), mattId = await creditOf(alpha, 'CAST')
  assert.deepEqual([(await person(nolanId)).name, (await person(nolanId)).nameEn], [L('Chris Nolan'), ''], 'as before: a Latin name, no English one yet')
  const { row: beta } = await save({ title: L('beta'), slug: `${seed}-beta`, kind: 'MOVIE', director: P('کریس نولان'),
    cast: [{ name: P('مت مک'), nameEn: L('Matt Mac'), imdbId: 'nm9100001', role: 'Cooper' }],
    peopleNames: [{ role: 'DIRECTOR', name: P('کریس نولان'), nameEn: L('Chris Nolan'), imdbId: 'nm9100002' }] })
  assert.deepEqual([await creditOf(beta, 'DIRECTOR'), await creditOf(beta, 'CAST'), await mine()], [nolanId, mattId, 2], 'the same two people, not two more')
  let nolan = await person(nolanId), matt = await person(mattId)
  assert.deepEqual([nolan.name, nolan.nameEn, nolan.imdbId, nolan.normalizedName], [P('کریس نولان'), L('Chris Nolan'), 'nm9100002', key(L('Chris Nolan'))], 'Persian shown, English kept, IMDb person known, the match key unchanged')
  assert.deepEqual([matt.name, matt.nameEn, matt.imdbId], [P('مت مک'), L('Matt Mac'), 'nm9100001'])
  assert.equal(JSON.parse((await prisma.cinemaTitle.findUnique({ where: { id: beta.id } })).cast)[0].nameEn, L('Matt Mac'), 'the cast row keeps the English name')
  assert.deepEqual([(await people.creditProfiles(alpha.id)).get(key(L('Chris Nolan')))?.id, (await people.creditProfiles(beta.id)).get(key(P('کریس نولان')))?.id, (await people.creditLinks(beta.id)).get(key(P('مت مک')))], [nolanId, nolanId, mattId], 'each film page still finds the person by the name it shows')

  // A name typed by hand in Persian later, or in English with the same IMDb person: still that person.
  const { row: gamma } = await save({ title: L('gamma'), slug: `${seed}-gamma`, kind: 'SERIES', director: P('کریس نولان'), cast: [{ name: L('Matt Mac') }] })
  assert.deepEqual([await creditOf(gamma, 'DIRECTOR'), await creditOf(gamma, 'CAST'), await mine()], [nolanId, mattId, 2])
  assert.equal((await person(nolanId)).name, P('کریس نولان'), 'an English credit later does not undo the Persian name')

  // Two people with the same Latin name and different IMDb persons stay two; each is found by their own.
  const { row: delta } = await save({ title: L('delta'), slug: `${seed}-delta`, kind: 'MOVIE', cast: [{ name: L('John Same'), imdbId: 'nm9100011' }] })
  const { row: eps } = await save({ title: L('eps'), slug: `${seed}-eps`, kind: 'MOVIE', cast: [{ name: L('John Same'), imdbId: 'nm9100012' }] })
  const john1 = await creditOf(delta, 'CAST'), john2 = await creditOf(eps, 'CAST')
  assert.notEqual(john1, john2)
  assert.equal((await person(john2)).normalizedName, `${key(L('John Same'))} nm9100012`, 'its match key names its IMDb person')
  const { row: zeta } = await save({ title: L('zeta'), slug: `${seed}-zeta`, kind: 'MOVIE', cast: [{ name: P('جان سیم'), nameEn: L('John Same'), imdbId: 'nm9100012' }] })
  assert.equal(await creditOf(zeta, 'CAST'), john2, 'found by IMDb person under a Persian name')
  assert.deepEqual([(await person(john2)).name, (await person(john1)).name], [P('جان سیم'), L('John Same')])

  // ---- the catalogue search finds a person's films by either name, cast included
  assert.deepEqual(ids(await browseCinema({ q: L('Chris Nolan') })), [alpha.id, beta.id, gamma.id].sort((a, b) => a - b), 'English name: also the films that show the Persian one')
  assert.deepEqual(ids(await browseCinema({ q: P('کریس نولان') })), [alpha.id, beta.id, gamma.id].sort((a, b) => a - b), 'Persian name: also the film that shows the English one')
  assert.deepEqual(ids(await browseCinema({ q: L('Matt Mac') })), [alpha.id, beta.id, gamma.id].sort((a, b) => a - b), 'an actor is found too, not only the director line')
  assert.deepEqual(ids(await browseCinema({ q: L('Matt Mac'), director: String(nolanId), kind: 'SERIES' })), [gamma.id], 'with the other filters')
  assert.deepEqual((await people.publicPeopleChoices({ q: L('Matt Mac'), role: 'CAST' })).map(p => [p.id, p.name]), [[mattId, P('مت مک')]], 'the actor picker finds them by the English name and shows the Persian one')
  assert.ok((await people.peopleDirectory({ q: L('chris nolan') })).people.some(p => p.id === nolanId))
  assert.ok((await admin.adminPeople(new URLSearchParams({ q: L('Matt Mac') }))).people.some(p => p.id === mattId && p.nameEn === L('Matt Mac')))

  // ---- the person editor: an English name in Latin letters, cleared when sent empty, kept when not sent
  const audit = async () => {}
  nolan = await person(nolanId)
  await assert.rejects(admin.savePerson({ id: nolanId, profileVersion: nolan.profileVersion, name: nolan.name, nameEn: 'کریستوفر', bio: '', image: '', imageLocked: false }, audit), /حروف لاتین/)
  await admin.savePerson({ id: nolanId, profileVersion: nolan.profileVersion, name: nolan.name, nameEn: L('Christopher Nolan'), bio: '', image: '', imageLocked: false }, audit)
  nolan = await person(nolanId)
  assert.deepEqual([nolan.nameEn, nolan.normalizedNameEn], [L('Christopher Nolan'), key(L('Christopher Nolan'))])
  await admin.savePerson({ id: nolanId, profileVersion: nolan.profileVersion, name: nolan.name, bio: 'x', image: '', imageLocked: false }, audit)
  assert.equal((await person(nolanId)).nameEn, L('Christopher Nolan'), 'not sent: kept')
  assert.ok(ids(await browseCinema({ q: L('Christopher Nolan') })).includes(beta.id), 'the edited English name is searchable')

  // ---- artist profiles: Persian name shown, English name in its field, address made from it
  await celebrities.syncCelebrities()
  let entry = await prisma.celebrity.findUnique({ where: { cinemaPersonId: nolanId } })
  assert.deepEqual([entry.name, entry.slug], [P('کریس نولان'), suggestedCelebritySlug(L('Christopher Nolan'))])
  const shown = await profile.celebrityProfile(entry.id)
  assert.deepEqual([shown.name, shown.nameEn], [P('کریس نولان'), L('Christopher Nolan')], 'the editor shows «نام» in Persian and «نام انگلیسی» filled')
  // An entry made earlier at its number address moves to the English one, which the old address keeps leading to.
  const late = await prisma.cinemaPerson.create({ data: { name: L('Late Comer'), normalizedName: key(L('Late Comer')) } })
  await celebrities.syncCelebrities()
  entry = await prisma.celebrity.findUnique({ where: { cinemaPersonId: late.id } })
  assert.equal(entry.slug, `person-${late.id}`, 'no English name yet: the number address')
  await save({ title: L('eta'), slug: `${seed}-eta`, kind: 'MOVIE', cast: [{ name: P('لیت کامر'), nameEn: L('Late Comer'), imdbId: 'nm9100031' }] })
  await celebrities.syncCelebrities()
  entry = await prisma.celebrity.findUnique({ where: { cinemaPersonId: late.id } })
  assert.deepEqual([entry.name, entry.slug, !!await prisma.celebritySlugAlias.findUnique({ where: { slug: `person-${late.id}` } })], [P('لیت کامر'), suggestedCelebritySlug(L('Late Comer')), true])

  // ---- the import's naming step: Wikidata by IMDb person (the import's own or the title's on Wikidata), then the AI
  state.wikidata.titles.set('tt9100001', [['CAST', L('Cast Two'), 'nm9100023']])
  state.wikidata.labels.set('nm9100021', P('کارگردان یک')).set('nm9100023', P('بازیگر دو')).set('nm9100099', 'Latin label')
  state.ai.names.set(L('Cast One'), P('بازیگر یک'))
  const imported = { imdbId: 'tt9100001', director: L('Dir One'), producer: L('Prod One'), directorImages: [{ name: L('Dir One'), image: '', imdbId: 'nm9100021' }], cast: [{ name: L('Cast One'), imdbId: 'nm9100022', role: 'A' }, { name: L('Cast Two'), role: 'B' }, { name: P('از پیش فارسی'), role: 'C' }] }
  let result = await naming.enrichPeopleNames({ fields: imported, source: 'IMDb', warnings: ['before'] }, { ai: true })
  assert.equal(result.fields.director, P('کارگردان یک'))
  assert.deepEqual(result.fields.cast.map(r => [r.name, r.nameEn || '', r.imdbId || '']), [[P('بازیگر یک'), L('Cast One'), 'nm9100022'], [P('بازیگر دو'), L('Cast Two'), 'nm9100023'], [P('از پیش فارسی'), '', '']], 'Wikidata by the IMDb person it matched; the AI for the one Wikidata lacked')
  assert.equal(result.fields.producer, L('Prod One'), 'nothing known: the English name stays')
  assert.equal(result.warnings[0], 'before')
  assert.match(result.warnings.join(' | '), /ویکی‌داده/); assert.match(result.warnings.join(' | '), /هوش مصنوعی نوشت/); assert.match(result.warnings.join(' | '), /پیدا نشد/)
  assert.deepEqual(imported.cast[0].name, L('Cast One'), 'the input is not changed in place')
  // Saved as the form would send it: every person lands with both names.
  const { row: theta } = await save({ title: L('theta'), slug: `${seed}-theta`, kind: 'MOVIE', ...result.fields })
  const dir = await person(await creditOf(theta, 'DIRECTOR'))
  assert.deepEqual([dir.name, dir.nameEn, dir.imdbId], [P('کارگردان یک'), L('Dir One'), 'nm9100021'])
  // Created in Persian (its match key is Persian): its English name alone finds it in every search.
  assert.equal(dir.normalizedName, key(P('کارگردان یک')))
  assert.deepEqual((await people.publicPeopleChoices({ q: L('Dir One'), role: 'DIRECTOR' })).map(p => p.id), [dir.id], 'the director picker')
  assert.ok((await people.peopleDirectory({ q: L('Dir One') })).people.some(p => p.id === dir.id), 'the people directory')
  assert.ok((await admin.adminPeople(new URLSearchParams({ q: L('Dir One') }))).people.some(p => p.id === dir.id), 'the Admin list')
  assert.deepEqual((await admin.suggestPeople(new URLSearchParams({ q: L('Dir One') }))).people.map(p => p.id), [dir.id], 'the title form picker')
  assert.deepEqual(ids(await browseCinema({ q: L('Dir One') })), [theta.id], 'the catalogue search')
  // A big cast (hundreds of rows) still names the director; two people under one name are not guessed between.
  state.wikidata.titles.set('tt9100003', [...Array.from({ length: 300 }, (_, i) => ['CAST', L(`Extra ${i}`), `nm91${String(i).padStart(5, '0')}`]), ['DIRECTOR', L('Big Dir'), 'nm9100051'], ['CAST', L('Twin'), 'nm9100061'], ['CAST', L('Twin'), 'nm9100062'], ['CAST', L('Namesake'), 'nm9100071']])
  state.wikidata.labels.set('nm9100051', P('کارگردان بزرگ')).set('nm9100061', P('دوقلو یک')).set('nm9100062', P('دوقلو دو')).set('nm9100071', P('هم‌نام دیگر'))
  result = await naming.enrichPeopleNames({ fields: { imdbId: 'tt9100003', director: L('Big Dir'), cast: [{ name: L('Twin') }, { name: L('Namesake'), imdbId: 'nm9100072' }] }, source: 'Cinemeta', warnings: [] }, { ai: false })
  assert.deepEqual([result.fields.director, result.fields.directorImages?.[0]?.imdbId, result.fields.cast[0].name], [P('کارگردان بزرگ'), 'nm9100051', L('Twin')], 'a director without an IMDb person from the import is found on the title; an ambiguous name stays as it was')
  assert.equal(result.fields.cast[1].name, L('Namesake'), 'a same-named person of the title with another IMDb identity does not lend its Persian name')
  // Wikidata down and the AI switched off: the English names stay in both fields, the import still works.
  state.wikidata.down = true; const calls = state.ai.calls
  result = await naming.enrichPeopleNames({ fields: { imdbId: 'tt9100001', director: L('Dir One'), cast: [{ name: L('Cast One') }] }, source: 'IMDb', warnings: [] }, { ai: false })
  assert.deepEqual([result.fields.director, result.fields.cast[0].name, result.fields.cast[0].nameEn, state.ai.calls], [L('Dir One'), L('Cast One'), L('Cast One'), calls])
  assert.match(result.warnings.join(' | '), /ویکی‌داده دریافت نشد/)
  state.ai.fail = true
  result = await naming.enrichPeopleNames({ fields: { imdbId: 'tt9100001', cast: [{ name: L('Cast One') }] }, source: 'IMDb', warnings: [] }, { ai: true })
  assert.match(result.warnings.join(' | '), /هوش مصنوعی ساخته نشد/, 'an AI failure is a warning, not a failed import')
  state.wikidata.down = false; state.ai.fail = false

  // ---- titles imported before: named again through the title's own save, as the admin who started it
  const owner = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  state.wikidata.titles.set('tt9100002', [['DIRECTOR', L('Old Dir'), 'nm9100041'], ['CAST', L('Old Star'), 'nm9100042']])
  state.wikidata.labels.set('nm9100041', P('کارگردان قدیمی')).set('nm9100042', P('ستارهٔ قدیمی'))
  const { row: old } = await save({ title: L('old'), slug: `${seed}-old`, kind: 'MOVIE', imdbId: 'tt9100002', director: L('Old Dir'), cast: [{ name: L('Old Star'), role: 'Lead' }] })
  const oldStar = await creditOf(old, 'CAST')
  const continued = []
  const pass = await naming.runPeopleNamesBackfill({ cursor: old.id - 1, run: 'test', actorId: owner.id }, { checkpoint: async () => {}, continueWith: async (...args) => continued.push(args) })
  assert.deepEqual([pass.changed, pass.done, continued.length], [1, true, 0])
  const after = await prisma.cinemaTitle.findUnique({ where: { id: old.id } })
  assert.deepEqual([after.director, JSON.parse(after.cast)[0].name, JSON.parse(after.cast)[0].nameEn], [P('کارگردان قدیمی'), P('ستارهٔ قدیمی'), L('Old Star')])
  assert.equal(await creditOf(old, 'CAST'), oldStar, 'the same person, renamed')
  assert.deepEqual([(await person(oldStar)).name, (await person(oldStar)).nameEn, (await person(oldStar)).imdbId], [P('ستارهٔ قدیمی'), L('Old Star'), 'nm9100042'])
  const again = await naming.runPeopleNamesBackfill({ cursor: old.id - 1, run: 'test', actorId: owner.id }, { checkpoint: async () => {}, continueWith: async () => {} })
  assert.equal(again.changed, 0, 'a title already in Persian is left alone')
  state.credentials.persianNames = false
  assert.deepEqual(await naming.runPeopleNamesBackfill({ cursor: 0, run: 'test', actorId: owner.id }, { checkpoint: async () => {}, continueWith: async () => {} }), { skipped: 'off' })
  state.credentials.persianNames = true
  await assert.rejects(naming.runPeopleNamesBackfill({ cursor: 0, run: 'bad run', actorId: owner.id }, {}), /Invalid/)
  await assert.rejects(naming.runPeopleNamesBackfill({ cursor: 0, run: 'ok', actorId: 2_000_000_000 }, {}), /Invalid/)
  const started = await naming.startPeopleNamesBackfill(owner.id), twice = await naming.startPeopleNamesBackfill(owner.id)
  // A pass may already wait (started from Admin on this database): either way a second start joins the one there is.
  assert.deepEqual([twice.started, twice.id, await prisma.backgroundJob.count({ where: { kind: 'cinema.people-names', status: { in: ['QUEUED', 'RUNNING'] } } })], [false, started.id, 1], 'one pass at a time')

  // ---- the migration's list clean-up, replayed: titles move to the entry that carries the English name
  const country = `${seed}land`
  await prisma.vocabulary.createMany({ data: [{ section: 'cinema', list: 'COUNTRY', code: P('سرزمین'), name: P('سرزمین'), nameEn: country, sortOrder: 99 }, { section: 'cinema', list: 'COUNTRY', code: country, name: country, nameEn: '', sortOrder: 100 }] })
  await prisma.cinemaTitle.update({ where: { id: alpha.id }, data: { countries: `${country}, ${P('سرزمین')}, ایران` } })
  const sql = fs.readFileSync('prisma/migrations/20270303120000_cinema_people_names/migration.sql', 'utf8')
  const statements = sql.slice(sql.indexOf('CREATE TEMP TABLE')).replace(/^--.*$/gm, '').split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
  await prisma.$transaction(async tx => { for (const statement of statements) await tx.$executeRawUnsafe(statement) })
  assert.equal((await prisma.cinemaTitle.findUnique({ where: { id: alpha.id } })).countries, `${P('سرزمین')}, ایران`, 'the copy becomes the entry, once, in the original order')
  assert.equal(await prisma.vocabulary.count({ where: { section: 'cinema', list: 'COUNTRY', code: country } }), 0, 'the adopted copy goes')
  console.log('PostgreSQL film people names: one person across Persian/English names and IMDb persons, same-name people kept apart, film pages and search by either name (cast too), person editor, artist profiles and addresses, Wikidata/AI naming with failures, the pass over earlier titles and the list clean-up passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const titles = (await prisma.cinemaTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    const persons = (await prisma.cinemaPerson.findMany({ where: { OR: [{ normalizedName: { contains: seed } }, { displayNameKey: { contains: seed } }, { normalizedName: { contains: pseed } }, { displayNameKey: { contains: pseed } }] }, select: { id: true } })).map(row => row.id)
    await prisma.celebritySlugAlias.deleteMany({ where: { celebrity: { cinemaPersonId: { in: persons } } } })
    await prisma.celebrity.deleteMany({ where: { cinemaPersonId: { in: persons } } })
    await prisma.cinemaTitle.deleteMany({ where: { id: { in: titles } } })
    await prisma.cinemaPerson.deleteMany({ where: { id: { in: persons } } })
    await prisma.vocabulary.deleteMany({ where: { section: 'cinema', OR: [{ code: { contains: seed } }, { nameEn: { contains: seed } }, { code: { contains: pseed } }] } })
    await prisma.backgroundJob.deleteMany({ where: { kind: 'cinema.people-names', createdAt: { gte: startedAt } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
