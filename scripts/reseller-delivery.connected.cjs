// Real PostgreSQL delivery claims; Telegram/Happ adapters stubbed, no external sends.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), seed = `delivery-${Date.now()}`, owned = {}
let sends = 0, fail = true
function load(file) {
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/modules/subscriptions/server/happ-protocol') return { safeHappLink: async () => 'https://example.invalid/private-fixture' }
    if (name === '@/modules/notifications/server/telegram') return { bot: async (method, payload) => { assert.equal(method, 'sendMessage'); assert.equal(payload.chat_id, seed); sends++; return { ok: !fail, description: 'injected provider failure' } } }
    if (name === '@/modules/reseller/server/reseller-bot') return { resellerBotConfig: () => ({ token: 'stub-only' }) }
    if (name === '@/modules/reseller/server/bot-messages') return load('src/modules/reseller/server/bot-messages.ts')
    throw Error(`Unexpected delivery dependency ${name}`)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  owned.user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  owned.reseller = await db.reseller.create({ data: { userId: owned.user.id } })
  owned.plan = await db.plan.create({ data: { name: seed, trafficGB: 1, days: 1, price: 1 } })
  owned.offer = await db.serviceOffer.create({ data: { ownerKey: `RESELLER:${owned.reseller.id}`, planId: owned.plan.id, nameFa: seed, nameEn: seed, trafficGB: 1, days: 1, deviceLimit: 1, priceMinor: 100n } })
  owned.bot = await db.resellerBot.create({ data: { resellerId: owned.reseller.id, botId: seed, username: seed, tokenCipher: 'stub-only', webhookSecret: seed, ownerTelegramId: seed, brandName: seed, cardNumber: '0000000000000000', cardHolder: seed, active: true } })
  owned.order = await db.order.create({ data: { userId: owned.user.id, planId: owned.plan.id, totalAmount: 1, totalMinor: 100n, status: 'PAID' } })
  owned.sub = await db.subscription.create({ data: { userId: owned.user.id, planId: owned.plan.id, orderId: owned.order.id, resellerId: owned.reseller.id, username: seed, expiresAt: new Date(Date.now() + 86400000), subToken: seed } })
  owned.sale = await db.resellerSale.create({ data: { resellerId: owned.reseller.id, offerId: owned.offer.id, botId: owned.bot.id, telegramUserId: seed, telegramChatId: seed, orderId: owned.order.id, status: 'PROVISIONING' } })
  const service = load('src/modules/reseller/server/sale-delivery.ts')
  await service.deliverResellerSale(owned.order.id)
  let sale = await db.resellerSale.findUniqueOrThrow({ where: { id: owned.sale.id } })
  assert.equal(sale.status, 'PROVISIONING'); assert.equal(sale.deliveredAt, null); assert.equal(sale.lastError, 'injected provider failure')
  sends = 0; fail = false
  await Promise.all([service.deliverResellerSale(owned.order.id), service.deliverResellerSale(owned.order.id)])
  assert.equal(sends, 1, 'atomic claim permits only one concurrent send')
  sale = await db.resellerSale.findUniqueOrThrow({ where: { id: owned.sale.id } })
  assert.equal(sale.status, 'FULFILLED'); assert.equal(sale.subscriptionId, owned.sub.id); assert.ok(sale.deliveredAt); assert.equal(sale.lastError, '')
  await service.deliverResellerSale(owned.order.id); assert.equal(sends, 1)
  console.log('Real PostgreSQL reseller delivery: failed-send retry, concurrent atomic claim, fulfilled subscription and delivered idempotency passed; providers stubbed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    for (const [key, model] of [['sale', 'resellerSale'], ['sub', 'subscription'], ['order', 'order'], ['bot', 'resellerBot'], ['offer', 'serviceOffer'], ['reseller', 'reseller'], ['plan', 'plan'], ['user', 'user']]) if (owned[key]) await db[model].delete({ where: { id: owned[key].id } })
  } finally { await db.$disconnect() }
})
