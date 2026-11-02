// Real PostgreSQL: an order and its invoice close together, on two connections like two server processes. The inbox, order
// transitions, seller shares, club points and the wallet are test doubles; stock and the database's own rules are real.
// ORDER_CLOSURE_FAULT=returns drops the check for a return request, to show that it is what stops a double payment.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), other = new PrismaClient(), prefix = `order-closure-${Date.now()}`, effects = []
const ids = { users: [], products: [], orders: [], invoices: [] }
const fault = process.env.ORDER_CLOSURE_FAULT || ''

function instance(db) {
  const cache = new Map()
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => {} },
    '@/modules/notifications/server/inbox': { createInboxEvent: async (event) => { effects.push(`inbox:${event.dedupeKey}`) } },
    '@/modules/wallet/server/wallet': { moveWallet: async (input) => { effects.push(`wallet:${input.idempotencyKey}`); return { ok: true } } },
    '@/modules/billing/server/billing': { voidOpenInvoice: async (invoiceId) => ({ voided: (await db.invoice.updateMany({ where: { id: invoiceId, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'VOID', paymentUrl: '' } })).count === 1 }) },
    '@/modules/store/server/orders': { transitionOrder: async (input) => { effects.push(`transition:${input.orderId}:${input.to}:${input.restock}`); await db.productDelivery.updateMany({ where: { orderId: input.orderId }, data: { status: input.to } }) } },
    '@/modules/marketplace/server/marketplace': { reverseSellerShare: async (orderId) => { effects.push(`seller:${orderId}`) } },
    '@/modules/store/server/marketing': { reverseOrderPoints: async (orderId) => { effects.push(`points:${orderId}`) } },
    '@/modules/catalog/server/code-stock': { syncCodeStock: async () => {} },
  }
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    let text = fs.readFileSync(file, 'utf8')
    if (fault === 'returns' && file.endsWith('order-closure.ts')) text = text.replace("if (await tx.returnRequest.count({ where: { orderId, status: { in: ['REQUESTED', 'APPROVED', 'REFUNDED'] } } })) return 'RETURNS'", '')
    new Function('require', 'module', 'exports', ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)((name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/')) { const base = `src/${name.slice(2)}`; return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`) }
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return load('src/modules/billing/server/order-closure.ts')
}

let serial = 0
async function placed({ order, invoice, delivery = '', hold, stock = 5, walletMinor = 0n }) {
  const key = `${prefix}-${++serial}`
  const user = await prisma.user.create({ data: { email: `${key}@example.invalid`, passwordHash: 'test-only' } }); ids.users.push(user.id)
  const product = await prisma.product.create({ data: { slug: key, name: key, price: 50000, priceMinor: 5000000n, currency: 'IRT', stock: stock - 1, kind: 'PHYSICAL', approval: 'APPROVED' } }); ids.products.push(product.id)
  const row = await prisma.order.create({ data: { userId: user.id, productId: product.id, status: order, totalAmount: 50000, totalMinor: 5000000n, currency: 'IRT', idempotencyKey: key, lines: { create: { productId: product.id, name: key, quantity: 1, kind: 'PHYSICAL', unitPriceMinor: 5000000n, totalMinor: 5000000n, currency: 'IRT' } } } }); ids.orders.push(row.id)
  const bill = await prisma.invoice.create({ data: { number: key, userId: user.id, productId: product.id, orderId: row.id, status: invoice, total: 50000, totalMinor: 5000000n, walletApplied: Number(walletMinor) / 100, walletAppliedMinor: walletMinor, currency: 'IRT', ...(invoice === 'PAID' ? { paidAt: new Date(), paidAmount: 50000, paidAmountMinor: 5000000n } : {}) } }); ids.invoices.push(bill.id)
  if (hold) await prisma.inventoryReservation.create({ data: { orderId: row.id, line: 0, productId: product.id, quantity: 1, finite: true, status: hold, expiresAt: new Date(Date.now() + 3_600_000) } })
  if (delivery) await prisma.productDelivery.create({ data: { orderId: row.id, status: delivery } })
  return { user, product, order: row, invoice: bill }
}
const read = async (row) => {
  const [order, invoice, hold, product, delivery] = await Promise.all([prisma.order.findUnique({ where: { id: row.order.id } }), prisma.invoice.findUnique({ where: { id: row.invoice.id } }), prisma.inventoryReservation.findFirst({ where: { orderId: row.order.id } }), prisma.product.findUnique({ where: { id: row.product.id } }), prisma.productDelivery.findUnique({ where: { orderId: row.order.id } })])
  return { order: order.status, invoice: invoice.status, hold: hold?.status || '', stock: product.stock, delivery: delivery?.status || '' }
}
const refundInput = (row, walletMinor = 0n) => ({ totalMinor: 5000000n, walletMinor, by: 'test', actorId: row.user.id })

async function main() {
  const one = instance(prisma), two = instance(other)

  const waiting = await placed({ order: 'PAID', invoice: 'PAID', delivery: 'PROCESSING', hold: 'CONSUMED', walletMinor: 1000000n })
  const raced = await Promise.all([one.refundPaidInvoice(waiting.invoice, refundInput(waiting, 1000000n)), two.refundPaidInvoice(waiting.invoice, refundInput(waiting, 1000000n))])
  assert.deepEqual(raced.map((result) => result.ok).sort(), [false, true], 'two clicks: one refund')
  assert.equal(await prisma.payment.count({ where: { invoiceId: waiting.invoice.id, status: 'REFUNDED' } }), 1)
  assert.equal(effects.filter((item) => item === `wallet:invoice-refund-wallet:${waiting.invoice.id}`).length, 1, 'the wallet part moves once')
  assert.ok(effects.includes(`transition:${waiting.order.id}:CANCELLED:true`), 'goods still here go back on the shelf')
  assert.ok(effects.includes(`points:${waiting.order.id}`) && effects.includes(`seller:${waiting.order.id}`) && effects.includes(`inbox:invoice-refund:${waiting.invoice.id}`))
  assert.equal((await read(waiting)).order, 'REFUNDED')
  assert.equal(await prisma.orderEvent.count({ where: { orderId: waiting.order.id, status: 'REFUNDED', visible: true } }), 1, 'the customer sees it on the timeline')

  const delivered = await placed({ order: 'PAID', invoice: 'PAID', delivery: 'DELIVERED', hold: 'CONSUMED' })
  assert.equal((await one.refundPaidInvoice(delivered.invoice, refundInput(delivered))).ok, true)
  assert.deepEqual(await read(delivered), { order: 'REFUNDED', invoice: 'REFUNDED', hold: 'CONSUMED', stock: 4, delivery: 'DELIVERED' }, 'goods with the customer are not put back on the shelf')
  assert.ok(!effects.some((item) => item.startsWith(`transition:${delivered.order.id}:`)))

  const undelivered = await placed({ order: 'PAID', invoice: 'PAID', hold: 'HELD' })
  assert.equal((await one.refundPaidInvoice(undelivered.invoice, refundInput(undelivered))).ok, true)
  assert.deepEqual(await read(undelivered), { order: 'REFUNDED', invoice: 'REFUNDED', hold: 'RELEASED', stock: 5, delivery: '' }, 'paid, not yet handed to delivery: the held unit returns')

  for (const status of ['REQUESTED', 'APPROVED', 'REFUNDED']) {
    const returned = await placed({ order: 'PAID', invoice: 'PAID', delivery: 'DELIVERED', hold: 'CONSUMED', walletMinor: 1000000n })
    await prisma.returnRequest.create({ data: { number: `${prefix}-${status}`, orderId: returned.order.id, userId: returned.user.id, kind: 'RETURN', status, reason: 'other', lines: '[]', requestedMinor: 1000000n, refundMinor: status === 'REFUNDED' ? 1000000n : 0n, currency: 'IRT' } })
    const refused = await one.refundPaidInvoice(returned.invoice, refundInput(returned, 1000000n))
    assert.deepEqual([refused.ok, refused.status], [false, 409], `a ${status} return goes through its own request`)
    assert.equal((await read(returned)).invoice, 'PAID')
    assert.ok(!effects.includes(`wallet:invoice-refund-wallet:${returned.invoice.id}`), 'nothing is paid twice')
  }

  const unpaid = await placed({ order: 'PENDING', invoice: 'UNPAID', hold: 'HELD' })
  assert.equal((await one.cancelUnpaidOrder(unpaid.order.id, 'test')).ok, true)
  assert.deepEqual(await read(unpaid), { order: 'CANCELLED', invoice: 'VOID', hold: 'RELEASED', stock: 5, delivery: '' })

  const paid = await placed({ order: 'PAID', invoice: 'PAID', delivery: 'PROCESSING', hold: 'CONSUMED' })
  const refused = await one.cancelUnpaidOrder(paid.order.id, 'test')
  assert.deepEqual([refused.ok, refused.status], [false, 409])
  assert.deepEqual(await read(paid), { order: 'PAID', invoice: 'PAID', hold: 'CONSUMED', stock: 4, delivery: 'PROCESSING' }, 'a paid order is not cancelled over its money')

  const receipt = await placed({ order: 'PENDING', invoice: 'UNPAID', hold: 'HELD' })
  await prisma.paymentReceipt.create({ data: { invoiceId: receipt.invoice.id, userId: receipt.user.id, amountMinor: 5000000n, currency: 'IRT', status: 'PENDING' } })
  assert.equal((await one.cancelUnpaidOrder(receipt.order.id, 'test')).ok, false, 'a receipt waiting for staff may be a payment')
  assert.equal((await read(receipt)).invoice, 'UNPAID')

  // The rows that came apart before this rule; the migration leaves a waiting receipt to staff and repeats harmlessly.
  const apartRefund = await placed({ order: 'PAID', invoice: 'PAID', delivery: 'SHIPPED', hold: 'CONSUMED' })
  await prisma.invoice.update({ where: { id: apartRefund.invoice.id }, data: { status: 'REFUNDED' } })
  const apartCancel = await placed({ order: 'CANCELLED', invoice: 'UNPAID', hold: 'HELD' })
  const apartReceipt = await placed({ order: 'CANCELLED', invoice: 'UNPAID' })
  await prisma.paymentReceipt.create({ data: { invoiceId: apartReceipt.invoice.id, userId: apartReceipt.user.id, amountMinor: 5000000n, currency: 'IRT', status: 'PENDING' } })
  const sql = fs.readFileSync(path.join('prisma/migrations/20270203120000_close_settled_orders/migration.sql'), 'utf8').split('\n').filter((line) => !line.startsWith('--')).join('\n').split(';').map((part) => part.trim()).filter(Boolean)
  assert.equal(sql.length, 2)
  for (let run = 0; run < 2; run++) for (const statement of sql) await prisma.$executeRawUnsafe(statement)
  assert.deepEqual(await read(apartRefund), { order: 'REFUNDED', invoice: 'REFUNDED', hold: 'CONSUMED', stock: 4, delivery: 'SHIPPED' })
  assert.equal((await read(apartCancel)).invoice, 'VOID')
  assert.equal((await read(apartReceipt)).invoice, 'UNPAID')

  console.log('Order closure: double refund, return requests, unpaid cancel, paid refusal, waiting receipt and stored rows passed')
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.returnRequest.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.productDelivery.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.payment.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.paymentReceipt.deleteMany({ where: { invoiceId: { in: ids.invoices } } })
    await prisma.invoice.deleteMany({ where: { id: { in: ids.invoices }, number: { startsWith: prefix } } })
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.order.deleteMany({ where: { id: { in: ids.orders }, idempotencyKey: { startsWith: prefix } } })
    await prisma.product.deleteMany({ where: { id: { in: ids.products }, slug: { startsWith: prefix } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users }, email: { startsWith: prefix } } })
  } finally { await prisma.$disconnect(); await other.$disconnect() }
})
