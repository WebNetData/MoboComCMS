// Real PostgreSQL through the real checkout, wallet and fulfilment: extra traffic and plan upgrades on a running
// hosting service, staff tasks for manual delivery, hourly upgrades and recovery.
// HOSTING_FAULT=twice applies a paid add-on twice; =owner quotes another member's service; =closed ignores a per-service
// switch that closed an add-on.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `hostadd-${Date.now()}`, fault = process.env.HOSTING_FAULT || '', cache = new Map()
const owned = { users: [], products: [] }
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
const DAY = 86_400_000

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (fault === 'twice' && file.endsWith('hosting/server/addons.ts')) source = source.replace('const key = `addon:order:${order.id}`', 'const key = `addon:order:${order.id}:${Math.random()}`').replace('where: { id: serviceId, productId: Number(meta.fromProductId) }', 'where: { id: serviceId }')
  if (fault === 'owner' && file.endsWith('hosting/server/addons.ts')) source = source.replace('const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, include: { product: true } })\n  if (!service) throw new HostingRefusal', 'const service = await db.hostingService.findFirst({ where: { id: serviceId }, include: { product: true } })\n  if (!service) throw new HostingRefusal')
  if (fault === 'closed' && file.endsWith('hosting/domain/addons.ts')) source = source.replace('=> service ?? product', '=> product')
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
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleSettings: async () => ({ 'hourly-min-hours': 24 }), getModuleStates: async () => ({}) }
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

