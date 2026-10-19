// Real PostgreSQL products, code pools, holds, orders and deliveries, through the real inventory and order code.
// Two database clients are used where two buyers or two deliveries act at the same moment.
process.env.STORE_DELIVERY_KEY = process.env.STORE_DELIVERY_KEY || 'ab'.repeat(32)
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), second = new PrismaClient(), seed = `codes-${Date.now()}`
const inbox = []
// The shop's return rules as the owner set them; changed by the sections below.
const rules = { enabled: true, autoRefundCancel: true, codeReturnDays: 0 }
const form = fields => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return { form: data } }
/** Loads the store code with one database client; everything of the project is real except the inbox. */
function world(db) {
  const cache = new Map()
  const load = file => {
    const full = path.resolve(file.endsWith('.ts') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : path.join(file, 'index.ts'))
    if (cache.has(full)) return cache.get(full).exports
    const mod = { exports: {} }; cache.set(full, mod)
    const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', source)(name => {
      if (name === '@/platform/database/prisma') return { db }
      if (name === '@/platform/observability/logger') return { logEvent: () => {} }
      if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async event => { inbox.push(event) } }
      if (name === '@/modules/settings/server') return { readJsonSetting: async () => rules, writeJsonSetting: async () => {} }
      if (name === '@/platform/http/rate-limit') return { rateLimitHit: () => ({ ok: true }) }
      if (name === '@/platform/http/multipart') return { MultipartError: class extends Error {}, readMultipart: async req => req.form }
      if (name === '@/modules/sms/server/sms') return { notifyAdmins: async () => {} }
      if (name === '@/modules/marketplace/server/marketplace') return { reverseSellerShare: async () => {} }
      if (name === '@/modules/store/server/marketing') return { reverseOrderPoints: async () => {} }
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
      if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return { returns: load('src/modules/store/server/returns.ts'), codes: load('src/modules/store/server/digital-codes.ts'), inventory: load('src/modules/catalog/server/inventory.ts'), delivery: load('src/modules/catalog/server/digital-delivery.ts') }
}
const a = world(prisma), b = world(second)
let count = 0
const product = (name, data = {}) => prisma.product.create({ data: { slug: `${seed}-${name}`, name, price: 10, priceMinor: 1000n, currency: 'USD', kind: 'VIRTUAL', stock: -1, ...data } })
const stockOf = async row => (await prisma.product.findUniqueOrThrow({ where: { id: row.id } })).stock
const shelf = row => prisma.productDigitalCode.count({ where: { productId: row.id, orderId: null } })
/** An order with its lines; `lines` are [product, quantity, variantId?]. */
async function order(user, lines, { status = 'PENDING' } = {}) {
  return prisma.order.create({ data: {
    userId: user.id, productId: lines[0][0].id, totalAmount: 10, totalMinor: 1000n, currency: 'USD', idempotencyKey: `${seed}-${count++}`, status, provider: 'wallet',
    lines: { create: lines.map(([item, quantity, variantId = null], line) => ({ line, name: item.name, productId: item.id, variantId, kind: item.kind, quantity, unitPriceMinor: 1000n, totalMinor: BigInt(1000 * quantity), currency: 'USD' })) },
  } })
}
/** What payment does: the hold becomes a sale and the delivery row appears. */
async function pay(row, w = a) {
  await prisma.order.update({ where: { id: row.id }, data: { status: 'PAID' } })
  assert.equal((await w.inventory.consumeInventoryReservation(row.id)).ok, true)
  await prisma.productDelivery.upsert({ where: { orderId: row.id }, create: { orderId: row.id }, update: {} })
}
const delivery = row => prisma.productDelivery.findUniqueOrThrow({ where: { orderId: row.id } })
const codesOf = async row => (await prisma.productDigitalCode.findMany({ where: { orderId: row.id }, orderBy: { id: 'asc' } })).map(code => a.delivery.decryptDigitalDelivery(code.secret))

