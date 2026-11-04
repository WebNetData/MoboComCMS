// Real PostgreSQL: hourly cloud billing (slice 5). Buying without prepayment, one wallet charge per service-hour under
// concurrent runs, stopped-server rate, low-credit warnings, suspension on an empty wallet, return after a top-up,
// termination, deletion by the customer and the usage view. The wallet is real; the module switch is a double.
// HOSTING_FAULT=rate charges the running price while stopped; =unpaid writes the hour even when the wallet refused;
// =resume charges the suspended hours after a top-up. (Two runs meeting are also stopped by the unique hour row.)
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `hosthr-${Date.now()}`, fault = process.env.HOSTING_FAULT || '', cache = new Map()
const owned = { users: [], products: [] }
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
const HOUR = 3_600_000, DAY = 24 * HOUR

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (file.endsWith('hosting/server/metering.ts')) {
    if (fault === 'rate') source = source.replace("const rate = service.powerState === 'STOPPED' ? service.stoppedHourlyMinor : service.priceMinor\n    const next", 'const rate = service.priceMinor\n    const next')
    if (fault === 'unpaid') source = source.replace("if (!moved.ok) throw new Insufficient(moved.message || 'insufficient')", "if (!moved.ok) walletTxId = null")
    if (fault === 'resume') source = source.replace("data: { status: 'ACTIVE', suspendedAt: null, chargedUntil: floorHour(now) }", "data: { status: 'ACTIVE', suspendedAt: null }")
  }
  const mod = { exports: {} }; cache.set(file, mod)
  const req = (name) => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/extensions/server/runtime') return { emitExtensionEvent: async () => {} }
    if (name === '@/modules/mail/server/mailer') return { sendMail: async () => ({ ok: true, messageId: 'test' }) }
    if (name === '@/modules/automation/server/engine') return { emitAutomation: async () => {} }
    if (name === 'next-auth') return { getServerSession: async () => null }
    if (name === '@/modules/identity/auth') return { authOptions: {} }
    if (name === '@/modules/sms/server/sms') return { notifyAdmins: async () => {} }
    if (name === '@/modules/site/server/maintenance') return { closedSectionPlugins: async () => new Set() }
    if (name === '@/modules/content/server/registry') return { itemCards: async () => new Map(), latestItemCards: async () => [] }
    if (name === '@/modules/editor/server/blocks/items' || name === '@/modules/editor/server/blocks/source') return {}
    if (name === '@/modules/imports/server/authority') return { destinationActor: async () => ({}) }
    if (name === '@/modules/referrals/server/referrals') return { awardReferralForInvoice: async () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleSettings: async () => ({ 'hourly-min-hours': 24, 'terminate-days': 14 }), getModuleStates: async () => ({}) }
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
const setBalance = (user, balanceMinor) => db.walletAccount.update({ where: { userId_currency: { userId: user.id, currency: 'IRT' } }, data: { balanceMinor } })
const get = (id) => db.hostingService.findUniqueOrThrow({ where: { id } })
const floorHour = (d) => new Date(Math.floor(d.getTime() / HOUR) * HOUR)
const charges = (id) => db.hostingUsageCharge.findMany({ where: { serviceId: id }, orderBy: { hourStart: 'asc' } })
const debited = async (user) => -(await db.walletTx.aggregate({ where: { userId: user.id, amountMinor: { lt: 0n } }, _sum: { amountMinor: true } }))._sum.amountMinor || 0n