async function main() {
  const checkout = load('src/modules/checkout/server/checkout.ts'), jobs = load('src/modules/fulfillment/server/jobs.ts')
  const s = load('src/modules/hosting/server/services.ts'), a = load('src/modules/hosting/server/addons.ts'), r = load('src/modules/hosting/server/renewal.ts'), m = load('src/modules/hosting/server/metering.ts')
  const { upgradeCharge } = load('src/modules/hosting/domain/addons.ts')
  const product = async (slug, data, prices) => { const row = await db.hostingProduct.create({ data: { slug: `${prefix}-${slug}`, name: `${prefix} ${slug}`, kind: 'VPS', ...data, prices: { create: prices.map(([cycle, amountMinor]) => ({ cycle, amountMinor })) } } }); owned.products.push(row.id); return row }
  const small = await product('small', { allowTraffic: true, trafficPackGb: 100, trafficPackMinor: 50_000n, allowUpgrade: true }, [['MONTH', 300_000n]])
  const big = await product('big', {}, [['MONTH', 600_000n]])
  await product('cheap', {}, [['MONTH', 200_000n]])
  await product('cloud', { kind: 'CLOUD_SERVER' }, [['MONTH', 900_000n]])
  let serial = 0
  const pay = (user, extra, key = `${prefix}-o-${++serial}`) => checkout.executeCheckout({ userId: user.id, payWith: 'wallet', idempotencyKey: key, siteUrl: 'https://example.invalid', ...extra })
  const ali = await member('ali', 5_000_000n), sara = await member('sara', 5_000_000n)
  const bought = await pay(ali, { hostingProductId: small.id, hostingCycle: 'MONTH' })
  assert.equal(bought.ok, true, JSON.stringify(bought))
  let svc = await db.hostingService.findUniqueOrThrow({ where: { orderId: bought.data.orderId } })
  await s.deliverService(svc.id, { ipv4: '203.0.113.80', loginUser: 'root', password: 'pw-1' }, ali.id)

  // ---- What the page offers: traffic packs and only dearer plans of the same kind.
  const offer = await a.memberAddons(ali.id, svc.id)
  assert.deepEqual([offer.traffic, offer.upgrades.map((u) => u.productId), offer.renewFirst], [{ packGb: 100, packPrice: 50_000 }, [big.id], false])
  assert.equal(await a.memberAddons(sara.id, svc.id), null)

  // ---- Traffic: paid once, added once, a task for staff since it is delivered by hand.
  const before = await balance(ali)
  const traffic = await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 3 } })
  assert.equal(traffic.ok, true, JSON.stringify(traffic))
  assert.equal(await balance(ali), before - 150_000n)
  assert.equal((await get(svc.id)).extraTrafficGb, 300)
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 3 } }, `${prefix}-o-${serial}`)).data.replayed, true)
  await a.applyHostingAddon(traffic.data.orderId); await a.applyHostingAddon(traffic.data.orderId)
  assert.equal((await get(svc.id)).extraTrafficGb, 300, 'a paid order adds its traffic once')
  const task = await db.hostingAction.findFirstOrThrow({ where: { serviceId: svc.id, kind: 'TRAFFIC' } })
  assert.equal(task.status, 'WAITING')
  assert.equal((await s.adminHostingServices({ status: 'TASKS', q: prefix })).services.some((row) => row.id === svc.id), true, 'staff find it among waiting tasks')
  await a.completeHostingTask(task.id, ali.id)
  await assert.rejects(a.completeHostingTask(task.id, ali.id), /قبلاً انجام شده/)

  // ---- Refusals: another member, too many packs, a discount, a closed switch.
  assert.equal((await pay(sara, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 1 } })).code, 'HOSTING_SERVICE_NOT_FOUND')
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 25 } })).code, 'HOSTING')
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 1 }, discountCode: 'ANY10' })).code, 'PROMOTION_NOT_APPLICABLE')
  await db.hostingService.update({ where: { id: svc.id }, data: { allowTraffic: false } })
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 1 } })).code, 'HOSTING_ADDON_CLOSED', 'staff closed it for this service')
  await db.hostingService.update({ where: { id: svc.id }, data: { allowTraffic: null } })

  // ---- Upgrade: only to a listed plan, for the difference over the days left, then renewals cost the new price.
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'UPGRADE', productId: owned.products[2] } })).code, 'HOSTING_UPGRADE_TARGET')
  const dueAt = new Date(Date.now() + 15 * DAY)
  await db.hostingService.update({ where: { id: svc.id }, data: { nextDueAt: dueAt } })
  const low = upgradeCharge({ cycle: 'MONTH', currentPriceMinor: 300_000n, newPriceMinor: 600_000n, nextDueAt: dueAt, now: new Date(Date.now() + 60_000) })
  const upgrade = await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'UPGRADE', productId: big.id } })
  const high = upgradeCharge({ cycle: 'MONTH', currentPriceMinor: 300_000n, newPriceMinor: 600_000n, nextDueAt: dueAt, now: new Date(Date.now() - 60_000) })
  assert.equal(upgrade.ok, true, JSON.stringify(upgrade))
  const paid = (await db.order.findUniqueOrThrow({ where: { id: upgrade.data.orderId } })).totalMinor
  assert.ok(paid >= low && paid <= high && paid > 100_000n && paid < 200_000n, `about half the difference: ${paid}`)
  svc = await get(svc.id)
  assert.deepEqual([svc.productId, svc.priceMinor, svc.label, svc.nextDueAt.getTime()], [big.id, 600_000n, big.name, dueAt.getTime()], 'new plan and renewal price, same due date')
  assert.equal((await r.hostingRenewalQuote(svc.id, ali.id)).amountMinor, 600_000n)
  assert.equal((await db.hostingAction.findFirstOrThrow({ where: { serviceId: svc.id, kind: 'UPGRADE' } })).status, 'WAITING')
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'UPGRADE', productId: big.id } })).code, 'HOSTING_ADDON_CLOSED', 'the new plan\'s own switch decides now')
  await db.hostingService.update({ where: { id: svc.id }, data: { allowUpgrade: true } })
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'UPGRADE', productId: big.id } })).code, 'HOSTING_UPGRADE_TARGET', 'already on the top plan')
  await db.hostingService.update({ where: { id: svc.id }, data: { nextDueAt: new Date(Date.now() - DAY) } })
  assert.equal((await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'UPGRADE', productId: big.id } })).code, 'HOSTING_RENEW_FIRST', 'an ended term is renewed before an upgrade')

  // ---- Hourly: upgrades without payment; the new rates apply from the next hour.
  const h1 = await product('h1', { kind: 'CLOUD_SERVER', allowUpgrade: true, stoppedHourlyMinor: 100n }, [['HOURLY', 1_000n]])
  const h2 = await product('h2', { kind: 'CLOUD_SERVER', stoppedHourlyMinor: 300n }, [['HOURLY', 2_000n]])
  const hourly = await m.createHourlyService({ userId: ali.id, productId: h1.id, hostname: '', requestKey: `${prefix}-hr` })
  await s.deliverService(hourly.serviceId, { ipv4: '203.0.113.81', loginUser: 'root', password: 'pw-2' }, ali.id)
  assert.equal((await pay(ali, { hostingAddon: { serviceId: hourly.serviceId, kind: 'UPGRADE', productId: h2.id } })).code, 'HOSTING_UPGRADE_HOURLY')
  await a.upgradeHourlyService(ali.id, hourly.serviceId, h2.id)
  const up = await get(hourly.serviceId)
  assert.deepEqual([up.productId, up.priceMinor, up.stoppedHourlyMinor], [h2.id, 2_000n, 300n])
  await assert.rejects(a.upgradeHourlyService(sara.id, hourly.serviceId, h2.id), /پیدا نشد/)

  // ---- Recovery: a paid add-on whose job was lost is found again.
  await db.hostingService.update({ where: { id: svc.id }, data: { nextDueAt: dueAt, productId: small.id } })
  const lost =await pay(ali, { hostingAddon: { serviceId: svc.id, kind: 'TRAFFIC', packs: 1 } })
  await db.hostingAction.deleteMany({ where: { idempotencyKey: `addon:order:${lost.data.orderId}` } })
  await db.fulfillmentJob.deleteMany({ where: { orderId: lost.data.orderId } })
  assert.ok((await a.addonOrdersWithoutDelivery(50)).some((row) => row.orderId === lost.data.orderId))
  const again = await jobs.enqueueOrderFulfillment({ orderId: lost.data.orderId, invoiceId: lost.data.invoiceId })
  await jobs.processFulfillmentJob(again.id)
  assert.ok(!(await a.addonOrdersWithoutDelivery(50)).some((row) => row.orderId === lost.data.orderId))
  console.log('hosting add-ons: traffic, upgrades, staff tasks, refusals, hourly upgrade and recovery verified')
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const orders = (await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    const notes = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notes) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
    await db.userNotification.deleteMany({ where: { userId: { in: ids } } })
    const services = (await db.hostingService.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    await db.fulfillmentJob.deleteMany({ where: { OR: [{ orderId: { in: orders } }, { dedupeKey: { in: services.map((id) => `HOSTING_PROVISION:service:${id}`) } }] } })
    await db.hostingUsageCharge.deleteMany({ where: { serviceId: { in: services } } })
    await db.hostingService.deleteMany({ where: { id: { in: services } } })
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
