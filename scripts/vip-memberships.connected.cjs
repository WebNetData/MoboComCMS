// Real PostgreSQL through the real checkout, wallet and fulfilment: prices, trials, upgrades, stacking, coupons, refunds,
// auto-renewal, rules and tier perks. Module switches and outward carriers are declared boundaries.
// VIP_FAULT=trial gives every claim its own key; =refund keeps the period; =renew gives every renewal its own key.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `vip-${Date.now()}`, fault = process.env.VIP_FAULT || '', cache = new Map()
const owned = { users: [], tiers: [], plans: [], promos: [], groups: [] }

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (fault === 'trial' && file.endsWith('server/lifecycle.ts')) source = source.replace('const key = `trial:${userId}:${plan.tierId ? `t${plan.tierId}` : `p${plan.id}`}`', 'const key = `trial:${userId}:${Math.random()}`')
  if (fault === 'refund' && file.endsWith('server/membership.ts')) source = source.replace('where: { orderId, revokedAt: null }, data: { revokedAt: new Date() }', 'where: { orderId: -1, revokedAt: null }, data: { revokedAt: new Date() }')
  if (fault === 'renew' && file.endsWith('server/lifecycle.ts')) source = source.replace('idempotencyKey: `vip-renew-${userId}-${endsAt.getTime()}`', 'idempotencyKey: `vip-renew-${userId}-${endsAt.getTime()}-${Math.random().toString(36).slice(2)}`')
  const mod = { exports: {} }; cache.set(file, mod)
  const req = (name) => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === 'next-auth') return { getServerSession: async () => null }
    if (name === '@/modules/identity/auth') return { authOptions: {} }
    if (name === '@/extensions/server/runtime') return { emitExtensionEvent: async () => {} }
    if (name === '@/modules/sms/server/sms') return { notifyAdmins: async () => {} }
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

  let serial = 0
  const buy = (user, row, extra = {}) => checkout.executeCheckout({ userId: user.id, membershipPlanId: row.id, payWith: 'wallet', idempotencyKey: `${prefix}-order-${++serial}`, siteUrl: 'https://example.invalid', ...extra })
  const bought = async (user, row, extra) => { const result = await buy(user, row, extra); assert.equal(result.ok, true, JSON.stringify(result)); if (!(await db.userMembership.count({ where: { orderId: result.data.orderId } }))) await membership.fulfillMembershipOrder(result.data.orderId); return result }
  const refused = async (user, row, code, extra) => { const result = await buy(user, row, extra); assert.equal(result.ok, false, `${code} expected`); assert.equal(result.code, code); return result }

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
  console.log('VIP memberships: trials, prices, fees, upgrades, stacking, coupons, limits, refunds, renewal, reminders, rules and perks passed')
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const orders = (await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    const notices = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notices) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
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
