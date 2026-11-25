// Disposable PostgreSQL; real Identity sessions, Pay guards and bank reconciliation.
const assert = require('node:assert/strict')
const { randomUUID, randomBytes, createHash } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const { encode } = require('next-auth/jwt')
if (!/^mobocom_pay_test_[a-z0-9_]+$/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname.slice(1))) throw Error('Owned disposable Pay database required')
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex')
process.env.NEXTAUTH_URL = 'https://mobocom.invalid'
process.env.PANEL_CREDENTIAL_KEY = '12'.repeat(32)
process.env.MOBOCOM_PAY_BANK_PROVIDER = 'fixture'
process.env.MOBOCOM_PAY_BANK_SECRET = 'synthetic-fixture-secret-only-0123456789abcdef'
const db = new PrismaClient(), stamp = 'assets-' + randomUUID(), users = [], merchants = [], roles = [], invoices = []
let auditFault = false
const sourceDb = new Proxy(db, { get(t, n) {
  if (n === '$transaction') return (work, options) => t.$transaction(tx => work(new Proxy(tx, { get(x, k) {
    if (k === 'auditLog') return new Proxy(x.auditLog, { get(m, f) {
      if (f === 'create') return args => { if (auditFault && args.data.action === 'mobocom-pay.payment.verified') throw Error('synthetic credit audit failure'); return m.create(args) }
      return typeof m[f] === 'function' ? m[f].bind(m) : m[f]
    } })
    return typeof x[k] === 'function' ? x[k].bind(x) : x[k]
  } })), options)
  return typeof t[n] === 'function' ? t[n].bind(t) : t[n]
} })
const keys = ['billing.mobocom-pay.v1', 'extension.mobocom-pay.state.v1', 'security.policy.v1', 'publicApiEnabled'], snapshots = new Map()
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: sourceDb }, react: { ...require('react'), cache: fn => fn } })
const pay = load('src/modules/billing/server/pay.ts'), policy = load('src/modules/billing/domain/pay-policy.ts')
const payments = load('src/modules/billing/server/pay/payments.ts'), reconcile = load('src/modules/billing/server/pay/reconcile.ts')
const assets = load('src/modules/billing/server/pay/assets.ts'), wallet = load('src/modules/wallet/server/wallet.ts')
const access = load('src/modules/identity/server/access.ts')
const put = (key, value) => db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
const key = () => randomUUID()
async function actor(u) {
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(u.id), authAt: Date.now() } })
  return { id: u.id, email: u.email, req: new NextRequest('https://mobocom.invalid/api/pay/overview', { headers: { cookie: '__Secure-next-auth.session-token=' + token, origin: 'https://mobocom.invalid' } }) }
}
let bank, gateway, rateBefore, rateCaptured = false
async function main() {
  try {
    for (const k of keys) snapshots.set(k, await db.setting.findUnique({ where: { key: k } }))
    rateBefore = await db.currencyRate.findUnique({ where: { code: 'USDT' } }); rateCaptured = true
    const role = await db.role.create({ data: { name: stamp, permissions: 'mobocom-pay.manage' } }); roles.push(role.id)
    for (const [label, roleName, roleId] of [['manager', 'ADMIN', role.id], ['settler', 'ADMIN', null], ['owner', 'CUSTOMER', null]]) users.push(await db.user.create({ data: { email: stamp + label + '@example.invalid', passwordHash: '!', role: roleName, roleId } }))
    const [admin, settler, owner] = await Promise.all(users.map(actor))
    bank = await db.bankAccount.create({ data: { bankName: stamp, holderName: stamp, accountNumber: '123456789', collectionUse: 'GENERAL' } })
    gateway = await db.gateway.create({ data: { name: stamp, provider: 'CARD_TRANSFER', active: true, fiat: 'IRR' } })
    const defaults = policy.defaults(); assert.equal(defaults.rails.length, 5)
    const settings = policy.normalizePaySettings({ ...defaults, incomingEnabled: true, providerId: 'fixture', bankAccountIds: [bank.id], minPaymentRial: '1', minSettlementRial: '1', rails: defaults.rails.map(r => r.id === 'USDT_BSC' ? { ...r, enabled: true, rialPerUnit: '1000000', fees: { currency: 'USDT', bps: 100, flat: '0.1', cap: '0.12' } } : r) })
    await put(keys[0], JSON.stringify(settings)); await put(keys[1], '{"enabled":true,"settings":{}}'); await put(keys[2], '{"requireAdmin2fa":false}'); await put(keys[3], 'true'); access.clearAdminPolicyCache()
    const rate = (n, at = new Date()) => db.currencyRate.upsert({ where: { code: 'USDT' }, create: { code: 'USDT', rate: n, source: 'MANUAL', fetchedAt: at }, update: { rate: n, source: 'MANUAL', fetchedAt: at, pendingRate: null, pendingAt: null } })
    await rate(100000)
    const m = await pay.enrollMerchant(admin, { userId: owner.id, name: stamp, website: '', note: 'Synthetic provision' }); merchants.push(m.id)
    const manage = async (action, extra) => pay.manageMerchant(admin, { id: m.id, version: (await db.payMerchant.findUniqueOrThrow({ where: { id: m.id } })).version, note: 'Synthetic review', action, ...extra })
    await manage('status', { status: 'ACTIVE' })
    const instagram = await pay.createTerminal(owner, { name: 'Instagram', channelType: 'INSTAGRAM', channelUrl: 'https://instagram.com/synthetic' })
    const channel = await pay.createTerminal(owner, { name: 'Channel', channelType: 'CHANNEL', channelUrl: 'https://channel.invalid/profile' })
    const link = await pay.createTerminal(owner, { name: 'Link', channelType: 'PAYMENT_LINK' })
    assert.equal(link.returnUrl, ''); assert.equal(channel.channelUrl, 'https://channel.invalid/profile'); assert.equal(m.website, '')
    await assert.rejects(pay.createTerminal(owner, { name: 'Website', returnUrl: 'https://merchant.invalid/return' }))
    await assert.rejects(pay.saveBotIntegration(owner, { terminalId: instagram.id, version: 0, callbackUrl: 'https://instagram.com/callback', ackPolicy: 'JSON_OK', responseMode: 'URL', active: true }))
    await manage('profile', { name: stamp, website: 'https://merchant.invalid' })
    await assert.rejects(pay.createTerminal(owner, { name: 'Foreign', returnUrl: 'https://foreign.invalid/return' }))
    await manage('credit-mode', { creditCurrency: 'USDT' })
    assert.equal((await wallet.moveWallet({ userId: owner.id, amount: '2.35', currency: 'USDT', type: 'ADMIN_CREDIT', idempotencyKey: key(), description: stamp })).ok, true)
    const account = () => db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: owner.id, currency: 'USDT' } } })
    assert.equal((await account()).balanceMinor, 235n); assert.equal((await account()).withdrawableMinor, 0n)
    const p = await payments.createPayPayment(owner, { terminalId: link.id, externalId: stamp, amountRial: '12345678' }, key())
    assert.equal(p.creditCurrency, 'USDT'); assert.equal(p.creditMinor, 1234n); assert.equal(p.creditRateRial, '1000000'); assert.equal(p.creditRoundingRial, 5678n)
    assert.equal(p.purchaseRecipientName, stamp); assert.ok(p.expiresAt > p.createdAt); assert.match(p.purchaseTermsHash, /^[a-f0-9]{64}$/)
    for (const data of [{ creditCurrency: 'BAD' }, { creditMinor: 1n }, { purchaseRecipientName: 'altered' }]) await assert.rejects(db.payPayment.update({ where: { id: p.id }, data }))
    // Explicit fixture at the OTP boundary; no SMS is sent.
    assert.equal((await db.payPayment.updateMany({ where: { id: p.id, status: 'PENDING', payerVerifiedAt: null }, data: { payerVerifiedAt: new Date(), payerSessionHash: 'a'.repeat(64) } })).count, 1)
    const verified = await db.payPayment.findUniqueOrThrow({ where: { id: p.id } })
    await assert.rejects(db.$transaction(tx => assets.acceptPurchase(tx, verified, {})))
    await assert.rejects(db.$transaction(tx => assets.acceptPurchase(tx, verified, { acceptPurchase: true, purchaseTermsHash: 'b'.repeat(64) })))
    await payments.reportPayReference(p.id, 'ASSETREF001')
    const event = { providerId: 'fixture', externalId: stamp, transferReference: 'ASSETREF001', amountRial: '12345678', bankAccountId: bank.id, occurredAt: new Date().toISOString(), targetPaymentId: p.id }
    await assert.rejects(reconcile.acceptBankEvent(event, 'fixture-hash'))
    await db.$transaction(tx => assets.acceptPurchase(tx, verified, { acceptPurchase: true, purchaseTermsHash: p.purchaseTermsHash }))
    await manage('credit-mode', { creditCurrency: 'IRR' }); await rate(200000)
    auditFault = true
    try { await assert.rejects(reconcile.acceptBankEvent(event, 'fixture-hash'), /synthetic credit audit failure/) } finally { auditFault = false }
    assert.equal((await account()).balanceMinor, 235n); assert.equal((await account()).withdrawableMinor, 0n)
    assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_CREDIT' } }), 0)
    assert.equal(await db.payBankEvent.count({ where: { bankAccountId: bank.id, externalId: stamp } }), 0)
    const credits = await Promise.allSettled([reconcile.acceptBankEvent(event, 'fixture-hash'), reconcile.acceptBankEvent(event, 'fixture-hash')])
    assert.ok(credits.some(result => result.status === 'fulfilled'))
    await reconcile.acceptBankEvent(event, 'fixture-hash')
    assert.equal((await account()).balanceMinor, 1469n); assert.equal((await account()).withdrawableMinor, 1234n)
    assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_CREDIT', currency: 'USDT' } }), 1)
    assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_CREDIT', currency: 'IRR' } }), 0)
    const irr = await payments.createPayPayment(owner, { terminalId: link.id, externalId: stamp + '-irr', amountRial: '10000' }, key())
    assert.equal(irr.status, 'PENDING'); assert.equal(irr.creditCurrency, 'IRR'); assert.equal(irr.creditMinor, 10000n)
    const balances = (await pay.payOverview(owner)).assetBalances
    assert.equal(balances.find(b => b.currency === 'IRR').availableMinor, '0')
    assert.equal(balances.find(b => b.currency === 'USDT').availableMinor, '1234')
    await rate(100000)
    const q = await pay.createPayQuote(owner, { sourceCurrency: 'USDT', amount: '5.00', railId: 'USDT_BSC' })
    assert.equal(q.feeAmount, '0.12'); assert.equal(q.payoutAmount, '4.88'); assert.equal(q.network, 'BSC'); assert.ok(q.instrument)
    const destination = '0x' + '1'.repeat(40), idem = key()
    await assert.rejects(pay.requestPaySettlement(owner, { quoteId: q.id, destination, ackNetwork: false }, idem))
    await assert.rejects(pay.requestPaySettlement(owner, { quoteId: q.id, destination: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', ackNetwork: true }, idem))
    const s = await pay.requestPaySettlement(owner, { quoteId: q.id, destination, ackNetwork: true }, idem)
    assert.equal((await pay.requestPaySettlement(owner, { quoteId: q.id, destination, ackNetwork: true }, idem)).id, s.id)
    assert.equal((await account()).withdrawableMinor, 734n); assert.equal(s.sourceMinor, 500n)
    await assert.rejects(db.paySettlement.update({ where: { id: s.id }, data: { sourceCurrency: 'IRR' } }))
    await assert.rejects(db.paySettlement.update({ where: { id: s.id }, data: { sourceMinor: 501n } }))
    await rate(200000); await pay.decidePaySettlement(settler, { id: s.id, action: 'reject', reason: 'Synthetic no transfer' })
    await assert.rejects(pay.decidePaySettlement(settler, { id: s.id, action: 'reject', reason: 'Synthetic no transfer' }))
    assert.equal((await account()).withdrawableMinor, 1234n); assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_RELEASE' } }), 1)
    const bankQuote = await pay.createPayQuote(owner, { sourceCurrency: 'USDT', amount: '5.00', railId: 'IRR_BANK' })
    assert.equal(bankQuote.amountRial, '10000000'); assert.equal(bankQuote.payoutAmount, '10000000')
    const bankStored = await db.paySettlementQuote.findUniqueOrThrow({ where: { id: bankQuote.id } }); assert.equal(bankStored.sourceRateRial, '2000000'); assert.ok(bankStored.feePolicySnapshot)
    await assert.rejects(db.paySettlementQuote.create({ data: { ...bankStored, id: key(), sourceCurrency: 'IRR', sourceMinor: 1n, sourceRateRial: '1' } }))
    const thirdQuote = await pay.createPayQuote(owner, { sourceCurrency: 'USDT', amount: '5.00', railId: 'USDT_BSC' })
    assert.equal(thirdQuote.feeAmount, '0.12'); assert.equal(thirdQuote.payoutAmount, '4.88')
    const raceQuotes = await Promise.all([1, 2].map(() => pay.createPayQuote(owner, { sourceCurrency: 'USDT', amount: '8.00', railId: 'USDT_BSC' })))
    const reserves = await Promise.allSettled(raceQuotes.map(quote => pay.requestPaySettlement(owner, { quoteId: quote.id, destination, ackNetwork: true }, key())))
    const winners = reserves.filter(result => result.status === 'fulfilled')
    assert.equal(winners.length, 1); assert.equal((await account()).withdrawableMinor, 434n)
    await pay.decidePaySettlement(settler, { id: winners[0].value.id, action: 'reject', reason: 'Synthetic race release' })
    assert.equal((await account()).withdrawableMinor, 1234n)
    await rate(100000, new Date(Date.now() - 86400000)); await manage('credit-mode', { creditCurrency: 'USDT' })
    const staleBalances = (await pay.payOverview(owner)).assetBalances
    assert.equal(staleBalances.find(b => b.currency === 'USDT').rateStatus, 'STALE')
    assert.equal(staleBalances.find(b => b.currency === 'USDT').equivalentRial, null)
    assert.equal(staleBalances.find(b => b.currency === 'IRR').equivalentRial, '0')
    await assert.rejects(payments.createPayPayment(owner, { terminalId: link.id, externalId: stamp + '-stale', amountRial: '12345678' }, key()), e => e.code === 'PAY_FX_UNAVAILABLE')
    await assert.rejects(pay.createPayQuote(owner, { sourceCurrency: 'USDT', amount: '5.00', railId: 'USDT_BSC' }), e => e.code === 'PAY_FX_UNAVAILABLE')
    await rate(100000)
    await assert.rejects(payments.createPayPayment(owner, { terminalId: link.id, externalId: stamp + '-tiny', amountRial: '1' }, key()))
    await db.currencyRate.delete({ where: { code: 'USDT' } })
    await assert.rejects(pay.createPayQuote(owner, { sourceCurrency: 'USDT', amount: '5.00', railId: 'USDT_BSC' }), e => e.code === 'PAY_FX_UNAVAILABLE')
    // A receipt submitted before expiry remains reviewable afterwards; this fixture
    // starts at the verified payer boundary and never uploads a file or sends SMS.
    await rate(100000)
    const late = await payments.createPayPayment(owner, { terminalId: link.id, externalId: stamp + '-receipt', amountRial: '12345678' }, key())
    const token = randomBytes(32).toString('base64url'), hash = createHash('sha256').update(token).digest('hex')
    const encrypted = load('src/modules/providers/server/panel-credentials.ts').encryptPanelCredential('09121234567')
    assert.equal((await db.payPayment.updateMany({ where: { id: late.id, status: 'PENDING', payerVerifiedAt: null }, data: { payerSessionHash: hash, payerPhoneCiphertext: encrypted, payerPhoneLast4: '4567', payerVerifiedAt: new Date(), payerSessionExpiresAt: new Date(Date.now() + 86400000) } })).count, 1)
    const payerReq = new NextRequest('https://mobocom.invalid/api/pay/' + late.id, { headers: { cookie: pay.payPayerCookie(late.id) + '=' + token, origin: 'https://mobocom.invalid' } })
    const started = await pay.startPayGateway(payerReq, late.id, { gatewayRef: 'db:' + gateway.id, acceptPurchase: true, purchaseTermsHash: late.purchaseTermsHash })
    invoices.push(started.invoiceId); assert.equal(started.status, 'READY')
    const receipt = await db.paymentReceipt.create({ data: { invoiceId: started.invoiceId, bankAccountId: bank.id, amountMinor: late.totalMinor, currency: 'IRR', trackingCode: 'ASSETRECEIPT1', payerName: 'Synthetic', image: 'synthetic.png', imageType: 'image/png' } })
    assert.ok(receipt.createdAt <= late.expiresAt)
    const NativeDate = Date, afterExpiry = late.expiresAt.getTime() + 1000
    try {
      global.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [afterExpiry])) } static now() { return afterExpiry } }
      assert.equal((await pay.payPaymentById(owner, late.id)).status, 'UNDER_REVIEW')
      assert.ok((await pay.payList(owner, 'payments', new URLSearchParams('status=UNDER_REVIEW'))).items.some(p => p.id === late.id))
      await pay.reviewPayReceiptByStaff(admin, receipt.id, 'approve', 'Synthetic late review')
      const repeated = await pay.reviewPayReceiptByStaff(admin, receipt.id, 'approve', 'Synthetic duplicate')
      assert.equal(repeated.alreadyPaid, true); assert.equal(repeated.confirmation.method, 'MANUAL')
    } finally { global.Date = NativeDate }
    assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: late.id } })).status, 'PAID')
    assert.equal((await account()).balanceMinor, 2703n); assert.equal((await account()).withdrawableMinor, 2468n)
    const projection = await pay.payPaymentById(owner, late.id)
    assert.equal(projection.creditAmount, '12.34'); assert.equal(projection.creditRial, '12340000'); assert.equal(projection.platformFeeRial, '5678'); assert.equal(projection.settledServiceFeeRial, '0')
    assert.equal((await pay.payPaymentById(owner, p.id)).confirmation.method, 'BANK')
    const finance = (await pay.payOverview(owner)).stats
    assert.equal(finance.creditedRial, '24680000'); assert.equal(finance.platformFeeRial, '11356'); assert.equal(finance.serviceFeeRial, '0')
    assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_CREDIT', currency: 'USDT' } }), 2)
    console.log('Pay assets connected checks passed')
  } finally {
    for (const row of await db.payPayment.findMany({ where: { merchantId: { in: merchants }, invoiceId: { not: null } }, select: { invoiceId: true } })) if (!invoices.includes(row.invoiceId)) invoices.push(row.invoiceId)
    await db.payBankEvent.deleteMany({ where: { bankAccountId: bank?.id || -1 } })
    await db.paySettlement.deleteMany({ where: { merchantId: { in: merchants } } }); await db.paySettlementQuote.deleteMany({ where: { merchantId: { in: merchants } } })
    await db.paymentReceipt.deleteMany({ where: { invoiceId: { in: invoices } } }); await db.payPayment.deleteMany({ where: { merchantId: { in: merchants } } }); await db.payBotIntegration.deleteMany({ where: { terminal: { merchantId: { in: merchants } } } }); await db.payTerminal.deleteMany({ where: { merchantId: { in: merchants } } }); await db.payMerchant.deleteMany({ where: { id: { in: merchants } } })
    const ids = users.map(u => u.id)
    await db.payment.deleteMany({ where: { OR: [{ userId: { in: ids }, provider: 'MOBOCOM_PAY' }, { invoiceId: { in: invoices } }] } }); await db.invoice.deleteMany({ where: { id: { in: invoices } } }); await db.walletTx.deleteMany({ where: { userId: { in: ids } } }); await db.walletAccount.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } }); await db.userNotification.deleteMany({ where: { userId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.role.deleteMany({ where: { id: { in: roles } } })
    if (bank) await db.bankAccount.delete({ where: { id: bank.id } }); if (gateway) await db.gateway.delete({ where: { id: gateway.id } })
    if (rateCaptured && rateBefore) await db.currencyRate.upsert({ where: { code: 'USDT' }, create: rateBefore, update: rateBefore }); else if (rateCaptured) await db.currencyRate.deleteMany({ where: { code: 'USDT' } })
    for (const [k, row] of snapshots) if (row) await put(k, row.value); else await db.setting.deleteMany({ where: { key: k } })
    access.clearAdminPolicyCache(); await db.$disconnect()
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1 })