async function main() {
  const m = load('src/modules/hosting/server/metering.ts'), s = load('src/modules/hosting/server/services.ts'), checkout = load('src/modules/checkout/server/checkout.ts')
  const product = await db.hostingProduct.create({ data: { slug: `${prefix}-cloud`, name: `${prefix} cloud`, kind: 'CLOUD_SERVER', stoppedHourlyMinor: 200n, prices: { create: [{ cycle: 'HOURLY', amountMinor: 1_000n }, { cycle: 'MONTH', amountMinor: 600_000n }] } } })
  owned.products.push(product.id)
  const ali = await member('ali', 100_000n), poor = await member('poor', 5_000n)

  // ---- Buying: enough credit for 24 hours, nothing charged up front, one service per request key.
  await assert.rejects(m.createHourlyService({ userId: poor.id, productId: product.id, hostname: '', requestKey: `${prefix}-k0` }), /دست‌کم هزینهٔ/)
  const made = await m.createHourlyService({ userId: ali.id, productId: product.id, hostname: 'Node-1', requestKey: `${prefix}-k1` })
  assert.deepEqual(await m.createHourlyService({ userId: ali.id, productId: product.id, hostname: 'node-1', requestKey: `${prefix}-k1` }), { serviceId: made.serviceId, repeated: true })
  assert.equal(await db.hostingService.count({ where: { userId: ali.id } }), 1)
  assert.equal(await balance(ali), 100_000n, 'nothing is charged before it runs')
  assert.equal((await checkout.executeCheckout({ userId: ali.id, hostingProductId: product.id, hostingCycle: 'HOURLY', payWith: 'wallet', idempotencyKey: `${prefix}-c1`, siteUrl: 'x' })).code, 'HOSTING_HOURLY_LATER', 'hourly is not sold through checkout')
  let svc = await get(made.serviceId)
  assert.deepEqual([svc.status, svc.cycle, svc.priceMinor, svc.stoppedHourlyMinor, svc.hostname], ['PENDING', 'HOURLY', 1_000n, 200n, 'node-1'])
  const now = new Date()
  await m.runHostingMetering(now)
  assert.equal((await charges(svc.id)).length, 0, 'a service not delivered yet is not charged')

  // ---- Delivered: completed hours are charged once, even when two runs meet.
  await s.deliverService(svc.id, { ipv4: '203.0.113.70', loginUser: 'root', password: 'x-pass-1' }, ali.id)
  svc = await get(svc.id)
  assert.equal(svc.nextDueAt, null)
  const started = new Date(now.getTime() - 5.5 * HOUR)
  await db.hostingService.update({ where: { id: svc.id }, data: { startedAt: started } })
  const expected = Math.round((floorHour(now) - floorHour(started)) / HOUR)
  await Promise.all([m.runHostingMetering(now), m.runHostingMetering(now), m.chargeHourlyService(svc.id, now)])
  let rows = await charges(svc.id)
  assert.equal(rows.length, expected, `the ${expected} completed hours, each once`)
  assert.equal(await balance(ali), 100_000n - BigInt(expected) * 1_000n)
  assert.equal(await debited(ali), BigInt(expected) * 1_000n, 'every charge is a wallet movement and nothing else moved')
  assert.ok(rows.every((row, i) => i === 0 || row.hourStart - rows[i - 1].hourStart === HOUR) && rows.every((row) => row.walletTxId))
  await assert.rejects(db.hostingUsageCharge.create({ data: { serviceId: svc.id, userId: ali.id, hourStart: rows[0].hourStart, powerState: 'RUNNING', amountMinor: 1n } }), /Unique constraint/)
  await assert.rejects(db.hostingUsageCharge.create({ data: { serviceId: svc.id, userId: ali.id, hourStart: new Date(rows[0].hourStart.getTime() + 60_000), powerState: 'RUNNING', amountMinor: 1n } }), /HostingUsageCharge_hour_check/)

  // ---- A stopped server pays the disk and IP rate.
  await db.hostingService.update({ where: { id: svc.id }, data: { powerState: 'STOPPED' } })
  const later = new Date(now.getTime() + 2 * HOUR)
  await m.runHostingMetering(later)
  rows = await charges(svc.id)
  assert.deepEqual(rows.slice(-2).map((row) => [row.powerState, row.amountMinor]), [['STOPPED', 200n], ['STOPPED', 200n]])
  await db.hostingService.update({ where: { id: svc.id }, data: { powerState: 'RUNNING' } })

  // ---- The usage view: 48 hours, totals that match the rows, nothing for another member.
  const usage = await m.hourlyUsage(ali.id, svc.id, later)
  assert.equal(usage.hours.length, 48)
  assert.equal(usage.allTotal, rows.reduce((sum, row) => sum + Number(row.amountMinor), 0))
  assert.equal(usage.balance, Number(await balance(ali)))
  assert.equal(await m.hourlyUsage(poor.id, svc.id, later), null)

  // ---- Low credit: warned under a day, then the wallet runs out and the service stops; the wallet never goes below zero.
  await setBalance(ali, 1_500n)
  const t1 = new Date(later.getTime() + HOUR)
  await m.runHostingMetering(t1)
  assert.ok(await db.userNotification.findFirst({ where: { userId: ali.id, dedupeKey: { contains: 'low-credit:3:' } } }), 'warned before it runs out')
  const t2 = new Date(t1.getTime() + 3 * HOUR)
  await m.runHostingMetering(t2)
  svc = await get(svc.id)
  assert.equal(svc.status, 'SUSPENDED')
  assert.ok((await balance(ali)) >= 0n && (await balance(ali)) < 1_000n)
  assert.equal(await db.hostingAction.count({ where: { serviceId: svc.id, kind: 'SUSPEND', actor: 'SYSTEM' } }), 1)
  const suspendedCharges = (await charges(svc.id)).length

  // ---- A top-up brings it back; the suspended hours are not charged.
  await setBalance(ali, 50_000n)
  const t3 = new Date(t2.getTime() + 10 * HOUR)
  await m.runHostingMetering(t3)
  svc = await get(svc.id)
  assert.equal(svc.status, 'ACTIVE')
  assert.equal(svc.chargedUntil.getTime(), floorHour(t3).getTime())
  assert.equal((await charges(svc.id)).length, suspendedCharges, 'the hours it was stopped for lack of credit cost nothing')

  // ---- Deletion by the customer: the name must match, the current hour is charged, then nothing more.
  await assert.rejects(m.terminateHourlyByCustomer(ali.id, svc.id, 'wrong', t3), /بنویسید/)
  await assert.rejects(m.terminateHourlyByCustomer(poor.id, svc.id, 'node-1', t3), /پیدا نشد/)
  const before = await balance(ali)
  await m.terminateHourlyByCustomer(ali.id, svc.id, ' NODE-1 ', new Date(floorHour(t3).getTime() + 20 * 60_000))
  assert.equal((await get(svc.id)).status, 'TERMINATED')
  assert.equal(await balance(ali), before - 1_000n, 'the hour in progress is charged in full')
  const final = (await charges(svc.id)).length
  await m.runHostingMetering(new Date(t3.getTime() + 5 * HOUR))
  assert.equal((await charges(svc.id)).length, final, 'a deleted service costs nothing more')

  // ---- An unpaid suspension ends in termination after the days; a fixed term is not deleted by the customer.
  const second = await m.createHourlyService({ userId: ali.id, productId: product.id, hostname: '', requestKey: `${prefix}-k2` })
  await s.deliverService(second.serviceId, { ipv4: '203.0.113.71', loginUser: 'root', password: 'x-pass-2' }, ali.id)
  await setBalance(ali, 0n)
  await db.hostingService.update({ where: { id: second.serviceId }, data: { startedAt: new Date(t3.getTime() - 2 * HOUR) } })
  await m.runHostingMetering(t3)
  assert.equal((await get(second.serviceId)).status, 'SUSPENDED')
  await db.hostingService.update({ where: { id: second.serviceId }, data: { suspendedAt: new Date(t3.getTime() - 15 * DAY) } })
  await m.runHostingMetering(t3)
  assert.equal((await get(second.serviceId)).status, 'TERMINATED')
  const fixed = await db.hostingService.create({ data: { userId: ali.id, productId: product.id, cycle: 'MONTH', priceMinor: 600_000n, label: 'fixed' } })
  await assert.rejects(m.terminateHourlyByCustomer(ali.id, fixed.id, 'fixed'), /تمدید نکردن/)

  assert.equal(await debited(ali), (await db.hostingUsageCharge.aggregate({ where: { userId: ali.id }, _sum: { amountMinor: true } }))._sum.amountMinor, 'what the wallet paid is exactly what the hours cost')
  console.log('hosting hourly: buying, per-hour charges under concurrency, stopped rate, warnings, suspension, return, termination and deletion verified')
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const notes = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notes) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
    await db.userNotification.deleteMany({ where: { userId: { in: ids } } })
    const services = (await db.hostingService.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    await db.fulfillmentJob.deleteMany({ where: { dedupeKey: { in: services.map((id) => `HOSTING_PROVISION:service:${id}`) } } })
    await db.hostingUsageCharge.deleteMany({ where: { serviceId: { in: services } } })
    await db.hostingService.deleteMany({ where: { id: { in: services } } })
    await db.walletTx.deleteMany({ where: { userId: { in: ids } } })
    await db.hostingProduct.deleteMany({ where: { id: { in: owned.products } } })
    await db.walletAccount.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await db.$disconnect() }
})
