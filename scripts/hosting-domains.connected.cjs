// Real PostgreSQL through the real checkout, wallet and fulfilment: the domain price list, search, ordering and
// transfer, two customers racing for one name, staff registration and cancellation with refund, renewal, name
// servers, transfer codes and the yearly lifecycle. The outside WHOIS/RDAP lookup is a declared double.
// HOSTING_FAULT=norefund keeps the money of the customer who lost the race; =owner reads another member's domain;
// =twice applies a paid renewal twice.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), prefix = `hostdom${Date.now()}`, fault = process.env.HOSTING_FAULT || '', cache = new Map()
const owned = { users: [], tlds: [] }
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
const DAY = 86_400_000

function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let source = fs.readFileSync(file, 'utf8')
  if (file.endsWith('hosting/server/domains.ts')) {
    if (fault === 'norefund') source = source.replace("        await refundOrder(order.id, order.userId, `دامنهٔ ${unicode(String(meta.name))} همزمان سفارش داده شد`)\n", '')
    if (fault === 'owner') source = source.replace('const row = await db.domain.findFirst({ where: { id: domainId, userId }, include', 'const row = await db.domain.findFirst({ where: { id: domainId }, include')
    if (fault === 'twice') source = source.replace("const key = `renew:order:${order.id}`\n  if (await db.domainAction", "const key = `renew:order:${order.id}:${Math.random()}`\n  if (await db.domainAction").replace('where: { id: domain.id, expiresAt: domain.expiresAt }, data: { expiresAt, status', 'where: { id: domain.id }, data: { expiresAt, status')
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
    if (name === '@/modules/settings/server') return { getSettings: async () => ({ siteUrl: 'https://example.invalid' }) }
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

const member = async (key, wallet) => {
  const user = await db.user.create({ data: { email: `${prefix}-${key}@example.invalid`, passwordHash: 'test-only' } })
  owned.users.push(user.id)
  await db.walletAccount.create({ data: { userId: user.id, currency: 'IRT', balanceMinor: wallet } })
  return user
}
const balance = async (user) => (await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: user.id, currency: 'IRT' } } })).balanceMinor

