// Real PostgreSQL game lists (platforms, stores, play modes, localisations) through the vocabulary service, the admin
// save path and the public browse query. Entries and games carry this script's own code/slug and are removed
// afterwards; the seeded entries are only read.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `gv${Date.now().toString(36)}`, CODE = seed.toUpperCase()
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
const vocab = load('src/modules/games/server/vocabulary.ts'), rules = load('src/modules/games/domain/vocabulary.ts'), media = load('src/modules/media/server/admin.ts'), browse = load('src/modules/media/server/queries/games.ts')
const audits = []
const audit = async (tx, id, action) => { audits.push(action); assert.ok(tx.gameVocabulary && tx.auditLog, 'the audit is written in the same transaction') }
const refused = (work, pattern, status) => assert.rejects(work, (error) => error instanceof rules.VocabularyError && pattern.test(error.message) && error.status === status)

async function main() {
  // ---- the seeded lists are the values the code had fixed, in that order
  const active = await vocab.activeVocabulary()
  for (const list of rules.VOCABULARY_LISTS) assert.deepEqual(active[list].filter((entry) => !entry.code.startsWith(CODE) && !entry.code.startsWith(seed)).slice(0, rules.defaultVocabulary()[list].length).map((entry) => entry.code), rules.defaultVocabulary()[list].map((entry) => entry.code), `seeded ${list}`)
  assert.equal((await vocab.vocabularyLabels()).LOCALIZATION.FA_DUB, 'دوبله فارسی')
  // the database refuses an unknown list, a comma in a code and a malformed mode code
  for (const [list, code] of [['BOOK', `${CODE}_A`], ['PLATFORM', `${seed},x`], ['MODE', `${seed}-lower`]]) {
    await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "GameVocabulary" (list, code, name) VALUES ('${list}', '${code}', 'x')`), /check/i, `${list} ${code}`)
  }

  // ---- the owner adds entries; the code is fixed, the name is theirs
  await refused(vocab.createVocabulary({ list: 'MODE', code: 'battle royale!', name: 'x' }, audit), /حروف بزرگ/, 422)
  await refused(vocab.createVocabulary({ list: 'NOPE', code: 'X' }, audit), /فهرست/, 422)
  await refused(vocab.createVocabulary({ list: 'PLATFORM', code: 'a, b' }, audit), /ویرگول/, 422)
  const mode = await vocab.createVocabulary({ list: 'MODE', code: `${seed}-royale`, name: 'بتل رویال' }, audit)
  assert.equal(mode.code, `${CODE}_ROYALE`, 'a mode code is written upper case with underscores')
  const prefix = await vocab.createVocabulary({ list: 'LOCALIZATION', code: `${CODE}_V`, name: 'صدای فارسی' }, audit)
  const longer = await vocab.createVocabulary({ list: 'LOCALIZATION', code: `${CODE}_VX`, name: 'صدای فارسی کامل' }, audit)
  const platform = await vocab.createVocabulary({ list: 'PLATFORM', code: `${seed} Deck`, icon: '🎮' }, audit)
  assert.equal(platform.name, `${seed} Deck`, 'a platform without a name is shown by its code')
  const store = await vocab.createVocabulary({ list: 'STORE', code: `${seed} Store`, name: `${seed} Store` }, audit)
  await refused(vocab.createVocabulary({ list: 'MODE', code: `${CODE}_ROYALE` }, audit), /همین فهرست/, 409)
  await refused(vocab.updateVocabulary(mode.id, { code: 'OTHER' }, audit), /تغییر نمی‌کند/, 422)
  assert.equal((await vocab.updateVocabulary(mode.id, { name: 'بتل‌رویال', sortOrder: 99 }, audit)).name, 'بتل‌رویال')

  // ---- a game is saved with known codes only; an inactive code stays on a game that had it, and is not added
  const save = (body, id = null) => media.saveMediaItem('games', body, id)
  const { row: game } = await save({ title: `${seed} one`, slug: `${seed}-one`, modes: `single, ${CODE}_ROYALE, NOT_LISTED`, localization: [`${CODE}_VX`], platforms: `${seed} Deck`, storeLinks: [{ store: `${seed} Store`, url: 'https://example.invalid/game' }] })
  assert.deepEqual([game.modes, game.localization], [`SINGLE, ${CODE}_ROYALE`, `${CODE}_VX`], 'unknown codes are dropped, list order kept')
  await vocab.updateVocabulary(mode.id, { active: false }, audit)
  assert.equal((await vocab.activeVocabulary()).MODE.some((entry) => entry.id === mode.id), false, 'an inactive entry is not offered')
  assert.equal((await save({ modes: `${CODE}_ROYALE, COOP`, summary: 'x' }, game.id)).row.modes, `COOP, ${CODE}_ROYALE`, 'the game keeps the inactive code it had')
  const { row: other } = await save({ title: `${seed} two`, slug: `${seed}-two`, modes: `${CODE}_ROYALE, ONLINE`, localization: `${CODE}_V` })
  assert.equal(other.modes, 'ONLINE', 'an inactive code is not added to a game that did not have it')
  assert.equal((await vocab.vocabularyLabels()).MODE[`${CODE}_ROYALE`], 'بتل‌رویال', 'a game still shows the name of an inactive code')

  // ---- an entry a game uses is not deleted; an unused one is
  const counts = await vocab.adminVocabulary()
  const uses = (list, id) => counts[list].find((entry) => entry.id === id).games
  assert.deepEqual([uses('MODE', mode.id), uses('LOCALIZATION', prefix.id), uses('LOCALIZATION', longer.id), uses('PLATFORM', platform.id), uses('STORE', store.id)], [1, 1, 1, 1, 1], 'uses are whole items, not prefixes')
  await refused(vocab.deleteVocabulary(mode.id, audit), /بازی «بتل‌رویال» را دارند/, 409)
  await refused(vocab.deleteVocabulary(store.id, audit), /را دارند/, 409)
  await save({ platforms: '', releases: [{ platform: `${seed} Deck`, date: '2027-01-01' }] }, game.id)
  await refused(vocab.deleteVocabulary(platform.id, audit), /را دارند/, 409, 'a platform used only in a per-platform release date is in use')
  const spare = await vocab.createVocabulary({ list: 'STORE', code: `${seed} spare` }, audit)
  await vocab.deleteVocabulary(spare.id, audit)
  assert.equal(await prisma.gameVocabulary.count({ where: { id: spare.id } }), 0)

  // ---- the public filter matches a whole code: the shorter code does not find the longer one
  await prisma.gameTitle.updateMany({ where: { slug: { startsWith: seed } }, data: { status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60000) } })
  const by = async (input) => (await browse.browseGames({ ...input, q: seed })).games.map((g) => g.slug).sort()
  assert.deepEqual(await by({ lang: `${CODE}_V` }), [`${seed}-two`])
  assert.deepEqual(await by({ lang: `${CODE}_VX` }), [`${seed}-one`])
  assert.deepEqual(await by({ mode: 'ONLINE' }), [`${seed}-two`])
  assert.deepEqual(await by({ mode: 'online"); --' }), [`${seed}-one`, `${seed}-two`], 'a malformed code is ignored, not trusted')
  assert.ok(audits.length >= 9)
  console.log('PostgreSQL game lists: seeded from the fixed values, codes the database checks, fixed codes with the owner\'s names, games keep only known codes (an inactive one stays where it was), entries in use (including per-platform dates and store links) are not deleted, the public filter matches whole codes.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.gameTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.gameVocabulary.deleteMany({ where: { OR: [{ code: { startsWith: seed } }, { code: { startsWith: CODE } }] } })
  } finally { await prisma.$disconnect() }
})
