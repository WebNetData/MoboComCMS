// Real PostgreSQL managed lists of the sections (games: platforms, stores, play modes, localisations; software:
// licences) through the shared vocabulary service, the admin save path and the public queries. Entries and items
// carry this script's own code/slug and are removed afterwards; the seeded entries are only read.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `voc${Date.now().toString(36)}`, CODE = seed.toUpperCase()
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
const vocab = load('src/modules/vocabulary/server/vocabulary.ts'), rules = load('src/modules/vocabulary/domain/vocabulary.ts'), registry = load('src/modules/vocabulary/domain/registry.ts')
const mediaRules = load('src/modules/media/domain/media.ts'), prefs = load('src/modules/media/domain/playback-prefs.ts')
const media = load('src/modules/media/server/admin.ts'), games = load('src/modules/media/server/queries/games.ts'), software = load('src/modules/media/server/queries/software.ts')
const audits = []
const audit = async (tx, id, action) => { audits.push(action); assert.ok(tx.vocabulary && tx.auditLog, 'the audit is written in the same transaction') }
const refused = (work, pattern, status) => assert.rejects(work, (error) => error instanceof rules.VocabularyError && pattern.test(error.message) && error.status === status)
const ours = (entry) => !entry.code.startsWith(CODE) && !entry.code.startsWith(seed)