async function main() {
  const [buyer, other] = await Promise.all(['buyer', 'other'].map(name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only' } })))

  // ---- the pool: mode, adding, repeats, what it refuses
  const card = await product('gift card')
  assert.deepEqual(await a.codes.setDigitalMode(card.id, 'CODES'), { mode: 'CODES', stock: 0 }, 'an empty pool is out of stock, not unlimited')
  const added = await a.codes.addCodes({ productId: card.id, text: 'AAAA-1111\n  BBBB-2222 \n\nAAAA-1111\nCCCC-3333' })
  assert.deepEqual([added.added, added.repeated, added.existing, added.stock], [3, 1, 0, 3])
  const again = await a.codes.addCodes({ productId: card.id, text: 'BBBB-2222\nDDDD-4444' })
  assert.deepEqual([again.added, again.existing, again.stock], [1, 1, 4], 'a code the product already has is not stored twice')
  const stored = await prisma.productDigitalCode.findMany({ where: { productId: card.id } })
  assert.ok(stored.every(row => row.secret.startsWith('store:v1:') && !/AAAA|BBBB|CCCC|DDDD/.test(row.secret + row.fingerprint)), 'codes are stored encrypted')
  const physical = await product('router', { kind: 'PHYSICAL', stock: 5 })
  await assert.rejects(a.codes.setDigitalMode(physical.id, 'CODES'), /مجازی/)
  await assert.rejects(a.codes.addCodes({ productId: card.id, text: '<b>x</b>' }), /غیرمجاز/)
  const listed = await a.codes.listCodes(card.id)
  assert.deepEqual([listed.mode, listed.available, listed.delivered, listed.shelf.length, listed.shelf[0].code], ['CODES', 4, 0, 4, '•••••1111'], 'staff see the shelf masked')

  // ---- a paid order of code goods delivers itself, once
  const first = await order(buyer, [[card, 2]])
  assert.equal((await a.inventory.reserveInventory({ orderId: first.id })).ok, true)
  assert.equal(await stockOf(card), 2, 'held units leave the shelf count')
  await pay(first)
  assert.deepEqual(await a.codes.deliverDigitalCodes(first.id), { codeLines: 1, short: 0, delivered: true })
  assert.deepEqual(await codesOf(first), ['AAAA-1111', 'BBBB-2222'])
  const done = await delivery(first)
  assert.equal(done.status, 'DELIVERED'); assert.ok(done.deliveredAt)
  assert.equal(a.delivery.decryptDigitalDelivery(done.digitalDelivery), 'gift card\nAAAA-1111\nBBBB-2222')
  assert.deepEqual(inbox.map(event => [event.userId, event.kind]), [[buyer.id, 'PRODUCT_DELIVERED']])
  assert.ok(!JSON.stringify(inbox).includes('AAAA-1111'), 'the notice does not carry the code')
  assert.deepEqual(await a.codes.deliverDigitalCodes(first.id), { codeLines: 1, short: 0, delivered: false }, 'a delivered order is closed')
  assert.equal((await codesOf(first)).length, 2); assert.equal(inbox.length, 1)
  assert.deepEqual([await stockOf(card), await shelf(card)], [2, 2])
  assert.deepEqual(await a.codes.buyerCodes(buyer.id, first.id), [{ name: 'gift card', variantName: '', codes: ['AAAA-1111', 'BBBB-2222'] }])
  assert.deepEqual(await a.codes.buyerCodes(other.id, first.id), [], 'only the buyer reads them')

  // ---- two buyers and the last code: one hold succeeds
  await a.codes.removeCode(card.id, (await prisma.productDigitalCode.findFirstOrThrow({ where: { productId: card.id, orderId: null }, orderBy: { id: 'desc' } })).id)
  assert.deepEqual([await stockOf(card), await shelf(card)], [1, 1])
  const [left, right] = [await order(buyer, [[card, 1]]), await order(other, [[card, 1]])]
  const holds = await Promise.all([a.inventory.reserveInventory({ orderId: left.id }), b.inventory.reserveInventory({ orderId: right.id })])
  assert.deepEqual(holds.map(result => result.ok).sort(), [false, true], 'the last code is promised to one buyer')
  const winner = holds[0].ok ? left : right, loser = holds[0].ok ? right : left
  assert.equal(await stockOf(card), 0)
  // The stock column overwritten by another screen does not sell a code that is not there.
  await prisma.product.update({ where: { id: card.id }, data: { stock: 99 } })
  assert.equal((await a.inventory.reserveInventory({ orderId: loser.id })).ok, false)
  await prisma.product.update({ where: { id: card.id }, data: { stock: 99 } })
  assert.deepEqual(await a.codes.syncAllCodeStock().then(result => [result.failed, result.changed >= 1]), [0, true]); assert.equal(await stockOf(card), 0)
  // The held order is abandoned: its unit is back on the shelf count.
  await a.inventory.releaseInventoryReservation(winner.id)
  assert.equal(await stockOf(card), 1)

  // ---- two paid orders and one code (the hold was forced): one is served, the other waits and is served when codes arrive
  const [one, two] = [await order(buyer, [[card, 1]]), await order(other, [[card, 1]])]
  assert.equal((await a.inventory.reserveInventory({ orderId: one.id })).ok, true)
  await prisma.inventoryReservation.create({ data: { orderId: two.id, line: 0, productId: card.id, quantity: 1, finite: true, status: 'HELD', expiresAt: new Date(Date.now() + 3_600_000) } })
  await pay(one); await pay(two, b)
  inbox.length = 0
  const raced = await Promise.all([a.codes.deliverDigitalCodes(one.id), b.codes.deliverDigitalCodes(two.id)])
  assert.deepEqual(raced.map(result => result.short).sort(), [0, 1]); assert.deepEqual(raced.map(result => result.delivered).sort(), [false, true])
  const served = raced[0].delivered ? one : two, waiting = raced[0].delivered ? two : one
  assert.equal((await codesOf(served)).length, 1); assert.equal((await codesOf(waiting)).length, 0)
  assert.equal((await delivery(waiting)).status, 'PENDING')
  assert.equal(await prisma.orderEvent.count({ where: { orderId: waiting.id, status: 'CODES_SHORT', visible: false } }), 1, 'staff see why it waits')
  await a.codes.deliverDigitalCodes(waiting.id)
  assert.equal(await prisma.orderEvent.count({ where: { orderId: waiting.id, status: 'CODES_SHORT' } }), 1, 'noted once')
  assert.equal(await stockOf(card), 0)
  const refill = await a.codes.addCodes({ productId: card.id, text: 'EEEE-5555\nFFFF-6666' })
  assert.deepEqual([refill.added, refill.deliveredWaiting, refill.stock], [2, 1, 1], 'the waiting order takes its code from the refill')
  assert.deepEqual(await codesOf(waiting), ['EEEE-5555']); assert.equal((await delivery(waiting)).status, 'DELIVERED')
  assert.deepEqual([await stockOf(card), await shelf(card)], [1, 1])

  // ---- an order with other goods keeps its delivery open; its codes are the buyer's at once
  const manual = await product('manual licence')
  const mixed = await order(buyer, [[card, 1], [manual, 1]])
  assert.equal((await a.inventory.reserveInventory({ orderId: mixed.id })).ok, true); await pay(mixed)
  assert.deepEqual(await a.codes.deliverDigitalCodes(mixed.id), { codeLines: 1, short: 0, delivered: false })
  assert.equal((await delivery(mixed)).status, 'PENDING')
  assert.deepEqual(await a.codes.buyerCodes(buyer.id, mixed.id), [{ name: 'gift card', variantName: '', codes: ['FFFF-6666'] }])
  assert.deepEqual([await stockOf(card), await shelf(card)], [0, 0])

  // ---- orders staff delivered by hand before a product got its pool neither take codes nor hold stock
  const legacy = await product('old key')
  const old = await order(buyer, [[legacy, 1]])
  assert.equal((await a.inventory.reserveInventory({ orderId: old.id })).ok, true); await pay(old)
  await prisma.productDelivery.update({ where: { orderId: old.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
  const pendingOld = await order(other, [[legacy, 1]])
  assert.equal((await a.inventory.reserveInventory({ orderId: pendingOld.id })).ok, true); await pay(pendingOld)
  await a.codes.setDigitalMode(legacy.id, 'CODES')
  const fill = await a.codes.addCodes({ productId: legacy.id, text: 'OLD-1\nOLD-2\nOLD-3' })
  assert.deepEqual([fill.deliveredWaiting, fill.stock], [1, 2], 'the order still waiting for staff is served, the delivered one is left alone')
  assert.deepEqual([(await codesOf(old)).length, await codesOf(pendingOld)], [0, ['OLD-1']])

  // ---- variants have their own codes
  const keyed = await product('licence')
  const [home, pro] = await Promise.all(['home', 'pro'].map(name => prisma.productVariant.create({ data: { productId: keyed.id, name, sku: `${seed}-${name}`, price: 10, priceMinor: 1000n, stock: -1 } })))
  await a.codes.setDigitalMode(keyed.id, 'CODES')
  await assert.rejects(a.codes.addCodes({ productId: keyed.id, text: 'X' }), /تنوع/)
  await a.codes.addCodes({ productId: keyed.id, variantId: home.id, text: 'HOME-1\nHOME-2' }); await a.codes.addCodes({ productId: keyed.id, variantId: pro.id, text: 'PRO-1' })
  assert.deepEqual([await stockOf(keyed), (await prisma.productVariant.findUniqueOrThrow({ where: { id: home.id } })).stock, (await prisma.productVariant.findUniqueOrThrow({ where: { id: pro.id } })).stock], [3, 2, 1])
  const proOrder = await order(buyer, [[keyed, 1, pro.id]])
  assert.equal((await a.inventory.reserveInventory({ orderId: proOrder.id })).ok, true); await pay(proOrder)
  await a.codes.deliverDigitalCodes(proOrder.id)
  assert.deepEqual(await codesOf(proOrder), ['PRO-1'])
  const proAgain = await order(other, [[keyed, 1, pro.id]])
  assert.equal((await a.inventory.reserveInventory({ orderId: proAgain.id })).ok, false, 'another variant\'s codes do not make this one available')

  // ---- the shelf: only codes on it can be removed; back to staff delivery lifts the limit
  await assert.rejects(a.codes.removeCode(card.id, (await prisma.productDigitalCode.findFirstOrThrow({ where: { orderId: first.id } })).id), /قفسه/)
  assert.deepEqual(await a.codes.setDigitalMode(legacy.id, 'MANUAL'), { mode: 'MANUAL', stock: -1 })
  assert.equal(await shelf(legacy), 2, 'the codes are kept')

  // ---- a code that did not work is replaced: the old one is void, the buyer holds the new one, nothing returns to the shelf
  const voidOf = async row => (await prisma.productDigitalCode.findMany({ where: { orderId: row.id, returnedAt: { not: null } }, orderBy: { id: 'asc' } })).map(code => a.delivery.decryptDigitalDelivery(code.secret))
  const wallet = async user => Number((await prisma.walletAccount.findUnique({ where: { userId_currency: { userId: user.id, currency: 'USD' } } }))?.balanceMinor || 0n)
  const gift = await product('voucher'); await a.codes.setDigitalMode(gift.id, 'CODES')
  await a.codes.addCodes({ productId: gift.id, text: 'V-1\nV-2\nV-3\nV-4\nV-5' })
  const bought = await order(buyer, [[gift, 2]]); await prisma.order.update({ where: { id: bought.id }, data: { totalAmount: 20, totalMinor: 2000n } })
  assert.equal((await a.inventory.reserveInventory({ orderId: bought.id })).ok, true); await pay(bought)
  await a.codes.deliverDigitalCodes(bought.id)
  assert.deepEqual(await a.codes.buyerCodes(buyer.id, bought.id), [{ name: 'voucher', variantName: '', codes: ['V-1', 'V-2'] }])
  inbox.length = 0
  const faulty = await prisma.productDigitalCode.findFirstOrThrow({ where: { orderId: bought.id }, orderBy: { id: 'asc' } })
  const onShelf = await prisma.productDigitalCode.findFirstOrThrow({ where: { productId: gift.id, orderId: null } })
  await assert.rejects(a.codes.replaceCode({ productId: gift.id, codeId: onShelf.id, actorId: null }), /خریدار/, 'a code on the shelf has nobody to replace it for')
  await assert.rejects(a.codes.replaceCode({ productId: card.id, codeId: faulty.id, actorId: null }), /خریدار/, 'only through its own product')
  const replaced = await a.codes.replaceCode({ productId: gift.id, codeId: faulty.id, actorId: null, note: '<b>did not work</b>' })
  assert.deepEqual([replaced.orderId, replaced.stock], [bought.id, 2])
  assert.deepEqual(await a.codes.buyerCodes(buyer.id, bought.id), [{ name: 'voucher', variantName: '', codes: ['V-2', 'V-3'] }], 'the buyer holds the new code, not the void one')
  assert.deepEqual(await voidOf(bought), ['V-1'])
  assert.equal(a.delivery.decryptDigitalDelivery((await delivery(bought)).digitalDelivery), 'voucher\nV-2\nV-3', 'the delivery text is the codes held now')
  assert.deepEqual([await stockOf(gift), await shelf(gift)], [2, 2], 'the void code is not on the shelf')
  assert.deepEqual(inbox.map(event => [event.userId, event.kind]), [[buyer.id, 'PRODUCT_DELIVERED']]); assert.ok(!JSON.stringify(inbox).includes('V-3'), 'the notice does not carry the code')
  assert.deepEqual((await prisma.orderEvent.findMany({ where: { orderId: bought.id, status: 'CODE_REPLACED' } })).map(event => [event.visible, /<|>/.test(event.note)]), [[true, false]])
  await assert.rejects(a.codes.replaceCode({ productId: gift.id, codeId: faulty.id, actorId: null }), /خریدار/, 'a void code is not replaced twice')
  const pool = await a.codes.listCodes(gift.id)
  assert.deepEqual([pool.available, pool.delivered, pool.returned, pool.recent.filter(row => row.returnedAt).length], [2, 2, 1, 1])

  // ---- sending a delivered code back: off unless the owner allows it, then within its own window and reviewed by staff
  const info = () => a.returns.customerReturnInfo(buyer.id, bought.id)
  let offered = await info()
  assert.deepEqual([offered.eligibility.return, /کد تحویل‌شده/.test(offered.eligibility.reason), offered.lines[0].returnable], [false, true, 0], 'by default a delivered code does not go back')
  await assert.rejects(a.returns.createReturnRequest(form({ kind: 'RETURN', reason: 'code_invalid', lines: JSON.stringify([{ line: 0, quantity: 1 }]) }), buyer.id, bought.id), error => error.code === 'NOT_ALLOWED')
  rules.codeReturnDays = 3
  offered = await info()
  assert.deepEqual([offered.eligibility.return, offered.eligibility.goods, offered.lines[0].returnable, offered.lines[0].code, offered.reasons.RETURN.map(reason => reason.key)], [true, { physical: false, codes: true }, 2, true, ['code_invalid', 'code_used', 'other']])
  await assert.rejects(a.returns.createReturnRequest(form({ kind: 'RETURN', reason: 'damaged', lines: JSON.stringify([{ line: 0, quantity: 1 }]) }), buyer.id, bought.id), /دلیل درخواست/, 'a code is not "damaged in transit"')
  // a line gives back no more units than the codes its buyer still holds
  const aside = await prisma.productDigitalCode.findFirstOrThrow({ where: { orderId: bought.id, returnedAt: null }, orderBy: { id: 'desc' } })
  await prisma.productDigitalCode.update({ where: { id: aside.id }, data: { returnedAt: new Date() } })
  assert.equal((await info()).lines[0].returnable, 1)
  await prisma.productDigitalCode.update({ where: { id: aside.id }, data: { returnedAt: null } })
  const asked = await a.returns.createReturnRequest(form({ kind: 'RETURN', reason: 'code_invalid', lines: JSON.stringify([{ line: 0, quantity: 5 }]) }), buyer.id, bought.id)
  assert.deepEqual([asked.status, asked.kind, JSON.parse(asked.lines), asked.requestedMinor], ['REQUESTED', 'RETURN', [{ line: 0, quantity: 2 }], 2000n], 'no more than the codes held; staff decide')
  assert.equal((await a.codes.buyerCodes(buyer.id, bought.id))[0].codes.length, 2, 'asking takes nothing back')
  await prisma.returnRequest.update({ where: { id: asked.id }, data: { lines: JSON.stringify([{ line: 0, quantity: 1 }]), requestedMinor: 1000n } })
  const paidBack = await a.returns.refundReturn({ id: asked.id, actorId: null })
  assert.deepEqual([paidBack.status, paidBack.refundMinor, await wallet(buyer)], ['REFUNDED', 1000n, 1000])
  assert.deepEqual([await a.codes.buyerCodes(buyer.id, bought.id), await voidOf(bought)], [[{ name: 'voucher', variantName: '', codes: ['V-2'] }], ['V-1', 'V-3']], 'one unit paid back: the code given last is void, the other stays the buyer\'s')
  assert.deepEqual((await prisma.productDigitalCode.findMany({ where: { orderId: bought.id, returnId: asked.id } })).map(code => code.returnNote), [asked.number])
  assert.equal(a.delivery.decryptDigitalDelivery((await delivery(bought)).digitalDelivery), 'voucher\nV-2')
  assert.deepEqual([await stockOf(gift), await shelf(gift)], [2, 2], 'a returned code is never sold again')
  assert.equal(await a.codes.takeBackCodes(bought.id, [{ line: 0, quantity: 1 }], { returnId: asked.id, note: asked.number }), 0, 'repeating the same request takes nothing more')
  assert.equal((await a.codes.buyerCodes(buyer.id, bought.id))[0].codes.length, 1)
  offered = await info()
  assert.deepEqual([offered.lines[0].returnable, offered.eligibility.return], [1, true])
  // the window is its own: over for codes while goods would still be returnable
  await prisma.productDelivery.update({ where: { orderId: bought.id }, data: { deliveredAt: new Date(Date.now() - 4 * 86_400_000) } })
  offered = await info()
  assert.deepEqual([offered.eligibility.return, /مهلت/.test(offered.eligibility.reason)], [false, true])

  // ---- a cancellation after the buyer has read a code is not refunded by itself; once staff refund it the code is void
  rules.codeReturnDays = 0
  const mixedAgain = await order(other, [[gift, 1], [manual, 1]])
  assert.equal((await a.inventory.reserveInventory({ orderId: mixedAgain.id })).ok, true); await pay(mixedAgain)
  await a.codes.deliverDigitalCodes(mixedAgain.id)
  assert.deepEqual(await a.codes.buyerCodes(other.id, mixedAgain.id), [{ name: 'voucher', variantName: '', codes: ['V-4'] }])
  assert.equal((await a.returns.customerReturnInfo(other.id, mixedAgain.id)).autoRefundCancel, false)
  const cancelled = await a.returns.createReturnRequest(form({ kind: 'CANCEL', reason: 'changed_mind' }), other.id, mixedAgain.id)
  assert.deepEqual([cancelled.status, await wallet(other)], ['REQUESTED', 0], 'waits for staff')
  const unread = await order(other, [[manual, 1]]); await pay(unread)
  assert.equal((await a.returns.createReturnRequest(form({ kind: 'CANCEL', reason: 'changed_mind' }), other.id, unread.id)).status, 'REFUNDED', 'an order without codes still cancels by itself')
  const before = await wallet(other)
  await a.returns.refundReturn({ id: cancelled.id, actorId: null })
  assert.deepEqual([await wallet(other) - before, await a.codes.buyerCodes(other.id, mixedAgain.id), await voidOf(mixedAgain)], [1000, [], ['V-4']])
  assert.deepEqual([await stockOf(gift), await shelf(gift)], [1, 1])
  await prisma.order.update({ where: { id: bought.id }, data: { status: 'REFUNDED' } })
  await assert.rejects(a.codes.replaceCode({ productId: gift.id, codeId: (await prisma.productDigitalCode.findFirstOrThrow({ where: { orderId: bought.id, returnedAt: null } })).id, actorId: null }), /پرداخت‌شده/, 'a refunded order gets no replacement')
  console.log('PostgreSQL digital codes: pool, encrypted storage, self-delivery once, the last code under two buyers, shortage and refill, mixed orders, hand-delivered orders, variants, replacing a faulty code, sending a code back by its own window, and a cancellation after a code was read passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const products = (await prisma.product.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    const users = (await prisma.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    const orders = (await prisma.order.findMany({ where: { userId: { in: users } }, select: { id: true } })).map(row => row.id)
    await prisma.productDigitalCode.deleteMany({ where: { productId: { in: products } } })
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: orders } } }); await prisma.walletTx.deleteMany({ where: { userId: { in: users } } }); await prisma.walletAccount.deleteMany({ where: { userId: { in: users } } })
    await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: orders } } }); await prisma.orderEvent.deleteMany({ where: { orderId: { in: orders } } })
    await prisma.productDelivery.deleteMany({ where: { orderId: { in: orders } } }); await prisma.orderLine.deleteMany({ where: { orderId: { in: orders } } }); await prisma.order.deleteMany({ where: { id: { in: orders } } })
    await prisma.productVariant.deleteMany({ where: { productId: { in: products } } }); await prisma.product.deleteMany({ where: { id: { in: products } } }); await prisma.user.deleteMany({ where: { id: { in: users } } })
  } finally { await prisma.$disconnect(); await second.$disconnect() }
})
