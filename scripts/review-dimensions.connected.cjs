// Real PostgreSQL review dimensions, verified-experience badge, list order and filter; the public item registry and module switch are test doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `review-dimensions-${Date.now()}`, base = 700_000_000 + (Date.now() % 50_000_000)
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async () => true, getModuleSettings: async () => ({'moderate-text': false})},
 '@/modules/notifications/server/inbox': {createInboxEvent: async () => ({})},
 '@/modules/content/server/registry': {
  itemCard: async ref => ({type: ref.type, id: ref.id, title: `${ref.type} ${ref.id}`, url: `/x/${ref.id}`, image: ''}),
  itemCards: async refs => new Map(refs.map(ref => [`${ref.type}:${ref.id}`, {type: ref.type, id: ref.id, title: `${ref.type} ${ref.id}`, url: `/x/${ref.id}`, image: ''}])),
 },
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
const rejects = (promise, pattern) => assert.rejects(promise, error => pattern.test(error.message))
async function main() {
 const reviews = load('src/modules/reviews/server/reviews.ts'), {memberItemExperience} = load('src/modules/content/server/experience.ts')
 const users = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(name => db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name}})))
 const [a, b, c, d, e] = users.map(user => user.id)
 const game = {type: 'game', id: base}, software = {type: 'software', id: base + 1}

 // --- evidence, read from the records the owning modules keep
 const title = await db.cinemaTitle.create({data: {slug: `${seed}-title`, title: 'T'}})
 const season = await db.cinemaSeason.create({data: {titleId: title.id, number: 1}})
 const episode = await db.cinemaEpisode.create({data: {seasonId: season.id, number: 1}})
 const artist = await db.musicArtist.create({data: {slug: `${seed}-artist`, name: 'A'}})
 const album = await db.musicAlbum.create({data: {slug: `${seed}-album`, title: 'Al', artistId: artist.id}})
 const track = await db.musicTrack.create({data: {slug: `${seed}-track`, title: 'Tr', artistId: artist.id, albumId: album.id}})
 const film = {type: 'title', id: title.id}, record = {type: 'album', id: album.id}, song = {type: 'track', id: track.id}
 for (const ref of [game, software, film, record, song]) assert.equal(await memberItemExperience(a, ref), '', `${ref.type}: no record, no badge`)
 // Opening the player is not watching; five minutes or a finished episode is.
 await db.cinemaWatchProgress.create({data: {userId: a, ownerType: 'episode', ownerId: episode.id, positionSeconds: 40, durationSeconds: 3000}})
 assert.equal(await memberItemExperience(a, film), '')
 await db.cinemaWatchProgress.update({where: {userId_ownerType_ownerId: {userId: a, ownerType: 'episode', ownerId: episode.id}}, data: {positionSeconds: 0, completedAt: new Date()}})
 assert.equal(await memberItemExperience(a, film), 'WATCH', 'a finished episode counts for its series')
 assert.equal(await memberItemExperience(b, film), '', 'someone else\'s watch does not count')
 await db.cinemaWatchProgress.create({data: {userId: b, ownerType: 'title', ownerId: title.id, positionSeconds: 300, durationSeconds: 6000}})
 assert.equal(await memberItemExperience(b, film), 'WATCH')
 await db.musicListenHistory.create({data: {userId: a, trackId: track.id}})
 assert.equal(await memberItemExperience(a, song), 'LISTEN'); assert.equal(await memberItemExperience(a, record), 'LISTEN', 'a track counts for its album')
 await db.downloadLog.create({data: {ownerType: 'track', ownerId: track.id, userId: a}})
 assert.equal(await memberItemExperience(a, record), 'DOWNLOAD', 'a download outranks a listen')
 await db.contentPurchase.create({data: {userId: a, ownerType: 'album', ownerId: album.id}})
 assert.equal(await memberItemExperience(a, song), 'PURCHASE', 'buying the album covers its tracks')
 await db.contentPurchase.updateMany({where: {userId: a, ownerType: 'album', ownerId: album.id}, data: {revokedAt: new Date()}})
 assert.equal(await memberItemExperience(a, song), 'DOWNLOAD', 'a revoked purchase is not a purchase')
 await db.downloadLog.create({data: {ownerType: 'game', ownerId: game.id, userId: null, visitor: 'anonymous'}})
 assert.equal(await memberItemExperience(a, game), '', 'an anonymous download belongs to nobody')
 assert.equal(await memberItemExperience(a, {type: 'post', id: 1}), ''); assert.equal(await memberItemExperience(0, game), '')

 // --- saving: scores validated per type, badge taken from the record
 await db.downloadLog.create({data: {ownerType: 'game', ownerId: game.id, userId: a}})
 let saved = await reviews.saveReview(a, game, {rating: 5, body: 'a long enough review text', scores: {gameplay: 5, graphics: 4, story: '3', bogus: 5, audio: null, replay: ''}})
 assert.deepEqual(saved, {rating: 5, body: 'a long enough review text', status: 'APPROVED', verified: 'DOWNLOAD', scores: {gameplay: 5, graphics: 4, story: 3}})
 await rejects(reviews.saveReview(b, game, {rating: 4, scores: {gameplay: 6}}), /۱ تا ۵/)
 await rejects(reviews.saveReview(b, game, {rating: 4, scores: {gameplay: 2.5}}), /۱ تا ۵/)
 await rejects(reviews.saveReview(b, game, {rating: 4, scores: [5]}), /معتبر نیست/)
 assert.equal(await db.itemReview.count({where: {userId: b}}), 0, 'a rejected save writes nothing')
 // A software key is not a game key, and the other way round.
 saved = await reviews.saveReview(b, game, {rating: 2, body: 'second review on this game', scores: {gameplay: 1, usability: 5}})
 assert.deepEqual(saved.scores, {gameplay: 1}); assert.equal(saved.verified, '')
 // A client that only knows stars leaves stored scores alone; an empty object clears them.
 saved = await reviews.saveReview(a, game, {rating: 4, body: 'a long enough review text'})
 assert.deepEqual(saved.scores, {gameplay: 5, graphics: 4, story: 3}); assert.equal(saved.rating, 4)
 await reviews.saveReview(c, game, {rating: 3, body: 'third review, no dimensions', scores: {gameplay: 3}})
 assert.deepEqual((await reviews.saveReview(c, game, {rating: 3, body: 'third review, no dimensions', scores: {}})).scores, {})
 await reviews.saveReview(c, game, {rating: 3, body: 'third review, no dimensions', scores: {gameplay: 3, replay: 2}})
 // The badge is kept once earned, although download logs are pruned later.
 await db.downloadLog.deleteMany({where: {userId: a}})
 assert.equal((await reviews.saveReview(a, game, {rating: 4, body: 'edited after the log was pruned'})).verified, 'DOWNLOAD')
 // A rating without text is counted in the averages too.
 await reviews.saveReview(d, game, {rating: 1, scores: {gameplay: 2}})

 // --- item page data
 let page = await reviews.itemEngagement(game, null)
 assert.deepEqual(page.dimensions, [
  {key: 'gameplay', label: 'گیم‌پلی', average: 2.8, count: 4},
  {key: 'graphics', label: 'گرافیک و طراحی هنری', average: 4, count: 1},
  {key: 'story', label: 'داستان و شخصیت‌ها', average: 3, count: 1},
  {key: 'replay', label: 'ارزش تکرار', average: 2, count: 1},
 ], 'averages per dimension in the type\'s order, unscored dimensions left out')
 assert.equal(page.verifiedCount, 1); assert.equal(page.total, 3); assert.equal(page.experience, '')
 assert.deepEqual(page.reviews.map(row => [row.author.name, row.verified, row.scores]), [['c', '', {gameplay: 3, replay: 2}], ['b', '', {gameplay: 1}], ['a', 'DOWNLOAD', {gameplay: 5, graphics: 4, story: 3}]])
 // A rejected review leaves the dimension averages, like it leaves the stars.
 const second = await db.itemReview.findFirstOrThrow({where: {userId: b, itemType: 'game', itemId: game.id}})
 await reviews.moderateReview(second.id, 'reject')
 page = await reviews.itemEngagement(game, null)
 assert.deepEqual(page.dimensions[0], {key: 'gameplay', label: 'گیم‌پلی', average: 3.3, count: 3}); assert.equal(page.summary.count, 3)
 await reviews.moderateReview(second.id, 'approve')
 // Order and filter.
 const order = async (sort, verifiedOnly) => (await reviews.itemEngagement(game, null, 1, {sort, verifiedOnly})).reviews.map(row => row.author.name)
 assert.deepEqual(await order('high'), ['a', 'c', 'b']); assert.deepEqual(await order('low'), ['b', 'c', 'a']); assert.deepEqual(await order('nonsense'), ['c', 'b', 'a'])
 const third = await db.itemReview.findFirstOrThrow({where: {userId: c, itemType: 'game', itemId: game.id}})
 await reviews.setReviewHelpful(a, second.id, true); await reviews.setReviewHelpful(c, second.id, true); await reviews.setReviewHelpful(b, third.id, true)
 assert.deepEqual(await order('helpful'), ['b', 'c', 'a'])
 assert.deepEqual(await order('new', true), ['a'])
 page = await reviews.itemEngagement(game, null, 1, {verifiedOnly: true})
 assert.equal(page.total, 1); assert.equal(page.pages, 1); assert.equal(page.summary.count, 4, 'the filter narrows the list, not the summary')

 // --- the member's own view
 page = await reviews.itemEngagement(game, a, 1, {viewerExperience: true})
 assert.deepEqual(page.mine, {rating: 4, body: 'edited after the log was pruned', status: 'APPROVED', verified: 'DOWNLOAD', scores: {gameplay: 5, graphics: 4, story: 3}}); assert.equal(page.experience, 'DOWNLOAD')
 // Not reviewed yet: the form is told whether the badge would be given.
 assert.equal((await reviews.itemEngagement(software, e, 1, {viewerExperience: true})).experience, '')
 await db.contentPurchase.create({data: {userId: e, ownerType: 'software', ownerId: software.id}})
 assert.equal((await reviews.itemEngagement(software, e, 1, {viewerExperience: true})).experience, 'PURCHASE')
 assert.equal((await reviews.itemEngagement(software, e)).experience, '', 'only asked for by the review form')
 // Reviewed first, used later: the badge arrives on the next look, and that is not an edit.
 const before = await db.itemReview.findFirstOrThrow({where: {userId: b, itemType: 'game', itemId: game.id}})
 await db.downloadLog.create({data: {ownerType: 'game', ownerId: game.id, userId: b}})
 page = await reviews.itemEngagement(game, b)
 assert.equal(page.mine.verified, 'DOWNLOAD'); assert.equal(page.reviews.find(row => row.mine).verified, 'DOWNLOAD')
 const after = await db.itemReview.findFirstOrThrow({where: {id: before.id}})
 assert.equal(after.verified, 'DOWNLOAD'); assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime())
 assert.equal((await reviews.itemEngagement(game, null)).verifiedCount, 2)

 // --- moderation queue and cleanup of scores
 const queue = await reviews.reviewQueue('ALL', 1)
 const mine = queue.reviews.find(row => row.id === third.id)
 assert.deepEqual(mine.scores, [{label: 'گیم‌پلی', score: 3}, {label: 'ارزش تکرار', score: 2}]); assert.equal(mine.verified, '')
 await reviews.deleteReview(c, game)
 assert.equal(await db.itemReviewScore.count({where: {reviewId: third.id}}), 0, 'scores go with their review')
 await assert.rejects(db.itemReviewScore.create({data: {reviewId: second.id, key: 'graphics', score: 9}}), 'the database refuses a score outside 1–5')
 console.log('PostgreSQL verified-experience evidence, per-type dimension scores, averages, badge kept and earned later, order and filter, moderation and cleanup passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.itemReview.deleteMany({where: {userId: {in: ids}}}); await db.itemStat.deleteMany({where: {itemId: {in: [base, base + 1]}, itemType: {in: ['game', 'software']}}})
  await db.downloadLog.deleteMany({where: {OR: [{userId: {in: ids}}, {ownerType: 'game', ownerId: base}]}}); await db.contentPurchase.deleteMany({where: {userId: {in: ids}}})
  await db.cinemaWatchProgress.deleteMany({where: {userId: {in: ids}}})
  await db.musicTrack.deleteMany({where: {slug: {startsWith: seed}}}); await db.musicAlbum.deleteMany({where: {slug: {startsWith: seed}}}); await db.musicArtist.deleteMany({where: {slug: {startsWith: seed}}})
  await db.cinemaTitle.deleteMany({where: {slug: {startsWith: seed}}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
