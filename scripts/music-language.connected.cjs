// Real PostgreSQL songs, albums and terms. Music is filed two ways: albums under categories (taxonomy "music")
// and songs under a language or dialect (taxonomy "music-language"). The two share tables and must not see
// each other's items, even when an album and a song carry the same id.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `ml${Date.now()}`
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const taxonomy = load('src/modules/taxonomy/server/taxonomy.ts'), domain = load('src/modules/taxonomy/domain/taxonomy.ts'), queries = load('src/modules/media/server/queries.ts')
const LANG = 'music-language'
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }

async function main() {
  // ---- the taxonomy itself, and the languages the migration brought
  assert.deepEqual([domain.isTaxonomy(LANG), domain.TAXONOMY_INFO[LANG].base, domain.TAXONOMY_INFO[LANG].module, domain.LEGACY_SOURCES.includes(LANG)], [true, '/music/language', 'music', false])
  const seeded = (await prisma.taxonomyTerm.findMany({ where: { taxonomy: LANG, slug: { in: ['farsi', 'torki', 'lori', 'mazandarani'] } }, orderBy: { sortOrder: 'asc' } })).map(row => row.name)
  assert.deepEqual(seeded, ['فارسی', 'ترکی', 'لری', 'مازندرانی'], 'the four languages the owner named')

  const artist = await prisma.musicArtist.create({ data: { slug: `${seed}-artist`, name: `${seed} artist` } })
  const day = n => new Date(Date.now() - n * 86_400_000)
  const track = (name, data = {}) => prisma.musicTrack.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, artistId: artist.id, publishedAt: day(5), ...data } })
  const [older, newer, draft, future, plain] = [await track('older', { publishedAt: day(9) }), await track('newer', { publishedAt: day(1) }), await track('draft', { status: 'DRAFT' }), await track('future', { publishedAt: new Date(Date.now() + 86_400_000) }), await track('plain')]
  const language = await taxonomy.saveTerm(LANG, { name: `${seed} language`, slug: `${seed}-language`, color: '#10b981' })
  const dialect = await taxonomy.saveTerm(LANG, { name: `${seed} dialect`, slug: `${seed}-dialect`, parentId: language.id })
  const other = await taxonomy.saveTerm(LANG, { name: `${seed} other`, slug: `${seed}-other` })
  // filed as the admin's save files them
  await prisma.$transaction(async tx => {
    await taxonomy.assignTerms(tx, LANG, older.id, [language.id]); await taxonomy.assignTerms(tx, LANG, newer.id, [dialect.id])
    await taxonomy.assignTerms(tx, LANG, draft.id, [language.id]); await taxonomy.assignTerms(tx, LANG, future.id, [dialect.id])
  })
  await taxonomy.recount(LANG)
  const count = async id => (await prisma.taxonomyTerm.findUnique({ where: { id } })).count
  assert.deepEqual([await count(language.id), await count(dialect.id), await count(other.id)], [2, 1, 0], 'a language counts its published songs and its dialects\'; drafts and songs not yet due do not count')

  // ---- the public archive: a language shows its songs and its dialects', newest first
  const page = async slugs => { const found = await taxonomy.resolveTermPath(LANG, slugs); return found && { path: found.term.path, children: found.children.map(row => row.name.split(' ')[1]), ...(await queries.tracksByIds(found.ownerIds, 1)) } }
  const ofLanguage = await page([`${seed}-language`])
  assert.deepEqual([ofLanguage.path, ofLanguage.children, ofLanguage.total, ofLanguage.tracks.map(row => row.title.split(' ')[1])], [`/music/language/${seed}-language`, ['dialect'], 2, ['newer', 'older']])
  const ofDialect = await page([`${seed}-language`, `${seed}-dialect`])
  assert.deepEqual([ofDialect.path, ofDialect.tracks.map(row => row.title.split(' ')[1])], [`/music/language/${seed}-language/${seed}-dialect`, ['newer']])
  assert.deepEqual([(await page([`${seed}-other`])).total, await page([`${seed}-nothing`]), await page([`${seed}-dialect`])], [0, null, null], 'an empty language is a page; an unknown one, or a dialect without its language in the path, is not')
  // the song page names its language; a song without one names none
  const named = await taxonomy.primaryTerms(LANG, [newer.id, plain.id])
  assert.deepEqual([named.get(newer.id).name, named.get(newer.id).path, named.get(newer.id).chain.length, named.has(plain.id)], [`${seed} dialect`, `/music/language/${seed}-language/${seed}-dialect`, 2, false])
  assert.ok((await taxonomy.termTree(LANG)).some(node => node.id === language.id && node.children.some(child => child.id === dialect.id)))

  // ---- the two ways of filing music keep apart, even with equal ids
  const album = await prisma.musicAlbum.create({ data: { slug: `${seed}-album`, title: `${seed} album`, artistId: artist.id } })
  const category = await taxonomy.saveTerm('music', { name: `${seed} category`, slug: `${seed}-category` })
  await prisma.$transaction(async tx => {
    await taxonomy.assignTerms(tx, 'music', album.id, [category.id])
    // an album whose id equals a song's id, filed under a category
    await tx.taxonomyAssignment.create({ data: { taxonomy: 'music', termId: category.id, ownerId: older.id } })
    // and a song whose id equals the album's, filed under the language
    await tx.taxonomyAssignment.create({ data: { taxonomy: LANG, termId: other.id, ownerId: album.id } })
  })
  await taxonomy.recount(LANG); await taxonomy.recount('music')
  assert.equal(await count(other.id), (await prisma.musicTrack.count({ where: { id: album.id, status: 'PUBLISHED', publishedAt: { lte: new Date() } } })), 'a language counts songs, never the album that happens to share the id')
  assert.deepEqual((await taxonomy.assignmentsFor(LANG, [older.id])).get(older.id)?.ids, [language.id], 'a song\'s languages do not include a category filed under the same number')
  assert.deepEqual((await taxonomy.resolveTermPath('music', [`${seed}-category`])).ownerIds.sort((a, b) => a - b), [album.id, older.id].sort((a, b) => a - b))
  assert.ok(!(await taxonomy.resolveTermPath(LANG, [`${seed}-language`])).ownerIds.includes(album.id))
  // a term of one taxonomy cannot be given to an item of the other
  await prisma.$transaction(tx => taxonomy.assignTerms(tx, LANG, plain.id, [category.id]))
  assert.equal((await taxonomy.assignmentsFor(LANG, [plain.id])).get(plain.id)?.ids.length || 0, 0, 'a music category is not a language')

  // ---- removing a song removes its filing; there is no old field to build languages from
  await prisma.$transaction(tx => taxonomy.removeOwner(tx, LANG, newer.id))
  await taxonomy.recount(LANG)
  assert.deepEqual([await count(language.id), await count(dialect.id)], [1, 0])
  await refused(taxonomy.importLegacy(LANG), 400, 'building languages from an old field')
  console.log('PostgreSQL music language: songs filed under a language and its dialects, counted and listed when published, kept apart from album categories that share tables and ids passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.taxonomyTerm.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.musicArtist.deleteMany({ where: { slug: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
