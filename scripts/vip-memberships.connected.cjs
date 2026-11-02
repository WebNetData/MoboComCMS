// Real PostgreSQL through the real checkout, wallet and fulfilment: prices, trials, upgrades, stacking, coupons, refunds,
// auto-renewal, rules and tier perks. Module switches and outward carriers are declared boundaries.
// VIP_FAULT=trial gives every claim its own key; =refund keeps the period; =renew gives every renewal its own key;
// =gift lets a used code through; =seat hands out seats without counting them; =leak writes a restricted block's text out.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `vip-${Date.now()}`, fault = process.env.VIP_FAULT || '', cache = new Map()
const owned = { users: [], tiers: [], plans: [], promos: [], groups: [], categories: [], terms: [], posts: [], products: [] }
const mails = []
let viewerId = 0

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (fault === 'trial' && file.endsWith('server/lifecycle.ts')) source = source.replace('const key = `trial:${userId}:${plan.tierId ? `t${plan.tierId}` : `p${plan.id}`}`', 'const key = `trial:${userId}:${Math.random()}`')
  if (fault === 'refund' && file.endsWith('server/membership.ts')) source = source.replace('where: { orderId, revokedAt: null }, data: { revokedAt: now }', 'where: { orderId: -1, revokedAt: null }, data: { revokedAt: now }')
  if (fault === 'renew' && file.endsWith('server/lifecycle.ts')) source = source.replace('idempotencyKey: `vip-renew-${userId}-${endsAt.getTime()}`', 'idempotencyKey: `vip-renew-${userId}-${endsAt.getTime()}-${Math.random().toString(36).slice(2)}`')
  if (fault === 'gift' && file.endsWith('server/extras.ts')) source = source.replace("if (gift.claimedBy && gift.claimedBy !== userId) throw", "if (false) throw").replace("where: { id: gift.id, claimedBy: null, revokedAt: null }", "where: { id: gift.id }")
  if (fault === 'seat' && file.endsWith('server/extras.ts')) source = source.replace('(await db.membershipTeam.updateMany({ where: { id: team.id, used: team.used, closedAt: null }, data: { used: { increment: 1 } } })).count !== 1', 'false').replace('if (team.used >= team.seats) throw', 'if (false) throw')
  if (fault === 'leak' && file.endsWith('domain/render.ts')) source = source.replace("moduleHtml?.(block) ?? restrictedNotice(p.message, p.audience)", "inner()")
  const mod = { exports: {} }; cache.set(file, mod)
  const req = (name) => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/modules/identity/auth') return { authOptions: {} }
    if (name === '@/extensions/server/runtime') return { emitExtensionEvent: async () => {} }
    if (name === '@/modules/sms/server/sms') return { notifyAdmins: async () => {} }
    if (name === '@/modules/imports/server/authority') return { destinationActor: async () => ({}) }
    if (name === '@/modules/mail/server/mailer') return { sendMail: async (mail) => { mails.push(mail); return { ok: true, messageId: 'test' } } }
    if (name === '@/modules/editor/server/blocks/items' || name === '@/modules/editor/server/blocks/source') return {}
    if (name === '@/modules/content/server/registry') return { itemCards: async () => new Map(), latestItemCards: async () => [] }
    if (name === '@/modules/site/server/maintenance') return { closedSectionPlugins: async () => new Set() }
    if (name === 'next-auth') return { getServerSession: async () => (viewerId ? { user: { id: String(viewerId) } } : null) }
    if (name === '@/modules/automation/server/engine') return { emitAutomation: async () => {} }
    if (name === '@/modules/referrals/server/referrals') return { awardReferralForInvoice: async () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleSettings: async () => ({ 'reminder-days': '7,3,1', 'winback-days': 14 }), getModuleStates: async () => ({}) }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.join(path.posix.dirname(file), name)
      for (const candidate of [base, base + '.ts', base + '/index.ts']) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate.endsWith('.json') ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : load(candidate)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText)(req, mod, mod.exports)
  return mod.exports
}

const DAY = 86_400_000
const member = async (key, wallet = 2_000_000n) => {
  const user = await db.user.create({ data: { email: `${prefix}-${key}@example.invalid`, passwordHash: 'test-only' } })
  owned.users.push(user.id)
  if (wallet) await db.walletAccount.create({ data: { userId: user.id, currency: 'IRT', balanceMinor: wallet } })
  return user
}
const balance = async (user) => (await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: user.id, currency: 'IRT' } } })).balanceMinor
const periods = (user) => db.userMembership.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } })
const live = async (user) => (await periods(user)).filter((row) => !row.revokedAt)