async function main() {
  const checkout = load('src/modules/checkout/server/checkout.ts'), jobs = load('src/modules/fulfillment/server/jobs.ts')
  const d = load('src/modules/hosting/server/domains.ts'), { setDomainChecker } = load('src/modules/hosting/server/domain-check.ts')
  const taken = new Set([`taken${prefix}.com`, `old${prefix}.com`])
  setDomainChecker(async (name) => (name.startsWith('unknown') ? 'unknown' : taken.has(name) ? 'taken' : 'available'))
  // Unique suffixes for this run so a busy database does not interfere.
  const ir = `${prefix}ir`, com = `${prefix}com`
  const tldIr = await d.saveTld({ suffix: ir, registerMinor: '150000', renewMinor: '160000', years: '1,5', needsHandle: true, featured: true })
  const tldCom = await d.saveTld({ suffix: com, registerMinor: '900000', renewMinor: '950000', transferMinor: '900000', years: '1,2,3', featured: true })
  owned.tlds.push(tldIr.id, tldCom.id)
  await assert.rejects(d.saveTld({ suffix: com, registerMinor: '1', renewMinor: '1', years: '1' }), /قبلاً تعریف/)
  await assert.rejects(d.saveTld({ suffix: 'bad suffix', registerMinor: '1', renewMinor: '1', years: '1' }), /پسوند/)
  await assert.rejects(d.saveTld({ suffix: `${prefix}x`, registerMinor: '0', renewMinor: '1', years: '1' }), /بیشتر از صفر/)
  taken.add(`taken.${com}`); taken.add(`old.${com}`)

  // ---- Search: every featured extension, names already ordered here count as taken, IRNIC's three characters.
  let found = await d.searchDomains('Brand')
  assert.deepEqual(found.results.filter((r) => [ir, com].includes(r.suffix)).map((r) => [r.name, r.state]), [[`brand.${ir}`, 'available'], [`brand.${com}`, 'available']])
  assert.equal((await d.searchDomains(`taken.${com}`)).results[0].state, 'taken')

  let serial = 0
  const pay = (user, extra, key = `${prefix}-o-${++serial}`) => checkout.executeCheckout({ userId: user.id, payWith: 'wallet', idempotencyKey: key, siteUrl: 'https://example.invalid', ...extra })
  const ali = await member('ali', 50_000_000n), sara = await member('sara', 50_000_000n)

  // ---- Ordering .ir: handle required, allowed years only, paid once, a registry task for staff.
  assert.equal((await pay(ali, { domainOrder: { name: `brand.${ir}`, years: 5 } })).code, 'HOSTING', 'a .ir domain needs a NIC handle')
  assert.equal((await pay(ali, { domainOrder: { name: `brand.${ir}`, years: 2, handle: 'ab1234-irnic' } })).code, 'DOMAIN_YEARS')
  const before = await balance(ali)
  const bought = await pay(ali, { domainOrder: { name: `Brand.${ir}`, years: 5, handle: 'AB1234-irnic' } })
  assert.equal(bought.ok, true, JSON.stringify(bought))
  assert.equal(await balance(ali), before - 750_000n)
  const replay = await pay(ali, { domainOrder: { name: `Brand.${ir}`, years: 5, handle: 'AB1234-irnic' } }, `${prefix}-o-${serial}`)
  assert.equal(replay.data.replayed, true)
  let brand = await db.domain.findUniqueOrThrow({ where: { orderId: bought.data.orderId } })
  assert.deepEqual([brand.name, brand.status, brand.years, brand.handle, brand.renewMinor], [`brand.${ir}`, 'PENDING', 5, 'ab1234-irnic', 160_000n])
  assert.equal((await db.domainAction.findFirstOrThrow({ where: { domainId: brand.id, kind: 'REGISTER' } })).status, 'WAITING')
  assert.equal((await pay(sara, { domainOrder: { name: `brand.${ir}`, years: 1, handle: 'cd5678-irnic' } })).code, 'DOMAIN_ALREADY_ORDERED')
  found = await d.searchDomains(`brand.${ir}`)
  assert.equal(found.results.find((r) => r.name === `brand.${ir}`).state, 'taken', 'ordered here: no longer offered')

  // ---- Taken names, transfers, encrypted transfer codes.
  assert.equal((await pay(sara, { domainOrder: { name: `taken.${com}`, years: 1 } })).code, 'DOMAIN_TAKEN')
  assert.equal((await pay(sara, { domainOrder: { name: `free.${com}`, transfer: true, authCode: 'abcd-1234' } })).code, 'DOMAIN_NOT_REGISTERED')
  assert.equal((await pay(sara, { domainOrder: { name: `old.${com}`, transfer: true } })).code, 'DOMAIN_AUTHCODE')
  const moved = await pay(sara, { domainOrder: { name: `old.${com}`, transfer: true, authCode: 'Secret-Code-77' } })
  assert.equal(moved.ok, true, JSON.stringify(moved))
  const old = await db.domain.findUniqueOrThrow({ where: { orderId: moved.data.orderId } })
  assert.ok(old.kind === 'TRANSFER' && old.authCode.startsWith('encv1:') && !old.authCode.includes('Secret-Code-77'), 'the transfer code is stored encrypted')
  assert.ok(!JSON.stringify(await d.adminDomains({ q: prefix })).includes(old.authCode))

  // ---- Two customers race for one name: one gets it, the other's money comes back.
  // Both paid before either was delivered (the quote cannot see an order that has no domain row yet).
  const raceMeta = (await d.domainOrderQuote({ name: `race.${com}`, years: 1 })).meta
  const paidOrder = (user) => db.order.create({ data: { userId: user.id, totalAmount: 900000, totalMinor: 900_000n, currency: 'IRT', status: 'PAID', provider: 'test', meta: JSON.stringify(raceMeta) } })
  const [raceA, raceB] = await Promise.all([paidOrder(ali), paidOrder(sara)])
  const racers = { [raceA.id]: ali, [raceB.id]: sara }
  const wallets = { [ali.id]: await balance(ali), [sara.id]: await balance(sara) }
  await Promise.all([d.fulfillDomainOrder(raceA.id), d.fulfillDomainOrder(raceB.id)])
  const winners = await db.domain.findMany({ where: { name: `race.${com}`, status: { not: 'CANCELLED' } } })
  assert.equal(winners.length, 1, 'one live registration per name')
  const loserOrder = winners[0].orderId === raceA.id ? raceB.id : raceA.id
  const loser = racers[loserOrder]
  assert.equal(await balance(loser), wallets[loser.id] + 900_000n, 'the customer who lost the race is refunded in full')
  await d.fulfillDomainOrder(loserOrder)
  assert.equal(await balance(loser), wallets[loser.id] + 900_000n, 'and only once')

  // ---- Staff: register (active with expiry), cancel (refund, name freed).
  await d.completeDomainRegistration(brand.id, {}, ali.id)
  brand = await db.domain.findUniqueOrThrow({ where: { id: brand.id } })
  assert.equal(brand.status, 'ACTIVE')
  assert.equal(brand.expiresAt.getUTCFullYear(), new Date().getUTCFullYear() + 5)
  await assert.rejects(d.completeDomainRegistration(brand.id, {}, ali.id), /در انتظار ثبت نیست/)
  const saraBefore = await balance(sara)
  await d.cancelDomainOrder(old.id, 'transfer refused', ali.id)
  assert.equal(await balance(sara), saraBefore + 900_000n)
  await assert.rejects(d.cancelDomainOrder(old.id, '', ali.id), /هنوز ثبت نشده/)
  assert.equal((await d.domainOrderQuote({ name: `old.${com}`, transfer: true, authCode: 'x-1234' })).amountMinor, 900_000n, 'a cancelled order frees the name')

  // ---- Renewal: from the expiry date, once per order, a registry task for staff.
  const expiry = brand.expiresAt
  const renewal = await pay(ali, { domainRenew: { domainId: brand.id, years: 1 } })
  assert.equal(renewal.ok, true, JSON.stringify(renewal))
  await d.applyDomainRenewal(renewal.data.orderId); await d.applyDomainRenewal(renewal.data.orderId)
  brand = await db.domain.findUniqueOrThrow({ where: { id: brand.id } })
  assert.equal(brand.expiresAt.getUTCFullYear(), expiry.getUTCFullYear() + 1, 'one year added to the expiry, once')
  const renewTask = await db.domainAction.findFirstOrThrow({ where: { domainId: brand.id, kind: 'RENEW', status: 'WAITING' } })
  await d.completeDomainTask(renewTask.id, ali.id, '')
  assert.equal((await pay(sara, { domainRenew: { domainId: brand.id, years: 1 } })).code, 'DOMAIN_NOT_FOUND', 'nobody renews another member\'s domain')

  // ---- Customer: name servers, transfer code once a day, ownership.
  assert.deepEqual((await d.requestNameservers(ali.id, brand.id, 'ns1.host.ir\nns2.host.ir')).nameservers, ['ns1.host.ir', 'ns2.host.ir'])
  assert.equal(await db.domainAction.count({ where: { domainId: brand.id, kind: 'NAMESERVERS', status: 'WAITING' } }), 1)
  await d.requestNameservers(ali.id, brand.id, ['ns3.host.ir', 'ns4.host.ir'])
  assert.equal(await db.domainAction.count({ where: { domainId: brand.id, kind: 'NAMESERVERS', status: 'WAITING' } }), 1, 'a newer request replaces the waiting one')
  await d.requestAuthCode(ali.id, brand.id)
  await assert.rejects(d.requestAuthCode(ali.id, brand.id), /امروز/)
  assert.equal(await d.memberDomain(sara.id, brand.id), null)
  await assert.rejects(d.requestNameservers(sara.id, brand.id, 'ns1.a.ir ns2.a.ir'), /پیدا نشد/)
  assert.ok(!('authCode' in (await d.memberDomain(ali.id, brand.id))))

  // ---- Lifecycle: reminder, wallet renewal from three days before, expiry.
  const now = new Date()
  await db.domain.update({ where: { id: brand.id }, data: { expiresAt: new Date(now.getTime() + 29.5 * DAY) } })
  await d.runDomainLifecycle(now); await d.runDomainLifecycle(now)
  assert.equal(await db.userNotification.count({ where: { userId: ali.id, dedupeKey: { contains: `domain:${brand.id}:due:30:` } } }), 1)
  await d.setDomainAutoRenew(ali.id, brand.id, true)
  const soon = new Date(now.getTime() + 2 * DAY)
  await db.domain.update({ where: { id: brand.id }, data: { expiresAt: soon } })
  const wallet = await balance(ali)
  await d.runDomainLifecycle(now); await d.runDomainLifecycle(now)
  assert.equal(await balance(ali), wallet - 160_000n, 'renewed from the wallet once')
  assert.ok((await db.domain.findUniqueOrThrow({ where: { id: brand.id } })).expiresAt > new Date(now.getTime() + 300 * DAY))
  await db.domain.update({ where: { id: brand.id }, data: { expiresAt: new Date(now.getTime() - DAY), autoRenew: false } })
  await d.runDomainLifecycle(now)
  assert.equal((await db.domain.findUniqueOrThrow({ where: { id: brand.id } })).status, 'EXPIRED')

  // ---- A price-list row with domains is kept; recovery finds a lost order.
  await assert.rejects(d.deleteTld(tldIr.id), /دامنهٔ ثبت‌شده/)
  const lost = await pay(sara, { domainOrder: { name: `unknown-lost.${com}`, years: 1 } })
  assert.equal(lost.ok, true, JSON.stringify(lost))
  await db.domainAction.deleteMany({ where: { domain: { orderId: lost.data.orderId } } })
  await db.domain.deleteMany({ where: { orderId: lost.data.orderId } })
  await db.fulfillmentJob.deleteMany({ where: { orderId: lost.data.orderId } })
  assert.ok((await d.domainOrdersWithoutDelivery(50)).some((row) => row.orderId === lost.data.orderId))
  const again = await jobs.enqueueOrderFulfillment({ orderId: lost.data.orderId, invoiceId: lost.data.invoiceId })
  await jobs.processFulfillmentJob(again.id)
  assert.ok(await db.domain.findUnique({ where: { orderId: lost.data.orderId } }))
  console.log('domains: price list, search, ordering, transfer, race, staff registration and cancellation, renewal, name servers, lifecycle and recovery verified')
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = owned.users
    const orders = (await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    const notes = (await db.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((row) => row.id)
    for (const id of notes) await db.backgroundJob.deleteMany({ where: { kind: 'notification.deliver', payload: { startsWith: `{"notificationId":${id},` } } })
    await db.userNotification.deleteMany({ where: { userId: { in: ids } } })
    await db.domain.deleteMany({ where: { userId: { in: ids } } })
    await db.fulfillmentJob.deleteMany({ where: { orderId: { in: orders } } })
    await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } }).catch(() => undefined)
    await db.payment.deleteMany({ where: { userId: { in: ids } } })
    await db.walletTx.deleteMany({ where: { userId: { in: ids } } })
    await db.invoice.deleteMany({ where: { userId: { in: ids } } })
    await db.order.deleteMany({ where: { id: { in: orders } } })
    await db.domainTld.deleteMany({ where: { id: { in: owned.tlds } } })
    await db.walletAccount.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await db.$disconnect() }
})
