const assert = require('node:assert/strict'), { randomUUID, randomBytes, createHmac, createHash } = require('node:crypto'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server'), { encode } = require('next-auth/jwt')
const { envelope: fixtureEnvelope, config, binding: fixtureBinding } = require('./pay-bale.fixture.cjs')
const envelope = (number, options = {}) => fixtureEnvelope(number, { account: '9999999999999', ...options })
const { unlink } = require('node:fs/promises'), { join } = require('node:path')
if (!/^mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname.slice(1))) throw Error('Disposable Pay test database required')
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex'); process.env.NEXTAUTH_URL = 'https://mobocom.invalid'; process.env.MOBOCOM_PAY_BALE_VERIFIED = 'true'
const RealDate = Date; let now = RealDate.now()
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
const prisma = new PrismaClient(), stamp = `collection-${randomUUID()}`, users = [], roles = [], invoices = [], quotes = [], merchantPayments = [], snapshots = new Map()
const availabilitySetting = 'publicApiEnabled'
const keys = [availabilitySetting, 'billing.mobocom-pay.v1', 'extension.mobocom-pay.state.v1', 'security.policy.v1']
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: prisma }, react: { ...require('react'), cache: fn => fn } })
const pay = load('src/modules/billing/server/pay.ts'), policy = load('src/modules/billing/domain/pay-policy.ts'), access = load('src/modules/identity/server/access.ts')
const operations = load('src/modules/billing/server/pay/transfer-operations.ts')
const { prepareBaleGateway } = load('src/modules/billing/server/pay/bale/collection-create.ts')
const { baleCheckout, changeBaleCheckout } = load('src/modules/billing/server/pay/bale/collection-view.ts')
const { submitCollectionReceipt, reviewCollectionReceipt } = load('src/modules/billing/server/pay/bale/collection-receipts.ts')
const { receiveSmsNotice } = load('src/modules/billing/server/pay/sms/intake.ts')
const { encryptPanelCredential } = load('src/modules/providers/server/panel-credentials.ts')
const { acquisitionSnapshot } = load('src/modules/billing/server/pay/assets.ts')
const put = (key, value) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
const status = n => error => error.status === n
const extraSmsSources = []
let bank, secondBank, gateway, smsGateway, smsSource, payMerchant, payTerminal, merchantPayment, savedUsdtRate, rateCaptured = false
async function receive(body) { const raw = Buffer.from(JSON.stringify(body)), signature = 'sha256=' + createHmac('sha256', process.env.MOBOCOM_PAY_BALE_WEBHOOK_SECRET).update(raw).digest('hex'); return pay.receiveBaleBankMessage(signature, body.event_id, raw) }
async function invoice(amount, currency = 'IRR', kind = 'BILLING', userId = users[1].id) {
  const row = await prisma.invoice.create({ data: { number: `${stamp}-${invoices.length}`, userId, status: 'UNPAID', kind, currency, gatewayId: gateway.id, total: Number(amount), totalMinor: BigInt(amount), subtotal: Number(amount), subtotalMinor: BigInt(amount), expiresAt: new Date(now + 3600000) } }); invoices.push(row.id); return row
}
async function upload(id, amount, cookie = '') {
  const form = new FormData(); form.set('payerName', 'Synthetic User'); form.set('paidAmountRial', String(amount)); form.set('image', new Blob([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fef32a02550000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'receipt.png')
  return submitCollectionReceipt(new NextRequest(`https://mobocom.invalid/api/payment/mobocom-pay/collections/${id}/receipt`, { method: 'POST', headers: cookie ? { cookie } : {}, body: form }), id)
}
async function prepare(row) { const result = await prepareBaleGateway(gateway.id, row.number); if (!quotes.includes(result.txnId)) quotes.push(result.txnId); return result }
async function main() { try {
  for (const key of keys) snapshots.set(key, await prisma.setting.findUnique({ where: { key } }))
  bank = await prisma.bankAccount.create({ data: { bankName: stamp, holderName: stamp, accountNumber: '9999999999999', cardNumber: '9999999999999999', active: true, collectionUse: 'MOBOCOM_PAY' } })
  Object.assign(process.env, config(bank.id)); process.env.MOBOCOM_PAY_BALE_VERIFIED = 'true'
  users.push(await prisma.user.create({ data: { email: `${stamp}-admin@example.invalid`, passwordHash: '!', role: 'ADMIN', status: 'ACTIVE' } }))
  users.push(await prisma.user.create({ data: { email: `${stamp}-buyer@example.invalid`, passwordHash: '!', role: 'CUSTOMER', status: 'ACTIVE' } }))
  process.env.MOBOCOM_PAY_BALE_OWNER_USER_ID = String(users[0].id)
  gateway = await prisma.gateway.create({ data: { name: stamp, provider: 'MOBOCOM_PAY', active: true, fiat: 'IRR', feeBps: 0, feePercent: 0 } })
  await put(keys[0], 'true'); await put(keys[1], JSON.stringify({ ...policy.defaults(), incomingEnabled: true, bankAccountIds: [bank.id], bale: { enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '30', minutes: 15 } })); await put(keys[2], '{"enabled":true,"settings":{}}'); await put(keys[3], '{"requireAdmin2fa":false}'); access.clearAdminPolicyCache()
  const a = await invoice(100000), b = await invoice(100000), c = await invoice(100010)
  const [qa, qb, qc] = await Promise.all([prepare(a), prepare(b), prepare(c)])
  const recoveryIds=await prisma.payBaleNotice.findMany({where:{bankAccountId:{in:[bank?.id,secondBank?.id].filter(Boolean)}},select:{id:true}});if(recoveryIds.length)await prisma.backgroundJob.deleteMany({where:{kind:'pay.transfer-match',OR:recoveryIds.map(row=>({payload:{contains:row.id}}))}})
  const rows = await prisma.payBaleCollection.findMany({ where: { id: { in: [qa.txnId, qb.txnId, qc.txnId] } } }); assert.equal(new Set(rows.map(row => row.collectedRial.toString())).size, 3)
  assert.equal((await prepare(a)).txnId, qa.txnId)
  const request = new NextRequest('https://mobocom.invalid/pay/bank/' + qa.txnId)
  assert.equal((await baleCheckout(qa.txnId, request)).bank, null)
  assert.ok((await changeBaleCheckout(qa.txnId, request, 'accept')).bank)
  const quote = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: qa.txnId } })
  await assert.rejects(prisma.payBaleCollection.update({ where: { id: quote.id }, data: { collectedRial: quote.collectedRial + 10n } }))
  await assert.rejects(prisma.payBaleCollection.delete({ where: { id: quote.id } }))
  const notice = envelope(1, { amount: quote.collectedRial.toString(), reference: 'COLLECTION123' })
  const result = await receive(notice); assert.equal(result.financialApproval, true)
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: a.id } })).status, 'PAID')
  const principal = await prisma.payment.findFirstOrThrow({ where: { invoiceId: a.id, provider: 'MOBOCOM_PAY' } }), fee = await prisma.payment.findFirstOrThrow({ where: { providerTxnId: quote.id, provider: 'MOBOCOM_PAY_ADJUSTMENT' } })
  assert.equal(principal.amountMinor, 100000n); assert.equal(fee.amountMinor, quote.adjustmentRial); assert.equal(fee.currency, 'IRR'); assert.equal(await prisma.walletTx.count({ where: { invoiceId: a.id } }), 0)
  await receive(notice); assert.equal(await prisma.payment.count({ where: { providerTxnId: quote.id, provider: 'MOBOCOM_PAY_ADJUSTMENT' } }), 1)
  await put(keys[1], JSON.stringify({ ...policy.defaults(), incomingEnabled: true, bankAccountIds: [bank.id], bale: { enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '10', minutes: 15 } }))
  const x = await invoice(500000), y = await invoice(500000); await prepare(x); await assert.rejects(prepare(y), error => error.code === 'BALE_POOL_EXHAUSTED')
  secondBank = await prisma.bankAccount.create({ data: { bankName: stamp + '-second', holderName: stamp, accountNumber: '8888888888888', cardNumber: '8888888888888888', active: true, collectionUse: 'MOBOCOM_PAY' } })
  process.env.MOBOCOM_PAY_BALE_BANK_ACCOUNT = String(secondBank.id)
  try { await assert.rejects(prepare(y), error => error.code === 'BALE_POOL_EXHAUSTED') } finally { process.env.MOBOCOM_PAY_BALE_BANK_ACCOUNT = String(bank.id) }
  const toman = await invoice(70000, 'IRT'), qt = await prepare(toman); assert.equal((await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: qt.txnId } })).principalRial, 700000n)
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(users[0].id), authAt: Date.now() } })
  const admin = { id: users[0].id, email: users[0].email, req: new NextRequest('https://mobocom.invalid/api/admin/receipts', { headers: { cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`, origin: 'https://mobocom.invalid' } }) }
  const manual = await invoice(900000), qm = await prepare(manual), rm = new NextRequest('https://mobocom.invalid/pay/bank/' + qm.txnId)
  await changeBaleCheckout(qm.txnId, rm, 'accept'); await upload(qm.txnId, 900000)
  const pending = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: qm.txnId } }); assert.equal(pending.status, 'UNDER_REVIEW')
  now = pending.expiresAt.getTime() + 1000; assert.equal((await baleCheckout(qm.txnId, rm)).status, 'UNDER_REVIEW')
  await reviewCollectionReceipt(admin, pending.receiptId, 'approve', '')
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: manual.id } })).status, 'PAID')
  assert.equal(await prisma.payment.count({ where: { providerTxnId: pending.id, provider: 'MOBOCOM_PAY_ADJUSTMENT' } }), 0)
  const late = await receive(envelope(20, { amount: pending.collectedRial.toString(), reference: 'MANUALFIRST123' })); assert.equal(late.financialApproval, true)
  assert.equal(await prisma.payment.count({ where: { invoiceId: manual.id, status: 'CONFIRMED' } }), 1)
  now = RealDate.now() - 1000
  const autoFirst = await invoice(1000000), qAuto = await prepare(autoFirst), rAuto = new NextRequest('https://mobocom.invalid/pay/bank/' + qAuto.txnId)
  await changeBaleCheckout(qAuto.txnId, rAuto, 'accept'); await upload(qAuto.txnId, 1000000)
  const pendingAuto = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: qAuto.txnId } })
  assert.equal((await receive(envelope(24, { amount: pendingAuto.collectedRial.toString(), reference: 'AUTOFIRST123' }))).financialApproval, true)
  const afterAuto = await reviewCollectionReceipt(admin, pendingAuto.receiptId, 'approve', '')
  assert.equal(afterAuto.alreadyPaid, true); assert.equal(afterAuto.confirmation.method, 'AUTO'); assert.equal(afterAuto.confirmation.source, 'BALE'); assert.match(afterAuto.message, /قبلاً خودکار/)
  const autoAgain = await reviewCollectionReceipt(admin, pendingAuto.receiptId, 'approve', '')
  assert.equal(autoAgain.alreadyPaid, true); assert.equal(autoAgain.confirmation.method, 'AUTO')
  assert.equal(await prisma.payment.count({ where: { invoiceId: autoFirst.id, status: 'CONFIRMED' } }), 1)
  const raceInvoice = await invoice(1100000), raceQuote = await prepare(raceInvoice), raceReq = new NextRequest('https://mobocom.invalid/pay/bank/' + raceQuote.txnId)
  await changeBaleCheckout(raceQuote.txnId, raceReq, 'accept'); await upload(raceQuote.txnId, 1100000)
  const raceRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: raceQuote.txnId } })
  const race = await Promise.allSettled([reviewCollectionReceipt(admin, raceRow.receiptId, 'approve', ''), receive(envelope(25, { amount: raceRow.collectedRial.toString(), reference: 'RECEIPTRACE123' }))])
  assert.ok(race.some(result => result.status === 'fulfilled')); assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: raceInvoice.id } })).status, 'PAID')
  assert.equal(await prisma.payment.count({ where: { invoiceId: raceInvoice.id, status: 'CONFIRMED' } }), 1)
  const topup = await invoice(1200000, 'IRR', 'WALLET_TOPUP'), qw = await prepare(topup), rw = new NextRequest('https://mobocom.invalid/pay/bank/' + qw.txnId)
  await changeBaleCheckout(qw.txnId, rw, 'accept'); const walletQuote = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: qw.txnId } })
  const walletNotice = envelope(21, { amount: walletQuote.collectedRial.toString(), reference: 'TOPUP123456' }); await receive(walletNotice); await receive(walletNotice)
  const credits = await prisma.walletTx.findMany({ where: { invoiceId: topup.id, type: 'TOPUP', status: 'DONE' } }); assert.equal(credits.length, 1); assert.equal(credits[0].amountMinor, 1200000n)
  assert.equal((await prisma.payment.findFirstOrThrow({ where: { providerTxnId: walletQuote.id, provider: 'MOBOCOM_PAY_ADJUSTMENT' } })).amountMinor, walletQuote.adjustmentRial)
  process.env.PANEL_CREDENTIAL_KEY = '12'.repeat(32)
  const secret = 's'.repeat(43), template = { bankCode: 'fixture_bank', sender: 'fixture', creditTemplate: 'CREDIT {amount}', debitTemplate: 'DEBIT {amount}', unit: 'IRR', calendar: 'GREGORIAN' }
  smsSource = await prisma.paySmsSource.create({ data: { id: randomUUID(), label: stamp, bankCode: template.bankCode, bankAccountId: bank.id, ownerUserId: users[0].id, secretCiphertext: encryptPanelCredential(secret), templateJson: JSON.stringify(template), verified: true, active: true } })
  smsGateway = await prisma.gateway.create({ data: { name: stamp + '-dual', provider: 'CARD_TRANSFER', active: true, fiat: 'IRR', feeBps: 0, feePercent: 0, config: JSON.stringify({ autoVerify: true, autoSources: ['SMS', 'BALE'], autoBankAccountId: bank.id }) } })
  const dual = await invoice(1500000); await prisma.invoice.updateMany({ where: { id: dual.id, status: 'UNPAID' }, data: { gatewayId: smsGateway.id } })
  const dualQuote = await prepareBaleGateway(smsGateway.id, dual.number); quotes.push(dualQuote.txnId)
  await changeBaleCheckout(dualQuote.txnId, new NextRequest('https://mobocom.invalid/pay/bank/' + dualQuote.txnId), 'accept')
  const dualRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: dualQuote.txnId } })
  const sms = Buffer.from(JSON.stringify({ message_id: 'synthetic-dual', sender: 'fixture', message: `CREDIT ${dualRow.collectedRial}`, received_at: new Date().toISOString() }))
  const both = await Promise.allSettled([receiveSmsNotice(smsSource.id, secret, sms), receive(envelope(22, { amount: dualRow.collectedRial.toString(), reference: 'DUALSOURCE123' }))])
  assert.ok(both.some(result => result.status === 'fulfilled' && result.value.financialApproval)); assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: dual.id } })).status, 'PAID')
  assert.equal(await prisma.payment.count({ where: { invoiceId: dual.id, status: 'CONFIRMED' } }), 1)
  await require('./pay-transfer-recovery.scenarios.cjs')({prisma,load,pay,invoice,prepare,changeBaleCheckout,receive,envelope,bank,smsGateway,smsSource,secret,quotes})
  const simpleSource = await require('./pay-sms-forwarder.scenarios.cjs')({ prisma, load, admin, bank, gateway: smsGateway, invoice,
    prepare: prepareBaleGateway, quotes, upload, receiveBale: receive, envelope, sources: extraSmsSources, clock: { now: () => now, set: value => { now = value } } })
  const sources = [
    { ...fixtureBinding, id: 'first-card', bankAccountId: bank.id, ownerUserId: users[0].id, secret: 'x'.repeat(43), enabled: true, verified: true },
    { ...fixtureBinding, id: 'second-card', alias: 'second-card', instanceId: 'c'.repeat(64), accountId: '321', bankPeerId: '789', bankAccountId: secondBank.id, ownerUserId: users[0].id, secret: 'y'.repeat(43), enabled: true, verified: true },
  ]
  const dualConfig = JSON.stringify({ autoVerify: true, autoSources: ['SMS', 'BALE'], autoBankAccountId: bank.id })
  process.env.MOBOCOM_PAY_BALE_SOURCES = JSON.stringify(sources)
  try {
    await prisma.gateway.update({ where: { id: smsGateway.id }, data: { config: JSON.stringify({ autoVerify: true, autoSources: ['BALE'], autoBankAccountId: secondBank.id }) } })
    const isolated = await invoice(1550000, 'IRR', 'WALLET_TOPUP'); await prisma.invoice.updateMany({ where: { id: isolated.id, status: 'UNPAID' }, data: { gatewayId: smsGateway.id } })
    const isolatedQuote = await prepareBaleGateway(smsGateway.id, isolated.number); quotes.push(isolatedQuote.txnId)
    await changeBaleCheckout(isolatedQuote.txnId, new NextRequest('https://mobocom.invalid/pay/bank/' + isolatedQuote.txnId), 'accept')
    const isolatedRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: isolatedQuote.txnId } })
    async function sourceNotice(source, number) {
      const e = envelope(number, { amount: isolatedRow.collectedRial.toString(), reference: 'ISOLATED' + number }); Object.assign(e, { session_id: source.alias, instance_id: source.instanceId, device_id: source.accountId, peer: { type: 'user', id: source.bankPeerId }, sender_id: source.bankPeerId }); Object.assign(e.payload, { chat_id: source.bankPeerId, from: source.bankPeerId })
      const raw = Buffer.from(JSON.stringify(e)); return pay.receiveBaleBankMessage('sha256=' + createHmac('sha256', source.secret).update(raw).digest('hex'), e.event_id, raw, source.id)
    }
    assert.equal((await sourceNotice(sources[0], 45)).financialApproval, false, 'another destination cannot claim the reserved amount')
    sources[1].instanceId = 'd'.repeat(64); process.env.MOBOCOM_PAY_BALE_SOURCES = JSON.stringify(sources)
    await assert.rejects(sourceNotice(sources[1], 46), e => e.status === 503)
    assert.equal(await prisma.walletTx.count({ where: { invoiceId: isolated.id, type: 'TOPUP', status: 'DONE' } }), 0)
    sources[1].instanceId = 'c'.repeat(64); process.env.MOBOCOM_PAY_BALE_SOURCES = JSON.stringify(sources)
    assert.equal((await sourceNotice(sources[1], 47)).financialApproval, true)
    assert.equal((await sourceNotice(sources[1], 47)).alreadyPaid, true)
    const credit = await prisma.walletTx.findMany({ where: { invoiceId: isolated.id, type: 'TOPUP', status: 'DONE' } }); assert.equal(credit.length, 1); assert.equal(credit[0].amountMinor, 1550000n)
  } finally { delete process.env.MOBOCOM_PAY_BALE_SOURCES; await prisma.gateway.update({ where: { id: smsGateway.id }, data: { config: dualConfig } }) }
  await put(keys[1], JSON.stringify({ ...policy.defaults(), incomingEnabled: true, bankAccountIds: [bank.id], bale: { enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '30', minutes: 15 } }))
  const renewedInvoice = await invoice(1800000), oldQuote = await prepare(renewedInvoice), renewalReq = new NextRequest('https://mobocom.invalid/pay/bank/' + oldQuote.txnId)
  await changeBaleCheckout(oldQuote.txnId, renewalReq, 'accept'); const old = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: oldQuote.txnId } })
  now = old.expiresAt.getTime() + 1000
  const renewed = await changeBaleCheckout(old.id, renewalReq, 'renew'); quotes.push(renewed.id)
  assert.notEqual(renewed.collectedRial, old.collectedRial.toString())
  const lateOld = await receive(envelope(23, { amount: old.collectedRial.toString(), reference: 'LATEOLD123' })); assert.equal(lateOld.financialApproval, false)
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: renewedInvoice.id } })).status, 'UNPAID')
  await load('src/modules/billing/server/pay/transfer-operations').decideTransferReview(admin, { noticeId: lateOld.id, collectionId: old.id, version: 0, action: 'confirm', note: 'Synthetic reviewed old quote after renewal' })
  const { paymentInvoiceFields } = load('src/modules/billing/server/pay/payment-view.ts')
  const oldWinner = await prisma.invoice.findUniqueOrThrow({ where: { id: renewedInvoice.id }, select: paymentInvoiceFields })
  assert.equal(oldWinner.baleCollections[0].settlementMethod, 'REVIEWED_NOTICE')
  assert.equal(oldWinner.baleCollections[0].paidCollectedRial, old.collectedRial, 'paid original quote outranks the newer unpaid renewal')
  assert.equal((await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: renewed.id } })).status, 'PENDING')
  // The immutable Pay deadline is not the automatic quote deadline. A scoped ticket may
  // renew its already-linked automatic invoice and keep an uploaded receipt under review.
  now = RealDate.now() - 1800000
  payMerchant = await prisma.payMerchant.create({ data: { id: randomUUID(), userId: users[1].id, name: stamp, website: 'https://merchant.invalid', status: 'ACTIVE', baleAllowed: true } })
  payTerminal = await prisma.payTerminal.create({ data: { id: randomUUID(), merchantId: payMerchant.id, name: stamp, returnUrl: 'https://merchant.invalid/return', active: true, baleEnabled: true } })
  const payerToken = randomBytes(32).toString('base64url'), payId = randomBytes(24).toString('base64url')
  const payInvoice = await prisma.$transaction(async tx => {
    const inv = await tx.invoice.create({ data: { number: stamp+'-merchant', kind: 'PAY_COLLECTION', status: 'UNPAID', currency: 'IRR', gatewayId: smsGateway.id, total: 2100000, totalMinor: 2100000n, subtotal: 2100000, subtotalMinor: 2100000n } })
    merchantPayment = await tx.payPayment.create({ data: { id: payId, merchantId: payMerchant.id, terminalId: payTerminal.id, externalId: stamp, idempotencyKey: stamp, fingerprint: stamp, invoiceId: inv.id, amountMinor: 2100000n, totalMinor: 2100000n, feeMinor: 1000n, netMinor: 2099000n, createdAt: new Date(now), expiresAt: new Date(now+600000), payerSessionHash: createHash('sha256').update(payerToken).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('+989120009999'), payerPhoneLast4: '9999', payerVerifiedAt: new Date(now), payerSessionExpiresAt: new Date(now+86400000), gatewayAttemptStatus: 'READY', gatewayAttemptRef: 'db:'+smsGateway.id, gatewayAttemptProvider: 'CARD_TRANSFER' } })
    return inv
  }); invoices.push(payInvoice.id)
  merchantPayments.push(payId)
  const cookie = `pay_payer_${payId}=${payerToken}`, payRequest = new NextRequest('https://mobocom.invalid/pay/bank/fixture', { headers: { cookie } })
  const oldPayQuote = await prepareBaleGateway(smsGateway.id, payInvoice.number); quotes.push(oldPayQuote.txnId)
  await changeBaleCheckout(oldPayQuote.txnId, payRequest, 'accept')
  now += 16*60000
  const renewedPay = await changeBaleCheckout(oldPayQuote.txnId, payRequest, 'renew'); quotes.push(renewedPay.id)
  assert.equal((await prisma.payPayment.findUniqueOrThrow({ where: { id: payId } })).expiresAt.getTime(), merchantPayment.expiresAt.getTime())
  await changeBaleCheckout(renewedPay.id, payRequest, 'accept'); await upload(renewedPay.id, renewedPay.collectedRial, cookie)
  now = Date.parse(renewedPay.expiresAt)+1000
  assert.equal((await baleCheckout(renewedPay.id, payRequest)).status, 'UNDER_REVIEW')
  const merchantNotice = envelope(30, { amount: renewedPay.collectedRial, reference: 'MERCHANTPAY123' })
  assert.equal((await receive(merchantNotice)).financialApproval, true); await receive(merchantNotice)
  const paidMerchant = await prisma.payPayment.findUniqueOrThrow({ where: { id: payId } })
  assert.equal(paidMerchant.status, 'PAID')
  const proceeds = await prisma.walletTx.findMany({ where: { userId: users[1].id, type: 'PAY_CREDIT' } })
  assert.equal(proceeds.length, 1); assert.equal(proceeds[0].amountMinor, 2099000n); assert.equal(proceeds[0].withdrawableDeltaMinor, 2099000n)
  const merchantToken = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(users[1].id), authAt: Date.now() } })
  const merchantActor = { id: users[1].id, email: users[1].email, req: new NextRequest('https://mobocom.invalid/api/pay', { headers: { cookie: `__Secure-next-auth.session-token=${merchantToken}`, origin: 'https://mobocom.invalid' } }) }
  const merchantView = await pay.payPaymentById(merchantActor, payId)
  assert.equal(merchantView.confirmation.method, 'AUTO'); assert.equal(merchantView.confirmation.source, 'BALE')
  assert.equal(merchantView.creditRial, '2099000'); assert.equal(merchantView.customerAmountRial, renewedPay.collectedRial)
  assert.equal(BigInt(merchantView.platformFeeRial) + BigInt(merchantView.creditRial), BigInt(merchantView.customerAmountRial))
  assert.equal(await prisma.payment.count({ where: { invoiceId: payInvoice.id, status: 'CONFIRMED' } }), 1)
  // A USDT purchase remains bound to its payment deadline and credits the stored
  // amount when an attested automatic notice arrives during that window.
  now = RealDate.now() - 1000
  savedUsdtRate = await prisma.currencyRate.findUnique({ where: { code: 'USDT' } }); rateCaptured = true
  await prisma.currencyRate.upsert({ where: { code: 'USDT' }, create: { code: 'USDT', rate: 100000, source: 'MANUAL', fetchedAt: new Date(now) }, update: { rate: 100000, source: 'MANUAL', fetchedAt: new Date(now), pendingRate: null, pendingAt: null } })
  const usdtId = randomBytes(24).toString('base64url'), usdtToken = randomBytes(32).toString('base64url'), usdtHash = createHash('sha256').update(usdtToken).digest('hex'), usdtExpiry = new Date(now + 600000)
  const usdtInvoice = await prisma.$transaction(async tx => {
    const inv = await tx.invoice.create({ data: { number: stamp+'-usdt', kind: 'PAY_COLLECTION', status: 'UNPAID', currency: 'IRR', gatewayId: smsGateway.id, total: 2000000, totalMinor: 2000000n, subtotal: 2000000, subtotalMinor: 2000000n } })
    const snapshot = await acquisitionSnapshot(tx, { id: usdtId, merchantId: payMerchant.id, name: payMerchant.name, currency: 'USDT', netMinor: 2000000n, totalMinor: 2000000n, expiresAt: usdtExpiry, maxAgeMinutes: 60 })
    assert.equal(snapshot.creditMinor, 200n)
    await tx.payPayment.create({ data: { id: usdtId, merchantId: payMerchant.id, terminalId: payTerminal.id, externalId: stamp+'-usdt', idempotencyKey: stamp+'-usdt', fingerprint: stamp+'-usdt', invoiceId: inv.id, amountMinor: 2000000n, totalMinor: 2000000n, feeMinor: 0n, netMinor: 2000000n, ...snapshot, createdAt: new Date(now), expiresAt: usdtExpiry, payerSessionHash: usdtHash, payerPhoneCiphertext: encryptPanelCredential('+989120009999'), payerPhoneLast4: '9999', payerVerifiedAt: new Date(now), payerSessionExpiresAt: new Date(now+86400000), purchaseAcceptedAt: new Date(now), purchaseAcceptedHash: snapshot.purchaseTermsHash, purchasePayerHash: usdtHash, gatewayAttemptStatus: 'READY', gatewayAttemptRef: 'db:'+smsGateway.id, gatewayAttemptProvider: 'CARD_TRANSFER' } })
    return inv
  }); invoices.push(usdtInvoice.id); merchantPayments.push(usdtId)
  const usdtCookie = `pay_payer_${usdtId}=${usdtToken}`, usdtRequest = new NextRequest('https://mobocom.invalid/pay/bank/fixture', { headers: { cookie: usdtCookie } })
  const usdtQuote = await prepareBaleGateway(smsGateway.id, usdtInvoice.number); quotes.push(usdtQuote.txnId)
  assert.ok(new Date(usdtQuote.expiresAt) <= usdtExpiry)
  await changeBaleCheckout(usdtQuote.txnId, usdtRequest, 'accept'); await upload(usdtQuote.txnId, 2000000, usdtCookie)
  const usdtCollection = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: usdtQuote.txnId } })
  const simpleUsdt = await load('src/modules/billing/server/pay/sms/forwarder.ts').receiveForwardedSms(simpleSource.sourceId, Buffer.from(JSON.stringify({ sms: `CREDIT ${usdtCollection.collectedRial}`, bank: simpleSource.bank, token: simpleSource.token })))
  assert.equal(simpleUsdt.financialApproval, false); assert.equal(simpleUsdt.reviewRequired, true)
  assert.equal((await prisma.payPayment.findUniqueOrThrow({ where: { id: usdtId } })).status, 'PENDING')
  await assert.rejects(prisma.$transaction(tx => load('src/modules/billing/server/pay/bale/collection-settle.ts').settleTransferCollection(tx, usdtCollection, { method: 'AUTO', noticeId: simpleUsdt.id, actor: admin })), e => e.code === 'PAY_PURCHASE_PROOF')
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: usdtInvoice.id } })).status, 'UNPAID')
  const usdtNotice = envelope(31, { amount: usdtCollection.collectedRial.toString(), reference: 'USDTMERCHANT31' })
  assert.equal((await receive(usdtNotice)).financialApproval, true); await receive(usdtNotice)
  const usdtPaid = await prisma.payPayment.findUniqueOrThrow({ where: { id: usdtId } }); assert.equal(usdtPaid.status, 'PAID')
  const usdtCredit = await prisma.walletTx.findUniqueOrThrow({ where: { id: usdtPaid.walletTxId } })
  assert.equal(usdtCredit.currency, 'USDT'); assert.equal(usdtCredit.amountMinor, 200n); assert.equal(usdtCredit.withdrawableDeltaMinor, 200n)
  assert.equal(await prisma.walletTx.count({ where: { userId: users[1].id, type: 'PAY_CREDIT', currency: 'USDT' } }), 1)
  // Operations desk: late evidence requires explicit audited admission, never a second journal.
  await put(keys[1], JSON.stringify({ ...policy.defaults(), incomingEnabled: true, bankAccountIds: [bank.id], bale: { enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '10', minutes: 15 } }))
  now = RealDate.now() - 16 * 60000
  const deskInvoice = await invoice(3100000, 'IRR', 'WALLET_TOPUP'), deskQuote = await prepare(deskInvoice)
  await changeBaleCheckout(deskQuote.txnId, new NextRequest('https://mobocom.invalid/pay/bank/' + deskQuote.txnId), 'accept')
  const deskRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: deskQuote.txnId } })
  now = RealDate.now()
  const lateDesk = await receive(envelope(501, { amount: String(deskRow.collectedRial), reference: 'DESKLATE501' })); assert.equal(lateDesk.financialApproval, false)
  const evidence = await prisma.payBaleNotice.findFirstOrThrow({ where: { bankAccountId: bank.id, amountMinor: deskRow.collectedRial } })
  const command = (noticeId, action, version = 0, collectionId) => operations.decideTransferReview(admin, { noticeId, action, version, note: 'Synthetic reviewed decision', ...(collectionId ? { collectionId } : {}) })
  let detail = await operations.transferReviewDetail(admin, evidence.id); assert.equal(detail.canConfirm, true); assert.equal(detail.difference, 'EXACT')
  process.env.MOBOCOM_PAY_BALE_VERIFIED = 'false'
  try { await assert.rejects(command(evidence.id, 'confirm'), status(503)) } finally { process.env.MOBOCOM_PAY_BALE_VERIFIED = 'true' }
  assert.equal(await prisma.payTransferReview.count({ where: { noticeId: evidence.id } }), 0)
  assert.equal((await command(evidence.id, 'confirm')).financialApproval, true)
  await assert.rejects(command(evidence.id, 'confirm'), status(409))
  await receive(envelope(502, { amount: String(deskRow.collectedRial), reference: 'DESKLATE502' }))
  assert.equal(await prisma.payment.count({ where: { invoiceId: deskInvoice.id, status: 'CONFIRMED' } }), 1)
  assert.equal(await prisma.walletTx.count({ where: { invoiceId: deskInvoice.id, type: 'TOPUP', status: 'DONE' } }), 1)
  await assert.rejects(prisma.payTransferReview.updateMany({ where: { noticeId: evidence.id }, data: { note: 'tampered', version: { increment: 1 } } }))
  detail = await operations.transferReviewDetail(admin, evidence.id); assert.ok(detail.history.some(h => h.note === 'Synthetic reviewed decision'))
  const from = await prisma.payBaleNotice.findUniqueOrThrow({ where: { id: evidence.id } })
  async function deskNotice(number, amount, sentAt = new Date(now)) { return prisma.payBaleNotice.create({ data: { ...from, id: randomUUID(), sourceEventId: createHash('sha256').update('desk-event-'+number).digest('hex'), messageId: String(1000000+number), payloadHash: createHash('sha256').update('desk-'+number).digest('hex'), bankFingerprint: null, duplicateOfId: null, amountMinor: amount, sourceSentAt: sentAt, receivedAt: new Date(now) } }) }
  for (const [number, amount] of [[510,3200000n],[511,3400000n]]) {
    const inv = await invoice(3300000 + number * 10000), q = await prepare(inv), row = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: q.txnId } }), n = await deskNotice(number, amount)
    assert.equal((await operations.transferReviewSearch(admin,n.id,inv.number)).items.length,1)
    await command(n.id,'assign',0,q.txnId)
    const d = await operations.transferReviewDetail(admin,n.id)
    // Both sides of an exact request are deliberately exercised below.
    assert.equal(d.difference, amount < row.collectedRial ? 'UNDER' : 'OVER'); assert.equal(d.canConfirm,false)
    await assert.rejects(prisma.payTransferReview.updateMany({where:{noticeId:n.id,version:1,status:'OPEN'},data:{status:'CONFIRMED',version:{increment:1}}}))
    await assert.rejects(command(n.id,'confirm',1),status(409)); assert.equal(await prisma.payment.count({where:{invoiceId:inv.id}}),0)
    await assert.rejects(command(n.id,'dismiss',0),status(409)); await command(n.id,'dismiss',1)
  }
  const overInvoice = await invoice(9000000), overQuote = await prepare(overInvoice), overNotice = await deskNotice(512,10000000n)
  await command(overNotice.id,'assign',0,overQuote.txnId); assert.equal((await operations.transferReviewDetail(admin,overNotice.id)).difference,'OVER'); await assert.rejects(command(overNotice.id,'confirm',1),status(409))
  // Same invoice fence across receipt, operator and automatic evidence.
  const deskRaceInvoice = await invoice(10100000,'IRR','WALLET_TOPUP'), deskRaceQuote = await prepare(deskRaceInvoice)
  await changeBaleCheckout(deskRaceQuote.txnId,new NextRequest('https://mobocom.invalid/pay/bank/'+deskRaceQuote.txnId),'accept'); await upload(deskRaceQuote.txnId,10100000)
  const deskRaceRow = await prisma.payBaleCollection.findUniqueOrThrow({where:{id:deskRaceQuote.txnId}}), deskRaceNotice = await deskNotice(513,deskRaceRow.collectedRial)
  await command(deskRaceNotice.id,'assign',0,deskRaceRow.id)
  await assert.rejects(prisma.payTransferReview.updateMany({where:{noticeId:deskRaceNotice.id,version:1,status:'OPEN'},data:{status:'CONFIRMED',version:{increment:1}}}))
  const deskRace = await Promise.allSettled([command(deskRaceNotice.id,'confirm',1),reviewCollectionReceipt(admin,deskRaceRow.receiptId,'approve','Synthetic receipt review'),pay.matchBaleNotice(deskRaceNotice.id)])
  assert.ok(deskRace.some(r=>r.status==='fulfilled')); assert.equal(await prisma.payment.count({where:{invoiceId:deskRaceInvoice.id,status:'CONFIRMED'}}),1); assert.equal(await prisma.walletTx.count({where:{invoiceId:deskRaceInvoice.id,type:'TOPUP',status:'DONE'}}),1)
  const monitor = await operations.transferMonitor(admin); assert.ok(monitor.totals.paid>0); assert.ok(monitor.sources.some(s=>s.type==='BALE'&&s.observed)); assert.ok(monitor.pools.every(p=>p.remaining===Math.max(0,p.capacity-p.occupied))); assert.ok(monitor.pools.some(p=>p.state==='EXHAUSTED'))
  assert.ok((await operations.transferReviewQueue(admin,new URLSearchParams('closed=true'))).items.some(n=>n.id===evidence.id))
  const buyerToken = await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(users[1].id),authAt:Date.now()}})
  const buyerActor = {id:users[1].id,email:users[1].email,req:new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/transfer-reviews',{headers:{cookie:`next-auth.session-token=${buyerToken}; __Secure-next-auth.session-token=${buyerToken}`,origin:'https://mobocom.invalid'}})}
  await assert.rejects(operations.transferMonitor(buyerActor),status(403))
  const payRole=await prisma.role.create({data:{name:stamp+'-pay-only',permissions:'mobocom-pay.manage'}}); roles.push(payRole.id)
  const payOnly=await prisma.user.create({data:{email:stamp+'-pay-only@example.invalid',passwordHash:'!',role:'ADMIN',roleId:payRole.id}}); users.push(payOnly)
  const payOnlyToken=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(payOnly.id),authAt:Date.now()}}),payOnlyActor={id:payOnly.id,email:payOnly.email,req:new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/transfer-reviews',{headers:{cookie:`__Secure-next-auth.session-token=${payOnlyToken}`,origin:'https://mobocom.invalid'}})}
  assert.ok((await operations.transferMonitor(payOnlyActor)).sources.length)
  await assert.rejects(operations.transferReviewDetail(payOnlyActor,evidence.id),status(403))
  await assert.rejects(operations.decideTransferReview(payOnlyActor,{noticeId:overNotice.id,version:1,action:'confirm',note:'Synthetic denied approval'}),status(403))
  const selfInvoice = await invoice(11200000,'IRR','BILLING',users[0].id), selfQuote = await prepare(selfInvoice)
  await changeBaleCheckout(selfQuote.txnId,new NextRequest('https://mobocom.invalid/pay/bank/'+selfQuote.txnId),'accept')
  const selfRow = await prisma.payBaleCollection.findUniqueOrThrow({where:{id:selfQuote.txnId}}), selfNotice = await deskNotice(514,selfRow.collectedRial)
  await assert.rejects(command(selfNotice.id,'confirm',0,selfRow.id),status(403))
  const staleInvoice=await invoice(11300000),staleQuote=await prepare(staleInvoice)
  await changeBaleCheckout(staleQuote.txnId,new NextRequest('https://mobocom.invalid/pay/bank/'+staleQuote.txnId),'accept')
  const staleRow=await prisma.payBaleCollection.findUniqueOrThrow({where:{id:staleQuote.txnId}}),staleNotice=await deskNotice(515,staleRow.collectedRial,new Date(staleRow.validFrom.getTime()-1000))
  await assert.rejects(command(staleNotice.id,'confirm',0,staleRow.id),status(409))
  await put(keys[2],'{"enabled":false,"settings":{}}'); await assert.rejects(operations.transferMonitor(admin),status(404)); await assert.rejects(command(overNotice.id,'dismiss',1),status(404)); await put(keys[2],'{"enabled":true,"settings":{}}')
  console.log('Bale collection + operations desk assertions passed: exact-once receipts/auto/reviewer race, late admission, mismatch refusal, version/module/source denial, pool and latency projections')
} finally {
  const rows = await prisma.payBaleCollection.findMany({ where: { invoiceId: { in: invoices } }, select: { id: true } }); const ids = rows.map(row => row.id)
  if (bank) { await prisma.$executeRawUnsafe('ALTER TABLE "PayTransferReview" DISABLE TRIGGER "PayTransferReview_guard"'); try { await prisma.payTransferReview.deleteMany({where:{notice:{bankAccountId:bank.id}}}) } finally { await prisma.$executeRawUnsafe('ALTER TABLE "PayTransferReview" ENABLE TRIGGER "PayTransferReview_guard"') } }
  try { if (ids.length) { await prisma.$executeRawUnsafe('ALTER TABLE "PayBaleCollection" DISABLE TRIGGER "PayBaleCollection_no_delete"'); try { await prisma.payBaleCollection.deleteMany({ where: { id: { in: ids } } }) } finally { await prisma.$executeRawUnsafe('ALTER TABLE "PayBaleCollection" ENABLE TRIGGER "PayBaleCollection_no_delete"') } } }
  finally {
    // Extra source rows are removed after all their notices/collections below.
    const receipts = await prisma.paymentReceipt.findMany({ where: { invoiceId: { in: invoices } }, select: { id: true, image: true } })
    if (bank) { const ids = [bank.id, secondBank?.id].filter(Boolean); await prisma.payBaleNotice.deleteMany({ where: { bankAccountId: { in: ids }, duplicateOfId: { not: null } } }); await prisma.payBaleNotice.deleteMany({ where: { bankAccountId: { in: ids } } }) }
    await prisma.paymentReceipt.deleteMany({ where: { id: { in: receipts.map(row => row.id) } } }); for (const row of receipts) if (/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(row.image)) await unlink(join(process.cwd(), 'storage', 'receipts', row.image)).catch(() => {})
    await prisma.payPayment.deleteMany({ where: { id: { in: merchantPayments } } })
    if (payTerminal) await prisma.payTerminal.deleteMany({ where: { id: payTerminal.id } })
    if (payMerchant) await prisma.payMerchant.deleteMany({ where: { id: payMerchant.id } })
    await prisma.payment.deleteMany({ where: { OR: [{ invoiceId: { in: invoices } }, { providerTxnId: { in: ids }, provider: 'MOBOCOM_PAY_ADJUSTMENT' }] } }); await prisma.walletTx.deleteMany({ where: { OR: [{ invoiceId: { in: invoices } }, { userId: { in: users.map(user => user.id) }, type: 'PAY_CREDIT' }] } }); await prisma.walletAccount.deleteMany({ where: { userId: { in: users.map(user => user.id) } } }); await prisma.invoice.deleteMany({ where: { id: { in: invoices } } })
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users.map(user => user.id) }, action: { startsWith: 'mobocom-pay.' } } }); await prisma.paySmsSource.deleteMany({ where: { id: { in: extraSmsSources } } }); if (smsSource) await prisma.paySmsSource.deleteMany({ where: { id: smsSource.id } }); if (smsGateway) await prisma.gateway.deleteMany({ where: { id: smsGateway.id } }); if (gateway) await prisma.gateway.deleteMany({ where: { id: gateway.id } }); if (bank) await prisma.bankAccount.deleteMany({ where: { id: bank.id } }); if (secondBank) await prisma.bankAccount.deleteMany({ where: { id: secondBank.id } }); await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    await prisma.role.deleteMany({where:{id:{in:roles}}})
    if (rateCaptured && savedUsdtRate) await prisma.currencyRate.upsert({ where: { code: 'USDT' }, create: savedUsdtRate, update: savedUsdtRate }); else if (rateCaptured) await prisma.currencyRate.deleteMany({ where: { code: 'USDT' } })
    for (const [key, old] of snapshots) if (old) await put(key, old.value); else await prisma.setting.deleteMany({ where: { key } }); access.clearAdminPolicyCache(); await prisma.$disconnect(); global.Date = RealDate
  }
} }
main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
