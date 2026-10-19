// Real PostgreSQL member, game, songs, playlist, collection and favourites, read and changed through the one
// reading and writing of a member's lists, which calls each list's own owner. Only this script's rows are touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `mlist${Date.now()}`
const state = { off: new Set(), user: null }
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => !state.off.has(id), getModuleSettings: async () => ({}), getModuleStates: async () => ({}), moduleGuard: async () => null, requireModule: async () => {} }
    if (name === '@/modules/games/server/portal') return { getGamesSettings: async () => ({ libraryEnabled: !state.off.has('shelves') }) }
    if (name === '@/modules/identity/server/access') return { requireUser: async () => state.user }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === '@/platform/http/rate-limit') return { rateLimitHit: () => ({ ok: true }), clientIp: () => '' }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const lists = load('src/modules/account/server/lists.ts'), rules = load('src/modules/account/domain/lists.ts')
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }

async function main() {
  const member = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } }), other = await prisma.user.create({ data: { email: `${seed}-other@example.invalid`, passwordHash: 'test-only' } })
  const artist = await prisma.musicArtist.create({ data: { slug: seed, name: seed } })
  const song = (name, data = {}) => prisma.musicTrack.create({ data: { slug: `${seed}-${name}`, title: name, artistId: artist.id, audioUrl: '/x.mp3', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000), ...data } })
  const track = await song('song'), draft = await song('draft', { status: 'DRAFT' })
  const game = await prisma.gameTitle.create({ data: { slug: `${seed}-game`, title: `${seed} game`, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) } })
  const playlist = await prisma.userMusicPlaylist.create({ data: { userId: member.id, title: `${seed} mix` } }), theirs = await prisma.userMusicPlaylist.create({ data: { userId: other.id, title: `${seed} theirs` } })
  const collection = await prisma.userCollection.create({ data: { ownerId: member.id, title: `${seed} picks` } }), foreign = await prisma.userCollection.create({ data: { ownerId: other.id, title: `${seed} foreign`, visibility: 'PUBLIC' } })
  const site = await prisma.userCollection.create({ data: { ownerId: member.id, title: `${seed} site`, staffAuthored: true } })
  const T = { type: 'track', id: track.id }, G = { type: 'game', id: game.id }
  const key = text => rules.parseListKey(text)
  const mine = async () => (await lists.memberLists(member.id)).map(list => [list.key, list.count, list.accepts])

  // ---- how a list is named
  assert.deepEqual(['favorites', 'games:WANT', `playlist:${playlist.id}`, 'collection:7', 'games:LOVED', 'playlist:x', 'collection:0', 'playlist:1:2', 'nonsense', ''].map(text => { const parsed = key(text); return parsed ? rules.listKey(parsed) : null }), ['favorites', 'games:WANT', `playlist:${playlist.id}`, 'collection:7', null, null, null, null, null, null])

  // ---- one reading of every list, each counted by its owner
  assert.deepEqual(await mine(), [['favorites', 0, 'any'], ['games:PLAYING', 0, 'game'], ['games:PLAYED', 0, 'game'], ['games:WANT', 0, 'game'], ['games:DROPPED', 0, 'game'], [`playlist:${playlist.id}`, 0, 'track'], [`collection:${collection.id}`, 0, 'any']], 'the member\'s own lists; not another member\'s, not a collection written for the site')

  // ---- one writing, through each owner
  assert.deepEqual(await lists.setInList(member.id, T, key('favorites'), true), { list: 'favorites', on: true })
  await lists.setInList(member.id, T, key(`playlist:${playlist.id}`), true); await lists.setInList(member.id, T, key(`collection:${collection.id}`), true)
  await lists.setInList(member.id, G, key('games:WANT'), true); await lists.setInList(member.id, G, key(`collection:${collection.id}`), true)
  assert.deepEqual([await lists.listsHolding(member.id, T), await lists.listsHolding(member.id, G), await lists.listsHolding(other.id, T)], [['favorites', `playlist:${playlist.id}`, `collection:${collection.id}`], ['games:WANT', `collection:${collection.id}`], []])
  assert.deepEqual((await mine()).filter(row => row[1]), [['favorites', 1, 'any'], ['games:WANT', 1, 'game'], [`playlist:${playlist.id}`, 1, 'track'], [`collection:${collection.id}`, 2, 'any']])
  assert.deepEqual([await prisma.itemFavorite.count({ where: { userId: member.id } }), await prisma.userMusicPlaylistTrack.count({ where: { playlistId: playlist.id } }), await prisma.userCollectionItem.count({ where: { collectionId: collection.id } }), (await prisma.gameLibrary.findFirstOrThrow({ where: { userId: member.id } })).status], [1, 1, 2, 'WANT'], 'the rows are the owners\' own')
  // A game is on one shelf: moving it is one write, and taking it off a shelf it is not on changes nothing.
  await lists.setInList(member.id, G, key('games:PLAYED'), true)
  assert.deepEqual(await lists.setInList(member.id, G, key('games:WANT'), false), { list: 'games:WANT', on: false })
  assert.deepEqual(await lists.listsHolding(member.id, G), ['games:PLAYED', `collection:${collection.id}`])

  // ---- each owner's own rules still decide
  await refused(lists.setInList(member.id, G, key(`playlist:${playlist.id}`), true), 400, 'a game in a playlist')
  await refused(lists.setInList(member.id, T, key('games:WANT'), true), 400, 'a song on a game shelf')
  await refused(lists.setInList(member.id, T, key(`playlist:${theirs.id}`), true), 404, 'another member\'s playlist')
  await refused(lists.setInList(member.id, T, key(`collection:${foreign.id}`), true), 404, 'another member\'s collection')
  await refused(lists.setInList(member.id, T, key(`collection:${site.id}`), true), 404, 'a collection written for the site')
  await refused(lists.setInList(member.id, { type: 'track', id: draft.id }, key(`playlist:${playlist.id}`), true), 404, 'a song the public cannot open')
  await refused(lists.setInList(member.id, { type: 'track', id: draft.id }, key(`collection:${collection.id}`), true), 404, 'an unpublished item in a collection')
  await refused(lists.setInList(member.id, { type: 'game', id: 2_000_000_000 }, key('games:WANT'), true), 404, 'a game that is not there')

  // ---- taking out
  for (const list of ['favorites', `playlist:${playlist.id}`, `collection:${collection.id}`]) await lists.setInList(member.id, T, key(list), false)
  await lists.setInList(member.id, G, key('games:PLAYED'), false)
  assert.deepEqual([await lists.listsHolding(member.id, T), await lists.listsHolding(member.id, G)], [[], [`collection:${collection.id}`]])

  // ---- a module that is off takes its lists with it and leaves the others
  state.off.add('music'); state.off.add('shelves')
  assert.deepEqual((await mine()).map(row => row[0]), ['favorites', `collection:${collection.id}`])
  await refused(lists.setInList(member.id, T, key(`playlist:${playlist.id}`), true), 404, 'a playlist while music is off')
  await refused(lists.setInList(member.id, G, key('games:WANT'), true), 404, 'a shelf while the game library is off')
  state.off.clear()

  // ---- the address apps will use
  const get = query => lists.GET_lists({ nextUrl: new URL(`http://site.invalid/api/me/lists${query}`), headers: new Headers() })
  const put = (body, headers = {}) => lists.PUT_lists({ headers: new Headers(headers), json: async () => body })
  assert.deepEqual([(await get('')).status, (await put({ item: `track:${track.id}`, list: 'favorites', on: true })).status], [401, 401], 'a visitor has no lists')
  state.user = { id: member.id }
  const forSong = await (await get(`?item=track:${track.id}`)).json()
  assert.deepEqual([forSong.version, forSong.item, forSong.holding, forSong.lists.map(list => list.key)], [1, `track:${track.id}`, [], ['favorites', `playlist:${playlist.id}`, `collection:${collection.id}`]], 'for a song: only the lists that can hold a song')
  assert.deepEqual([(await get('?item=nonsense')).status, (await put({ item: `track:${track.id}`, list: 'games:LOVED', on: true })).status, (await put({ item: `track:${track.id}`, list: 'favorites' })).status, (await put({ item: `track:${track.id}`, list: 'favorites', on: true }, { origin: 'https://elsewhere.invalid', host: 'site.invalid' })).status], [400, 400, 400, 403])
  const saved = await put({ item: `track:${track.id}`, list: 'favorites', on: true })
  assert.deepEqual([saved.status, (await saved.json()).holding, (await put({ item: `game:${game.id}`, list: `playlist:${playlist.id}`, on: true })).status, (await put({ item: `track:${track.id}`, list: `playlist:${theirs.id}`, on: true })).status], [200, ['favorites'], 400, 404])
  console.log('PostgreSQL member lists: one naming, one reading and one writing of favourites, game shelves, playlists and collections through their owners, the owners\' rules kept, modules off, and the address for apps passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const users = (await prisma.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.itemFavorite.deleteMany({ where: { userId: { in: users } } }); await prisma.gameLibrary.deleteMany({ where: { userId: { in: users } } })
    await prisma.userCollection.deleteMany({ where: { ownerId: { in: users } } }); await prisma.userMusicPlaylist.deleteMany({ where: { userId: { in: users } } })
    await prisma.itemStat.deleteMany({ where: { OR: [{ itemType: 'track', itemId: { in: (await prisma.musicTrack.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id) } }, { itemType: 'game', itemId: { in: (await prisma.gameTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id) } }] } })
    await prisma.musicTrack.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.musicArtist.deleteMany({ where: { slug: seed } }); await prisma.gameTitle.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  } finally { await prisma.$disconnect() }
})
