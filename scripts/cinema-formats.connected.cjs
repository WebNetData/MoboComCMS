// Real PostgreSQL cinema formats (film, series, anime…) through the formats service, the admin save path and the
// public browse query. Formats and titles carry this script's own slug and are removed afterwards; the two formats
// the migration creates (movie, series) are only read.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `cfmt${Date.now().toString(36)}`
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
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
const formats = load('src/modules/cinema/server/formats.ts'), rules = load('src/modules/cinema/domain/formats.ts'), media = load('src/modules/media/server/admin.ts'), browse = load('src/modules/media/server/queries/cinema.ts')
const audits = []
const audit = async (tx, id, action, metadata) => { audits.push([action, id, metadata]); assert.ok(tx.auditLog, 'the audit is written in the same transaction') }
const refused = async (work, pattern, status) => { await assert.rejects(work, (error) => error instanceof rules.CinemaFormatError && pattern.test(error.message) && error.status === status) }

async function main() {
  // ---- the migration's two formats exist and every title has a format whose structure is its kind
  const movie = await prisma.cinemaFormat.findUnique({ where: { slug: 'movie' } }), series = await prisma.cinemaFormat.findUnique({ where: { slug: 'series' } })
  assert.deepEqual([movie?.structure, series?.structure], ['MOVIE', 'SERIES'], 'film and series formats from the migration')
  const mismatched = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "CinemaTitle" t LEFT JOIN "CinemaFormat" f ON f.id = t."formatId" WHERE f.id IS NULL OR f.structure <> t.kind')
  assert.equal(mismatched[0].n, 0, 'every stored title has a format of its own kind')
  await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "CinemaFormat" (slug, name, structure) VALUES ('${seed}-bad', 'x', 'PODCAST')`), /check/i, 'the database refuses an unknown structure')

  // ---- the owner adds "anime" with seasons and episodes
  await refused(formats.createFormat({ name: 'انیمه', slug: 'Anime!', structure: 'SERIES' }, audit), /نشانی انگلیسی/, 422)
  await refused(formats.createFormat({ name: '', slug: `${seed}-x`, structure: 'SERIES' }, audit), /نام نوع/, 422)
  await refused(formats.createFormat({ name: 'x', slug: `${seed}-x`, structure: 'BOOK' }, audit), /ساختار/, 422)
  const anime = await formats.createFormat({ name: 'انیمه', nameEn: 'Anime', plural: 'انیمه‌ها', slug: `${seed}-anime`, structure: 'SERIES', icon: '🎌', sortOrder: 5 }, audit)
  await refused(formats.createFormat({ name: 'دوباره', slug: `${seed}-anime`, structure: 'MOVIE' }, audit), /همین نشانی/, 409)
  const doc = await formats.createFormat({ name: 'مستند', slug: `${seed}-doc`, structure: 'MOVIE' }, audit)
  assert.deepEqual(audits.map(([action]) => action), ['created', 'created'])

  // ---- a title of that format is a series; a kind sent alongside does not override the format
  const save = (body, id = null) => media.saveMediaItem('cinema-titles', body, id)
  const { row: one } = await save({ title: `${seed} one`, slug: `${seed}-one`, formatId: String(anime.id), kind: 'MOVIE' })
  assert.deepEqual([one.formatId, one.kind], [anime.id, 'SERIES'], 'the format sets the kind')
  // a kind alone (an import, IMDb data) takes the default format of that kind; a fitting format is kept
  const { row: two } = await save({ title: `${seed} two`, slug: `${seed}-two`, kind: 'SERIES' })
  assert.deepEqual([two.formatId, two.kind], [rules.defaultFormat(await formats.activeFormats(), 'SERIES').id, 'SERIES'])
  const { row: kept } = await save({ kind: 'SERIES', summary: 'x' }, one.id)
  assert.equal(kept.formatId, anime.id, 'a kind that fits keeps the chosen format')
  const { row: moved } = await save({ kind: 'MOVIE' }, one.id)
  assert.deepEqual([moved.kind, moved.formatId === anime.id], ['MOVIE', false], 'a kind that does not fit takes that kind\'s default')
  const { row: untouched } = await save({ summary: 'only the text' }, two.id)
  assert.equal(untouched.formatId, two.formatId, 'a save that names neither keeps the format')
  await assert.rejects(save({ title: `${seed} bad`, slug: `${seed}-bad`, formatId: '2147480000' }), /وجود ندارد/)
  const { row: three } = await save({ title: `${seed} three`, slug: `${seed}-three`, formatId: String(doc.id) })
  assert.deepEqual([three.kind, three.formatId], ['MOVIE', doc.id])

  // ---- an inactive format is not offered for new titles, but a title that has it keeps it
  await formats.updateFormat(doc.id, { active: false }, audit)
  assert.equal((await formats.activeFormats()).some((format) => format.id === doc.id), false)
  await assert.rejects(save({ title: `${seed} four`, slug: `${seed}-four`, formatId: String(doc.id) }), /غیرفعال/)
  assert.equal((await save({ formatId: String(doc.id), summary: 'still' }, three.id)).row.formatId, doc.id)

  // ---- a format in use keeps its structure and is not deleted; an unused one is
  await save({ formatId: String(anime.id) }, one.id)
  await refused(formats.updateFormat(anime.id, { structure: 'MOVIE' }, audit), /ساختار نوعی که/, 409)
  await refused(formats.updateFormat(anime.id, { slug: 'other' }, audit), /تغییر نمی‌کند/, 422)
  await refused(formats.deleteFormat(anime.id, audit), /عنوان این نوع را دارند/, 409)
  await assert.rejects(prisma.cinemaFormat.delete({ where: { id: anime.id } }), /Foreign key|constraint/i, 'the database refuses too')
  const spare = await formats.createFormat({ name: 'کوتاه', slug: `${seed}-short`, structure: 'MOVIE' }, audit)
  await formats.deleteFormat(spare.id, audit)
  assert.equal(await prisma.cinemaFormat.count({ where: { id: spare.id } }), 0)

  // ---- the public browse finds titles by format and cards carry it
  await prisma.cinemaTitle.updateMany({ where: { slug: { startsWith: seed } }, data: { status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60000) } })
  const found = await browse.browseCinema({ format: `${seed}-anime`, q: seed })
  assert.deepEqual(found.titles.map((title) => [title.id, title.format?.slug]), [[one.id, `${seed}-anime`]])
  assert.equal(rules.formatLabel(found.titles[0], true), 'انیمه')
  assert.equal((await browse.browseCinema({ format: 'Robert"); DROP', q: seed })).titles.length, 3, 'an invalid format is ignored, not trusted')
  // ---- a format the owner gives a home shelf shows its newest titles on the cinema home; inactive or unticked, none
  const home = async () => (await browse.getCinemaHome({ shelfSize: 6 })).formatShelves.filter((row) => row.slug.startsWith(seed)).map((row) => [row.slug, row.titles.map((title) => title.slug)])
  assert.deepEqual(await home(), [], 'no shelf until the owner ticks it')
  await formats.updateFormat(anime.id, { homeShelf: true }, audit)
  assert.deepEqual(await home(), [[`${seed}-anime`, [`${seed}-one`]]])
  await formats.updateFormat(anime.id, { active: false }, audit)
  assert.deepEqual(await home(), [], 'an inactive format has no shelf')
  await formats.updateFormat(anime.id, { active: true, homeShelf: false }, audit)
  assert.deepEqual(await home(), [])
  console.log('PostgreSQL cinema formats: managed kinds with a structure the database checks, the format sets a title\'s kind, a kind alone takes a fitting default, inactive formats are kept but not offered, a format in use keeps its structure and cannot be deleted, browse filters by format.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.cinemaFormat.deleteMany({ where: { slug: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