async function main() {
  // ---- every declared list is seeded with the values the code had fixed, in that order
  for (const section of Object.keys(registry.VOCABULARY_SECTIONS)) {
    const active = await vocab.activeLists(section)
    for (const definition of registry.listsOf(section)) assert.deepEqual(active[definition.list].filter(ours).slice(0, definition.seeds.length).map((entry) => entry.code), definition.seeds.map(([code]) => code), `${section} ${definition.list}`)
  }
  assert.equal((await vocab.listLabels('games')).LOCALIZATION.FA_DUB, 'دوبله فارسی')
  assert.equal((await vocab.listLabels('software')).LICENSE.OPEN_SOURCE, 'متن‌باز')
  // the database keeps the shape: section and list names, no comma, upper-case codes except for name lists
  for (const [section, list, code] of [['Games', 'MODE', `${CODE}_A`], ['games', 'mode', `${CODE}_A`], ['games', 'PLATFORM', `${seed},x`], ['games', 'MODE', `${seed}-lower`], ['software', 'LICENSE', `${seed}`]]) {
    await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "Vocabulary" (section, list, code, name) VALUES ('${section}', '${list}', '${code}', 'x')`), /check/i, `${section} ${list} ${code}`)
  }

  // ---- the owner adds entries in a section's declared lists; the code is fixed, the name is theirs
  await refused(vocab.createEntry('games', { list: 'MODE', code: 'battle royale!', name: 'x' }, audit), /حروف بزرگ/, 422)
  await refused(vocab.createEntry('games', { list: 'LICENSE', code: 'X' }, audit), /فهرست/, 422)
  await refused(vocab.createEntry('games', { list: 'PLATFORM', code: 'a, b' }, audit), /ویرگول/, 422)
  const mode = await vocab.createEntry('games', { list: 'MODE', code: `${seed}-royale`, name: 'بتل رویال' }, audit)
  assert.equal(mode.code, `${CODE}_ROYALE`, 'a mode code is written upper case with underscores')
  const prefix = await vocab.createEntry('games', { list: 'LOCALIZATION', code: `${CODE}_V`, name: 'صدای فارسی' }, audit)
  const longer = await vocab.createEntry('games', { list: 'LOCALIZATION', code: `${CODE}_VX`, name: 'صدای فارسی کامل' }, audit)
  const platform = await vocab.createEntry('games', { list: 'PLATFORM', code: `${seed} Deck`, icon: '🎮' }, audit)
  assert.equal(platform.name, `${seed} Deck`, 'a platform without a name is shown by its code')
  const store = await vocab.createEntry('games', { list: 'STORE', code: `${seed} Store` }, audit)
  const licence = await vocab.createEntry('software', { list: 'LICENSE', code: `${CODE}_SUB`, name: 'اشتراکی' }, audit)
  await refused(vocab.createEntry('games', { list: 'MODE', code: `${CODE}_ROYALE` }, audit), /همین فهرست/, 409)
  await refused(vocab.updateEntry('games', mode.id, { code: 'OTHER' }, audit), /تغییر نمی‌کند/, 422)
  await refused(vocab.updateEntry('software', mode.id, { name: 'x' }, audit), /پیدا نشد/, 404, 'another section\'s entry is not found')
  await refused(vocab.deleteEntry('games', licence.id, audit), /پیدا نشد/, 404)
  assert.equal((await vocab.updateEntry('games', mode.id, { name: 'بتل‌رویال', sortOrder: 99 }, audit)).name, 'بتل‌رویال')

  // ---- a game keeps only known codes; an inactive code stays on a game that had it, and is not added
  const saveGame = (body, id = null) => media.saveMediaItem('games', body, id)
  const { row: game } = await saveGame({ title: `${seed} one`, slug: `${seed}-one`, modes: `single, ${CODE}_ROYALE, NOT_LISTED`, localization: [`${CODE}_VX`], platforms: `${seed} Deck`, storeLinks: [{ store: `${seed} Store`, url: 'https://example.invalid/game' }] })
  assert.deepEqual([game.modes, game.localization], [`SINGLE, ${CODE}_ROYALE`, `${CODE}_VX`], 'unknown codes are dropped, list order kept')
  await vocab.updateEntry('games', mode.id, { active: false }, audit)
  assert.equal((await vocab.activeLists('games')).MODE.some((entry) => entry.id === mode.id), false, 'an inactive entry is not offered')
  assert.equal((await saveGame({ modes: `${CODE}_ROYALE, COOP`, summary: 'x' }, game.id)).row.modes, `COOP, ${CODE}_ROYALE`, 'the game keeps the inactive code it had')
  const { row: other } = await saveGame({ title: `${seed} two`, slug: `${seed}-two`, modes: `${CODE}_ROYALE, ONLINE`, localization: `${CODE}_V` })
  assert.equal(other.modes, 'ONLINE', 'an inactive code is not added to a game that did not have it')
  assert.equal((await vocab.listLabels('games')).MODE[`${CODE}_ROYALE`], 'بتل‌رویال', 'a game still shows the name of an inactive code')

  // ---- a software title takes a known licence; an unknown one keeps the licence it had (a new title: free)
  const saveSoftware = (body, id = null) => media.saveMediaItem('software', body, id)
  const { row: app } = await saveSoftware({ title: `${seed} app`, slug: `${seed}-app`, license: `${CODE}_SUB` })
  assert.equal(app.license, `${CODE}_SUB`)
  assert.equal((await saveSoftware({ license: 'NOT_A_LICENCE' }, app.id)).row.license, `${CODE}_SUB`, 'an unknown licence keeps the one it had')
  const { row: fresh } = await saveSoftware({ title: `${seed} fresh`, slug: `${seed}-fresh`, license: 'nonsense here' })
  assert.equal(fresh.license, 'FREE', 'a new title with an unknown licence is free, as before')
  await vocab.updateEntry('software', licence.id, { active: false }, audit)
  assert.equal((await saveSoftware({ license: `${CODE}_SUB`, summary: 'kept' }, app.id)).row.license, `${CODE}_SUB`, 'an inactive licence stays where it was')
  assert.equal((await saveSoftware({ license: `${CODE}_SUB` }, fresh.id)).row.license, 'FREE', 'an inactive licence is not given to another title')

  // ---- an entry in use is not deleted; an unused one is
  const uses = async (section, list, id) => (await vocab.adminLists(section))[list].find((entry) => entry.id === id).uses
  assert.deepEqual([await uses('games', 'MODE', mode.id), await uses('games', 'LOCALIZATION', prefix.id), await uses('games', 'LOCALIZATION', longer.id), await uses('games', 'PLATFORM', platform.id), await uses('games', 'STORE', store.id), await uses('software', 'LICENSE', licence.id)], [1, 1, 1, 1, 1, 1], 'uses are whole items, not prefixes')
  await refused(vocab.deleteEntry('games', mode.id, audit), /«بتل‌رویال» را دارند/, 409)
  await refused(vocab.deleteEntry('games', store.id, audit), /را دارند/, 409)
  await refused(vocab.deleteEntry('software', licence.id, audit), /را دارند/, 409)
  await saveGame({ platforms: '', releases: [{ platform: `${seed} Deck`, date: '2027-01-01' }] }, game.id)
  await refused(vocab.deleteEntry('games', platform.id, audit), /را دارند/, 409)
  const spare = await vocab.createEntry('games', { list: 'STORE', code: `${seed} spare` }, audit)
  await vocab.deleteEntry('games', spare.id, audit)
  assert.equal(await prisma.vocabulary.count({ where: { id: spare.id } }), 0)

  // ---- the links of every section: audio sides are codes of the shared list; a quality list holds names
  await prisma.$executeRawUnsafe(`INSERT INTO "Vocabulary" (section, list, code, name) VALUES ('media', 'QUALITY', '${seed} HDR', 'x')`)
  await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "Vocabulary" (section, list, code, name) VALUES ('media', 'AUDIO', '${seed} dub', 'x')`), /check/i, 'an audio side is a code')
  const studio = await vocab.createEntry('media', { list: 'AUDIO', code: `DUBBED_${CODE}`, name: 'دوبلهٔ استودیو', icon: '🎬' }, audit)
  const saveTitle = (body, id = null) => media.saveMediaItem('cinema-titles', body, id)
  const linksOf = (id) => prisma.mediaLink.findMany({ where: { ownerType: 'title', ownerId: id }, orderBy: { id: 'asc' }, select: { url: true, audio: true } })
  const { row: film } = await saveTitle({ title: `${seed} film`, slug: `${seed}-film`, links: [
    { url: 'https://example.invalid/a.mkv', audio: `DUBBED_${CODE}` }, { url: 'https://example.invalid/b.mkv', audio: 'NOT_A_SIDE' }, { url: 'https://example.invalid/c.mkv', audio: 'ORIGINAL' }, { url: 'https://example.invalid/d.mkv', audio: 'lower case' },
  ] })
  assert.deepEqual((await linksOf(film.id)).map((link) => link.audio), [`DUBBED_${CODE}`, '', 'ORIGINAL', ''], 'unknown audio sides are dropped')
  await vocab.updateEntry('media', studio.id, { active: false }, audit)
  await saveTitle({ links: [{ url: 'https://example.invalid/a.mkv', audio: `DUBBED_${CODE}` }] }, film.id)
  assert.deepEqual((await linksOf(film.id)).map((link) => link.audio), [`DUBBED_${CODE}`], 'a link keeps a side the owner later deactivated')
  assert.equal(await uses('media', 'AUDIO', studio.id), 1)
  await refused(vocab.deleteEntry('media', studio.id, audit), /را دارند/, 409)
  // a member's preference puts every dub (or the original) first, the rest in the list's order, links without a side last
  const sides = ['DUBBED', `DUBBED_${CODE}`, 'ORIGINAL']
  assert.deepEqual(prefs.audioOrder({ audio: '' }, sides), ['DUBBED', `DUBBED_${CODE}`, 'ORIGINAL', ''])
  assert.deepEqual(prefs.audioOrder({ audio: 'ORIGINAL' }, sides), ['ORIGINAL', 'DUBBED', `DUBBED_${CODE}`, ''])
  assert.deepEqual(prefs.audioOrder({ audio: 'ORIGINAL' }), ['ORIGINAL', 'DUBBED', ''], 'the old order without a list')
  assert.deepEqual(mediaRules.groupLinks([{ audio: '', quality: 'a' }, { audio: 'SOMETHING_NEW', quality: 'b' }, { audio: 'ORIGINAL', quality: 'c' }], ['ORIGINAL', '']).map((group) => group.audio), ['ORIGINAL', 'SOMETHING_NEW', ''], 'an unnamed side comes before links without one')

  // ---- the public side: whole-code filters for games, the owner's licence names on software cards and filters
  await prisma.gameTitle.updateMany({ where: { slug: { startsWith: seed } }, data: { status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60000) } })
  await prisma.softwareTitle.updateMany({ where: { slug: { startsWith: seed } }, data: { status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60000) } })
  const by = async (input) => (await games.browseGames({ ...input, q: seed })).games.map((g) => g.slug).sort()
  assert.deepEqual(await by({ lang: `${CODE}_V` }), [`${seed}-two`])
  assert.deepEqual(await by({ lang: `${CODE}_VX` }), [`${seed}-one`])
  assert.deepEqual(await by({ mode: 'ONLINE' }), [`${seed}-two`])
  assert.deepEqual(await by({ mode: 'online"); --' }), [`${seed}-one`, `${seed}-two`], 'a malformed code is ignored, not trusted')
  const listed = await software.browseSoftware({ license: `${CODE}_SUB`, q: seed })
  assert.deepEqual(listed.items.map((item) => [item.slug, item.licenseName]), [[`${seed}-app`, 'اشتراکی']], 'a card carries the owner\'s licence name')
  assert.deepEqual(audits, ['created', 'created', 'created', 'created', 'created', 'created', 'updated', 'updated', 'updated', 'created', 'deleted', 'created', 'updated'], 'every change is audited; refused ones are not')

  // ---- software is specialised: platforms have a family, app stores are a list, a mobile app keeps its own facts
  const phone = await vocab.createEntry('software', { list: 'PLATFORM', code: `${seed} Phone OS`, family: 'MOBILE' }, audit)
  assert.equal(phone.family, 'MOBILE')
  await refused(vocab.createEntry('software', { list: 'PLATFORM', code: `${seed} Bad`, family: 'TOASTER' }, audit), /نوع/, 422)
  await refused(vocab.updateEntry('software', licence.id, { family: 'MOBILE' }, audit), /نوع/, 422, 'a list without families takes none')
  assert.equal((await vocab.updateEntry('software', phone.id, { family: 'WEB' }, audit)).family, 'WEB', 'the family follows the entry\'s own list')
  await vocab.updateEntry('software', phone.id, { family: 'MOBILE' }, audit)
  assert.equal((await vocab.allLists('software')).PLATFORM.find((entry) => entry.code === 'Android')?.family, 'MOBILE', 'seeded platforms carry their family')
  await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "Vocabulary" (section, list, code, name, family) VALUES ('software', 'APP_STORE', '${seed} x', 'x', 'lower')`), /check/i, 'a family is an upper-case word')
  const shop = await vocab.createEntry('software', { list: 'APP_STORE', code: `${seed} Shop`, name: 'فروشگاه آزمون' }, audit)
  const { row: mobile } = await saveSoftware({ title: `${seed} mobile`, slug: `${seed}-mobile`, platforms: `Android, ${seed} Phone OS`, packageId: 'com.example.app', minOs: 'Android 8.0',
    appStores: [{ store: `${seed} Shop`, url: 'https://example.invalid/app' }, { store: 'Not A Store', url: 'https://example.invalid/x' }, { store: 'Myket', url: '' }] })
  assert.deepEqual([mobile.packageId, mobile.minOs, JSON.parse(mobile.appStores)], ['com.example.app', 'Android 8.0', [{ store: `${seed} Shop`, url: 'https://example.invalid/app' }]], 'only listed stores with an address are kept')
  await assert.rejects(saveSoftware({ packageId: 'not a package' }, mobile.id), /شناسهٔ بسته/)
  await assert.rejects(saveSoftware({ appStores: [{ store: `${seed} Shop`, url: 'javascript:alert(1)' }] }, mobile.id), /معتبر نیست/)
  await vocab.updateEntry('software', shop.id, { active: false }, audit)
  assert.equal(JSON.parse((await saveSoftware({ appStores: [{ store: `${seed} Shop`, url: 'https://example.invalid/app2' }] }, mobile.id)).row.appStores)[0]?.url, 'https://example.invalid/app2', 'a title keeps a store the owner later deactivated')
  assert.equal(JSON.parse((await saveSoftware({ appStores: [{ store: `${seed} Shop`, url: 'https://example.invalid/app3' }] }, fresh.id)).row.appStores).length, 0, 'an inactive store is not given to another title')
  assert.deepEqual([await uses('software', 'PLATFORM', phone.id), await uses('software', 'APP_STORE', shop.id)], [1, 1], 'platform and store uses are counted')
  await refused(vocab.deleteEntry('software', shop.id, audit), /را دارند/, 409)
  await prisma.softwareTitle.updateMany({ where: { slug: `${seed}-mobile` }, data: { status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60000) } })
  const page = await software.getSoftware(`${seed}-mobile`)
  assert.deepEqual([page.software.packageId, page.software.minOs, page.software.appStores], ['com.example.app', 'Android 8.0', [{ store: `${seed} Shop`, url: 'https://example.invalid/app2', name: 'فروشگاه آزمون' }]], 'the page reads the app\'s facts with the store\'s name')
  const softwareRules = load('src/modules/software/domain/vocabulary.ts')
  assert.deepEqual([...softwareRules.platformFamilies(`android, ${seed} Phone OS, Unknown`, (await vocab.allLists('software')).PLATFORM)].sort(), ['MOBILE'], 'families follow the list, case-insensitively; unknown names add none')
  console.log('PostgreSQL managed lists: each section\'s declared lists seeded from the fixed values, the shape the database checks, fixed codes with the owner\'s names, entries scoped to their section, items keep only known codes (an inactive one stays where it was; an unknown licence keeps the old one), entries in use are not deleted, public filters match whole codes and cards show the owner\'s names.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const films = await prisma.cinemaTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })
    await prisma.mediaLink.deleteMany({ where: { ownerType: 'title', ownerId: { in: films.map((row) => row.id) } } })
    await prisma.cinemaTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.gameTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.softwareTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.vocabulary.deleteMany({ where: { OR: [{ code: { startsWith: seed } }, { code: { startsWith: CODE } }, { code: `DUBBED_${CODE}` }] } })
  } finally { await prisma.$disconnect() }
})
