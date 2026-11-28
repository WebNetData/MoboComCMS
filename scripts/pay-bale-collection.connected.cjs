const assert = require('node:assert/strict'), { randomUUID, randomBytes, createHash } = require('node:crypto'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server'), { encode } = require('next-auth/jwt')
const envelope = (number, {amount}) => ({ number, amount })
const { unlink } = require('node:fs/promises'), { join } = require('node:path')
if (!/^mobocom_pay_test_/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname.slice(1))) throw Error('Disposable Pay test database required')
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex'); process.env.NEXTAUTH_URL = 'https://mobocom.invalid'
const RealDate = Date; let now = RealDate.now()
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
const prisma = new PrismaClient(), stamp = `collection-${randomUUID()}`, users = [], roles = [], invoices = [], orders = [], quotes = [], merchantPayments = [], snapshots = new Map()
const availabilitySetting = 'publicApiEnabled'
const keys = [availabilitySetting, 'billing.mobocom-pay.v1', 'extension.mobocom-pay.state.v1', 'security.policy.v1']
const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: prisma }, react: { ...require('react'), cache: fn => fn } })
const pay = load('src/modules/billing/server/pay.ts'), policy = load('src/modules/billing/domain/pay-policy.ts'), access = load('src/modules/identity/server/access.ts')
const operations = load('src/modules/billing/server/pay/transfer-operations.ts')
const { settleInvoiceManually } = load('src/modules/billing/server/settle.ts')
const { markInvoicePaid } = load('src/modules/billing/server/billing.ts')
const invoiceAdmin = load('src/modules/billing/server/http/admin/invoices/route.ts')
const orderAdmin = load('src/modules/orders/server/http/admin/orders/route.ts')
const userAdmin = load('src/modules/identity/server/http/admin/users/[id]/route.ts')
const { prepareBaleGateway, createBaleCollectionInTransaction } = load('src/modules/billing/server/pay/bale/collection-create.ts')
const { baleCheckout, changeBaleCheckout } = load('src/modules/billing/server/pay/bale/collection-view.ts')
const { submitCollectionReceipt, reviewCollectionReceipt } = load('src/modules/billing/server/pay/bale/collection-receipts.ts')
const { receiveSmsNotice } = load('src/modules/billing/server/pay/sms/intake.ts')
const { POST: retiredBaleIntake } = load('src/app/api/payment/mobocom-pay/bale-events/route.ts')
const { POST: botHttp } = load('src/app/api/v1/pay/bot/[id]/route.ts')
const { POST_smsForwarder: smsForwarderHttp } = load('src/modules/billing/server/http/pay-sms.ts')
const { recoverTransferMatch } = load('src/modules/billing/server/pay/bale/match-job.ts')
const { collectionSourceActor } = load('src/modules/billing/server/pay/bale/collection-proof.ts')
const { encryptPanelCredential } = load('src/modules/providers/server/panel-credentials.ts')
const { acquisitionSnapshot } = load('src/modules/billing/server/pay/assets.ts')
const put = (key, value) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
const status = n => error => error.status === n
const extraSmsSources = []
let bank, secondBank, gateway, smsGateway, manualGateway, smsSource, secondSmsSource, payMerchant, payTerminal, merchantPayment, savedUsdtRate, rateCaptured = false
let generalBank, generalGateway, secondGeneralBank
const secret = 's'.repeat(43)
const template = { bankCode: 'fixture_bank', sender: 'fixture', creditTemplate: 'CREDIT {amount}', debitTemplate: 'DEBIT {amount}', unit: 'IRR', calendar: 'GREGORIAN' }
const gatewayConfig = bankId => JSON.stringify({ autoVerify: true, autoSources: ['SMS'], autoBankAccountId: bankId })
async function newSmsSource(bankId) {
  return prisma.paySmsSource.create({ data: { id: randomUUID(), label: stamp + bankId, bankCode: template.bankCode, bankAccountId: bankId, ownerUserId: users[0].id,
    secretCiphertext: encryptPanelCredential(secret), templateJson: JSON.stringify(template), verified: true, active: true } })
}
async function receive(body, source = smsSource) {
  return receiveSmsNotice(source.id, secret, Buffer.from(JSON.stringify({ message_id: 'fixture-' + body.number, sender: 'fixture', message: 'CREDIT ' + body.amount, received_at: new Date().toISOString() })))
}
async function invoice(amount, currency = 'IRR', kind = 'BILLING', userId = users[1].id, orderId = null) {
  const row = await prisma.invoice.create({ data: { number: `${stamp}-${invoices.length}`, userId, orderId, status: 'UNPAID', kind, currency, gatewayId: gateway.id, total: Number(amount), totalMinor: BigInt(amount), subtotal: Number(amount), subtotalMinor: BigInt(amount), expiresAt: new Date(now + 3600000) } }); invoices.push(row.id); return row
}
async function upload(id, amount, cookie = '') {
  const form = new FormData(); form.set('payerName', 'Synthetic User'); if (amount !== undefined) form.set('paidAmountRial', String(amount)); form.set('image', new Blob([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fef32a02550000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'receipt.png')
  return submitCollectionReceipt(new NextRequest(`https://mobocom.invalid/api/payment/mobocom-pay/collections/${id}/receipt`, { method: 'POST', headers: cookie ? { cookie } : {}, body: form }), id)
}
async function prepare(row) { const result = await prepareBaleGateway(gateway.id, row.number); if (!quotes.includes(result.txnId)) quotes.push(result.txnId); return result }
async function main() { try {
  const retired = retiredBaleIntake()
  assert.equal(retired.status, 410)
  assert.equal((await retired.json()).code, 'PAY_SOURCE_RETIRED')
  for (const key of keys) snapshots.set(key, await prisma.setting.findUnique({ where: { key } }))
  bank = await prisma.bankAccount.create({ data: { bankName: stamp, holderName: stamp, accountNumber: '9999999999999', cardNumber: '9999999999999999', active: true, collectionUse: 'MOBOCOM_PAY' } })
  users.push(await prisma.user.create({ data: { email: `${stamp}-admin@example.invalid`, passwordHash: '!', role: 'ADMIN', status: 'ACTIVE' } }))
  users.push(await prisma.user.create({ data: { email: `${stamp}-buyer@example.invalid`, passwordHash: '!', role: 'CUSTOMER', status: 'ACTIVE' } }))
  process.env.PANEL_CREDENTIAL_KEY = '12'.repeat(32)
  smsSource = await newSmsSource(bank.id)
  gateway = await prisma.gateway.create({ data: { config: gatewayConfig(bank.id), name: stamp, provider: 'MOBOCOM_PAY', active: true, fiat: 'IRR', feeBps: 0, feePercent: 0 } })
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
  secondSmsSource = await newSmsSource(secondBank.id)
  extraSmsSources.push(secondSmsSource.id)
  await prisma.gateway.update({ where: { id: gateway.id }, data: { config: gatewayConfig(secondBank.id) } })
  await prisma.paySmsSource.update({ where: { id: secondSmsSource.id }, data: { templateJson: JSON.stringify({ ...template, bankCode: 'other_bank' }), version: { increment: 1 } } })
  assert.equal(await pay.baleGatewayReady(undefined, gateway.id), false)
  await prisma.paySmsSource.update({ where: { id: secondSmsSource.id }, data: { templateJson: JSON.stringify(template), version: { increment: 1 } } })
  assert.equal(await pay.baleGatewayReady(undefined, gateway.id), true)
  try { await assert.rejects(prepare(y), error => error.code === 'BALE_POOL_EXHAUSTED') } finally { await prisma.gateway.update({ where: { id: gateway.id }, data: { config: gatewayConfig(bank.id) } }) }
  const toman = await invoice(70000, 'IRT'), qt = await prepare(toman); assert.equal((await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: qt.txnId } })).principalRial, 700000n)
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(users[0].id), authAt: Date.now() } })
  const admin = { id: users[0].id, email: users[0].email, req: new NextRequest('https://mobocom.invalid/api/admin/receipts', { headers: { cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`, origin: 'https://mobocom.invalid' } }) }
  async function adminMarkPaid(id) {
    return invoiceAdmin.PATCH(new NextRequest('https://mobocom.invalid/api/admin/invoices', { method: 'PATCH', headers: { cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`, origin: 'https://mobocom.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ id, action: 'markPaid' }) }))
  }
  function adminRequest(path, method, body) {
    return new NextRequest('https://mobocom.invalid' + path, { method, headers: { cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`, origin: 'https://mobocom.invalid', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  }
  async function admin360(id, amount) {
    return userAdmin.POST(adminRequest(`/api/admin/users/${users[1].id}`, 'POST', { action: 'invoice', invoiceAction: 'markPaid', invoiceId: id, amount }), { params: Promise.resolve({ id: String(users[1].id) }) })
  }
  async function assertGenericRefused(inv, q) {
    const invoiceBefore = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })
    const before = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: q.txnId } })
    const walletBefore = await prisma.walletAccount.findMany({ where: { userId: users[1].id } })
    const direct = await settleInvoiceManually({ invoiceId: inv.id, raw: { source: 'test' } })
    assert.equal(direct.ok, false); assert.equal(direct.status, 409)
    await assert.rejects(markInvoicePaid({ invoiceId: inv.id, genericManualReview: true }), error => error.status === 409)
    assert.equal((await adminMarkPaid(inv.id)).status, 409)
    assert.equal((await admin360(inv.id)).status, 409)
    if (inv.orderId) assert.equal((await orderAdmin.PATCH(adminRequest('/api/admin/orders', 'PATCH', { id: inv.orderId, action: 'markPaid' }))).status, 409)
    assert.deepEqual(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }), invoiceBefore)
    assert.deepEqual(await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: q.txnId } }), before)
    assert.deepEqual(await prisma.walletAccount.findMany({ where: { userId: users[1].id } }), walletBefore)
    assert.equal(await prisma.walletTx.count({ where: { invoiceId: inv.id } }), 0)
    assert.equal(await prisma.payment.count({ where: { OR: [{ invoiceId: inv.id }, { providerTxnId: q.txnId }] } }), 0)
  }
  const blockedTopup = await invoice(850000, 'IRR', 'WALLET_TOPUP'), blockedTopupQuote = await prepare(blockedTopup)
  await assertGenericRefused(blockedTopup, blockedTopupQuote)
  const order = await prisma.order.create({ data: { userId: users[1].id, totalAmount: 860000, totalMinor: 860000n, currency: 'IRR', status: 'PENDING' } }); orders.push(order.id)
  const blockedOrder = await invoice(860000, 'IRR', 'BILLING', users[1].id, order.id), blockedOrderQuote = await prepare(blockedOrder)
  await assertGenericRefused(blockedOrder, blockedOrderQuote)
  assert.deepEqual(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }), order)
  await changeBaleCheckout(blockedTopupQuote.txnId, new NextRequest('https://mobocom.invalid/pay/bank/' + blockedTopupQuote.txnId), 'accept')
  const blockedRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: blockedTopupQuote.txnId } })
  const blockedNotice = envelope(67, { amount: blockedRow.collectedRial.toString(), reference: 'BLOCKEDTOPUP123' })
  await receive(blockedNotice); await receive(blockedNotice)
  const autoBalance = await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: users[1].id, currency: 'IRR' } } })
  assert.equal((await admin360(blockedTopup.id)).status, 200); assert.equal((await admin360(blockedTopup.id)).status, 200)
  assert.deepEqual(await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: users[1].id, currency: 'IRR' } } }), autoBalance)
  const paidReplay = await settleInvoiceManually({ invoiceId: blockedTopup.id, raw: { source: 'test' } })
  assert.equal(paidReplay.ok, true); assert.equal(paidReplay.alreadyPaid, true)
  assert.equal(await prisma.walletTx.count({ where: { invoiceId: blockedTopup.id, type: 'TOPUP', status: 'DONE' } }), 1)
  assert.equal(await prisma.payment.count({ where: { providerTxnId: blockedRow.id, provider: 'MOBOCOM_PAY_ADJUSTMENT' } }), 1)
  const plainTopup = await invoice(875000, 'IRR', 'WALLET_TOPUP')
  const balanceBeforePlain = (await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: users[1].id, currency: 'IRR' } } })).balanceMinor
  const concurrent = await Promise.all([admin360(plainTopup.id, '880000'), admin360(plainTopup.id, '880000')])
  assert.deepEqual(concurrent.map(response => response.status), [200, 200])
  assert.equal((await admin360(plainTopup.id, '880000')).status, 200)
  const plainRows = await prisma.walletTx.findMany({ where: { invoiceId: plainTopup.id, type: 'TOPUP', status: 'DONE' } })
  assert.equal(plainRows.length, 1); assert.equal(plainRows[0].amountMinor, 875000n)
  assert.equal((await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: users[1].id, currency: 'IRR' } } })).balanceMinor, balanceBeforePlain + 875000n)
  const genericTopup = await invoice(876000, 'IRR', 'WALLET_TOPUP')
  const genericResults = await Promise.all([settleInvoiceManually({ invoiceId: genericTopup.id, raw: {} }), settleInvoiceManually({ invoiceId: genericTopup.id, raw: {} })])
  assert.ok(genericResults.every(result => result.ok))
  const genericRows = await prisma.walletTx.findMany({ where: { invoiceId: genericTopup.id, type: 'TOPUP', status: 'DONE' } })
  assert.equal(genericRows.length, 1); assert.equal(genericRows[0].amountMinor, 876000n)
  // An uncommitted quote is invisible to the helper's advisory precheck. The
  // shared invoice write lock must still prevent an unreviewed settlement.
  const racingTopup = await invoice(877000, 'IRR', 'WALLET_TOPUP')
  let quoteReady, releaseQuote
  const ready = new Promise(resolve => { quoteReady = resolve }), release = new Promise(resolve => { releaseQuote = resolve })
  const creating = prisma.$transaction(async tx => {
    const row = await createBaleCollectionInTransaction(tx, racingTopup.number, gateway.id)
    quotes.push(row.id); quoteReady(); await release; return row
  }, { timeout: 10000 })
  let racingManual
  try {
    await ready
    racingManual = settleInvoiceManually({ invoiceId: racingTopup.id, raw: { source: 'concurrent-admin' } })
    let blocked = false
    for (let attempt = 0; attempt < 80; attempt++) {
      const waiting = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = current_user AND wait_event_type = 'Lock' AND query LIKE '%Invoice%' AND query LIKE '%UPDATE%'`
      if (waiting[0].n > 0) { blocked = true; break }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.ok(blocked, 'generic settlement waits on the quote transaction invoice lock')
  } finally { releaseQuote() }
  const racingQuote = await creating, racingRefusal = await racingManual
  assert.equal(racingRefusal.ok, false); assert.equal(racingRefusal.status, 409)
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: racingTopup.id } })).status, 'UNPAID')
  assert.equal((await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: racingQuote.id } })).status, 'PENDING')
  assert.equal(await prisma.walletTx.count({ where: { invoiceId: racingTopup.id } }), 0)
  assert.equal(await prisma.payment.count({ where: { invoiceId: racingTopup.id } }), 0)
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
  assert.equal(afterAuto.alreadyPaid, true); assert.equal(afterAuto.confirmation.method, 'AUTO'); assert.equal(afterAuto.confirmation.source, 'SMS'); assert.match(afterAuto.message, /قبلاً خودکار/)
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
  smsGateway = await prisma.gateway.create({ data: { name: stamp + '-dual', provider: 'CARD_TRANSFER', active: true, fiat: 'IRR', feeBps: 0, feePercent: 0, config: JSON.stringify({ autoVerify: true, autoSources: ['SMS'], autoBankAccountId: bank.id }) } })
  const dual = await invoice(1500000); await prisma.invoice.updateMany({ where: { id: dual.id, status: 'UNPAID' }, data: { gatewayId: smsGateway.id } })
  const dualQuote = await prepareBaleGateway(smsGateway.id, dual.number); quotes.push(dualQuote.txnId)
  await changeBaleCheckout(dualQuote.txnId, new NextRequest('https://mobocom.invalid/pay/bank/' + dualQuote.txnId), 'accept')
  const dualRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: dualQuote.txnId } })
  const sms = Buffer.from(JSON.stringify({ message_id: 'synthetic-dual', sender: 'fixture', message: `CREDIT ${dualRow.collectedRial}`, received_at: new Date().toISOString() }))
  const both = await Promise.allSettled([receiveSmsNotice(smsSource.id, secret, sms), receive(envelope(22, { amount: dualRow.collectedRial.toString(), reference: 'DUALSOURCE123' }))])
  assert.ok(both.some(result => result.status === 'fulfilled' && result.value.financialApproval)); assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: dual.id } })).status, 'PAID')
  assert.equal(await prisma.payment.count({ where: { invoiceId: dual.id, status: 'CONFIRMED' } }), 1)
  await require('./pay-transfer-recovery.scenarios.cjs')({prisma,load,pay,invoice,prepare,changeBaleCheckout,bank,smsGateway,smsSource,secret,quotes})
  const secondAdmin = await prisma.user.create({ data: { email: `${stamp}-sms-admin@example.invalid`, passwordHash: '!', role: 'ADMIN', status: 'ACTIVE' } })
  users.push(secondAdmin)
  const smsEditorRole = await prisma.role.create({ data: { name: stamp + '-sms-editor', permissions: 'mobocom-pay.manage' } }); roles.push(smsEditorRole.id)
  const limitedSmsEditor = await prisma.user.create({ data: { email: `${stamp}-sms-editor@example.invalid`, passwordHash: '!', role: 'ADMIN', roleId: smsEditorRole.id, status: 'ACTIVE' } })
  users.push(limitedSmsEditor)
  async function sessionActor(user) {
    const session = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), authAt: Date.now() } })
    return { id: user.id, email: user.email, req: new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/sms-sources', { headers: { cookie: `__Secure-next-auth.session-token=${session}`, origin: 'https://mobocom.invalid' } }) }
  }
  const simpleSource = await require('./pay-sms-forwarder.scenarios.cjs')({ prisma, load, admin, secondAdmin: await sessionActor(secondAdmin), limitedEditor: await sessionActor(limitedSmsEditor), bank, gateway: smsGateway, invoice,
    prepare: prepareBaleGateway, quotes, upload, receiveTimestamped: receive, envelope, sources: extraSmsSources, clock: { now: () => now, set: value => { now = value } } })
  const isolated = await invoice(1550000, 'IRR', 'WALLET_TOPUP')
  await prisma.gateway.update({ where: { id: gateway.id }, data: { config: gatewayConfig(secondBank.id) } })
  try {
    const isolatedQuote = await prepare(isolated), request = new NextRequest('https://mobocom.invalid/pay/bank/' + isolatedQuote.txnId)
    await changeBaleCheckout(isolatedQuote.txnId, request, 'accept')
    const row = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: isolatedQuote.txnId } })
    const exact = envelope(45, { amount: row.collectedRial })
    assert.equal((await receive(exact)).financialApproval, false, 'another destination cannot claim the reserved amount')
    await prisma.paySmsSource.update({ where: { id: secondSmsSource.id }, data: { version: { increment: 1 } } })
    const restored = await baleCheckout(row.id, request)
    assert.equal(restored.receiptOnly, true)
    assert.equal(restored.bank, null)
    await assert.rejects(receive(envelope(46, { amount: row.collectedRial }), secondSmsSource), status(503))
    await upload(row.id, row.collectedRial)
    const held = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: row.id } })
    assert.equal(held.status, 'UNDER_REVIEW')
    await reviewCollectionReceipt(admin, held.receiptId, 'approve', '')
    const credit = await prisma.walletTx.findMany({ where: { invoiceId: isolated.id, type: 'TOPUP', status: 'DONE' } })
    assert.equal(credit.length, 1); assert.equal(credit[0].amountMinor, 1550000n)
  } finally { await prisma.gateway.update({ where: { id: gateway.id }, data: { config: gatewayConfig(bank.id) } }) }
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
  manualGateway = await prisma.gateway.create({ data: { name: stamp + '-manual', provider: 'MANUAL', active: true, fiat: 'IRR', instructions: 'Synthetic manual transfer instructions' } })
  const gatewayRef = 'db:' + smsGateway.id
  async function verifiedCheckout(amount, legacy = false, split = false) {
    const id = randomBytes(24).toString('base64url'), secret = randomBytes(32).toString('base64url')
    const invoiceId = await prisma.$transaction(async tx => {
      const legacyInvoice = legacy ? await tx.invoice.create({ data: {
        number: stamp + '-interrupted', kind: 'PAY_COLLECTION', status: 'UNPAID', currency: 'IRR', gatewayId: smsGateway.id,
        total: Number(amount), totalMinor: amount, subtotal: Number(amount), subtotalMinor: amount,
      } }) : null
      await tx.payPayment.create({ data: {
        id, merchantId: payMerchant.id, terminalId: payTerminal.id, externalId: id, idempotencyKey: id, fingerprint: id,
        amountMinor: amount, totalMinor: amount + (split ? 300n : 0n), netMinor: amount - (split ? 700n : 0n), feeMinor: split ? 1000n : 0n,
        ...(split && { feeBearer: 'SPLIT' }), createdAt: new Date(now), expiresAt: new Date(now + 600000),
        payerSessionHash: createHash('sha256').update(secret).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('+989120009999'),
        payerPhoneLast4: '9999', payerVerifiedAt: new Date(now), payerSessionExpiresAt: new Date(now + 86400000),
        ...(legacyInvoice && { invoiceId: legacyInvoice.id, gatewayAttemptRef: gatewayRef, gatewayAttemptProvider: 'CARD_TRANSFER', gatewayAttemptStatus: 'UNKNOWN' }),
      } })
      return legacyInvoice?.id
    })
    if (invoiceId) invoices.push(invoiceId)
    merchantPayments.push(id)
    return { id, invoiceId, req: new NextRequest('https://mobocom.invalid/pay/' + id, { headers: { cookie: `pay_payer_${id}=${secret}` } }) }
  }
  const originalPolicy = await prisma.setting.findUniqueOrThrow({ where: { key: keys[1] } })
  await put(keys[1], JSON.stringify({ ...JSON.parse(originalPolicy.value), bale: { enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '10', minutes: 15 } }))
  const blockedCheckout = await verifiedCheckout(500000n)
  try {
    await assert.rejects(pay.startPayGateway(blockedCheckout.req, blockedCheckout.id, { gatewayRef }), error => error.code === 'BALE_POOL_EXHAUSTED')
  } finally {
    const bound = await prisma.payPayment.findUniqueOrThrow({ where: { id: blockedCheckout.id }, select: { invoiceId: true } })
    if (bound.invoiceId) invoices.push(bound.invoiceId)
  }
  const unbound = await prisma.payPayment.findUniqueOrThrow({ where: { id: blockedCheckout.id } })
  assert.equal(unbound.invoiceId, null)
  assert.equal(unbound.gatewayAttemptStatus, '')
  assert.equal(await prisma.invoice.count({ where: { idempotencyKey: 'pay-collection:' + blockedCheckout.id } }), 0)
  const fallback = await pay.startPayGateway(blockedCheckout.req, blockedCheckout.id, { gatewayRef: 'db:' + manualGateway.id })
  invoices.push(fallback.invoiceId)
  assert.equal(fallback.status, 'READY')
  assert.equal(fallback.manual, true)
  await put(keys[1], originalPolicy.value)

  const freshCheckout = await verifiedCheckout(15000000n)
  const start = () => pay.startPayGateway(freshCheckout.req, freshCheckout.id, { gatewayRef })
  const [fresh, repeated] = await Promise.all([start(), start()])
  invoices.push(fresh.invoiceId)
  assert.equal(fresh.status, 'READY')
  assert.deepEqual(repeated, fresh)
  assert.equal(await prisma.payBaleCollection.count({ where: { invoiceId: fresh.invoiceId } }), 1)
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: fresh.invoiceId } })).paymentUrl, fresh.paymentUrl)

  const interrupted = await verifiedCheckout(15100000n, true)
  assert.equal((await pay.checkoutView(interrupted.id, interrupted.req)).selectedGateway.status, 'FAILED')
  const resumed = await pay.startPayGateway(interrupted.req, interrupted.id, { gatewayRef })
  assert.equal(resumed.status, 'READY')
  assert.equal(resumed.invoiceId, interrupted.invoiceId)
  assert.equal(await prisma.payBaleCollection.count({ where: { invoiceId: interrupted.invoiceId } }), 1)
  const payerToken = randomBytes(32).toString('base64url'), payId = randomBytes(24).toString('base64url')
  const payInvoice = await prisma.$transaction(async tx => {
    const inv = await tx.invoice.create({ data: { number: stamp+'-merchant', kind: 'PAY_COLLECTION', status: 'UNPAID', currency: 'IRR', gatewayId: smsGateway.id, total: 2100000, totalMinor: 2100000n, subtotal: 2100000, subtotalMinor: 2100000n } })
    merchantPayment = await tx.payPayment.create({ data: { id: payId, merchantId: payMerchant.id, terminalId: payTerminal.id, externalId: stamp, idempotencyKey: stamp, fingerprint: stamp, invoiceId: inv.id, amountMinor: 2100000n, totalMinor: 2100000n, feeMinor: 1000n, netMinor: 2099000n, createdAt: new Date(now), expiresAt: new Date(now+600000), payerSessionHash: createHash('sha256').update(payerToken).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('+989120009999'), payerPhoneLast4: '9999', payerVerifiedAt: new Date(now), payerSessionExpiresAt: new Date(now+86400000), gatewayAttemptStatus: 'READY', gatewayAttemptRef: 'db:'+smsGateway.id, gatewayAttemptProvider: 'CARD_TRANSFER' } })
    return inv
  }); invoices.push(payInvoice.id)
  merchantPayments.push(payId)
  const cookie = `pay_payer_${payId}=${payerToken}`, payRequest = new NextRequest('https://mobocom.invalid/pay/bank/fixture', { headers: { cookie } })
  const oldPayQuote = await prepareBaleGateway(smsGateway.id, payInvoice.number); quotes.push(oldPayQuote.txnId)
  assert.equal((await adminMarkPaid(payInvoice.id)).status, 409)
  assert.equal((await settleInvoiceManually({ invoiceId: payInvoice.id, raw: { source: 'test' } })).status, 409)
  await changeBaleCheckout(oldPayQuote.txnId, payRequest, 'accept')
  const renewedPay = await baleCheckout(oldPayQuote.txnId, payRequest)
  assert.equal(Date.parse(renewedPay.expiresAt), merchantPayment.expiresAt.getTime())
  const beforeExpiry = now
  now = merchantPayment.expiresAt.getTime() + 1000
  await assert.rejects(changeBaleCheckout(oldPayQuote.txnId, payRequest, 'renew'), error => error.status === 409)
  now = beforeExpiry
  assert.equal((await prisma.payPayment.findUniqueOrThrow({ where: { id: payId } })).expiresAt.getTime(), merchantPayment.expiresAt.getTime())
  await changeBaleCheckout(renewedPay.id, payRequest, 'accept'); await upload(renewedPay.id, undefined, cookie)
  const heldMerchantReceipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: renewedPay.id }, include: { receipt: true } })
  assert.equal(heldMerchantReceipt.receiptAmountRial, BigInt(renewedPay.collectedRial))
  assert.equal(heldMerchantReceipt.receipt.trackingCode, '')
  assert.ok((await pay.adminPayOverview(admin)).payments.find(row => row.id === payId).receiptIds.includes(heldMerchantReceipt.receiptId))
  const queueBefore = (await pay.adminPayOverview(admin)).workQueue
  assert.ok(queueBefore.pendingReceipts > 0)
  const receiptPage = await pay.adminPayPayments(admin, new URLSearchParams({ q: payId, status: 'UNDER_REVIEW' }))
  assert.equal(receiptPage.total, 1)
  assert.deepEqual(receiptPage.items[0].receiptIds, [heldMerchantReceipt.receiptId])
  assert.equal((await pay.adminPayPayments(admin, new URLSearchParams({ q: payId, status: 'PAID' }))).total, 0)
  assert.equal((await pay.payReceiptImage(admin.req, heldMerchantReceipt.receiptId)).headers.get('content-type'), 'image/png')
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
  assert.equal(merchantView.confirmation.method, 'AUTO'); assert.equal(merchantView.confirmation.source, 'SMS')
  assert.equal(merchantView.creditRial, '2099000'); assert.equal(merchantView.customerAmountRial, renewedPay.collectedRial)
  assert.equal(BigInt(merchantView.platformFeeRial) + BigInt(merchantView.creditRial), BigInt(merchantView.customerAmountRial))
  assert.equal(await prisma.payment.count({ where: { invoiceId: payInvoice.id, status: 'CONFIRMED' } }), 1)
  const reportDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tehran' }).format(paidMerchant.paidAt)
  const reportRange = new URLSearchParams({ from: reportDay, to: reportDay })
  const merchantReport = await pay.payFinancialReport(merchantActor, 'merchant', reportRange)
  assert.equal(merchantReport.days.length, 1)
  assert.equal(merchantReport.totals.paidCount, 1)
  assert.equal(merchantReport.totals.receivedRial, renewedPay.collectedRial)
  assert.equal(merchantReport.totals.platformFeeRial, '1000')
  assert.equal(merchantReport.totals.creditedRial, '2099000')
  assert.equal(merchantReport.totals.netRial, '2099000')
  assert.deepEqual(merchantReport.closing.find(row => row.currency === 'IRR'), { currency: 'IRR', credited: '2099000', paid: '0', difference: '2099000' })
  const terminalReport = await pay.payFinancialReport(merchantActor, 'merchant', new URLSearchParams({ ...Object.fromEntries(reportRange), terminalId: payTerminal.id }))
  assert.equal(terminalReport.totals.paidCount, 1)
  assert.equal(terminalReport.terminalId, payTerminal.id)
  assert.deepEqual(terminalReport.closing, [])
  await assert.rejects(pay.payFinancialReport(merchantActor, 'merchant', new URLSearchParams({ terminalId: 'foreign-terminal' })), error => error.status === 404)
  assert.equal(merchantReport.totals.bankServiceFeeRial, (BigInt(renewedPay.collectedRial) - paidMerchant.totalMinor).toString())
  assert.equal((await pay.payFinancialReport(admin, 'admin', reportRange)).totals.receivedRial, merchantReport.totals.receivedRial)
  await assert.rejects(pay.payFinancialReport(merchantActor, 'admin', reportRange), error => error.status === 403)
  await assert.rejects(pay.payFinancialReport(merchantActor, 'merchant', new URLSearchParams({ from: '2026-02-30', to: reportDay })), error => error.status === 422)
  await prisma.payMerchant.update({ where: { id: payMerchant.id }, data: { feeBps: 0, flatFeeMinor: 1000n, customerFeeShareBps: 3000 } })
  const bot = await pay.saveBotIntegration(merchantActor, { terminalId: payTerminal.id, version: 0, callbackUrl: 'https://merchant.invalid/api/payment',
    callbackToken: 'synthetic-sms-checkout-callback', ackPolicy: 'JSON_OK', responseMode: 'LINKS', active: true })
  const botOrder = { api_key: bot.token, order_id: stamp + '-bot', amount: '1700000', user_id: '12345', type: 'purchase',
    payment_count: '3', membership_days: '45', register: '1735689600', balance: '' }
  const botUrl = 'https://mobocom.invalid/api/v1/pay/bot/' + bot.integration.id
  const postOrder = body => botHttp(new NextRequest(botUrl, { method: 'POST', headers: { origin: 'https://mobocom.invalid', 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: bot.integration.id }) })
  const invalid = await postOrder({ ...botOrder, register: '1e3' })
  assert.equal(invalid.status, 422); assert.match((await invalid.json()).message, /register/)
  const currentPaymentSettings = JSON.parse((await prisma.setting.findUniqueOrThrow({ where: { key: keys[1] } })).value)
  await put(keys[1], JSON.stringify({ ...currentPaymentSettings, paymentMinutes: 60 }))
  const createdBotOrder = await postOrder(botOrder)
  const botResponse = await createdBotOrder.json()
  assert.equal(createdBotOrder.status, 200, botResponse.message)
  assert.equal(botResponse.links.length, 1)
  const smsCheckoutUrl = botResponse.links[0].url, smsId = new URL(smsCheckoutUrl).pathname.split('/').at(-1)
  merchantPayments.push(smsId)
  const timedPayment = await prisma.payPayment.findUniqueOrThrow({ where: { id: smsId } })
  assert.equal(timedPayment.expiresAt.getTime() - timedPayment.createdAt.getTime(), 60 * 60000)
  const replay = await postOrder({ ...botOrder, amount: 1700000, payment_count: 3, user_id: 12345 })
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), botResponse)
  // Seed the session from the OTP boundary; the rest uses production gateway, SMS and ledger owners.
  const checkoutToken = randomBytes(32).toString('base64url')
  const verified = await prisma.payPayment.updateMany({ where: { id: smsId, status: 'PENDING', payerSessionHash: '' }, data: {
    payerSessionHash: createHash('sha256').update(checkoutToken).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('+989120009999'),
    payerPhoneLast4: '9999', payerVerifiedAt: new Date(), payerSessionExpiresAt: new Date(now + 3600000),
  } })
  assert.equal(verified.count, 1)
  const smsCheckout = { id: smsId, req: new NextRequest(smsCheckoutUrl, { headers: { cookie: `pay_payer_${smsId}=${checkoutToken}` } }) }
  const smsPeer = await verifiedCheckout(17000000n, false, true)
  const options = (await pay.checkoutView(smsCheckout.id, smsCheckout.req)).gateways
  assert.ok(options.some(option => option.ref === gatewayRef && option.automatic && !option.manual))
  assert.ok(options.some(option => option.id === manualGateway.id && option.manual && !option.automatic))
  const smsOrders = await Promise.all([smsCheckout, smsPeer].map(async checkout => {
    const started = await pay.startPayGateway(checkout.req, checkout.id, { gatewayRef })
    invoices.push(started.invoiceId)
    const id = new URL(started.paymentUrl).pathname.split('/').at(-1)
    quotes.push(id)
    return changeBaleCheckout(id, checkout.req, 'accept')
  }))
  const [smsQuote, peerQuote] = smsOrders
  assert.equal(Date.parse(smsQuote.expiresAt), timedPayment.expiresAt.getTime())
  assert.equal(smsQuote.principalRial, '17000300')
  assert.equal(smsQuote.orderRial, '17000000')
  assert.equal(smsQuote.customerFeeRial, '300'); assert.equal(smsQuote.merchantFeeRial, '700')
  assert.ok(BigInt(smsQuote.adjustmentRial) > 0n)
  assert.notEqual(smsQuote.collectedRial, peerQuote.collectedRial)
  const forwarded = async amount => {
    const request = new NextRequest('https://mobocom.invalid/api/payment/mobocom-pay/sms-forwarder/' + simpleSource.sourceId, {
      method: 'POST', headers: { origin: 'https://mobocom.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ sms: `CREDIT ${amount}`, bank: simpleSource.bank, token: simpleSource.token }),
    })
    const response = await smsForwarderHttp(request, { params: Promise.resolve({ id: simpleSource.sourceId }) })
    const body = await response.json()
    assert.equal(response.status, 200, body.error)
    return body.data
  }
  async function settledMerchantState(checkout, collectionId, expectedMethod) {
    const payment = await prisma.payPayment.findUniqueOrThrow({ where: { id: checkout.id } })
    const collection = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: collectionId } })
    const account = await prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: users[1].id, currency: 'IRR' } } })
    const credits = await prisma.walletTx.findMany({ where: { idempotencyKey: 'pay-credit:' + checkout.id } })
    const principal = await prisma.payment.findMany({ where: { invoiceId: payment.invoiceId, status: 'CONFIRMED' } })
    const fees = await prisma.payment.findMany({ where: { provider: 'MOBOCOM_PAY_ADJUSTMENT', providerTxnId: collectionId, status: 'CONFIRMED' } })
    assert.equal(payment.status, 'PAID')
    assert.equal(collection.status, 'PAID')
    assert.equal(collection.paidCollectedRial, collection.collectedRial)
    if (expectedMethod) assert.equal(collection.settlementMethod, expectedMethod)
    assert.equal(credits.length, 1)
    assert.equal(credits[0].id, payment.walletTxId)
    assert.equal(credits[0].amountMinor, payment.creditMinor)
    assert.equal(credits[0].withdrawableDeltaMinor, payment.creditMinor)
    assert.equal(principal.length, 1)
    assert.equal(principal[0].amountMinor, collection.principalRial)
    assert.equal(fees.length, 1)
    assert.equal(fees[0].amountMinor, collection.collectedRial - collection.principalRial)
    assert.equal(await prisma.auditLog.count({ where: { action: 'mobocom-pay.transfer.paid', targetId: collectionId } }), 1)
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tehran' }).format(payment.paidAt)
    const report = await pay.payFinancialReport(merchantActor, 'merchant', new URLSearchParams({ from: day, to: day }))
    return { walletBalance: account.balanceMinor, withdrawable: account.withdrawableMinor, creditId: credits[0].id,
      principalId: principal[0].id, feeId: fees[0].id, settledAt: collection.paidAt, confirmation: collection.settlementMethod, report: report.totals }
  }
  assert.equal((await forwarded(smsQuote.principalRial)).financialApproval, false)
  const waitingForReceipt = await forwarded(smsQuote.collectedRial)
  assert.equal(waitingForReceipt.financialApproval, false)
  assert.equal(waitingForReceipt.receiptRequired, true)
  const receiptQueue = await operations.transferReviewQueue(admin, new URLSearchParams({ stage: 'WAITING_RECEIPT' }))
  assert.ok(receiptQueue.receipts.some(row => row.id === smsQuote.id && row.stage === 'WAITING_RECEIPT' && row.totalRial === smsQuote.collectedRial))
  const noticeCandidate = await operations.transferCollectionReview(admin, smsQuote.id)
  assert.equal(noticeCandidate.notice.id, waitingForReceipt.id)
  assert.equal(noticeCandidate.notice.candidate, true)
  assert.equal(noticeCandidate.canConfirm, false)
  assert.equal((await prisma.payPayment.findUniqueOrThrow({ where: { id: smsCheckout.id } })).status, 'PENDING')
  assert.equal(await prisma.walletTx.count({ where: { idempotencyKey: 'pay-credit:' + smsCheckout.id } }), 0)
  assert.equal((await upload(smsQuote.id, smsQuote.collectedRial, smsCheckout.req.headers.get('cookie'))).status, 'PAID')
  const smsReceipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: smsQuote.id } })
  assert.equal(await prisma.backgroundJob.count({ where: { dedupeKey: 'pay-transfer-match:' + waitingForReceipt.id + ':receipt:' + smsReceipt.receiptId } }), 1)
  assert.equal((await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: smsReceipt.receiptId } })).status, 'PENDING')
  const smsFirstState = await settledMerchantState(smsCheckout, smsQuote.id, 'AUTO')
  const afterSms = await reviewCollectionReceipt(admin, smsReceipt.receiptId, 'approve', '', 'SMSFIRSTBANK001')
  assert.equal(afterSms.alreadyPaid, true)
  assert.deepEqual(afterSms.confirmation, { method: 'AUTO', source: 'SMS' })
  assert.equal((await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: smsReceipt.receiptId } })).status, 'APPROVED')
  const smsReplay = await forwarded(smsQuote.collectedRial)
  assert.equal(smsReplay.duplicate, true)
  assert.equal(smsReplay.alreadyPaid, true)
  assert.deepEqual(await settledMerchantState(smsCheckout, smsQuote.id, 'AUTO'), smsFirstState)
  assert.equal((await baleCheckout(peerQuote.id, smsPeer.req)).status, 'PENDING')
  const splitPayment = await prisma.payPayment.findUniqueOrThrow({ where: { id: smsCheckout.id } })
  assert.equal(splitPayment.status, 'PAID')
  const splitCredit = await prisma.walletTx.findUniqueOrThrow({ where: { id: splitPayment.walletTxId } })
  assert.equal(splitCredit.amountMinor, 16999300n)
  assert.equal(await prisma.walletTx.count({ where: { userId: users[1].id, type: 'PAY_CREDIT', amountMinor: 16999300n } }), 1)
  const botDelivery = await prisma.payBotDelivery.findUniqueOrThrow({ where: { paymentId: smsId } })
  assert.equal(botDelivery.status, 'QUEUED')
  const botCheckoutResult = await pay.checkoutView(smsId, smsCheckout.req)
  assert.equal(botCheckoutResult.returnUrl, '', 'legacy web terminal bot payments have no public return URL')
  assert.equal(botCheckoutResult.botDelivery.status, 'QUEUED')
  assert.ok(!JSON.stringify(botCheckoutResult).includes('merchant.invalid'))
  assert.equal(await prisma.backgroundJob.count({ where: { kind: 'pay.bot-delivery', payload: { contains: botDelivery.id } } }), 1)
  await upload(peerQuote.id, peerQuote.collectedRial, smsPeer.req.headers.get('cookie'))
  const peerReceipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: peerQuote.id } })
  assert.ok((await operations.transferReviewQueue(admin, new URLSearchParams({ stage: 'WAITING_SMS' }))).receipts.some(row => row.id === peerQuote.id && row.stage === 'WAITING_SMS'))
  assert.equal((await operations.transferCollectionReview(admin, peerQuote.id)).canReviewReceipt, true)
  const decidePeer = () => reviewCollectionReceipt(admin, peerReceipt.receiptId, 'approve', '', 'CONCURRENTBANK001')
  const raceResults = await Promise.all([decidePeer(), forwarded(peerQuote.collectedRial), decidePeer(), forwarded(peerQuote.collectedRial)])
  assert.equal(raceResults.filter(result => result.alreadyPaid === false).length, 1)
  assert.equal((await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: peerReceipt.receiptId } })).status, 'APPROVED')
  const raceState = await settledMerchantState(smsPeer, peerQuote.id)
  assert.ok(['AUTO', 'MANUAL'].includes(raceState.confirmation))
  assert.equal((await decidePeer()).alreadyPaid, true)
  assert.equal((await forwarded(peerQuote.collectedRial)).alreadyPaid, true)
  assert.deepEqual(await settledMerchantState(smsPeer, peerQuote.id), raceState)
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
  assert.ok((await pay.payOperationalHealth()).bankAttention > 0)
  const evidence = await prisma.payBaleNotice.findFirstOrThrow({ where: { bankAccountId: bank.id, amountMinor: deskRow.collectedRial } })
  const command = (noticeId, action, version = 0, collectionId) => operations.decideTransferReview(admin, { noticeId, action, version, note: 'Synthetic reviewed decision', ...(collectionId ? { collectionId } : {}) })
  let detail = await operations.transferReviewDetail(admin, evidence.id); assert.equal(detail.canConfirm, true); assert.equal(detail.difference, 'EXACT')
  const historical = await prisma.payBaleNotice.create({ data: {
    ...evidence, id: randomUUID(), sourceType: 'BALE', smsSourceId: null,
    sourceEventId: createHash('sha256').update('retired-event-' + stamp).digest('hex'),
    messageId: '501999', bankCode: 'bankmeli', code: 'CARD_TRANSFER',
    bankFingerprint: createHash('sha256').update('retired-transfer-' + stamp).digest('hex'),
    occurredFrom: new Date(now - 60000), occurredBefore: new Date(now),
  } })
  assert.deepEqual(await recoverTransferMatch({ noticeId: historical.id }), { financialApproval: false })
  await assert.rejects(prisma.$transaction(tx => collectionSourceActor(tx, deskRow, historical)), error => error.code === 'PAY_SOURCE_RETIRED')
  await assert.rejects(command(historical.id, 'confirm', 0, deskRow.id), status(409))
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: deskInvoice.id } })).status, 'UNPAID')
  await put(keys[0], 'false')
  try { await assert.rejects(command(evidence.id, 'confirm'), status(503)) } finally { await put(keys[0], 'true') }
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
  const monitor = await operations.transferMonitor(admin); assert.ok(monitor.totals.paid>0); assert.ok(monitor.sources.some(s=>s.type==='SMS'&&s.observed)); assert.ok(monitor.pools.every(p=>p.remaining===Math.max(0,p.capacity-p.occupied))); assert.ok(monitor.pools.some(p=>p.state==='EXHAUSTED'))
  assert.ok((await operations.transferReviewQueue(admin,new URLSearchParams('closed=true'))).items.some(n=>n.id===evidence.id))
  const buyerToken = await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(users[1].id),authAt:Date.now()}})
  const buyerActor = {id:users[1].id,email:users[1].email,req:new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/transfer-reviews',{headers:{cookie:`next-auth.session-token=${buyerToken}; __Secure-next-auth.session-token=${buyerToken}`,origin:'https://mobocom.invalid'}})}
  await assert.rejects(operations.transferMonitor(buyerActor),status(403))
  const payRole=await prisma.role.create({data:{name:stamp+'-pay-only',permissions:'mobocom-pay.manage'}}); roles.push(payRole.id)
  const payOnly=await prisma.user.create({data:{email:stamp+'-pay-only@example.invalid',passwordHash:'!',role:'ADMIN',roleId:payRole.id}}); users.push(payOnly)
  const payOnlyToken=await encode({secret:process.env.NEXTAUTH_SECRET,token:{uid:String(payOnly.id),authAt:Date.now()}}),payOnlyActor={id:payOnly.id,email:payOnly.email,req:new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/transfer-reviews',{headers:{cookie:`__Secure-next-auth.session-token=${payOnlyToken}`,origin:'https://mobocom.invalid'}})}
  assert.ok((await operations.transferMonitor(payOnlyActor)).sources.length)
  await assert.rejects(pay.adminPayPayments(buyerActor, new URLSearchParams()), status(403))
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
  now = RealDate.now() - 45 * 60000
  const ownCheckout = await verifiedCheckout(15200000n)
  const ownStart = await pay.startPayGateway(ownCheckout.req, ownCheckout.id, { gatewayRef })
  invoices.push(ownStart.invoiceId)
  const ownQuote = await prisma.payBaleCollection.findFirstOrThrow({ where: { invoiceId: ownStart.invoiceId } })
  await changeBaleCheckout(ownQuote.id, ownCheckout.req, 'accept')
  now = ownQuote.expiresAt.getTime() + 1000
  const fallbackPolicy = await prisma.setting.findUniqueOrThrow({ where: { key: keys[1] } })
  const activePolicy = JSON.parse(fallbackPolicy.value)
  await put(keys[1], JSON.stringify({ ...activePolicy, bale: { ...activePolicy.bale, enabled: false } }))
  try {
    const expired = await baleCheckout(ownQuote.id, ownCheckout.req)
    assert.equal(expired.status, 'EXPIRED')
    assert.equal(expired.lateReceiptAllowed, true)
    assert.equal(expired.bank, null)
    await assert.rejects(upload(ownQuote.id, ownQuote.collectedRial), error => error.status === 401)
    assert.equal((await upload(ownQuote.id, ownQuote.collectedRial, ownCheckout.req.headers.get('cookie'))).status, 'UNDER_REVIEW')
  } catch (error) {
    await put(keys[1], fallbackPolicy.value)
    throw error
  }
  const ownReceipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: ownQuote.id } })
  const merchantUser = users[1], ownReference = 'PAYOWN' + randomUUID().replaceAll('-', '')
  const reviewerActor = await sessionActor(merchantUser)
  const { payAdminHttp } = load('src/modules/billing/server/http/pay.ts')
  async function approveOwnReceipt() {
    const body = JSON.stringify({ id: ownReceipt.receiptId, action: 'approve', trackingCode: ownReference })
    const headers = new Headers(reviewerActor.req.headers)
    headers.set('content-type', 'application/json')
    return payAdminHttp(new NextRequest('https://mobocom.invalid/api/admin/mobocom-pay/receipts', { method: 'PATCH', headers, body }), {
      params: Promise.resolve({ resource: 'receipts' }),
    })
  }
  try {
    await prisma.user.update({ where: { id: merchantUser.id }, data: { role: 'ADMIN', roleId: payRole.id } })
    const limited = await operations.transferCollectionReview(reviewerActor, ownQuote.id)
    assert.equal(limited.canReviewReceipt, false)
    assert.equal(limited.canRejectReceipt, false)
    assert.equal((await approveOwnReceipt()).status, 403)
    await prisma.user.update({ where: { id: merchantUser.id }, data: { roleId: null } })
    const full = await operations.transferCollectionReview(reviewerActor, ownQuote.id)
    assert.equal(full.canReviewReceipt, true)
    assert.equal(full.canRejectReceipt, false)
    assert.equal(full.requiresTrackingCode, true)
    await assert.rejects(reviewCollectionReceipt(reviewerActor, ownReceipt.receiptId, 'reject', 'Synthetic rejection'), status(403))
    assert.equal((await approveOwnReceipt()).status, 200)
    assert.equal((await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: ownReceipt.receiptId } })).status, 'APPROVED')
    assert.equal((await reviewCollectionReceipt(reviewerActor, ownReceipt.receiptId, 'approve', '', ownReference)).alreadyPaid, true)
    assert.equal(await prisma.walletTx.count({ where: { idempotencyKey: 'pay-credit:' + ownCheckout.id } }), 1)
    const manualState = await settledMerchantState(ownCheckout, ownQuote.id, 'MANUAL')
    await put(keys[1], fallbackPolicy.value)
    const originalTime = now
    try {
      now = ownQuote.expiresAt.getTime() + 1000
      const lateSms = await forwarded(ownQuote.collectedRial)
      assert.equal(lateSms.alreadyPaid, true)
      assert.equal((await forwarded(ownQuote.collectedRial)).duplicate, true)
      const repeatedManual = await reviewCollectionReceipt(reviewerActor, ownReceipt.receiptId, 'approve', '', ownReference)
      assert.equal(repeatedManual.alreadyPaid, true)
      assert.deepEqual(repeatedManual.confirmation, { method: 'MANUAL', source: 'STAFF' })
      assert.deepEqual(await settledMerchantState(ownCheckout, ownQuote.id, 'MANUAL'), manualState)
    } finally { now = originalTime }
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { actorUserId: merchantUser.id, action: 'mobocom-pay.transfer.receipt-review', targetId: ownQuote.id } })
    assert.equal(JSON.parse(audit.metadata).selfReview, true)
  } finally {
    await prisma.user.update({ where: { id: merchantUser.id }, data: { role: merchantUser.role, roleId: null } })
    await put(keys[1], fallbackPolicy.value)
  }
  generalBank = await prisma.bankAccount.create({ data: { bankName: stamp, holderName: stamp, accountNumber: '59001', cardNumber: '7777777777777777', active: true, collectionUse: 'GENERAL' } })
  generalGateway = await prisma.gateway.create({ data: { name: stamp + '-general', provider: 'CARD_TRANSFER', active: true, fiat: 'IRR' } })
  await put(keys[1], JSON.stringify({ ...activePolicy, bankAccountIds: [], bale: { ...activePolicy.bale, minAdjustmentRial: '10', maxAdjustmentRial: '100' } }))
  const manualOnly = []
  for (const order of ['manual-unique-a', 'manual-unique-b']) {
    const payment = await pay.createPayPayment(merchantActor, { terminalId: payTerminal.id, externalId: order, amountRial: '18000000', gatewayRef: 'db:' + generalGateway.id }, randomUUID())
    merchantPayments.push(payment.id)
    assert.equal(payment.bankAccountId, generalBank.id)
    const secret = randomBytes(32).toString('base64url'), cookie = `pay_payer_${payment.id}=${secret}`
    await prisma.payPayment.updateMany({ where: { id: payment.id, payerSessionHash: '' }, data: { payerSessionHash: createHash('sha256').update(secret).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('+989120009999'), payerPhoneLast4: '9999', payerVerifiedAt: new Date(now), payerSessionExpiresAt: new Date(now + 3600000) } })
    const req = new NextRequest('https://mobocom.invalid/pay/' + payment.id, { headers: { cookie } })
    const started = await pay.startPayGateway(req, payment.id, { gatewayRef: 'db:' + generalGateway.id })
    invoices.push(started.invoiceId)
    const id = new URL(started.paymentUrl).pathname.split('/').at(-1)
    const quote = await changeBaleCheckout(id, req, 'accept')
    assert.equal(quote.bank.cardNumber, generalBank.cardNumber)
    assert.equal(quote.receiptOnly, undefined)
    assert.equal(BigInt(quote.collectedRial) % 10n, 0n)
    assert.ok(BigInt(quote.adjustmentRial) > 0n)
    const stored = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id } })
    assert.deepEqual(JSON.parse(stored.sourceBindings).sms, [])
    manualOnly.push({ payment, quote, cookie })
  }
  assert.notEqual(manualOnly[0].quote.collectedRial, manualOnly[1].quote.collectedRial)
  const { payment: manualPayment, quote: manualQuote, cookie: manualCookie } = manualOnly[0]
  now += 3000
  await upload(manualQuote.id, manualQuote.collectedRial, manualCookie)
  const manualTransfer = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: manualQuote.id } })
  assert.equal(manualTransfer.status, 'UNDER_REVIEW')
  assert.ok((await operations.transferReviewQueue(admin, new URLSearchParams({ stage: 'REVIEW' }))).receipts.some(row => row.id === manualQuote.id && row.stage === 'REVIEW'))
  const at = new Date(now - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const header = 'reference,amount_irr,occurred_at\n'
  const row = 'NOMSGPAY001,' + manualQuote.collectedRial + ',' + at
  const preview = (csv, bankAccountId = generalBank.id) => pay.previewPayStatement(admin, { bankAccountId, csv })
  assert.ok((await pay.statementAccounts(admin)).some(account => account.id === generalBank.id))
  const tehran = new Date(Date.parse(at) + 210 * 60000).toISOString().replace(/\.000Z$/, '+03:30')
  assert.deepEqual(await preview(header + row + '\n' + row.replace(at, tehran)), {
    entries: 1, duplicates: 1, suggestions: [{ receiptId: manualTransfer.receiptId, entry: { reference: 'NOMSGPAY001', amountRial: manualQuote.collectedRial, at } }],
    ambiguous: 0, unmatched: 0, alreadyUsed: 0,
  })
  assert.equal((await preview(header + row, secondBank.id)).unmatched, 1)
  assert.equal((await preview(header + row + '\n' + row.replace('001', '002'))).ambiguous, 2)
  await assert.rejects(preview(header + row + '\n' + row.replace(manualQuote.collectedRial, '100')), status(422))
  await assert.rejects(preview(header + 'NOMSGPAY001,9999999999999999999,' + at), status(422))
  await assert.rejects(pay.previewPayStatement(merchantActor, { bankAccountId: generalBank.id, csv: header + row }), status(403))
  assert.equal((await pay.payReceipts(admin, [manualTransfer.receiptId])).items.length, 1)
  assert.equal(await prisma.walletTx.count({ where: { idempotencyKey: 'pay-credit:' + manualPayment.id } }), 0)
  const previewTime = now
  const savedReceipt = await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: manualTransfer.receiptId } })
  now = savedReceipt.createdAt.getTime()
  const backlogBefore = (await operations.transferMonitor(admin)).receiptBacklog
  now += 31 * 60000
  const backlogAfter = (await operations.transferMonitor(admin)).receiptBacklog
  assert.equal(backlogAfter.olderThanMinutes, 30)
  assert.ok(backlogAfter.count > backlogBefore.count)
  assert.ok(backlogAfter.oldestAt)
  now = previewTime
  await reviewCollectionReceipt(admin, manualTransfer.receiptId, 'approve', '', 'NOMSGPAY001')
  await settledMerchantState(manualPayment, manualQuote.id, 'MANUAL')
  const replayPreview = await preview(header + row)
  assert.deepEqual(replayPreview.suggestions, [])
  assert.equal(replayPreview.alreadyUsed, 1)
  secondGeneralBank = await prisma.bankAccount.create({ data: { bankName: stamp, holderName: stamp, accountNumber: '59002', cardNumber: '7777777777777797', active: true, collectionUse: 'GENERAL' } })
  const melli = load('src/modules/billing/domain/pay-sms-template.ts').smsBankPresets.find(preset => preset.bankCode === 'bankmeli')
  const sources = await Promise.all([generalBank, secondGeneralBank].map(async account => {
    const saved = await pay.saveSmsSource(admin, { label: stamp + account.id, bankAccountId: account.id, template: melli, format: 'FORWARDER_V1', verified: true, active: true })
    extraSmsSources.push(saved.source.id)
    return { ...saved, account }
  }))
  await put(keys[1], JSON.stringify({ ...activePolicy, bankAccountIds: [generalBank.id, secondGeneralBank.id], bale: { ...activePolicy.bale, minAdjustmentRial: '10', maxAdjustmentRial: '100' } }))
  await prisma.gateway.update({ where: { id: generalGateway.id }, data: { config: gatewayConfig(null) } })
  const { baleCollectionContext } = load('src/modules/billing/server/pay/bale/collection-context.ts')
  const destinations = await prisma.$transaction(async tx => {
    const ids = new Set()
    for (let index = 0; index < 12 && ids.size < 2; index++) {
      const result = await baleCollectionContext(tx, generalGateway.id, undefined, { merchantUserId: users[1].id }, { routingKey: String(index) })
      ids.add(result.bank.id)
    }
    return [...ids].sort()
  })
  assert.deepEqual(destinations, [generalBank.id, secondGeneralBank.id].sort())
  const automatic = await pay.createPayPayment(merchantActor, { terminalId: payTerminal.id, externalId: stamp + '-pool', amountRial: '19100000', gatewayRef: 'db:' + generalGateway.id }, randomUUID())
  merchantPayments.push(automatic.id)
  const autoSecret = randomBytes(32).toString('base64url'), autoCookie = `pay_payer_${automatic.id}=${autoSecret}`
  await prisma.payPayment.updateMany({ where: { id: automatic.id, payerSessionHash: '' }, data: { payerSessionHash: createHash('sha256').update(autoSecret).digest('hex'), payerPhoneCiphertext: encryptPanelCredential('+989120009999'), payerPhoneLast4: '9999', payerVerifiedAt: new Date(now), payerSessionExpiresAt: new Date(now + 3600000) } })
  const autoReq = new NextRequest('https://mobocom.invalid/pay/' + automatic.id, { headers: { cookie: autoCookie } })
  const autoStarted = await pay.startPayGateway(autoReq, automatic.id, { gatewayRef: 'db:' + generalGateway.id })
  invoices.push(autoStarted.invoiceId)
  const quoteId = new URL(autoStarted.paymentUrl).pathname.split('/').at(-1)
  const autoQuote = await changeBaleCheckout(quoteId, autoReq, 'accept')
  const poolRow = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: quoteId } })
  const correct = sources.find(item => item.account.id === poolRow.bankAccountId)
  const wrong = sources.find(item => item.account.id !== poolRow.bankAccountId)
  assert.equal(autoQuote.bank.cardNumber, correct.account.cardNumber)
  assert.equal(BigInt(autoQuote.collectedRial) % 10n, 0n)
  const noticeText = `بانك ملي ايران\nانتقالي:${BigInt(autoQuote.collectedRial).toLocaleString('en-US')}+\nحساب:${correct.account.accountNumber}\nمانده:10,100,512,660\n0828-18:40`
  const poolSms = async source => {
    const req = new NextRequest('https://mobocom.invalid/api/payment/mobocom-pay/sms-forwarder/' + source.source.id, { method: 'POST', headers: { origin: 'https://mobocom.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ sms: noticeText, bank: 'bankmeli', token: source.secret }) })
    const response = await smsForwarderHttp(req, { params: Promise.resolve({ id: source.source.id }) })
    assert.equal(response.status, 200)
    return (await response.json()).data
  }
  now += 3000
  assert.equal((await poolSms(wrong)).status, 'REJECTED')
  assert.equal((await poolSms(correct)).receiptRequired, true)
  assert.equal((await upload(quoteId, autoQuote.collectedRial, autoCookie)).status, 'PAID')
  await settledMerchantState({ id: automatic.id, req: autoReq }, quoteId, 'AUTO')
  assert.equal((await poolSms(correct)).duplicate, true)
  const bankDestination = await prisma.bankAccount.findUniqueOrThrow({ where: { id: correct.account.id } })
  await assert.rejects(prisma.bankAccount.update({ where: { id: bankDestination.id }, data: { accountNumber: '12345678' } }))
  await put(keys[2],'{"enabled":false,"settings":{}}'); await assert.rejects(operations.transferMonitor(admin),status(404)); await assert.rejects(command(overNotice.id,'dismiss',1),status(404)); await put(keys[2],'{"enabled":true,"settings":{}}')
  console.log('Bale collection + operations desk assertions passed: exact-once receipts/auto/reviewer race, late admission, mismatch refusal, version/module/source denial, pool and latency projections')
} finally {
  const rows = await prisma.payBaleCollection.findMany({ where: { invoiceId: { in: invoices } }, select: { id: true } }); const ids = rows.map(row => row.id)
  if (bank) { await prisma.$executeRawUnsafe('ALTER TABLE "PayTransferReview" DISABLE TRIGGER "PayTransferReview_guard"'); try { await prisma.payTransferReview.deleteMany({where:{notice:{bankAccountId:bank.id}}}) } finally { await prisma.$executeRawUnsafe('ALTER TABLE "PayTransferReview" ENABLE TRIGGER "PayTransferReview_guard"') } }
  try { if (ids.length) { await prisma.$executeRawUnsafe('ALTER TABLE "PayBaleCollection" DISABLE TRIGGER "PayBaleCollection_no_delete"'); try { await prisma.payBaleCollection.deleteMany({ where: { id: { in: ids } } }) } finally { await prisma.$executeRawUnsafe('ALTER TABLE "PayBaleCollection" ENABLE TRIGGER "PayBaleCollection_no_delete"') } } }
  finally {
    // Extra source rows are removed after all their notices/collections below.
    const receipts = await prisma.paymentReceipt.findMany({ where: { invoiceId: { in: invoices } }, select: { id: true, image: true } })
    if (bank) { const ids = [bank.id, secondBank?.id, generalBank?.id, secondGeneralBank?.id].filter(Boolean); await prisma.payBaleNotice.deleteMany({ where: { bankAccountId: { in: ids }, duplicateOfId: { not: null } } }); await prisma.payBaleNotice.deleteMany({ where: { bankAccountId: { in: ids } } }) }
    await prisma.paymentReceipt.deleteMany({ where: { id: { in: receipts.map(row => row.id) } } }); for (const row of receipts) if (/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(row.image)) await unlink(join(process.cwd(), 'storage', 'receipts', row.image)).catch(() => {})
    const deliveries = await prisma.payBotDelivery.findMany({ where: { paymentId: { in: merchantPayments } }, select: { id: true } })
    if (deliveries.length) await prisma.backgroundJob.deleteMany({ where: { kind: 'pay.bot-delivery', OR: deliveries.map(({ id }) => ({ payload: { contains: id } })) } })
    await prisma.payBotDelivery.deleteMany({ where: { paymentId: { in: merchantPayments } } })
    if (payTerminal) await prisma.payBotIntegration.deleteMany({ where: { terminalId: payTerminal.id } })
    await prisma.payPayment.deleteMany({ where: { id: { in: merchantPayments } } })
    if (payTerminal) await prisma.payTerminal.deleteMany({ where: { id: payTerminal.id } })
    if (payMerchant) await prisma.payMerchant.deleteMany({ where: { id: payMerchant.id } })
    await prisma.payment.deleteMany({ where: { OR: [{ invoiceId: { in: invoices } }, { providerTxnId: { in: ids }, provider: 'MOBOCOM_PAY_ADJUSTMENT' }] } }); await prisma.walletTx.deleteMany({ where: { OR: [{ invoiceId: { in: invoices } }, { userId: { in: users.map(user => user.id) }, type: 'PAY_CREDIT' }] } }); await prisma.walletAccount.deleteMany({ where: { userId: { in: users.map(user => user.id) } } }); await prisma.invoice.deleteMany({ where: { id: { in: invoices } } }); await prisma.order.deleteMany({ where: { id: { in: orders } } })
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users.map(user => user.id) }, OR: [{ action: { startsWith: 'mobocom-pay.' } }, { action: 'invoice.markPaid' }, { action: 'order.markPaid' }] } }); await prisma.paySmsSource.deleteMany({ where: { id: { in: extraSmsSources } } }); if (smsSource) await prisma.paySmsSource.deleteMany({ where: { id: smsSource.id } }); if (smsGateway) await prisma.gateway.deleteMany({ where: { id: smsGateway.id } }); if (gateway) await prisma.gateway.deleteMany({ where: { id: gateway.id } }); if (bank) await prisma.bankAccount.deleteMany({ where: { id: bank.id } }); if (secondBank) await prisma.bankAccount.deleteMany({ where: { id: secondBank.id } }); await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    await prisma.role.deleteMany({where:{id:{in:roles}}})
    if (manualGateway) await prisma.gateway.deleteMany({ where: { id: manualGateway.id } })
    if (generalGateway) await prisma.gateway.deleteMany({ where: { id: generalGateway.id } })
    if (generalBank) await prisma.bankAccount.deleteMany({ where: { id: generalBank.id } })
    if (secondGeneralBank) await prisma.bankAccount.deleteMany({ where: { id: secondGeneralBank.id } })
    if (rateCaptured && savedUsdtRate) await prisma.currencyRate.upsert({ where: { code: 'USDT' }, create: savedUsdtRate, update: savedUsdtRate }); else if (rateCaptured) await prisma.currencyRate.deleteMany({ where: { code: 'USDT' } })
    for (const [key, old] of snapshots) if (old) await put(key, old.value); else await prisma.setting.deleteMany({ where: { key } }); access.clearAdminPolicyCache(); await prisma.$disconnect(); global.Date = RealDate
  }
} }
main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
