// Real PostgreSQL through the real checkout, wallet and fulfilment: renewing hosting services by hand and from the
// wallet, reminders, grace days, suspension and termination, and money for a service deleted meanwhile (slice 3).
// HOSTING_FAULT=twice lets one paid order add two terms; =grace suspends on the due date itself; =staff lets the
// system terminate a service staff suspended; =refund keeps the money of a renewal for a deleted service.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `hostren-${Date.now()}`, fault = process.env.HOSTING_FAULT || '', cache = new Map()
const owned = { users: [], products: [] }
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
const DAY = 86_400_000

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (fault === 'twice' && file.endsWith('hosting/server/renewal.ts')) source = source.replace('const key = `renew:order:${order.id}`', 'const key = `renew:order:${order.id}:${Math.random()}`').replace('where: { id: service.id, nextDueAt: service.nextDueAt, status: service.status }', 'where: { id: service.id }')
  if (fault === 'grace' && file.endsWith('hosting/domain/services.ts')) source = source.replace('if (left < -settings.graceDays * DAY) return { kind: \'suspend\' }', 'if (left < 0) return { kind: \'suspend\' }')
  if (fault === 'staff' && file.endsWith('hosting/server/renewal.ts')) source = source.replace("return last?.kind === 'SUSPEND' && last.actor === 'SYSTEM'", "return last?.kind === 'SUSPEND'")
  if (fault === 'refund' && file.endsWith('hosting/server/renewal.ts')) source = source.replace("const refund = await moveWallet(", "const refund = { ok: true, message: '' } || await moveWallet(")
  const mod = { exports: {} }; cache.set(file, mod)
  const req = (name) => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/modules/identity/auth') return { authOptions: {} }
    if (name === '@/extensions/server/runtime') return { emitExtensionEvent: async () => {} }
    if (name === '@/modules/sms/server/sms') return { notifyAdmins: async () => {} }
    if (name === '@/modules/imports/server/authority') return { destinationActor: async () => ({}) }
    if (name === '@/modules/mail/server/mailer') return { sendMail: async () => ({ ok: true, messageId: 'test' }) }
    if (name === '@/modules/editor/server/blocks/items' || name === '@/modules/editor/server/blocks/source') return {}
    if (name === '@/modules/content/server/registry') return { itemCards: async () => new Map(), latestItemCards: async () => [] }
    if (name === '@/modules/site/server/maintenance') return { closedSectionPlugins: async () => new Set() }
    if (name === 'next-auth') return { getServerSession: async () => null }
    if (name === '@/modules/automation/server/engine') return { emitAutomation: async () => {} }
    if (name === '@/modules/referrals/server/referrals') return { awardReferralForInvoice: async () => {} }
    if (name === '@/modules/settings/server') return { getSettings: async () => ({ siteUrl: 'https://example.invalid' }) }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleSettings: async () => ({ 'reminder-days': '7,3,1', 'grace-days': 3, 'terminate-days': 14, 'auto-renew': true }), getModuleStates: async () => ({}) }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.join(path.posix.dirname(file), name)
      for (const candidate of [base, base + '.ts', base + '/index.ts']) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate.endsWith('.json') ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : load(candidate)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText)(req, mod, mod.exports)
  return mod.exports
}

const member = async (key, wallet) => {
  const user = await db.user.create({ data: { email: `${prefix}-${key}@example.invalid`, passwordHash: 'test-only' } })
  owned.users.push(user.id)
  await db.walletAccount.create({ data: { userId: user.id, currency: 'IRT', balanceMinor: wallet } })
  return user
}
const balance = async (user) => (await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: user.id, currency: 'IRT' } } })).balanceMinor
const get = (id) => db.hostingService.findUniqueOrThrow({ where: { id } })
const notices = (user, part) => db.userNotification.count({ where: { userId: user.id, dedupeKey: { contains: part } } })

