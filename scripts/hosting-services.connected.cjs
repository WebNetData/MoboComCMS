// Real PostgreSQL through the real checkout, wallet and fulfilment: buying hosting and servers, manual and automatic
// delivery, retries, ownership, password reveal, staff states and recovery (docs/specs/hosting-cloud/SPEC.md, slice 2).
// Module switches, outward carriers and the provider system are declared boundaries; a test driver stands in for a system.
// HOSTING_FAULT=owner reads a service without its owner; =claim delivers without claiming the status it decided on;
// =plain stores the login password unencrypted; =once lets a second fulfilment create a second service.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `hostsvc-${Date.now()}`, fault = process.env.HOSTING_FAULT || '', cache = new Map()
const owned = { users: [], products: [], providers: [] }
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (file.endsWith('hosting/server/services.ts')) {
    if (fault === 'owner') source = source.replace('db.hostingService.findFirst({ where: { id: serviceId, userId }, include', 'db.hostingService.findFirst({ where: { id: serviceId }, include')
    if (fault === 'claim') source = source.replace('db.hostingService.updateMany({ where: { id: service.id, status: service.status }, data })', 'db.hostingService.updateMany({ where: { id: service.id }, data })')
    if (fault === 'plain') source = source.replace('...(password ? { loginSecret: encryptPanelCredential(password) } : {}),', '...(password ? { loginSecret: password } : {}),')
    if (fault === 'once') source = source.replace('let service = await db.hostingService.findUnique({ where: { orderId } })', 'let service = null as Awaited<ReturnType<typeof db.hostingService.findUnique>>').replace("if ((error as { code?: string })?.code !== 'P2002') throw error", 'throw error')
  }
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
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, moduleGuard: async () => null, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.join(path.posix.dirname(file), name)
      for (const candidate of [base, base + '.ts', base + '/index.ts']) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate.endsWith('.json') ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : load(candidate)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText)(req, mod, mod.exports)
  return mod.exports
}

const member = async (key, wallet = 5_000_000n) => {
  const user = await db.user.create({ data: { email: `${prefix}-${key}@example.invalid`, passwordHash: 'test-only' } })
  owned.users.push(user.id)
  if (wallet) await db.walletAccount.create({ data: { userId: user.id, currency: 'IRT', balanceMinor: wallet } })
  return user
}
const balance = async (user) => (await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: user.id, currency: 'IRT' } } })).balanceMinor