async function main() {
  const checkout = load('src/modules/checkout/server/checkout.ts'), membership = load('src/modules/membership/server/membership.ts'), lifecycle = load('src/modules/membership/server/lifecycle.ts')
  const { tierStanding } = load('src/modules/membership/server/tiers.ts'), { ruleRefusal, saveRule } = load('src/modules/membership/server/rules.ts'), { groupDeal } = load('src/modules/account/server/user-groups.ts')
  const { siteGroupsOf } = load('src/modules/account/server/site-groups.ts'), { refundPaidInvoice } = load('src/modules/billing/server/order-closure.ts'), { LIFETIME_END } = load('src/modules/membership/domain/plans.ts')
  const { vipCatalog } = load('src/modules/membership/server/catalog.ts')

  const tier = async (rank, data) => { const row = await db.membershipTier.create({ data: { name: `${prefix} ${rank}`, rank: 50 + rank, ...data } }); owned.tiers.push(row.id); return row }
  const plan = async (slug, data) => { const row = await db.membershipPlan.create({ data: { slug: `${prefix}-${slug}`, name: `${prefix} ${slug}`, days: 30, priceMinor: 30_000n, currency: 'IRT', ...data } }); owned.plans.push(row.id); return row }
  const bronze = await tier(1, { storeDiscountPercent: 10 }), gold = await tier(2, { storeDiscountPercent: 20, freeShipping: true, hideAds: true })
  const pBronze = await plan('bronze', { tierId: bronze.id, trialDays: 7 })
  const pGold = await plan('gold', { tierId: gold.id, priceMinor: 90_000n, signupFeeMinor: 5_000n })
  const pPaidTrial = await plan('paid-trial', { trialDays: 5, trialPriceMinor: 2_000n })
  const pLife = await plan('life', { tierId: gold.id, billing: 'LIFETIME', priceMinor: 500_000n })
  const pFixed = await plan('fixed', { billing: 'FIXED', fixedEndsAt: new Date(Date.now() + 10 * DAY) })
  const pOver = await plan('over', { billing: 'FIXED', fixedEndsAt: new Date(Date.now() - DAY) })
  const pWant = await plan('want', { payWhatYouWant: true, minPriceMinor: 5_000n, priceMinor: 10_000n })
  const pSeat = await plan('seat', { maxMembers: 1 })
  const groupPlan = await plan('group', { tierId: gold.id, seats: 2, priceMinor: 200_000n })
  const pSeatPlan = () => groupPlan
  const approvalPlan = await plan('approval', { requiresApproval: true })
  const approvalTrial = await plan('approval-trial', { requiresApproval: true, trialDays: 3 })

  let serial = 0
  const buy = (user, row, extra = {}) => checkout.executeCheckout({ userId: user.id, membershipPlanId: row.id, payWith: 'wallet', idempotencyKey: `${prefix}-order-${++serial}`, siteUrl: 'https://example.invalid', ...extra })
  const bought = async (user, row, extra) => { const result = await buy(user, row, extra); assert.equal(result.ok, true, JSON.stringify(result)); await membership.fulfillMembershipOrder(result.data.orderId); return result }
  const refused = async (user, row, code, extra) => { const result = await buy(user, row || {}, extra); assert.equal(result.ok, false, `${code} expected`); assert.equal(result.code, code); return result }

  // A free trial once, however the requests race; a paid trial through checkout.
  const ali = await member('ali')
  const claims = await Promise.allSettled([lifecycle.startFreeTrial(ali.id, pBronze.id), lifecycle.startFreeTrial(ali.id, pBronze.id), lifecycle.startFreeTrial(ali.id, pBronze.id)])
  assert.equal(claims.filter((row) => row.status === 'fulfilled').length, 1, 'three racing claims give one trial')
  assert.equal((await periods(ali)).length, 1)
  assert.equal((await periods(ali))[0].kind, 'TRIAL')
  await db.userMembership.updateMany({ where: { userId: ali.id }, data: { endsAt: new Date(Date.now() - 1000) } })
  await assert.rejects(lifecycle.startFreeTrial(ali.id, pBronze.id), /قبلاً/, 'a used trial stays used after it ends')
  const trialBuyer = await member('trial-buyer')
  await refused(trialBuyer, pGold, 'NO_TRIAL', { membershipTrial: true })
  await bought(trialBuyer, pPaidTrial, { membershipTrial: true })
  assert.equal(await balance(trialBuyer), 1_998_000n, 'a paid trial charges the trial price')
  assert.equal((await periods(trialBuyer))[0].kind, 'TRIAL')
  assert.ok((await periods(trialBuyer))[0].endsAt.getTime() <= Date.now() + 5 * DAY + 5000)

  // The price is the server's. A fee on the first purchase only, and never worth anything on an upgrade.
  const sara = await member('sara')
  await refused(sara, pWant, 'OFFER_TOO_LOW', { membershipOffer: '4000' })
  await bought(sara, pWant, { membershipOffer: '7000' })
  assert.equal(await balance(sara), 1_993_000n, 'the offered amount is charged')
  await bought(sara, pGold)
  assert.equal(await balance(sara) < 1_993_000n - 80_000n, true)
  const feeBuyer = await member('fee')
  const first = await bought(feeBuyer, pGold)
  assert.equal(await balance(feeBuyer), 1_905_000n, 'first purchase pays the fee')
  assert.equal((await periods(feeBuyer))[0].amountMinor, 90_000n, 'the fee is not part of the period\'s value')
  await bought(feeBuyer, pGold)
  assert.equal(await balance(feeBuyer), 1_815_000n, 'a renewal does not')
  assert.equal((await live(feeBuyer)).length, 2)
  const [one, two] = await live(feeBuyer)
  assert.equal(two.startsAt.getTime(), one.endsAt.getTime(), 'a renewal queues after the current end')
  assert.equal((await buy(feeBuyer, pGold, { idempotencyKey: `${prefix}-order-${serial}` })).data.orderId, (await db.order.findFirst({ where: { userId: feeBuyer.id }, orderBy: { id: 'desc' } })).id, 'a replay finds the same order')
  assert.equal(await balance(feeBuyer), 1_815_000n, 'and charges nothing')
  assert.ok(first.ok)

  // An upgrade is credited for what is unused, starts now, and swaps periods once.
  const reza = await member('reza')
  await bought(reza, pBronze)
  const held = (await live(reza))[0]
  await db.userMembership.update({ where: { id: held.id }, data: { startsAt: new Date(Date.now() - 15 * DAY), endsAt: new Date(Date.now() + 15 * DAY) } })
  assert.equal((await tierStanding(reza.id)).rank, bronze.rank)
  const before = await balance(reza)
  const upgrade = await bought(reza, pGold)
  const paid = before - await balance(reza)
  assert.ok(paid >= 74_990n && paid <= 75_010n, `90000 less about 15000 credit, charged ${paid}`)
  const after = await live(reza)
  assert.equal(after.length, 1, 'the credited period is gone')
  assert.equal(after[0].planId, pGold.id)
  assert.ok(after[0].startsAt.getTime() > Date.now() - 60_000, 'the new tier starts now')
  assert.equal(after[0].amountMinor, 90_000n, 'worth its full value, credit included')
  await membership.fulfillMembershipOrder(upgrade.data.orderId)
  assert.equal((await live(reza)).length, 1, 'fulfilling again changes nothing')
  assert.equal((await tierStanding(reza.id)).rank, gold.rank)

  // A lower tier waits for the end; the higher one keeps its perks meanwhile.
  await bought(reza, pBronze)
  assert.equal((await tierStanding(reza.id)).rank, gold.rank)
  const queued = (await live(reza)).at(-1)
  assert.equal(queued.startsAt.getTime(), after[0].endsAt.getTime())

  // Perks of the highest tier held, across the store, the ads and the audiences.
  assert.equal((await groupDeal(reza.id, [1])).percent, 20)
  const standing = await tierStanding(reza.id)
  assert.equal(standing.freeShipping, true); assert.equal(standing.hideAds, true)
  assert.deepEqual((await siteGroupsOf(reza.id, [`vip-tier:${bronze.id}`, `vip-tier:${gold.id}`])).sort(), [`vip-tier:${bronze.id}`, `vip-tier:${gold.id}`].sort())
  const bronzeOnly = await member('bronze-only'); await bought(bronzeOnly, pBronze)
  assert.deepEqual(await siteGroupsOf(bronzeOnly.id, [`vip-tier:${bronze.id}`, `vip-tier:${gold.id}`]), [`vip-tier:${bronze.id}`])
  const special = await db.userGroup.create({ data: { name: `${prefix} group`, discountPercent: 30 } }); owned.groups.push(special.id)
  await db.userGroupMember.create({ data: { groupId: special.id, userId: reza.id } })
  assert.equal((await groupDeal(reza.id, [1])).percent, 30, 'the better of a group and a tier')

  // Coupons.
  const promo = await db.promotion.create({ data: { code: `V${Date.now()}`, percentBps: 5000, currency: 'IRT', membershipPlanId: pGold.id, perUserLimit: 5 } }); owned.promos.push(promo.id)
  const coupon = await member('coupon')
  await refused(coupon, pBronze, 'PROMOTION_SCOPE', { discountCode: promo.code })
  await bought(coupon, pGold, { discountCode: promo.code })
  assert.equal(await balance(coupon), 2_000_000n - 47_500n, 'half of price and fee')

  // Limits on sale.
  await bought(await member('seat-one'), pSeat)
  await refused(await member('seat-two'), pSeat, 'PLAN_FULL')
  await refused(sara, pOver, 'PLAN_ENDED')
  const fixedBuyer = await member('fixed'); await bought(fixedBuyer, pFixed)
  assert.equal((await live(fixedBuyer))[0].endsAt.getTime(), pFixed.fixedEndsAt.getTime())
  const lifer = await member('life'); await bought(lifer, pLife)
  assert.equal((await live(lifer))[0].endsAt.getTime(), LIFETIME_END.getTime())
  await refused(lifer, pGold, 'ALREADY_LIFETIME')
  const catalog = await vipCatalog(lifer.id)
  assert.ok(catalog.lifetime); assert.ok(catalog.groups.flatMap((group) => group.plans).find((row) => row.id === pGold.id).offer.refused)

  // A refund takes the membership back.
  const refundee = await member('refund')
  const order = await bought(refundee, pBronze)
  assert.equal(await membership.isMember(refundee.id), true)
  const invoice = await db.invoice.findFirstOrThrow({ where: { orderId: order.data.orderId } })
  const refunded = await refundPaidInvoice(invoice, { totalMinor: invoice.totalMinor ?? 30_000n, walletMinor: invoice.totalMinor ?? 30_000n, by: 'test', actorId: owned.users[0] })
  assert.equal(refunded.ok, true, JSON.stringify(refunded))
  assert.equal(await membership.isMember(refundee.id), false, 'a refunded order leaves no membership')

  // Auto-renewal: once per period end, whatever repeats.
  const auto = await member('auto')
  await bought(auto, pBronze)
  await lifecycle.setAutoRenew(auto.id, true, pBronze.id)
  const end = new Date(Date.now() + 12 * 3_600_000)
  await db.userMembership.updateMany({ where: { userId: auto.id }, data: { endsAt: end } })
  const beforeRenew = await balance(auto)
  // Two runs at once see the same end, as two app instances would: only the key keeps it to one charge.
  await Promise.all([lifecycle.runMembershipLifecycle(), lifecycle.runMembershipLifecycle()])
  await lifecycle.runMembershipLifecycle()
  assert.equal(await db.order.count({ where: { userId: auto.id } }), 2, 'one renewal order')
  assert.equal(beforeRenew - await balance(auto), 30_000n, 'one charge')
  assert.equal((await live(auto)).length, 2)
  // Too little in the wallet: nothing charged, the member is told once.
  const broke = await member('broke', 100n)
  await db.userMembership.create({ data: { userId: broke.id, planId: pBronze.id, endsAt: end } })
  await lifecycle.setAutoRenew(broke.id, true, pBronze.id)
  await lifecycle.runMembershipLifecycle(); await lifecycle.runMembershipLifecycle()
  assert.equal(await db.order.count({ where: { userId: broke.id, status: 'PAID' } }), 0)
  assert.equal(await balance(broke), 100n)
  assert.match((await db.membershipAccount.findUniqueOrThrow({ where: { userId: broke.id } })).renewError, /کیف پول/)
  assert.equal(await db.userNotification.count({ where: { userId: broke.id, dedupeKey: { startsWith: 'membership:renew-failed' } } }), 1)
  // Cancelled: keeps what was paid for, and nothing renews.
  const leaver = await member('leaver')
  await bought(leaver, pBronze)
  await lifecycle.setAutoRenew(leaver.id, true, pBronze.id)
  await lifecycle.cancelMembership(leaver.id, 'گران است')
  await db.userMembership.updateMany({ where: { userId: leaver.id }, data: { endsAt: end } })
  await lifecycle.runMembershipLifecycle()
  assert.equal(await db.order.count({ where: { userId: leaver.id } }), 1, 'a cancelled membership does not renew')
  assert.equal(await membership.isMember(leaver.id), true, 'and stays open to its end')
  // Reminders at the owner's days, once each; the notice at the end; the invitation back.
  const reminded = await member('reminded')
  const soon = new Date(Date.now() + 2.5 * DAY)
  await db.userMembership.create({ data: { userId: reminded.id, endsAt: soon } })
  await lifecycle.runMembershipLifecycle(); await lifecycle.runMembershipLifecycle()
  assert.equal(await db.userNotification.count({ where: { userId: reminded.id, dedupeKey: { startsWith: 'membership:expiring' } } }), 1)
  await db.userMembership.updateMany({ where: { userId: reminded.id }, data: { endsAt: new Date(Date.now() - 3_600_000) } })
  await lifecycle.runMembershipLifecycle()
  assert.equal(await db.userNotification.count({ where: { userId: reminded.id, dedupeKey: { startsWith: 'membership:expired' } } }), 1)
  await db.userMembership.updateMany({ where: { userId: reminded.id }, data: { endsAt: new Date(Date.now() - 15 * DAY) } })
  await lifecycle.runMembershipLifecycle()
  assert.equal(await db.userNotification.count({ where: { userId: reminded.id, dedupeKey: { startsWith: 'membership:winback' } } }), 1)

  // Rules: a tier and a wait, for members; a person VIP through a group passes with no wait.
  const item = 900_000_000 + (Date.now() % 90_000_000)
  const chain = [{ ownerType: 'post', ownerId: item }]
  try {
    await saveRule('post', item, { minRank: gold.rank, dripDays: 0 })
    assert.equal((await ruleRefusal(null, chain)).reason, 'tier')
    assert.equal((await ruleRefusal(bronzeOnly.id, chain)).reason, 'tier')
    assert.equal(await ruleRefusal(reza.id, chain), null)
    await saveRule('post', item, { minRank: 0, dripDays: 10 })
    const waiting = await member('waiting')
    await bought(waiting, pBronze)
    const drip = await ruleRefusal(waiting.id, chain)
    assert.equal(drip.reason, 'drip'); assert.ok(drip.opensAt > new Date())
    await db.userMembership.updateMany({ where: { userId: waiting.id }, data: { startsAt: new Date(Date.now() - 11 * DAY) } })
    assert.equal(await ruleRefusal(waiting.id, chain), null, 'the wait is over')
    const friend = await member('friend')
    const vipGroup = await db.userGroup.create({ data: { name: `${prefix} vip`, vipBenefits: true } }); owned.groups.push(vipGroup.id)
    await db.userGroupMember.create({ data: { groupId: vipGroup.id, userId: friend.id } })
    assert.equal(await ruleRefusal(friend.id, chain), null)
    await saveRule('post', item, { minRank: 0, dripDays: 0 })
    assert.equal(await db.membershipRule.count({ where: { ownerType: 'post', ownerId: item } }), 0, 'an empty rule leaves no row')
  } finally { await db.membershipRule.deleteMany({ where: { ownerType: 'post', ownerId: item } }) }
  // A gift: bought by one person, opened by another, once, whatever races.
  const extras = load('src/modules/membership/server/extras.ts')
  const giver = await member('giver'), friendOne = await member('friend-one'), friendTwo = await member('friend-two')
  const giftOrder = await bought(giver, pBronze, { membershipGift: { email: 'friend@example.invalid', message: 'تولدت مبارک' } }).catch(async () => null)
  assert.ok(!giftOrder || giftOrder.ok)
  const gift = await db.membershipGift.findFirst({ where: { buyerId: giver.id } })
  assert.ok(gift, 'a paid gift order becomes a code')
  assert.equal(await membership.isMember(giver.id), false, 'the buyer gets no membership from it')
  assert.equal(mails.length, 1); assert.ok(mails[0].text.includes(gift.code), 'the recipient is written to')
  await refused(giver, pSeatPlan(), 'GIFT_NOT_FOR_GROUPS', { membershipGift: {} })
  const redeemed = await Promise.allSettled([extras.redeemGift(gift.code, friendOne.id), extras.redeemGift(gift.code, friendTwo.id)])
  assert.equal(redeemed.filter((row) => row.status === 'fulfilled').length, 1, 'one code, one person')
  assert.equal((await membership.isMember(friendOne.id)) !== (await membership.isMember(friendTwo.id)), true)
  await assert.rejects(extras.redeemGift('NOPE-NOPE-NOPE-NOPE', friendOne.id), /معتبر نیست/)
  // Refunding a gift takes it back from whoever opened it.
  const holder = (await membership.isMember(friendOne.id)) ? friendOne : friendTwo
  const giftInvoice = await db.invoice.findFirstOrThrow({ where: { orderId: gift.orderId } })
  assert.equal((await refundPaidInvoice(giftInvoice, { totalMinor: 30_000n, walletMinor: 30_000n, by: 'test', actorId: owned.users[0] })).ok, true)
  assert.equal(await membership.isMember(holder.id), false, 'a refunded gift ends for its holder')
  assert.ok((await db.membershipGift.findUnique({ where: { id: gift.id } })).revokedAt)

  // A group: seats fill to the limit under a race, follow the owner, and free up.
  const owner = await member('owner')
  await bought(owner, groupPlan)
  const team = await db.membershipTeam.findFirst({ where: { ownerId: owner.id } })
  assert.equal(team.seats, 2)
  const people = await Promise.all(['a', 'b', 'c', 'd'].map((key) => member(`seat-${key}`)))
  const joins = await Promise.allSettled(people.map((person) => extras.joinTeam(team.code, person.id)))
  assert.equal(joins.filter((row) => row.status === 'fulfilled').length, 2, 'two seats, two people')
  assert.equal((await db.membershipTeam.findUnique({ where: { id: team.id } })).used, 2)
  await assert.rejects(db.membershipTeam.update({ where: { id: team.id }, data: { used: 3 } }), 'the database refuses more seats than were bought')
  const seated = people.filter((_person, index) => joins[index].status === 'fulfilled'), left = people.find((_person, index) => joins[index].status !== 'fulfilled')
  assert.equal(await membership.isMember(seated[0].id), true)
  assert.equal((await tierStanding(seated[0].id)).rank, gold.rank, 'a seat gives the plan\'s tier')
  await assert.rejects(extras.joinTeam(team.code, owner.id), /مالک/)
  await extras.joinTeam(team.code, seated[0].id)
  assert.equal((await db.membershipTeam.findUnique({ where: { id: team.id } })).used, 2, 'joining again takes no second seat')
  await bought(owner, groupPlan)
  const renewedEnd = (await db.membershipTeam.findUnique({ where: { id: team.id } })).endsAt
  assert.equal((await live(seated[0]))[0].endsAt.getTime(), renewedEnd.getTime(), 'a renewal carries the seats on')
  assert.equal(await db.membershipTeam.count({ where: { ownerId: owner.id } }), 1, 'and opens no second group')
  await extras.removeTeamMember(owner.id, team.id, seated[0].id)
  assert.equal(await membership.isMember(seated[0].id), false, 'removed, the seat ends now')
  await extras.joinTeam(team.code, left.id)
  assert.equal(await membership.isMember(left.id), true, 'and can be given again')
  await assert.rejects(extras.removeTeamMember(friendOne.id, team.id, left.id), /نیست/, 'only the owner removes')
  const oldCode = team.code
  await extras.rotateTeamCode(owner.id, team.id)
  await assert.rejects(extras.joinTeam(oldCode, friendOne.id), /معتبر نیست/, 'a rotated invite stops working')
  for (const order of await db.order.findMany({ where: { userId: owner.id } })) await refundPaidInvoice(await db.invoice.findFirstOrThrow({ where: { orderId: order.id } }), { totalMinor: order.totalMinor, walletMinor: order.totalMinor, by: 'test', actorId: owned.users[0] })
  assert.equal(await membership.isMember(left.id), false, 'the owner refunded, the seats end')
  assert.ok((await db.membershipTeam.findUnique({ where: { id: team.id } })).closedAt)

  // Approval: paid first, active only on the team's yes; a no refunds to the wallet.
  const applicant = await member('applicant'), staff = { id: owned.users[0], email: 'staff@example.invalid' }
  const applied = await bought(applicant, approvalPlan).catch(async () => null)
  assert.equal(await membership.isMember(applicant.id), false, 'paid, not yet active')
  const application = await db.membershipApplication.findFirstOrThrow({ where: { userId: applicant.id } })
  assert.equal(application.status, 'PENDING'); assert.ok(!applied || applied.ok)
  await extras.decideApplication(application.id, 'APPROVED', staff, '')
  assert.equal(await membership.isMember(applicant.id), true, 'approved, it starts')
  await assert.rejects(extras.decideApplication(application.id, 'REJECTED', staff, ''), /قبلاً/, 'decided once')
  const declined = await member('declined')
  const beforeApply = await balance(declined)
  await bought(declined, approvalPlan).catch(async () => null)
  const refusedApp = await db.membershipApplication.findFirstOrThrow({ where: { userId: declined.id } })
  await extras.decideApplication(refusedApp.id, 'REJECTED', staff, 'مدارک کامل نیست')
  assert.equal(await balance(declined), beforeApply, 'refused, the money is back')
  assert.equal(await membership.isMember(declined.id), false)
  const freeApplicant = await member('free-applicant')
  await lifecycle.startFreeTrial(freeApplicant.id, approvalTrial.id)
  assert.equal(await membership.isMember(freeApplicant.id), false, 'a free trial waits too')
  await extras.decideApplication((await db.membershipApplication.findFirstOrThrow({ where: { userId: freeApplicant.id } })).id, 'APPROVED', staff, '')
  assert.equal((await live(freeApplicant))[0].kind, 'TRIAL')

  // A rule on a whole category holds for what is filed under it and under its children.
  const parent = await db.postCategory.create({ data: { name: `${prefix} parent`, slug: `${prefix}-parent` } }); owned.categories.push(parent.id)
  const child = await db.postCategory.create({ data: { name: `${prefix} child`, slug: `${prefix}-child`, parentId: parent.id } }); owned.categories.unshift(child.id)
  const post = await db.post.create({ data: { title: prefix, slug: prefix, content: 'x', categoryId: child.id } }); owned.posts.push(post.id)
  const free = await db.post.create({ data: { title: `${prefix} free`, slug: `${prefix}-free`, content: 'x' } }); owned.posts.push(free.id)
  const catalogue = await db.productCategory.create({ data: { name: `${prefix} store`, slug: `${prefix}-store` } })
  const product = await db.product.create({ data: { slug: prefix, name: prefix, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 10, active: true, approval: 'APPROVED', categoryId: catalogue.id } }); owned.products.push(product.id)
  const term = await db.taxonomyTerm.create({ data: { taxonomy: 'games', slug: prefix, name: prefix } }); owned.terms.push(term.id)
  const game = 1_900_000_000 + (Date.now() % 1000)
  await db.taxonomyAssignment.create({ data: { termId: term.id, ownerId: game, taxonomy: 'games' } })
  try {
    await saveRule('cat:post', parent.id, { minRank: gold.rank })
    await saveRule('cat:product', catalogue.id, { minRank: gold.rank })
    await saveRule('cat:games', term.id, { dripDays: 400 })
    const { hasRule } = load('src/modules/membership/server/rules.ts')
    assert.equal(await hasRule([{ ownerType: 'post', ownerId: post.id }]), true, 'the parent\'s rule reaches a child\'s post')
    assert.equal(await hasRule([{ ownerType: 'post', ownerId: free.id }]), false)
    assert.equal((await ruleRefusal(bronzeOnly.id, [{ ownerType: 'post', ownerId: post.id }])).reason, 'tier')
    assert.equal(await ruleRefusal(reza.id, [{ ownerType: 'post', ownerId: post.id }]), null)
    assert.equal((await ruleRefusal(reza.id, [{ ownerType: 'game', ownerId: game }])).reason, 'drip')
    await refused(bronzeOnly, null, 'MEMBERS_ONLY', { membershipPlanId: null, productId: product.id })
    assert.equal((await db.order.count({ where: { userId: bronzeOnly.id, productId: product.id } })), 0)
  } finally { await db.membershipRule.deleteMany({ where: { ownerType: { startsWith: 'cat:' }, ownerId: { in: [parent.id, catalogue.id, term.id] } } }); await db.product.deleteMany({ where: { id: product.id } }); await db.productCategory.deleteMany({ where: { id: catalogue.id } }) }

  // The restricted block: its text reaches only the reader it opens to, and no stored or derived form.
  const { publicDocumentHtml } = load('src/modules/editor/server/blocks/render.ts')
  const { documentHtml, documentFacts } = load('src/modules/editor/domain/render.ts')
  const { createRegistry } = load('src/modules/editor/domain/core-blocks.ts')
  const registry = createRegistry()
  const secret = 'SECRETWORD'
  const text = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: secret }] }] }
  const doc = { version: 1, blocks: [{ id: 'a', type: 'content.restricted', version: 1, props: { audience: 'vip', minRank: gold.rank, message: 'فقط طلایی' }, children: [{ id: 'b', type: 'content.richText', version: 2, props: { content: text, dir: 'auto' } }] }] }
  assert.equal(documentHtml(doc, registry).includes(secret), false, 'saved HTML holds only the notice')
  assert.equal(documentFacts(doc, registry).text.includes(secret), false, 'search and descriptions do not read it')
  const seen = async (id) => { viewerId = id; return publicDocumentHtml(doc, registry) }
  assert.equal((await seen(0)).includes(secret), false, 'a guest does not read it')
  assert.equal((await seen(bronzeOnly.id)).includes(secret), false, 'nor a lower tier')
  assert.equal((await seen(reza.id)).includes(secret), true, 'the tier reads it')
  assert.ok((await seen(0)).includes('فقط طلایی'), 'the others are told')
  viewerId = 0
  assert.equal((await publicDocumentHtml(doc, registry, true)).includes(secret), true, 'staff preview shows it')

  // Members move in from a file: previewed, written once, and taken back by the import's own undo.
  const { vipMembersImporter: importer } = load('src/modules/imports/server/adapters/vip-members.ts')
  const importActor = await db.user.create({ data: { email: `${prefix}-importer@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } }); owned.users.push(importActor.id)
  const moved = await member('moved', 0n), context = () => ({ cache: new Map(), settings: { adapter: 'vip-members', existing: 'skip', options: {} }, dryRun: false, jobId: null, actor: { id: importActor.id, email: importActor.email }, allow: (values) => values, previewLines: () => [] })
  const row = (values, index = 0) => importer.plan({ index, rows: [index + 2], values }, values, [], context())
  const unknown = await row({ user: `nobody-${prefix}@example.invalid`, plan: pBronze.slug })
  assert.equal(unknown.action, 'FAIL'); assert.match(unknown.messages[0].text, /کاربری/)
  assert.equal((await row({ user: moved.email, plan: 'no-such-plan' })).action, 'FAIL')
  assert.equal((await row({ user: moved.email })).action, 'FAIL', 'a row needs a plan or a length')
  const plannedRow = await row({ user: moved.email, plan: pBronze.slug, days: 45, note: 'از سایت قبلی' })
  assert.equal(plannedRow.action, 'CREATE')
  assert.equal(await db.userMembership.count({ where: { userId: moved.id } }), 0, 'planning writes nothing')
  const written = await importer.apply({}, plannedRow, { ...context(), dryRun: true })
  assert.equal((await live(moved))[0].source, 'ADMIN')
  assert.equal((await tierStanding(moved.id)).rank, bronze.rank)
  assert.equal((await row({ user: moved.email, plan: pBronze.slug, days: 45 })).action, 'SKIP', 'the same row twice adds no days')
  assert.equal((await importer.rollback(written.changes, { ...context(), dryRun: true })).undone, 1)
  assert.equal(await membership.isMember(moved.id), false, 'undoing the import ends the period')

  console.log('VIP memberships: trials, prices, fees, upgrades, stacking, coupons, limits, refunds, renewal, reminders, rules and perks passed')
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const orders = (await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    const notices = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notices) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
    await db.membershipTeam.deleteMany({ where: { ownerId: { in: ids } } })
    await db.membershipGift.deleteMany({ where: { buyerId: { in: ids } } })
    await db.membershipApplication.deleteMany({ where: { userId: { in: ids } } })
    await db.post.deleteMany({ where: { id: { in: owned.posts } } })
    for (const id of owned.categories) await db.postCategory.deleteMany({ where: { id } })
    await db.taxonomyAssignment.deleteMany({ where: { termId: { in: owned.terms } } })
    await db.taxonomyTerm.deleteMany({ where: { id: { in: owned.terms } } })
    await db.product.deleteMany({ where: { id: { in: owned.products } } })
    await db.promotionRedemption.deleteMany({ where: { orderId: { in: orders } } })
    await db.promotion.deleteMany({ where: { id: { in: owned.promos } } })
    await db.fulfillmentJob.deleteMany({ where: { orderId: { in: orders } } })
    await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } }).catch(() => undefined)
    await db.payment.deleteMany({ where: { userId: { in: ids } } })
    await db.walletTx.deleteMany({ where: { userId: { in: ids } } })
    await db.invoice.deleteMany({ where: { userId: { in: ids } } })
    await db.order.deleteMany({ where: { id: { in: orders } } })
    await db.userMembership.deleteMany({ where: { userId: { in: ids } } })
    await db.userGroup.deleteMany({ where: { id: { in: owned.groups } } })
    await db.membershipPlan.deleteMany({ where: { id: { in: owned.plans } } })
    await db.membershipTier.deleteMany({ where: { id: { in: owned.tiers } } })
    await db.walletAccount.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await db.$disconnect() }
})
