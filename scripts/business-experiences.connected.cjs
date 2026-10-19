// Real PostgreSQL storage/eligibility/history checks. Auth/HTTP/browser are separate gates.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), stamp = `owned-business-${Date.now()}`, cache = new Map()
const users = [], profiles = [], orders = [], sellers = []
const mocks = {
  '@/platform/database/prisma': { db },
  '@/platform/http/rate-limit': { rateLimitHit: () => ({ ok: true }) },
  '@/platform/observability/logger': { logEvent: () => {} },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, getModuleSettings: async () => ({ 'moderate-text': true }) },
  '@/modules/notifications/server/inbox': { createInboxEvent: async () => ({}) },
  '@/modules/content/server/registry': { itemCard: async () => null, itemCards: async () => new Map() },
}
function load(relative) {
  const file = path.resolve(relative)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    // Load the real existing SellerReview owner without unrelated marketplace services.
    if (name === '@/modules/marketplace/server/marketplace') return load('src/modules/marketplace/server/marketplace/reviews.ts')
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const tx = work => db.$transaction(work, { isolationLevel: 'Serializable' })
async function main() {
  const reviews = load('src/modules/reviews/server/business-experiences.ts')
  const generic = load('src/modules/reviews/server/reviews.ts')
  const owner = load('src/modules/businesses/server/queries.ts')
  try {
    for (const suffix of ['buyer', 'representative', 'other']) users.push(await db.user.create({ data: { email: `${stamp}-${suffix}@example.invalid`, passwordHash: 'owned fixture', name: suffix } }))
    const [buyer, representative, other] = users
    const external = await db.businessProfile.create({ data: { name: stamp, slug: stamp, kind: 'EXTERNAL', domain: `${stamp}.example`, website: `https://${stamp}.example`, status: 'PUBLISHED', representativeId: representative.id } }); profiles.push(external)
    const input = { rating: 4, body: 'A real sufficiently detailed buying experience.', experiencedOn: '2026-01-01', scores: { support: 4 }, verified: 'PURCHASE' }
    let result = await tx(t => reviews.writeBusinessExperience(t, buyer.id, external, input, true))
    assert.equal(result.status, 'PENDING'); assert.equal(result.verified, '', 'client cannot claim external purchase evidence')
    const reviewId = result.reviewId
    const stat = () => db.itemStat.findUniqueOrThrow({ where: { itemType_itemId: { itemType: 'business', itemId: external.id } } })
    assert.equal((await stat()).ratingCount, 0, 'pending business stars excluded')
    await assert.rejects(generic.moderateReview(reviewId, 'approve'), error => error.status === 403, 'generic review permission cannot moderate business')
    // The general queue neither lists nor counts what it may not decide; the owner's queue has it, oldest first, with the business named.
    const generalPending = await db.itemReview.count({ where: { status: 'PENDING', itemType: { not: 'business' } } })
    const overview = await generic.waitingForModeration(500)
    assert.equal(overview.count, generalPending); assert.ok(!overview.items.some(item => item.id === reviewId), 'general overview lists no business experience')
    for (const status of ['PENDING', 'ALL']) {
      const first = await generic.reviewQueue(status, 1)
      assert.equal(first.pending, generalPending, 'general pending badge excludes business')
      for (let page = 1; page <= first.pages; page += 1) assert.ok(!(await generic.reviewQueue(status, page)).reviews.some(row => row.id === reviewId || row.item.key.startsWith('business:')), 'general list offers no business experience')
    }
    const waiting = await owner.waitingForModeration(500)
    const mine = waiting.items.find(item => item.id === reviewId)
    assert.deepEqual([mine?.about, mine?.by, mine?.text], [external.name, 'buyer', input.body], 'owner queue names the business, the member and the text')
    const earlier = (await tx(t => reviews.writeBusinessExperience(t, other.id, external, input, true))).reviewId
    try {
      await db.itemReview.update({ where: { id: earlier }, data: { createdAt: new Date('2000-01-01T00:00:00.000Z') } })
      const ordered = (await owner.waitingForModeration(500)).items.map(item => item.id)
      assert.equal(ordered[0], earlier, 'the longest wait is first'); assert.ok(ordered.indexOf(earlier) < ordered.indexOf(reviewId), 'oldest first')
    } finally { await db.itemReview.delete({ where: { id: earlier } }) }
    const ownedPending = () => db.itemReview.count({ where: { status: 'PENDING', itemType: 'business' } })
    assert.ok(waiting.count >= await ownedPending() && waiting.count >= 1)
    assert.equal((await owner.waitingForModeration(1)).items.length, 1, 'the overview takes only what it shows')
    await tx(t => reviews.moderateBusinessExperience(t, external, reviewId, 'approve'))
    assert.equal((await stat()).ratingCount, 1); assert.equal((await stat()).ratingSum, 4)
    assert.ok(!(await owner.waitingForModeration(500)).items.some(item => item.id === reviewId), 'a decided experience leaves the owner queue')
    await assert.rejects(tx(t => reviews.replyToBusinessExperience(t, external, other.id, reviewId, 'An unauthorized response')), error => error.status === 403)
    await tx(t => reviews.replyToBusinessExperience(t, external, representative.id, reviewId, 'A considered business response'))
    await db.itemReviewHelpful.create({ data: { reviewId, userId: other.id } })
    const before = await db.itemReview.findUniqueOrThrow({ where: { id: reviewId }, include: { helpfulVotes: true, scores: true } })
    result = await tx(t => reviews.writeBusinessExperience(t, buyer.id, external, input, true))
    assert.equal(result.status, 'APPROVED', 'identical retry preserves moderation')
    let after = await db.itemReview.findUniqueOrThrow({ where: { id: reviewId }, include: { helpfulVotes: true, scores: true } })
    assert.equal(after.businessReply, before.businessReply); assert.deepEqual(after.helpfulVotes, before.helpfulVotes)
    await tx(t => reviews.writeBusinessExperience(t, buyer.id, external, { ...input, scores: { support: 2 } }, true))
    after = await db.itemReview.findUniqueOrThrow({ where: { id: reviewId }, include: { helpfulVotes: true } })
    assert.equal(after.status, 'PENDING', 'score-only edit must be reviewed'); assert.equal(after.businessReply, ''); assert.equal(after.helpfulVotes.length, 0)
    assert.equal((await stat()).ratingCount, 0)
    await tx(t => reviews.moderateBusinessExperience(t, external, reviewId, 'approve'))
    await tx(t => reviews.writeBusinessExperience(t, buyer.id, external, { rating: input.rating, body: input.body }, true))
    after = await db.itemReview.findUniqueOrThrow({ where: { id: reviewId }, include: { scores: true } })
    assert.equal(after.status, 'APPROVED'); assert.equal(after.scores[0].score, 2); assert.equal(after.experiencedOn.toISOString().slice(0, 10), '2026-01-01', 'omitted fields retained')
    await assert.rejects(tx(async t => { await reviews.writeBusinessExperience(t, buyer.id, external, { ...input, rating: 1 }, true); throw Error('owned rollback'); }), /owned rollback/)
    assert.equal((await stat()).ratingSum, 4, 'transaction failure rolls back aggregate and review')
    const second = await db.businessProfile.create({ data: { name: `${stamp}-second`, slug: `${stamp}-second`, kind: 'EXTERNAL', domain: `${stamp}-second.example`, website: `https://${stamp}-second.example`, status: 'PUBLISHED', representativeId: representative.id } }); profiles.push(second)
    await assert.rejects(tx(t => reviews.replyToBusinessExperience(t, second, representative.id, reviewId, 'Response crossing profile boundary')), error => error.status === 404)
    await assert.rejects(db.businessProfile.create({ data: { name: 'Duplicate', slug: `${stamp}-duplicate`, domain: external.domain, website: external.website } }), error => error.code === 'P2002')
    // Paid+delivered rows are isolated fixtures, not real provider transactions.
    const seller = await db.seller.create({ data: { userId: representative.id, slug: stamp, shopName: stamp, status: 'ACTIVE' } }); sellers.push(seller)
    async function order() {
      const row = await db.order.create({ data: { userId: buyer.id, totalAmount: 1, totalMinor: 100n, currency: 'USD', status: 'PAID' } }); orders.push(row)
      await db.orderLine.create({ data: { orderId: row.id, sellerId: seller.id, name: stamp, unitPriceMinor: 100n, totalMinor: 100n, currency: 'USD' } })
      await db.productDelivery.create({ data: { orderId: row.id, status: 'DELIVERED', deliveredAt: new Date() } })
      return row
    }
    const legacyOrder = await order(), eligibleOrder = await order()
    const legacy = await db.sellerReview.create({ data: { sellerId: seller.id, userId: buyer.id, orderId: legacyOrder.id, rating: 5, body: 'Original seller review retained', reply: 'Original reply retained', status: 'APPROVED' } })
    const business = await db.businessProfile.create({ data: { name: stamp, slug: `${stamp}-seller`, kind: 'SELLER', sellerId: seller.id, status: 'PUBLISHED' } }); profiles.push(business)
    await tx(t => reviews.refreshBusinessRating(t, business))
    await assert.rejects(tx(t => reviews.writeBusinessExperience(t, other.id, business, { ...input, orderId: eligibleOrder.id }, true)), error => error.status === 403)
    await tx(t => reviews.writeBusinessExperience(t, buyer.id, business, { ...input, orderId: eligibleOrder.id }, true))
    assert.equal(await db.itemReview.count({ where: { itemType: 'business', itemId: business.id } }), 0, 'no duplicate seller review store')
    assert.deepEqual(await db.sellerReview.findUniqueOrThrow({ where: { id: legacy.id } }), legacy, 'historical seller review untouched')
    const pending = await db.sellerReview.findUniqueOrThrow({ where: { orderId_sellerId: { sellerId: seller.id, orderId: eligibleOrder.id } } })
    const withSeller = await owner.waitingForModeration(500)
    assert.equal(withSeller.count, await db.itemReview.count({ where: { status: 'PENDING', itemType: 'business' } }) + await db.sellerReview.count({ where: { status: 'PENDING', sellerId: { in: (await db.businessProfile.findMany({ where: { sellerId: { not: null } }, select: { sellerId: true } })).map(row => row.sellerId) } } }) + await db.businessRequest.count({ where: { status: 'PENDING' } }), 'waiting seller experiences and business requests are counted with their owner without mixing row ids')
    assert.ok(!withSeller.items.some(item => item.id === pending.id && item.about === business.name), 'seller rows keep their own ids and are listed on the owning page')
    assert.equal(pending.status, 'PENDING'); assert.equal((await db.seller.findUniqueOrThrow({ where: { id: seller.id } })).ratingCount, 1)
    await assert.rejects(tx(t => reviews.writeBusinessExperience(t, buyer.id, business, { ...input, orderId: eligibleOrder.id }, true)), error => error.status === 409)
    await tx(t => reviews.moderateBusinessExperience(t, business, pending.id, 'approve'))
    assert.equal((await db.seller.findUniqueOrThrow({ where: { id: seller.id } })).ratingSum, 9)
    await assert.rejects(tx(t => reviews.replyToBusinessExperience(t, business, other.id, pending.id, 'Wrong seller reply')), error => error.status === 403)
    await tx(t => reviews.replyToBusinessExperience(t, business, representative.id, pending.id, 'Canonical seller response'))
    assert.equal((await db.sellerReview.findUniqueOrThrow({ where: { id: pending.id } })).reply, 'Canonical seller response')
    // SITE uniqueness is database-enforced; use the existing row if the fixture already has one.
    const existingSite = await db.businessProfile.findFirst({ where: { kind: 'SITE' } })
    const site = existingSite || await db.businessProfile.create({ data: { name: stamp, slug: `${stamp}-site`, kind: 'SITE', status: 'PUBLISHED' } })
    if (!existingSite) profiles.push(site)
    result = await tx(t => reviews.writeBusinessExperience(t, buyer.id, site, input, true)); assert.equal(result.verified, 'PURCHASE')
    result = await tx(t => reviews.writeBusinessExperience(t, other.id, site, input, true)); assert.equal(result.verified, '', 'another buyer cannot borrow evidence')
    if (existingSite) { await db.itemReview.deleteMany({ where: { itemType: 'business', itemId: site.id, userId: { in: users.map(u => u.id) } } }); await tx(t => reviews.refreshBusinessRating(t, site)) }
    result = await tx(t => reviews.writeBusinessExperience(t, buyer.id, external, input, true)); assert.equal(result.verified, '', 'own MoboCom purchase does not verify external business')
    console.log('Business storage: owner-only moderation queue/moderation/retries/scores/history/reply boundaries/rollback/uniqueness/external evidence/SITE evidence/canonical seller ownership passed')
  } finally {
    const ids = profiles.map(p => p.id), userIds = users.map(u => u.id)
    try {
      await db.itemReview.deleteMany({ where: { itemType: 'business', userId: { in: userIds } } })
      await db.itemStat.deleteMany({ where: { itemType: 'business', itemId: { in: ids } } })
      await db.businessProfile.deleteMany({ where: { id: { in: ids }, slug: { startsWith: stamp } } })
      await db.sellerReview.deleteMany({ where: { sellerId: { in: sellers.map(s => s.id) } } })
      await db.order.deleteMany({ where: { id: { in: orders.map(o => o.id) }, userId: { in: userIds } } })
      await db.seller.deleteMany({ where: { id: { in: sellers.map(s => s.id) }, slug: stamp } })
      await db.user.deleteMany({ where: { id: { in: userIds }, email: { startsWith: stamp } } })
    } finally { await db.$disconnect() }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
