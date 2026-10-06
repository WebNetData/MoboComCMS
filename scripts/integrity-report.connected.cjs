// Real PostgreSQL: one planted record per finding of scripts/integrity-report.cjs, each with a healthy twin that must not be
// reported. The report runs on a client that refuses every write, so "read-only" is checked, not assumed.
const assert = require('node:assert/strict'), {PrismaClient} = require('@prisma/client'), {findings} = require('./integrity-report.cjs')
const prisma = new PrismaClient(), seed = `integrity-${Date.now()}`
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', '$executeRaw', '$executeRawUnsafe', '$transaction'])
const readOnly = new Proxy(prisma, {get: (target, key) => {
 if (WRITES.has(key)) throw new Error(`the report tried to write: ${String(key)}`)
 const value = target[key]
 if (value && typeof value === 'object' && typeof key === 'string' && !key.startsWith('$') && !key.startsWith('_')) return new Proxy(value, {get: (model, method) => { if (WRITES.has(method)) return () => { throw new Error(`the report tried to write: ${key}.${String(method)}`) }; return typeof model[method] === 'function' ? model[method].bind(model) : model[method] }})
 return typeof value === 'function' ? value.bind(target) : value
}})
let count = 0
const old = new Date(Date.now() - 60 * 60_000)
async function main() {
 const user = name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})
 const [buyer, friend, referrer] = [await user('buyer'), await user('friend'), await user('referrer')]
 const panel = await prisma.panel.create({data: {name: seed, url: 'https://panel.invalid', type: 'REMNAWAVE', token: 'test-only'}})
 const plan = await prisma.plan.create({data: {name: seed, trafficGB: 50, days: 30, price: 1000, priceMinor: 1000n, currency: 'IRT', panelId: panel.id}})
 const seller = await prisma.seller.create({data: {userId: friend.id, slug: seed, shopName: seed, status: 'ACTIVE'}})
 const product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED', vipGiftDays: 30, sellerId: seller.id}})
 const order = (data = {}) => prisma.order.create({data: {userId: buyer.id, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', idempotencyKey: `${seed}-${count++}`, status: 'PAID', provider: 'wallet', createdAt: old, ...data}})
 const invoice = (row, data = {}) => prisma.invoice.create({data: {number: `${seed}-${count++}`, userId: buyer.id, orderId: row?.id ?? null, status: 'PAID', kind: 'BILLING', total: 1000, totalMinor: 1000n, currency: 'IRT', paidAt: old, ...data}})
 const refund = (row, amount, data = {}) => prisma.returnRequest.create({data: {number: `${seed}-${count++}`, orderId: row.id, userId: buyer.id, kind: 'RETURN', status: 'REFUNDED', refundMinor: BigInt(amount), refundedAt: old, walletTxId: 1, ...data}})
 const done = key => prisma.walletTx.create({data: {userId: buyer.id, amount: 1, amountMinor: 1n, balanceAfter: 1, balanceAfterMinor: 1n, currency: 'IRT', type: 'TEST', status: 'DONE', idempotencyKey: key}})

 // 1 and 2: refunds
 const over = await order(), fine = await order()
 await refund(over, 700); await refund(over, 600); await refund(fine, 400); await refund(fine, 600)
 const uncredited = await refund(await order(), 500, {walletTxId: null})
 // 3 and 4: gift cards
 const card = (data = {}) => prisma.giftCard.create({data: {codeHash: `${seed}-${count++}`, last4: '0000', amountMinor: 5000n, ...data}})
 const twin1 = await card({note: `buy:${buyer.id}:${seed}-dup`}), twin2 = await card({note: `buy:${buyer.id}:${seed}-dup`}); await card({note: `buy:${buyer.id}:${seed}-single`})
 const usedUnpaid = await card({status: 'REDEEMED', redeemedBy: buyer.id, redeemedAt: old}), usedPaid = await card({status: 'REDEEMED', redeemedBy: buyer.id, redeemedAt: old})
 await done(`gift-card:redeem:${usedPaid.id}`)
 // 5: referral (the referred account bought; a second attribution whose account never bought)
 await invoice(await order())
 const owed = await prisma.referralAttribution.create({data: {referredUserId: buyer.id, referrerUserId: referrer.id, code: 'T', rewardBps: 500}})
 await prisma.referralAttribution.create({data: {referredUserId: friend.id, referrerUserId: referrer.id, code: 'T', rewardBps: 500}})
 // 6, 8 and 13: a delivered seller line with gift days: no ledger sale, no gift period; and its paid invoice has no job
 const delivered = await order({productId: product.id, lines: {create: [{name: 'item', productId: product.id, sellerId: seller.id, quantity: 1, unitPriceMinor: 1000n, totalMinor: 1000n, createdAt: old}]}})
 await prisma.productDelivery.create({data: {orderId: delivered.id}})
 const unqueued = await invoice(delivered, {productId: product.id})
 const healthy = await order({productId: product.id, lines: {create: [{name: 'item', productId: product.id, sellerId: seller.id, quantity: 1, unitPriceMinor: 1000n, totalMinor: 1000n, createdAt: old}]}})
 await prisma.productDelivery.create({data: {orderId: healthy.id}}); await invoice(healthy, {productId: product.id})
 const healthyLine = await prisma.orderLine.findFirstOrThrow({where: {orderId: healthy.id}}), lostLine = await prisma.orderLine.findFirstOrThrow({where: {orderId: delivered.id}})
 await prisma.sellerLedger.create({data: {sellerId: seller.id, kind: 'SALE', amountMinor: 1000n, dedupeKey: `sale:line:${healthyLine.id}`}})
 await prisma.userMembership.create({data: {userId: buyer.id, source: 'GIFT', orderId: healthy.id, dedupeKey: `gift:order:${healthy.id}`, startsAt: old, endsAt: new Date(Date.now() + 86_400_000)}})
 await prisma.fulfillmentJob.create({data: {kind: 'DELIVER_PRODUCT', dedupeKey: `DELIVER_PRODUCT:order:${healthy.id}`, status: 'DONE', orderId: healthy.id}})
 // 7: payouts
 await prisma.sellerPayout.createMany({data: [{sellerId: seller.id, amountMinor: 800n}, {sellerId: seller.id, amountMinor: 900n}]})
 // 9: void invoice holding credit (and one that does not)
 const voidHeld = await invoice(null, {status: 'VOID', walletApplied: 300, walletAppliedMinor: 300n}); await invoice(null, {status: 'VOID'})
 await prisma.invoice.update({where: {id: voidHeld.id}, data: {updatedAt: old}})
 // 10: pending wallet renewals, one charged
 const pendingCharged = await order({status: 'PENDING', planId: plan.id, idempotencyKey: `renew:1:${seed}-charged`}), pendingFree = await order({status: 'PENDING', planId: plan.id, idempotencyKey: `renew:1:${seed}-free`})
 await done(`renew-wallet:1:${seed}-charged`)
 // 11: a reseller sale whose account is owned by the reseller, and one owned by its customer
 const sale = owner => order({userId: referrer.id, planId: plan.id, meta: JSON.stringify({kind: 'reseller', resellerId: 9, customerUserId: friend.id})}).then(async row => { await prisma.subscription.create({data: {userId: owner.id, planId: plan.id, orderId: row.id, username: `${seed}-${count}`, expiresAt: new Date(Date.now() + 86_400_000), subToken: `${seed}-${count++}`, status: 'ACTIVE'}}); return row })
 const wrongOwner = await sale(referrer); await sale(friend)
 // 12: club points taken, one without credit or undo
 const points = key => prisma.loyaltyEntry.create({data: {userId: buyer.id, points: -100, kind: 'REDEEM', idempotencyKey: `${seed}:${key}`, createdAt: old}})
 const taken = await points('lost'), paidPoints = await points('paid'), undonePoints = await points('undone')
 await done(`loyalty:redeem:${paidPoints.id}`); await prisma.loyaltyEntry.create({data: {userId: buyer.id, points: 100, kind: 'ADMIN', idempotencyKey: `redeem-undo:${undonePoints.id}`}})

 // 14: a paid order that found the code shelf empty; its twin was delivered since
 const waitingCode = await order({status: 'PAID'}), servedCode = await order({status: 'PAID'})
 await prisma.productDelivery.create({data: {orderId: waitingCode.id}}); await prisma.productDelivery.create({data: {orderId: servedCode.id, status: 'DELIVERED', deliveredAt: new Date()}})
 for (const row of [waitingCode, servedCode]) await prisma.orderEvent.create({data: {orderId: row.id, status: 'CODES_SHORT', note: 'x', visible: false}})

 const result = Object.fromEntries((await findings(readOnly)).map(row => [row.key, row]))
 const has = (key, test) => result[key].sample.concat([]).some(test) || (() => { throw new Error(`${key}: planted record not reported: ${JSON.stringify(result[key].sample.slice(0, 3))}`) })()
 const lacks = (key, test, why) => assert.ok(!result[key].sample.some(test), `${key}: ${why}`)
 assert.equal(Object.keys(result).length, 14)
 has('codes-waiting', row => row.orderId === waitingCode.id); lacks('codes-waiting', row => row.orderId === servedCode.id, 'an order delivered since is not waiting')
 has('order-over-refunded', row => row.orderId === over.id && row.refunded === '1300' && row.total === '1000'); lacks('order-over-refunded', row => row.orderId === fine.id, 'an order refunded exactly its total is fine')
 has('refund-without-credit', row => row.returnId === uncredited.id)
 has('gift-card-duplicate', row => row.cards.length === 2 && row.cards.some(c => c.id === twin1.id) && row.cards.some(c => c.id === twin2.id)); lacks('gift-card-duplicate', row => row.purchase.endsWith('-single'), 'a single card is fine')
 has('gift-card-redeemed-uncredited', row => row.cardId === usedUnpaid.id); lacks('gift-card-redeemed-uncredited', row => row.cardId === usedPaid.id, 'a credited redemption is fine')
 has('referral-reward-owed', row => row.attributionId === owed.id); lacks('referral-reward-owed', row => row.referredUserId === friend.id, 'an account that never bought owes nothing')
 has('seller-sale-unrecorded', row => row.lineId === lostLine.id); lacks('seller-sale-unrecorded', row => row.lineId === healthyLine.id, 'a recorded sale is fine')
 has('seller-payout-duplicate', row => row.sellerId === seller.id && row.requests === 2 && row.total === '1700')
 has('gift-membership-missing', row => row.orderId === delivered.id); lacks('gift-membership-missing', row => row.orderId === healthy.id, 'a granted gift is fine')
 has('void-invoice-credit', row => row.invoice === voidHeld.number && row.credit === '300')
 has('renewal-pending', row => row.orderId === pendingCharged.id && row.charged === true); has('renewal-pending', row => row.orderId === pendingFree.id && row.charged === false)
 has('reseller-account-wrong-owner', row => row.orderId === wrongOwner.id && row.ownedBy === referrer.id && row.soldFor === friend.id); assert.equal(result['reseller-account-wrong-owner'].sample.filter(row => row.soldFor === friend.id).length, 1, 'the sale owned by its customer is fine')
 has('points-redeemed-uncredited', row => row.entryId === taken.id && row.points === 100); lacks('points-redeemed-uncredited', row => [paidPoints.id, undonePoints.id].includes(row.entryId), 'a credited or undone redemption is fine')
 has('paid-without-fulfillment', row => row.invoice === unqueued.number); lacks('paid-without-fulfillment', row => row.orderId === healthy.id, 'an order with a job is fine')
 console.log('PostgreSQL integrity report: each of the 14 findings reports its planted record and not its healthy twin, on a client that refuses writes passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  const orders = (await prisma.order.findMany({where: {userId: {in: ids}}, select: {id: true}})).map(row => row.id)
  const shops = (await prisma.seller.findMany({where: {slug: seed}, select: {id: true}})).map(row => row.id)
  await prisma.sellerLedger.deleteMany({where: {sellerId: {in: shops}}}); await prisma.sellerPayout.deleteMany({where: {sellerId: {in: shops}}})
  await prisma.fulfillmentJob.deleteMany({where: {orderId: {in: orders}}}); await prisma.userMembership.deleteMany({where: {userId: {in: ids}}}); await prisma.subscription.deleteMany({where: {userId: {in: ids}}})
  await prisma.returnRequest.deleteMany({where: {userId: {in: ids}}}); await prisma.productDelivery.deleteMany({where: {orderId: {in: orders}}}); await prisma.orderLine.deleteMany({where: {orderId: {in: orders}}})
  await prisma.invoice.deleteMany({where: {userId: {in: ids}}}); await prisma.referralAttribution.deleteMany({where: {referrerUserId: {in: ids}}}); await prisma.loyaltyEntry.deleteMany({where: {userId: {in: ids}}})
  await prisma.walletTx.deleteMany({where: {userId: {in: ids}}}); await prisma.giftCard.deleteMany({where: {codeHash: {startsWith: seed}}}); await prisma.order.deleteMany({where: {id: {in: orders}}})
  await prisma.product.deleteMany({where: {slug: seed}}); await prisma.seller.deleteMany({where: {id: {in: shops}}}); await prisma.plan.deleteMany({where: {name: seed}}); await prisma.panel.deleteMany({where: {name: seed}}); await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await prisma.$disconnect()}
})