async function main() {
  const checkout = load('src/modules/checkout/server/checkout.ts'), jobs = load('src/modules/fulfillment/server/jobs.ts')
  const s = load('src/modules/hosting/server/services.ts'), registry = load('src/modules/hosting/server/drivers/registry.ts')
  const { decryptPanelCredential, encryptPanelCredential } = load('src/modules/providers/server/panel-credentials.ts')
  let serial = 0
  const buy = (user, product, cycle = 'MONTH', hostingName = '', key = `${prefix}-order-${++serial}`) => checkout.executeCheckout({ userId: user.id, hostingProductId: product.id, hostingCycle: cycle, hostingName, payWith: 'wallet', idempotencyKey: key, siteUrl: 'https://example.invalid' })
  const product = async (slug, data, prices = [['MONTH', 500_000n, 20_000n], ['YEAR', 5_000_000n, 0n]]) => {
    const row = await db.hostingProduct.create({ data: { slug: `${prefix}-${slug}`, name: `${prefix} ${slug}`, kind: 'VPS', ...data, prices: { create: prices.map(([cycle, amountMinor, setupMinor]) => ({ cycle, amountMinor, setupMinor })) } } })
    owned.products.push(row.id); return row
  }
  const ali = await member('ali', 20_000_000n), sara = await member('sara')

  // ---- Manual delivery: paid from the wallet, one service per order, waiting for staff.
  const manual = await product('manual', {})
  const bought = await buy(ali, manual, 'MONTH', 'Srv1.Example.IR')
  assert.equal(bought.ok, true, JSON.stringify(bought)); assert.equal(bought.data.paid, true)
  assert.equal(await balance(ali), 20_000_000n - 520_000n, 'price plus setup came off the wallet')
  const order = await db.order.findUniqueOrThrow({ where: { id: bought.data.orderId } })
  let service = await db.hostingService.findUniqueOrThrow({ where: { orderId: order.id } })
  assert.deepEqual([service.status, service.cycle, service.priceMinor, service.hostname, service.userId], ['PENDING', 'MONTH', 500_000n, 'srv1.example.ir', ali.id])
  assert.equal((await db.hostingAction.findMany({ where: { serviceId: service.id, kind: 'DELIVER', status: 'WAITING' } })).length, 1)
  assert.ok(await db.userNotification.findFirst({ where: { userId: ali.id, dedupeKey: `hosting:${service.id}:received` } }), 'the customer heard the order is in')
  const replay = await buy(ali, manual, 'MONTH', 'srv1.example.ir', `${prefix}-order-${serial}`)
  assert.equal(replay.data.replayed, true)
  await s.fulfillHostingOrder(order.id); await s.fulfillHostingOrder(order.id)
  assert.equal(await db.hostingService.count({ where: { userId: ali.id } }), 1, 'a replayed order and repeated fulfilment make one service')

  // ---- Ownership: nobody reads or reveals another member's service.
  assert.equal((await s.memberHostingServices(ali.id)).length, 1)
  assert.equal(await s.memberHostingService(sara.id, service.id), null, 'another member gets nothing')
  await assert.rejects(s.revealServicePassword(sara.id, service.id), /پیدا نشد/)
  await assert.rejects(s.revealServicePassword(ali.id, service.id), /رمزی برای نمایش/, 'nothing to reveal before delivery')

  // ---- Staff delivery: required details, one winner when two deliver at once, encrypted password, term starts.
  await assert.rejects(s.deliverService(service.id, { loginUser: 'root', password: 'x' }, ali.id), /آی‌پی یا نشانی پنل/)
  await assert.rejects(s.deliverService(service.id, { ipv4: '300.1.1.1', loginUser: 'root', password: 'x' }, ali.id), /آی‌پی/)
  const password = 'S3cret-pass_' + crypto.randomBytes(4).toString('hex')
  const both = await Promise.allSettled([1, 2].map(() => s.deliverService(service.id, { ipv4: '203.0.113.7', loginUser: 'root', password, panelUrl: 'https://panel.example.invalid', note: 'SSH port 22' }, ali.id)))
  assert.equal(both.filter((r) => r.status === 'fulfilled' && r.value.delivered).length, 1, 'exactly one delivery starts the term')
  service = await db.hostingService.findUniqueOrThrow({ where: { id: service.id } })
  assert.equal(service.status, 'ACTIVE')
  assert.ok(service.loginSecret.startsWith('encv1:') && !service.loginSecret.includes(password), 'the password is stored encrypted')
  const month = new Date(service.startedAt); month.setUTCMonth(month.getUTCMonth() + 1)
  assert.ok(Math.abs(service.nextDueAt - month) < 3 * 86_400_000, 'due one month after delivery')
  assert.equal(await s.revealServicePassword(ali.id, service.id), password)
  assert.equal(await db.hostingAction.count({ where: { serviceId: service.id, kind: 'REVEAL', actorId: ali.id } }), 1, 'a reveal is recorded')
  const view = await s.memberHostingService(ali.id, service.id)
  assert.ok(!('loginSecret' in view) && view.hasPassword && !view.actions.some((a) => a.kind === 'REVEAL'))
  assert.ok(!JSON.stringify(await s.adminHostingServices({ q: prefix })).includes(service.loginSecret), 'staff lists carry no secret either')
  // Editing later keeps the password and the dates.
  await s.deliverService(service.id, { ipv4: '203.0.113.8', loginUser: 'root', password: '' }, ali.id)
  const edited = await db.hostingService.findUniqueOrThrow({ where: { id: service.id } })
  assert.deepEqual([edited.loginSecret, edited.nextDueAt.getTime(), edited.ipv4], [service.loginSecret, service.nextDueAt.getTime(), '203.0.113.8'])

  // ---- Staff states follow their rules; a terminated service is not delivered again.
  await s.changeServiceStatus(service.id, 'SUSPEND', ali.id, 'test')
  await assert.rejects(s.changeServiceStatus(service.id, 'SUSPEND', ali.id), /این کار روی آن انجام نمی‌شود/)
  await s.changeServiceStatus(service.id, 'UNSUSPEND', ali.id)
  await s.changeServiceStatus(service.id, 'TERMINATE', ali.id)
  await assert.rejects(s.deliverService(service.id, { ipv4: '203.0.113.9', loginUser: 'r', password: 'p' }, ali.id), /حذف‌شده/)
  await assert.rejects(s.revealServicePassword(ali.id, service.id), /رمزی برای نمایش/)

  // ---- Automatic delivery through a driver: created on the system once, with a generated encrypted password.
  const calls = []
  let failNext = true
  registry.registerHostingDriver('TEST_CLOUD', () => ({ id: 'TEST_CLOUD', capabilities: ['create'], testConnection: async () => ({ ok: true, message: '' }), provision: async (input) => {
    calls.push(input)
    if (failNext) { failNext = false; throw new Error('system busy') }
    return { externalId: `vm-${input.serviceId}`, ipv4: '198.51.100.4' }
  } }))
  const system = await db.hostingProvider.create({ data: { name: `${prefix} cloud`, family: 'COMPUTE', driver: 'TEST_CLOUD', url: 'https://cloud.example.invalid', secret: encryptPanelCredential('token'), capacity: 2 } })
  owned.providers.push(system.id)
  const auto = await product('auto', { kind: 'CLOUD_SERVER', fulfillment: 'DRIVER', providerId: system.id, providerPlan: 'cx22' }, [['MONTH', 300_000n, 0n], ['HOURLY', 500n, 0n]])
  const first = await buy(sara, auto, 'MONTH', 'web-1')
  assert.equal(first.ok, true, JSON.stringify(first)); assert.equal(first.data.fulfillmentPending, true, 'the first call failed and is retried')
  let vm = await db.hostingService.findUniqueOrThrow({ where: { orderId: first.data.orderId } })
  assert.equal(vm.status, 'FAILED')
  assert.equal(await db.hostingAction.count({ where: { serviceId: vm.id, kind: 'PROVISION', status: 'FAILED' } }), 1)
  const job = await db.fulfillmentJob.findFirstOrThrow({ where: { orderId: first.data.orderId, kind: 'HOSTING_PROVISION' } })
  assert.equal(job.status, 'FAILED')
  await db.fulfillmentJob.update({ where: { id: job.id }, data: { availableAt: new Date() } })
  assert.equal((await jobs.processFulfillmentJob(job.id)).ok, true)
  vm = await db.hostingService.findUniqueOrThrow({ where: { id: vm.id } })
  assert.deepEqual([vm.status, vm.externalId, vm.ipv4, vm.loginUser], ['ACTIVE', `vm-${vm.id}`, '198.51.100.4', `u${vm.id}`])
  assert.equal(calls.length, 2); assert.equal(calls[1].plan, 'cx22'); assert.equal(calls[1].hostname, 'web-1')
  assert.equal(decryptPanelCredential(vm.loginSecret), calls[1].password, 'the generated password is what the system received')
  assert.ok(calls[1].password.length >= 20 && calls[1].password !== calls[0].password)
  await assert.rejects(db.hostingService.create({ data: { userId: sara.id, productId: auto.id, providerId: system.id, cycle: 'MONTH', priceMinor: 1n, label: 'x', externalId: `vm-${vm.id}` } }), /Unique constraint/, 'one service per machine on a system')

  // ---- Refusals: hourly waits for metering, a web plan needs a domain, a full system sells no more.
  const hourly = await buy(sara, auto, 'HOURLY')
  assert.equal(hourly.code, 'HOSTING_HOURLY_LATER')
  const web = await product('web', { kind: 'SHARED' })
  assert.equal((await buy(sara, web, 'MONTH', 'not a domain')).code, 'HOSTING')
  assert.equal((await buy(sara, web, 'WEEK', 'shop.example.ir')).code, 'HOSTING_CYCLE')
  const second = await buy(sara, auto, 'MONTH')
  assert.equal(second.ok, true)
  assert.equal((await buy(sara, auto, 'MONTH')).code, 'HOSTING_FULL', 'capacity two: the third is refused')
  await db.hostingProduct.update({ where: { id: web.id }, data: { active: false } })
  assert.equal((await buy(sara, web, 'MONTH', 'shop.example.ir')).code, 'HOSTING_PRODUCT_NOT_FOUND')
  await assert.rejects(db.hostingService.create({ data: { userId: sara.id, productId: auto.id, status: 'ACTIVE', cycle: 'MONTH', priceMinor: 1n, label: 'x', startedAt: new Date() } }), /HostingService_active_dates_check/, 'an active fixed-term service knows its due date')

  // ---- Recovery: a paid order whose job and service were lost is found and delivered.
  const lost = await buy(ali, manual, 'YEAR', 'lost.example.ir')
  await db.hostingAction.deleteMany({ where: { service: { orderId: lost.data.orderId } } })
  await db.hostingService.deleteMany({ where: { orderId: lost.data.orderId } })
  await db.fulfillmentJob.deleteMany({ where: { orderId: lost.data.orderId } })
  const missing = await s.hostingOrdersWithoutDelivery(50)
  assert.ok(missing.some((row) => row.orderId === lost.data.orderId))
  const again = await jobs.enqueueOrderFulfillment({ orderId: lost.data.orderId, invoiceId: lost.data.invoiceId })
  await jobs.processFulfillmentJob(again.id)
  assert.equal((await db.hostingService.findUniqueOrThrow({ where: { orderId: lost.data.orderId } })).cycle, 'YEAR')
  assert.ok(!(await s.hostingOrdersWithoutDelivery(50)).some((row) => row.orderId === lost.data.orderId))
  console.log('hosting services: checkout, wallet, manual and automatic delivery, retries, ownership, states and recovery verified')
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const orders = (await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    const notices = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notices) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
    await db.userNotification.deleteMany({ where: { userId: { in: ids } } })
    await db.hostingService.deleteMany({ where: { userId: { in: ids } } })
    await db.fulfillmentJob.deleteMany({ where: { orderId: { in: orders } } })
    await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } }).catch(() => undefined)
    await db.payment.deleteMany({ where: { userId: { in: ids } } })
    await db.walletTx.deleteMany({ where: { userId: { in: ids } } })
    await db.invoice.deleteMany({ where: { userId: { in: ids } } })
    await db.order.deleteMany({ where: { id: { in: orders } } })
    await db.hostingProduct.deleteMany({ where: { id: { in: owned.products } } })
    await db.hostingProvider.deleteMany({ where: { id: { in: owned.providers } } })
    await db.walletAccount.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await db.$disconnect() }
})
