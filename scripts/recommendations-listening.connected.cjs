// Real PostgreSQL private suggestions from listening history, behind its own consent; the public item registry is a test double.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const real = new PrismaClient(), seed = `rec-listening-${Date.now()}`
// Counts reads of the listening history so "not read without consent" is checked, not assumed.
let historyReads = 0
const db = new Proxy(real, {get: (target, key) => key === 'musicListenHistory' ? new Proxy(target.musicListenHistory, {get: (model, method) => { if (method === 'findMany') historyReads++; return model[method].bind(model) }}) : target[key]})
const card = ref => ({type: ref.type, id: ref.id, title: `${ref.type} ${ref.id}`, url: `/x/${ref.id}`, image: ''})
const mocks = {
 '@/platform/database/prisma': {db},
 '@/modules/content/server/registry': {itemCards: async refs => new Map(refs.map(ref => [`${ref.type}:${ref.id}`, card(ref)]))},
}
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const days = n => new Date(Date.now() - n * 86_400_000)
async function main() {
 const paused = await real.setting.findUnique({where: {key: 'personalRecommendationsEnabled'}})
 if (paused?.value === 'false') throw new Error('personalRecommendationsEnabled is off in this database; turn it on to run this check')
 const {personalRecommendations} = load('src/modules/recommendations/server/personal.ts')
 const [member, other] = await Promise.all(['member', 'other'].map(name => real.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})))
 const genre = `${seed}-shoegaze`, otherGenre = `${seed}-polka`
 const artists = await Promise.all(['a', 'b', 'c'].map(name => real.musicArtist.create({data: {slug: `${seed}-${name}`, name}})))
 const track = (name, artist, g, extra = {}) => real.musicTrack.create({data: {slug: `${seed}-${name}`, title: name, artistId: artist.id, genre: g, status: 'PUBLISHED', publishedAt: days(2), ...extra}})
 const loved = await track('loved', artists[0], genre)                 // finished: a seed
 const fresh = await track('fresh', artists[1], genre)                 // same genre, another artist, never played: the suggestion
 const heard = await track('heard', artists[2], genre)                 // same genre, started once: not suggested back
 const draft = await track('draft', artists[1], genre, {status: 'DRAFT'})
 const sampled = await track('sampled', artists[0], otherGenre)        // started once only: not a seed
 const polka = await track('polka', artists[1], otherGenre)            // would follow from `sampled`
 const listen = (userId, row, data) => real.musicListenHistory.create({data: {userId, trackId: row.id, ...data}})
 await listen(member.id, loved, {playCount: 1, completedAt: days(1), lastPlayedAt: days(1)})
 await listen(member.id, heard, {playCount: 1, lastPlayedAt: days(1)})
 await listen(member.id, sampled, {playCount: 1, lastPlayedAt: days(1)})
 await listen(other.id, sampled, {playCount: 9, completedAt: days(1), lastPlayedAt: days(1)})
 const titles = async userId => (await personalRecommendations(userId, 12)).items.map(entry => entry.item.id)
 const setConsent = (userId, main, listening) => real.user.update({where: {id: userId}, data: {recommendationOptIn: main, recommendationListeningOptIn: listening}})

 // No consent at all, or only the listening switch: nothing, and the history is not read.
 assert.deepEqual(await personalRecommendations(member.id), {available: true, enabled: false, items: []})
 await setConsent(member.id, false, true)
 assert.deepEqual(await personalRecommendations(member.id), {available: true, enabled: false, items: []})
 // General consent alone covers favorites and views, as before: still no read of the listening history.
 await setConsent(member.id, true, false)
 assert.deepEqual(await personalRecommendations(member.id), {available: true, enabled: true, items: []})
 assert.equal(historyReads, 0, 'listening history is not read without its own consent')

 // Both on: the finished track leads to an unheard track of another artist in the same genre.
 await setConsent(member.id, true, true)
 let result = await personalRecommendations(member.id, 12)
 assert.deepEqual(result.items.map(entry => [entry.item.id, entry.sourceKind, entry.sourceTitle]), [[fresh.id, 'listen', `track ${loved.id}`]])
 assert.ok(historyReads > 0)
 const ids = result.items.map(entry => entry.item.id)
 assert.ok(!ids.includes(heard.id), 'a track already played is not suggested back'); assert.ok(!ids.includes(draft.id), 'an unpublished track is not suggested')
 assert.ok(!ids.includes(polka.id), 'a single start is not a listening signal'); assert.ok(!ids.includes(loved.id))
 // Played again: now it is a signal.
 await real.musicListenHistory.update({where: {userId_trackId: {userId: member.id, trackId: sampled.id}}, data: {playCount: 2}})
 assert.deepEqual((await titles(member.id)).sort(), [fresh.id, polka.id].sort())
 // Old listening falls out of the window.
 await real.musicListenHistory.update({where: {userId_trackId: {userId: member.id, trackId: sampled.id}}, data: {lastPlayedAt: days(200)}})
 assert.deepEqual(await titles(member.id), [fresh.id])
 // Someone else's listening never reaches this member, and theirs stays unused without their consent.
 assert.deepEqual(await personalRecommendations(other.id), {available: true, enabled: false, items: []})
 await setConsent(other.id, true, true)
 assert.deepEqual(await titles(other.id), [polka.id])
 // A favorite outranks listening as the named source when both lead to the same track.
 await real.itemFavorite.create({data: {userId: member.id, itemType: 'track', itemId: loved.id}})
 result = await personalRecommendations(member.id, 12)
 assert.deepEqual(result.items.map(entry => [entry.item.id, entry.sourceKind]), [[fresh.id, 'favorite']])
 await real.itemFavorite.deleteMany({where: {userId: member.id}})
 // Withdrawing the listening consent, or clearing the history, removes the effect at once.
 await setConsent(member.id, true, false)
 assert.deepEqual(await titles(member.id), [])
 await setConsent(member.id, true, true)
 assert.deepEqual(await titles(member.id), [fresh.id])
 await real.musicListenHistory.deleteMany({where: {userId: member.id}})
 assert.deepEqual(await titles(member.id), [])
 console.log('PostgreSQL listening-based suggestions: separate consent, no read without it, finished or repeated plays only, heard and unpublished tracks left out, time window, other members, withdrawal and clearing passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await real.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await real.itemFavorite.deleteMany({where: {userId: {in: ids}}}); await real.musicTrack.deleteMany({where: {slug: {startsWith: seed}}})
  await real.musicArtist.deleteMany({where: {slug: {startsWith: seed}}}); await real.user.deleteMany({where: {id: {in: ids}}})
 } finally {await real.$disconnect()}
})
