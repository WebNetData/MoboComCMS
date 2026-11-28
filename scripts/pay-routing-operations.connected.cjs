const assert = require('node:assert/strict')
const { randomUUID, randomBytes, createHash } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
if (!/^mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname.slice(1))) throw Error('Disposable Pay test database required')
process.env.PANEL_CREDENTIAL_KEY = '12'.repeat(32)
process.env.NEXTAUTH_URL = 'https://mobocom.invalid'
process.env.MOBOCOM_PAY_BANK_PROVIDER = 'fixture'
process.env.MOBOCOM_PAY_BANK_SECRET = 'synthetic-fixture-secret-only-0123456789abcdef'
const prisma = new PrismaClient(), stamp = 'routing-' + randomUUID(), users = [], gateways = [], snapshots = new Map()
const keys = ['billing.mobocom-pay.v1', 'publicApiEnabled'], state = { sends: 0, auditFault: false, faultAction: 'mobocom-pay.bot.routing' }
function wrap(client) {
  return new Proxy(client, { get(target, name) {
    if (name === '$transaction') return (work, options) => target.$transaction(tx => work(wrap(tx)), options)
    if (name === 'auditLog') return new Proxy(target.auditLog, { get(model, method) {
      if (method === 'create') return args => { if (state.auditFault && args.data.action === state.faultAction) throw Error('fixture audit fault'); return model.create(args) }
      return typeof model[method] === 'function' ? model[method].bind(model) : model[method]
    } })
    return typeof target[name] === 'function' ? target[name].bind(target) : target[name]
  } })
}
const db = wrap(prisma), mocks = {
  '@/platform/database/prisma': { db }, react: { ...require('react'), cache: fn => fn },
  '@/extensions/server/modules': { isModuleEnabled: async () => true },
  '@/modules/identity/server/access': {resolveCurrentUser: async (id, _at, tx = db) => { const u = await tx.user.findUnique({where:{id}}); return u?.status === 'ACTIVE' ? u : null }, requireUser: async (req, tx = db) => tx.user.findUnique({ where: { id: Number(req.headers.get('x-fixture-user')) } }), requirePerm: async (req, _p, tx = db) => tx.user.findUnique({ where: { id: Number(req.headers.get('x-fixture-user')) } }) },
  '@/modules/identity/server/authentication-restrictions': { globalAuthenticationDenied: async () => false },
  '@/modules/account/server/section-access': { userOpensSection: async () => true },
  '@/modules/site/server/maintenance': { loadMaintenance: async () => ({}) },
  '@/modules/billing/server/pay/bot/transport': { sendBotVerification: async () => { state.sends++; return {status:200,body:'{"ok":true}'} } },
}
const load = require('./connected-source-loader.cjs')(mocks), pay = load('src/modules/billing/server/pay.ts'), policy = load('src/modules/billing/domain/pay-policy.ts')
const { encryptPanelCredential } = load('src/modules/providers/server/panel-credentials.ts')
let merchant, otherMerchant, terminal, bank, connection
const put = (key, value) => db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
const actor = u => ({ id: u.id, email: u.email, req: new NextRequest('https://mobocom.invalid/api/pay', { headers: { origin: 'https://mobocom.invalid', 'x-fixture-user': String(u.id) } }) })
const paymentId = response => new URL(response.links[0].url).pathname.split('/').pop()
const rule = (changes = {}) => ({ id: 'selected', name: 'Selected', enabled: true, minAmountToman: '', maxAmountToman: '', types: ['purchase'], minPayments: 2, minMembershipDays: 10, gateways: gateways.slice(0, 2).map(g => `db:${g.id}`), ...changes })
async function ticket(id) {
  const token = randomBytes(32).toString('base64url')
  const claim = await db.payPayment.updateMany({ where: { id, status: 'PENDING', payerSessionHash: '' }, data: { payerSessionHash: createHash('sha256').update(token).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('09121234567'), payerPhoneLast4: '4567', payerVerifiedAt: new Date(), payerSessionExpiresAt: new Date(Date.now() + 3600000) } })
  assert.equal(claim.count, 1)
  return new NextRequest(`https://mobocom.invalid/pay/${id}`, { headers: { cookie: `${pay.payPayerCookie(id)}=${token}`, origin: 'https://mobocom.invalid' } })
}
async function main() {
  for (const key of keys) snapshots.set(key, await db.setting.findUnique({ where: { key } }))
  for (const label of ['owner', 'other', 'admin']) users.push(await db.user.create({ data: { email: stamp + label + '@example.invalid', passwordHash: '!' } }))
  const a = actor(users[0]), b = actor(users[1]), admin = actor(users[2])
  bank = await db.bankAccount.create({ data: { bankName: stamp, holderName: stamp, accountNumber: '123456789' } })
  for (let i = 0; i < 3; i++) gateways.push(await db.gateway.create({ data: { name: `${stamp}-${i}`, provider: 'CARD_TRANSFER', active: true, fiat: 'IRR' } }))
  await put(keys[0], JSON.stringify({ ...policy.defaults(), incomingEnabled: true, providerId: 'fixture', bankAccountIds: [bank.id], minPaymentRial: '1' })); await put(keys[1], 'true')
  merchant = await pay.enrollMerchant(admin, { userId: users[0].id, note: 'Synthetic Admin provision', name: stamp, website: 'https://merchant.invalid' }); await pay.changeMerchant(admin, { id: merchant.id, status: 'ACTIVE' })
  otherMerchant = await pay.enrollMerchant(admin, { userId: users[1].id, note: 'Synthetic Admin provision', name: stamp + '-other', website: 'https://merchant.invalid' }); await pay.changeMerchant(admin, { id: otherMerchant.id, status: 'ACTIVE' })
  terminal = await pay.createTerminal(a, { name: stamp, returnUrl: 'https://merchant.invalid/return' })
  const saved = await pay.saveBotIntegration(a, { terminalId: terminal.id, version: 0, callbackUrl: 'https://merchant.invalid/api/payment', callbackToken: 'synthetic-callback-secret-only', ackPolicy: 'JSON_OK', responseMode: 'LINKS', active: true })
  connection = saved.integration; const token = saved.token
  connection = (await pay.saveBotRouting(a, { id: connection.id, version: connection.routingVersion, rules: [rule()] })).integration
  const base = { api_key: token, amount: 10000, order_id: 'order-first', user_id: 123456789, type: 'purchase', payment_count: 3, membership_days: 45 }
  const create = input => pay.createBotPayment(new NextRequest(`https://mobocom.invalid/api/v1/pay/bot/${connection.id}`), connection.id, input)
  const result = await create({ ...base, amount: '10000', payment_count: '3', membership_days: '45', register: '1735689600', balance: '0' })
  assert.equal(result.links.length, 2)
  assert.deepEqual(await create(base), result)
  const id = paymentId(result), urls = result.links.map(x => new URL(x.url))
  assert.ok(urls.every(u => u.pathname.endsWith('/' + id))); assert.deepEqual(urls.map(u => u.searchParams.get('method')), gateways.slice(0, 2).map(g => `db:${g.id}`))
  assert.equal(await db.payPayment.count({ where: { merchantId: merchant.id, externalId: base.order_id } }), 1)
  const delivery = await db.payBotDelivery.findUniqueOrThrow({ where: { paymentId: id } }), initialSnapshot = delivery.routingSnapshot
  assert.equal(await db.payBotDelivery.count({ where: { paymentId: id } }), 1)
  assert.deepEqual(await create({ ...base, payment_count: 0, membership_days: -1 }), result)
  connection = (await pay.saveBotRouting(a, { id: connection.id, version: connection.routingVersion, rules: [rule({ enabled: false })] })).integration
  assert.deepEqual(await create(base), result); assert.equal((await db.payBotDelivery.findUniqueOrThrow({ where: { paymentId: id } })).routingSnapshot, initialSnapshot)
  await assert.rejects(db.payBotDelivery.update({ where: { id: delivery.id }, data: { routingSnapshot: '' } }))
  const noCookie = new NextRequest(`https://mobocom.invalid/pay/${id}`)
  await assert.rejects(pay.startPayGateway(noCookie, id, { gatewayRef: `db:${gateways[0].id}` }), e => e.status === 401)
  const req = await ticket(id), view = await pay.checkoutView(id, req)
  assert.equal(view.verification.verified, true); assert.deepEqual(view.gateways.map(g => g.ref).sort(), gateways.slice(0, 2).map(g => `db:${g.id}`).sort())
  await assert.rejects(pay.startPayGateway(req, id, { gatewayRef: `db:${gateways[2].id}` }), e => e.status === 409)
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id } })).invoiceId, null)
  const starts = await Promise.allSettled([0, 1].map(i => pay.startPayGateway(req, id, { gatewayRef: `db:${gateways[i].id}` })))
  assert.equal(starts.filter(x => x.status === 'fulfilled').length, 1);assert.ok(starts.some(x => x.status === 'rejected' && x.reason.status === 409)); const payment = await db.payPayment.findUniqueOrThrow({ where: { id } }); assert.ok(payment.invoiceId)
  assert.equal(await db.invoice.count({ where: { idempotencyKey: 'pay-collection:' + id } }), 1)
  await assert.rejects(pay.saveBotRouting(a, { id: connection.id, version: connection.routingVersion - 1, rules: [] }), e => e.status === 409)
  await assert.rejects(pay.saveBotRouting(b, { id: connection.id, version: connection.routingVersion, rules: [] }), e => e.status === 404)
  const before = await db.payBotIntegration.findUniqueOrThrow({ where: { id: connection.id } }); state.auditFault = true
  try { await assert.rejects(pay.saveBotRouting(a, { id: connection.id, version: connection.routingVersion, rules: [] }), /fixture audit fault/) } finally { state.auditFault = false }
  const after = await db.payBotIntegration.findUniqueOrThrow({ where: { id: connection.id } }); assert.equal(after.version, before.version); assert.equal(after.routingVersion, before.routingVersion); assert.equal(after.routingRules, before.routingRules)
  const fallback = await create({ ...base, order_id: 'disabled-fallback' }); assert.equal(fallback.links.length, 1); assert.equal(new URL(fallback.links[0].url).searchParams.has('method'), false)
  connection = (await pay.saveBotRouting(a, { id: connection.id, version: connection.routingVersion, rules: [rule()] })).integration
  const missing = await create({ ...base, order_id: 'missing-history', payment_count: null, membership_days: '' }); assert.equal(missing.links.length, 1); assert.equal(new URL(missing.links[0].url).searchParams.has('method'), false)
  await db.gateway.updateMany({ where: { id: { in: gateways.slice(0, 2).map(g => g.id) } }, data: { active: false } })
  await assert.rejects(create({ ...base, order_id: 'unavailable' }), e => e.status === 503)
  assert.equal(await db.payPayment.count({ where: { merchantId: merchant.id, externalId: 'unavailable' } }), 0)
  await db.gateway.updateMany({ where: { id: { in: gateways.slice(0, 2).map(g => g.id) } }, data: { active: true } })
  for (let i = 0; i < 101; i++) await create({ ...base, order_id: `bulk-${String(i).padStart(3, '0')}` })
  const page = await pay.botOperations(a, { page: 5 }); assert.equal(page.total, 104); assert.equal(page.pages, 5); assert.equal(page.items.length, 4)
  const search = await pay.botOperations(a, { q: 'order-first', terminalId: terminal.id, paymentStatus: 'PENDING', status: 'WAITING' }); assert.equal(search.total, 1); assert.equal(search.items[0].paymentId, id)
  assert.equal((await pay.botOperations(b)).total, 0); await assert.rejects(pay.botOperationDetail(b, delivery.id), e => e.status === 404)
  await pay.reportPayReference(id, 'ROUTEREF001'); const current = await db.payPayment.findUniqueOrThrow({ where: { id } })
  await db.paymentReceipt.create({ data: { invoiceId: current.invoiceId, bankAccountId: bank.id, amountMinor: current.totalMinor, trackingCode: 'ROUTEREF001' } })
  await pay.acceptBankEvent({ providerId: 'fixture', externalId: stamp + '-event', bankAccountId: bank.id, transferReference: 'ROUTEREF001', amountRial: current.totalMinor.toString(), occurredAt: new Date().toISOString(), targetPaymentId: id }, stamp + '-event')
  let d = await db.payBotDelivery.findUniqueOrThrow({ where: { id: delivery.id } }); assert.equal(d.status, 'QUEUED')
  assert.equal(await db.walletTx.count({ where: { userId: a.id, type: 'PAY_CREDIT' } }), 1)
  let operations = await pay.botOperations(a); assert.equal(operations.summary.paidUndelivered, 1); assert.equal(operations.summary.queued, 1)
  assert.equal(operations.summary.creditIssues, 0);assert.equal((await pay.botOperationDetail(a, d.id)).operation.creditMatches, true)
  await db.backgroundJob.updateMany({where:{kind:'pay.bot-delivery',payload:{contains:d.id}},data:{lastError:'synthetic-private-job-error',result:'synthetic-private-job-result'}})
  const detail = JSON.stringify(await pay.botOperationDetail(a, d.id)); assert.ok(!detail.includes('synthetic-private-job-error'));assert.ok(!detail.includes('synthetic-private-job-result')); assert.ok(!detail.includes(token)); assert.ok(!detail.includes('synthetic-callback-secret-only')); assert.ok(!detail.includes('lastError'))
  await assert.rejects(pay.recoverBotDelivery(a, { id: d.id, version: d.version, action: 'queue', confirmed: true }), e => e.status === 409)
  await assert.rejects(pay.recoverBotDelivery(a, { id: d.id, version: d.version, action: 'queue', confirmed: false }))
  assert.equal((await db.payBotDelivery.updateMany({ where: { id: d.id, status: 'QUEUED', version: d.version }, data: { updatedAt: new Date(Date.now() - 310000) } })).count, 1)
  state.faultAction='mobocom-pay.bot.queue-repair';state.auditFault=true
  try{await assert.rejects(pay.recoverBotDelivery(a,{id:d.id,version:d.version,action:'queue',confirmed:true}),/fixture audit fault/)}finally{state.auditFault=false}
  assert.equal((await db.payBotDelivery.findUniqueOrThrow({where:{id:d.id}})).version,d.version)
  const queuedVersion = d.version; await pay.recoverBotDelivery(a, { id: d.id, version: queuedVersion, action: 'queue', confirmed: true })
  await assert.rejects(pay.recoverBotDelivery(a, { id: d.id, version: queuedVersion, action: 'queue', confirmed: true }), e => e.status === 409)
  assert.equal(await db.backgroundJob.count({ where: { kind: 'pay.bot-delivery', payload: { contains: d.id } } }), 1)
  d = await db.payBotDelivery.findUniqueOrThrow({ where: { id: d.id } })
  assert.equal((await db.payBotDelivery.updateMany({ where: { id: d.id, status: 'QUEUED', version: d.version }, data: { status: 'SENDING', attemptToken: randomUUID(), lastAttemptAt: new Date() } })).count, 1)
  await assert.rejects(pay.recoverBotDelivery(a, { id: d.id, version: d.version, action: 'inspect', confirmed: true }), e => e.status === 409)
  assert.equal((await db.payBotDelivery.updateMany({ where: { id: d.id, status: 'SENDING', version: d.version }, data: { lastAttemptAt: new Date(Date.now() - 130000) } })).count, 1)
  const concurrent = await Promise.allSettled([1, 2].map(() => pay.recoverBotDelivery(a, { id: d.id, version: d.version, action: 'inspect', confirmed: true })))
  assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1); assert.equal((await db.payBotDelivery.findUniqueOrThrow({ where: { id: d.id } })).status, 'UNKNOWN')
  assert.equal(await db.walletTx.count({ where: { userId: a.id, type: 'PAY_CREDIT' } }), 1)
  const stableConfigVersion=connection.version
  const routeUpdate=await create({...base,order_id:'routing-edit-delivery'}),routeUpdateId=paymentId(routeUpdate)
  connection=(await pay.saveBotRouting(a,{id:connection.id,version:connection.routingVersion,rules:[]})).integration
  assert.equal(connection.version,stableConfigVersion,'routing-only edits preserve callback authority')
  await ticket(routeUpdateId);await pay.reportPayReference(routeUpdateId,'ROUTEREF002')
  const routePayment=await db.payPayment.findUniqueOrThrow({where:{id:routeUpdateId}})
  await pay.acceptBankEvent({providerId:'fixture',externalId:stamp+'-route-event',bankAccountId:bank.id,transferReference:'ROUTEREF002',amountRial:routePayment.totalMinor.toString(),occurredAt:new Date().toISOString(),targetPaymentId:routeUpdateId},stamp+'-route-event')
  const routeDelivery=await db.payBotDelivery.findUniqueOrThrow({where:{paymentId:routeUpdateId}})
  await pay.deliverBotPayment({deliveryId:routeDelivery.id});assert.equal(state.sends,1)
  assert.equal((await db.payBotDelivery.findUniqueOrThrow({where:{id:routeDelivery.id}})).status,'SENT')
  assert.equal(await db.walletTx.count({where:{userId:a.id,type:'PAY_CREDIT'}}),2)
  console.log('Pay routing and operations connected acceptance passed')
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => {
  try {
    const deliveries = merchant ? await db.payBotDelivery.findMany({ where: { payment: { merchantId: merchant.id } }, select: { id: true } }) : []
    if (deliveries.length) await db.backgroundJob.deleteMany({ where: { kind: 'pay.bot-delivery', OR: deliveries.map(({ id }) => ({ payload: { contains: id } })) } })
    const payments = merchant ? await db.payPayment.findMany({ where: { merchantId: merchant.id }, select: { invoiceId: true } }) : []
    const invoiceIds = payments.map(p => p.invoiceId).filter(Boolean)
    if (merchant) { await db.payBotDelivery.deleteMany({ where: { payment: { merchantId: merchant.id } } }); await db.payBotIntegration.deleteMany({ where: { terminal: { merchantId: merchant.id } } }); if (bank) await db.payBankEvent.deleteMany({ where: { bankAccountId: bank.id } }); await db.payPayment.deleteMany({ where: { merchantId: merchant.id } }); await db.payTerminal.deleteMany({ where: { merchantId: merchant.id } }); await db.payMerchant.deleteMany({ where: { id: merchant.id } }) }
    if (otherMerchant) await db.payMerchant.deleteMany({ where: { id: otherMerchant.id } })
    const ids = users.map(u => u.id)
    await db.payment.deleteMany({ where: { OR: [{ userId: { in: ids } }, { invoiceId: { in: invoiceIds } }] } }); await db.walletTx.deleteMany({ where: { userId: { in: ids } } }); await db.walletAccount.deleteMany({ where: { userId: { in: ids } } }); await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } }); await db.userNotification.deleteMany({ where: { userId: { in: ids } } }); if (invoiceIds.length) await db.invoice.deleteMany({ where: { id: { in: invoiceIds } } }); await db.user.deleteMany({ where: { id: { in: ids } } })
    if (gateways.length) await db.gateway.deleteMany({ where: { id: { in: gateways.map(g => g.id) } } }); if (bank) await db.bankAccount.delete({ where: { id: bank.id } })
    for (const [key, row] of snapshots) { if (row) await put(key, row.value); else await db.setting.deleteMany({ where: { key } }) }
  } catch (e) { console.error('Owned fixture cleanup failed', e); process.exitCode = 1 } finally { await db.$disconnect() }
})