async function main() {
  const checkout = load('src/modules/checkout/server/checkout.ts'), jobs = load('src/modules/fulfillment/server/jobs.ts')
  const s = load('src/modules/hosting/server/services.ts'), r = load('src/modules/hosting/server/renewal.ts')
  let serial = 0
  const product = await db.hostingProduct.create({ data: { slug: `${prefix}-vps`, name: `${prefix} vps`, kind: 'VPS', prices: { create: [{ cycle: 'MONTH', amountMinor: 400_000n, setupMinor: 50_000n }] } } })
  owned.products.push(product.id)
  const service = async (user) => {
    const bought = await checkout.executeCheckout({ userId: user.id, hostingProductId: product.id, hostingCycle: 'MONTH', payWith: 'wallet', idempotencyKey: `${prefix}-buy-${++serial}`, siteUrl: 'https://example.invalid' })
    assert.equal(bought.ok, true, JSON.stringify(bought))
    const row = await db.hostingService.findUniqueOrThrow({ where: { orderId: bought.data.orderId } })
    await s.deliverService(row.id, { ipv4: '203.0.113.40', loginUser: 'root', password: 'p4ss-word' }, user.id)
    return get(row.id)
  }
  const renew = (user, row, key = `${prefix}-renew-${++serial}`) => checkout.executeCheckout({ userId: user.id, hostingRenewServiceId: row.id, payWith: 'wallet', idempotencyKey: key, siteUrl: 'https://example.invalid' })

  // ---- By hand: one more term from the due date, at the bought price (no setup), once per paid order.
  const ali = await member('ali', 5_000_000n), sara = await member('sara', 100_000n)
  let a = await service(ali)
  const due = a.nextDueAt
  const before = await balance(ali)
  const paid = await renew(ali, a)
  assert.equal(paid.ok, true, JSON.stringify(paid))
  assert.equal(await balance(ali), before - 400_000n, 'the renewal costs the price, without the setup fee')
  a = await get(a.id)
  const expected = new Date(due); expected.setUTCMonth(expected.getUTCMonth() + 1)
  assert.ok(Math.abs(a.nextDueAt - expected) < 3 * DAY && a.nextDueAt > due, 'one month added to the due date, not to today')
  assert.equal((await renew(ali, a, `${prefix}-renew-${serial}`)).data.replayed, true)
  await r.applyHostingRenewal(paid.data.orderId); await r.applyHostingRenewal(paid.data.orderId)
  assert.equal((await get(a.id)).nextDueAt.getTime(), a.nextDueAt.getTime(), 'a paid order adds one term however often it is applied')
  assert.equal((await renew(sara, a)).code, 'HOSTING_SERVICE_NOT_FOUND', 'nobody renews another member\'s service')
  assert.equal((await checkout.executeCheckout({ userId: ali.id, hostingRenewServiceId: a.id, discountCode: 'ANY10', payWith: 'wallet', idempotencyKey: `${prefix}-c-${++serial}`, siteUrl: 'x' })).code, 'PROMOTION_NOT_APPLICABLE')

  // ---- Reminders on the listed days, once each.
  const now = new Date()
  await db.hostingService.update({ where: { id: a.id }, data: { nextDueAt: new Date(now.getTime() + 2.5 * DAY) } })
  await r.runHostingLifecycle(now); await r.runHostingLifecycle(now)
  assert.equal(await notices(ali, `hosting:${a.id}:due:3:`), 1, 'three days left: reminded once')

  // ---- From the wallet a day before the due date; a short wallet gets a notice and no renewal.
  await r.setServiceAutoRenew(ali.id, a.id, true)
  const dueSoon = new Date(now.getTime() + 0.5 * DAY)
  await db.hostingService.update({ where: { id: a.id }, data: { nextDueAt: dueSoon } })
  const wallet = await balance(ali)
  await r.runHostingLifecycle(now); await r.runHostingLifecycle(now)
  a = await get(a.id)
  assert.equal(await balance(ali), wallet - 400_000n, 'renewed from the wallet exactly once')
  assert.ok(a.nextDueAt > new Date(now.getTime() + 25 * DAY))
  let b = await service(ali)
  await db.walletAccount.update({ where: { userId_currency: { userId: ali.id, currency: 'IRT' } }, data: { balanceMinor: 100n } })
  await r.setServiceAutoRenew(ali.id, b.id, true)
  await db.hostingService.update({ where: { id: b.id }, data: { nextDueAt: dueSoon } })
  await r.runHostingLifecycle(now)
  assert.equal((await get(b.id)).nextDueAt.getTime(), dueSoon.getTime(), 'no money, no renewal')
  assert.equal(await notices(ali, `hosting:${b.id}:renew-failed:`), 1)

  // ---- Grace days, suspension by the system, warning and termination; staff suspensions are left to staff.
  await db.hostingService.update({ where: { id: b.id }, data: { nextDueAt: new Date(now.getTime() - 2 * DAY) } })
  await r.runHostingLifecycle(now)
  assert.equal((await get(b.id)).status, 'ACTIVE', 'still inside the three grace days')
  await db.hostingService.update({ where: { id: b.id }, data: { nextDueAt: new Date(now.getTime() - 4 * DAY) } })
  await r.runHostingLifecycle(now)
  b = await get(b.id)
  assert.equal(b.status, 'SUSPENDED')
  assert.equal(await db.hostingAction.count({ where: { serviceId: b.id, kind: 'SUSPEND', actor: 'SYSTEM' } }), 1)
  await db.hostingService.update({ where: { id: b.id }, data: { autoRenew: false, suspendedAt: new Date(now.getTime() - 12 * DAY) } })
  await r.runHostingLifecycle(now)
  assert.equal(await notices(ali, `hosting:${b.id}:terminate-warn:`), 1, 'warned before termination')
  await db.hostingService.update({ where: { id: b.id }, data: { suspendedAt: new Date(now.getTime() - 15 * DAY) } })
  await r.runHostingLifecycle(now)
  assert.equal((await get(b.id)).status, 'TERMINATED')

  await db.walletAccount.update({ where: { userId_currency: { userId: ali.id, currency: 'IRT' } }, data: { balanceMinor: 5_000_000n } })
  const c = await service(ali)
  await s.changeServiceStatus(c.id, 'SUSPEND', ali.id, 'abuse')
  await db.hostingService.update({ where: { id: c.id }, data: { suspendedAt: new Date(now.getTime() - 40 * DAY) } })
  await r.runHostingLifecycle(now)
  assert.equal((await get(c.id)).status, 'SUSPENDED', 'a staff suspension is never turned into termination by the system')

  // ---- Paying for a suspended service: reopened when the system suspended it for the unpaid term, not otherwise.
  await db.walletAccount.update({ where: { userId_currency: { userId: ali.id, currency: 'IRT' } }, data: { balanceMinor: 5_000_000n } })
  const d = await service(ali)
  await db.hostingService.update({ where: { id: d.id }, data: { nextDueAt: new Date(now.getTime() - 5 * DAY) } })
  await r.runHostingLifecycle(now)
  assert.equal((await get(d.id)).status, 'SUSPENDED')
  assert.equal((await renew(ali, await get(d.id))).ok, true)
  assert.equal((await get(d.id)).status, 'ACTIVE', 'paid: open again')
  const cDue = (await get(c.id)).nextDueAt
  assert.equal((await renew(ali, await get(c.id))).ok, true)
  const cAfter = await get(c.id)
  assert.ok(cAfter.status === 'SUSPENDED' && cAfter.nextDueAt > cDue, 'term added, staff suspension kept')

  // ---- A renewal paid after the service was deleted goes back to the wallet; a terminated service cannot be renewed.
  assert.equal((await renew(ali, await get(b.id))).code, 'HOSTING_NOT_RENEWABLE')
  const meta = (await r.hostingRenewalQuote(d.id, ali.id)).meta
  await db.hostingService.update({ where: { id: d.id }, data: { status: 'TERMINATED', terminatedAt: now } })
  const late = await db.order.create({ data: { userId: ali.id, totalAmount: 400000, totalMinor: 400_000n, currency: 'IRT', status: 'PAID', provider: 'test', meta: JSON.stringify(meta) } })
  const refundFrom = await balance(ali)
  const job = await jobs.enqueueOrderFulfillment({ orderId: late.id })
  assert.equal((await jobs.processFulfillmentJob(job.id)).ok, true)
  assert.equal(await balance(ali), refundFrom + 400_000n, 'the money went back to the wallet')
  await jobs.processFulfillmentJob(job.id); await r.applyHostingRenewal(late.id)
  assert.equal(await balance(ali), refundFrom + 400_000n, 'and only once')

  // ---- Recovery finds a paid renewal whose job was lost.
  const lost = await renew(ali, await get(a.id))
  await db.hostingAction.deleteMany({ where: { idempotencyKey: `renew:order:${lost.data.orderId}` } })
  await db.fulfillmentJob.deleteMany({ where: { orderId: lost.data.orderId } })
  assert.ok((await r.renewalOrdersWithoutDelivery(50)).some((row) => row.orderId === lost.data.orderId))
  console.log('hosting renewal: by hand, from the wallet, reminders, grace, suspension, termination and refunds verified')
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const orders = (await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    const notes = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notes) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
    await db.userNotification.deleteMany({ where: { userId: { in: ids } } })
    await db.hostingService.deleteMany({ where: { userId: { in: ids } } })
    await db.fulfillmentJob.deleteMany({ where: { orderId: { in: orders } } })
    await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } }).catch(() => undefined)
    await db.payment.deleteMany({ where: { userId: { in: ids } } })
    await db.walletTx.deleteMany({ where: { userId: { in: ids } } })
    await db.invoice.deleteMany({ where: { userId: { in: ids } } })
    await db.order.deleteMany({ where: { id: { in: orders } } })
    await db.hostingProduct.deleteMany({ where: { id: { in: owned.products } } })
    await db.walletAccount.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await db.$disconnect() }
})
