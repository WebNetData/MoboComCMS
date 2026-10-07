// Real PostgreSQL members, songs, reviews and favourites through the real suggestion engine and its built-in
// providers; the public item registry is a test double. Checks the provider contract (one provider per kind
// of item, replaceable, contained when it fails) and the signal from the member's own high ratings.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const real = new PrismaClient(), seed = `rec-prov-${Date.now()}`
let reviewReads = 0
const db = new Proxy(real, { get: (target, key) => key === 'itemReview' ? new Proxy(target.itemReview, { get: (model, method) => { if (method === 'findMany') reviewReads++; return model[method].bind(model) } }) : target[key] })
const hidden = new Set()
const mocks = {
  '@/platform/database/prisma': { db },
  '@/platform/observability/logger': { logEvent: (level, name, data) => { logged.push([level, name, data?.provider]) } },
  '@/modules/content/server/registry': { itemCards: async refs => new Map(refs.filter(ref => !hidden.has(`${ref.type}:${ref.id}`)).map(ref => [`${ref.type}:${ref.id}`, { type: ref.type, id: ref.id, title: `${ref.type} ${ref.id}`, url: `/x/${ref.id}`, image: '' }])) },
}
const logged = [], cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) { const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts') }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const days = n => new Date(Date.now() - n * 86_400_000)

async function main() {
  const paused = await real.setting.findUnique({ where: { key: 'personalRecommendationsEnabled' } })
  if (paused?.value === 'false') throw new Error('personalRecommendationsEnabled is off in this database; turn it on to run this check')
  const { personalRecommendations } = load('src/modules/recommendations/server/personal.ts')
  const providers = load('src/modules/recommendations/server/providers.ts'), rules = load('src/modules/recommendations/domain/provider.ts')
  const member = await real.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  const genre = `${seed}-dream`, other = `${seed}-march`
  const artists = await Promise.all(['a', 'b', 'c'].map(name => real.musicArtist.create({ data: { slug: `${seed}-${name}`, name } })))
  const track = (name, artist, g, extra = {}) => real.musicTrack.create({ data: { slug: `${seed}-${name}`, title: name, artistId: artist.id, genre: g, status: 'PUBLISHED', publishedAt: days(2), ...extra } })
  const praised = await track('praised', artists[0], genre), alike = await track('alike', artists[1], genre), alsoRated = await track('also-rated', artists[2], genre)
  const disliked = await track('disliked', artists[0], other), march = await track('march', artists[1], other)
  const review = (row, rating, status = 'APPROVED') => real.itemReview.create({ data: { itemType: 'track', itemId: row.id, userId: member.id, rating, status } })
  const ask = async () => (await personalRecommendations(member.id, 12)).items.map(entry => [entry.item.id, entry.sourceKind])
  const consent = on => real.user.update({ where: { id: member.id }, data: { recommendationOptIn: on } })

  // ---- the contract: one provider for each kind a suggestion can start from
  assert.deepEqual(providers.recommendationSeedTypes().sort(), ['album', 'artist', 'game', 'software', 'studio', 'title', 'track'])
  assert.deepEqual([providers.recommendationProvider('track').id, providers.recommendationProvider('product'), rules.SEED_WEIGHT, rules.RATED_SEED_MIN], ['catalogue.track', undefined, { follow: 3, favorite: 3, rated: 3, listen: 2, view: 0 }, 4])
  const direct = await providers.recommendationProvider('track').suggest({ type: 'track', id: praised.id }, { now: new Date(), take: 12 })
  assert.deepEqual(direct.map(row => row.item.id).sort(), [alike.id, alsoRated.id].sort(), 'the built-in provider answers from the catalogue: the same style, published')
  assert.deepEqual(await providers.recommendationProvider('track').suggest({ type: 'track', id: 2_000_000_000 }, { now: new Date(), take: 12 }), [], 'a seed that is not there gives nothing')
  const withdrawn = await track('withdrawn', artists[2], genre, { status: 'DRAFT' })
  assert.deepEqual(await providers.recommendationProvider('track').suggest({ type: 'track', id: withdrawn.id }, { now: new Date(), take: 12 }), [], 'nor one the public cannot open')

  // ---- the member's own high ratings are a signal, under the same consent as the rest
  await review(praised, 5); await review(alsoRated, 3); await review(disliked, 2)
  reviewReads = 0
  assert.deepEqual([await ask(), reviewReads], [[], 0], 'without consent nothing is suggested and the reviews are not read')
  await consent(true)
  assert.deepEqual(await ask(), [[alike.id, 'rated']], 'from the 5-star review: the same style, but not the song they already rated 3; nothing from the 2-star one')
  await real.itemReview.updateMany({ where: { userId: member.id, itemId: praised.id }, data: { status: 'PENDING' } })
  assert.deepEqual(await ask(), [], 'a review still waiting for approval is not a signal')
  await real.itemReview.updateMany({ where: { userId: member.id, itemId: praised.id }, data: { status: 'APPROVED', rating: 4 } })
  assert.deepEqual(await ask(), [[alike.id, 'rated']], 'four stars is enough')
  await real.itemReview.updateMany({ where: { userId: member.id, itemId: praised.id }, data: { rating: 3 } })
  assert.deepEqual(await ask(), [], 'three is not')
  await real.itemReview.updateMany({ where: { userId: member.id, itemId: praised.id }, data: { rating: 5 } })

  // ---- a provider can be replaced; everything around it stays the engine's
  const calls = []
  const restore = providers.useRecommendationProvider({ id: 'test.track', seedType: 'track', suggest: async (ref, context) => { calls.push([ref.id, context.take, context.now instanceof Date]); return [
    { item: { type: 'track', id: march.id }, score: 5, reason: 'from the other provider' },
    { item: { type: 'track', id: alsoRated.id }, score: 99, reason: 'already rated by the member' },
    { item: { type: 'track', id: disliked.id }, score: 50, reason: 'not public any more' },
    { item: { type: 'track', id: -4 }, score: 1, reason: 'not an item' }, { item: { type: 'track', id: alike.id }, score: Number.NaN, reason: 'no score' }, null, 'nonsense',
  ] } })
  await real.itemReview.deleteMany({ where: { userId: member.id, itemId: disliked.id } }); hidden.add(`track:${disliked.id}`)
  const replaced = await personalRecommendations(member.id, 12)
  assert.deepEqual([replaced.items.map(entry => [entry.item.id, entry.sourceKind, entry.reason]), calls], [[[march.id, 'rated', 'from the other provider']], [[praised.id, 12, true]]], 'the other provider is asked; what the member already rated, what is not public and what is not an item never reach them')
  await consent(false)
  assert.deepEqual([await ask(), calls.length], [[], 1], 'consent is the engine\'s: without it the provider is not even asked')
  await consent(true)

  // ---- a provider that fails costs its own seed only
  restore()
  assert.equal(providers.recommendationProvider('track').id, 'catalogue.track', 'put back')
  const album = await real.musicAlbum.create({ data: { slug: `${seed}-album`, title: 'album', artistId: artists[0].id, genre, status: 'PUBLISHED', publishedAt: days(2) } })
  const twin = await real.musicAlbum.create({ data: { slug: `${seed}-twin`, title: 'twin', artistId: artists[1].id, genre, status: 'PUBLISHED', publishedAt: days(2) } })
  await real.itemFavorite.create({ data: { userId: member.id, itemType: 'album', itemId: album.id } })
  const undo = providers.useRecommendationProvider({ id: 'test.broken', seedType: 'album', suggest: async () => { throw new Error('the service is down') } })
  logged.length = 0
  assert.deepEqual([await ask(), logged], [[[alike.id, 'rated']], [['error', 'recommendations.provider_failed', 'test.broken']]], 'the album seed gives nothing and is logged; the song seed still answers')
  undo()
  assert.deepEqual((await ask()).sort(), [[alike.id, 'rated'], [twin.id, 'favorite']].sort())
  console.log('PostgreSQL recommendation providers: one replaceable provider per kind of item, consent and filtering kept by the engine, a failing provider contained, and high ratings as a signal passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await real.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(user => user.id)
    await real.itemFavorite.deleteMany({ where: { userId: { in: ids } } }); await real.itemReview.deleteMany({ where: { userId: { in: ids } } })
    await real.musicTrack.deleteMany({ where: { slug: { startsWith: seed } } }); await real.musicAlbum.deleteMany({ where: { slug: { startsWith: seed } } })
    await real.musicArtist.deleteMany({ where: { slug: { startsWith: seed } } }); await real.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await real.$disconnect() }
})
