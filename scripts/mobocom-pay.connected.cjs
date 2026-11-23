// Native PostgreSQL only. The canonical setting is temporarily replaced, so this runs solely on an explicitly disposable database.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const sourceLoader = require('./connected-source-loader.cjs')

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid')
if (!/^mobocom_pay_test_[a-z0-9_]+$/.test(url.pathname.slice(1))) throw Error('Refusing non-disposable database: expected mobocom_pay_test_*')
process.env.MOBOCOM_PAY_BANK_PROVIDER = 'fixture'
process.env.MOBOCOM_PAY_BANK_SECRET = 'synthetic-fixture-secret-only-0123456789abcdef'
const db = new PrismaClient(), seed = `pay-check-${randomUUID()}`
const state = { enabled: true, auditFails: false, reviewer: 0 }
const mocks = {
  '@/platform/database/prisma': { db },
  '@/extensions/server/modules': { isModuleEnabled: async () => state.enabled },
  '@/modules/identity/server/access': {
    requireUser: async (req, tx = db) => { const id = Number(req.headers.get('x-fixture-user')); return id ? tx.user.findUnique({ where: { id } }) : null },
    requirePerm: async (req, permission, tx = db) => Number(req.headers.get('x-fixture-user')) === state.reviewer && ['mobocom-pay.manage', 'mobocom-pay.settle', 'gateways.manage'].includes(permission) ? tx.user.findUnique({ where: { id: state.reviewer } }) : null,
  },
  '@/modules/identity/server/authentication-restrictions': { globalAuthenticationDenied: async () => false },
  '@/modules/account/server/section-access': { userOpensSection: async () => true },
  '@/modules/public-api/server/api-keys': { resolveApiCaller: async () => null },
  '@/modules/public-api/server/availability': { isPublicApiEnabled: async () => false },
}
const load = sourceLoader(mocks)
const realAudit = load('src/platform/audit/server.ts')
mocks['@/platform/audit/server'] = { ...realAudit, auditSystemStrict: (...args) => { if (state.auditFails) throw Error('fixture audit failure'); return realAudit.auditSystemStrict(...args) }, auditAdminStrict: (...args) => { if (state.auditFails) throw Error('fixture audit failure'); return realAudit.auditAdminStrict(...args) } }
const merchant = load('src/modules/billing/server/pay/merchants.ts')
const payments = load('src/modules/billing/server/pay/payments.ts')
const reconcile = load('src/modules/billing/server/pay/reconcile.ts')
const settlement = load('src/modules/billing/server/pay/settlements.ts')
const views = load('src/modules/billing/server/pay/views.ts')
const policy = load('src/modules/billing/domain/pay-policy.ts')
const wallet = load('src/modules/wallet/server/wallet.ts')
const billing = load('src/modules/billing/server/billing.ts')
const bankOwner = load('src/modules/billing/server/card-transfer.ts')
const bankHttp = load('src/modules/billing/server/http/card-transfer/admin.ts')
const key = () => randomUUID()
const actor = user => ({ id: user.id, email: user.email, req: new NextRequest('https://example.invalid/api/pay', { headers: { origin: 'https://example.invalid', 'x-fixture-user': String(user.id) } }) })
const paySettingsAddress = 'billing.mobocom-pay.v1'
let savedSetting, createdSetting = false, bank, gateway, users = [], merchants = []
async function main() {
  savedSetting = await db.setting.findUnique({ where: { key: paySettingsAddress } })
  assert.equal(savedSetting, null, 'disposable database must not have Pay settings')
  const makeUser = async suffix => { const u = await db.user.create({ data: { email: `${seed}-${suffix}@example.invalid`, passwordHash: 'fixture-only' } }); users.push(u.id); return u }
  const [owner, other, admin] = await Promise.all(['owner', 'other', 'admin'].map(makeUser))
  state.reviewer = admin.id
  const a = actor(owner), b = actor(other), r = actor(admin)
  bank = await db.bankAccount.create({ data: { bankName: seed, holderName: seed, accountNumber: '123456789' } })
  gateway = await db.gateway.create({ data: { name: seed, provider: 'CARD_TRANSFER', active: true, fiat: 'IRR' } })
  const settings = policy.normalizePaySettings({ ...policy.defaults(), incomingEnabled: true, providerId: 'fixture', bankAccountIds: [bank.id], minPaymentRial: '1', minSettlementRial: '1' })
  await db.setting.create({ data: { key: paySettingsAddress, value: JSON.stringify(settings) } })
  createdSetting = true
  const m = await merchant.enrollMerchant(a, { name: seed, website: 'https://example.invalid' }); merchants.push(m.id)
  await assert.rejects(merchant.createTerminal(a, { name: seed, returnUrl: 'https://example.invalid/return' }))
  await merchant.changeMerchant(r, { id: m.id, status: 'ACTIVE' })
  const terminal = await merchant.createTerminal(a, { name: seed, returnUrl: 'https://example.invalid/return' })
  // Legacy bank/Wallet scenarios start after the new guest OTP boundary (covered by pay-shared-checkout).
  const makePayment = async (suffix, amount = '1000000') => {
    const row = await payments.createPayPayment(a, { terminalId: terminal.id, externalId: `${seed}-${suffix}`, amountRial: amount }, key())
    return db.payPayment.update({ where: { id: row.id }, data: { payerVerifiedAt: new Date() } })
  }
  const event = (p, ref, suffix, amount = p.amountMinor.toString()) => ({ providerId: 'fixture', externalId: `${seed}-${suffix}`, transferReference: ref, amountRial: amount, bankAccountId: bank.id, occurredAt: new Date().toISOString(), targetPaymentId: p.id })
  const p = await makePayment('one')
  assert.equal((await payments.createPayPayment(a, { terminalId: terminal.id, externalId: p.externalId, amountRial: p.amountMinor.toString() }, p.idempotencyKey)).id, p.id)
  await assert.rejects(payments.createPayPayment(a, { terminalId: terminal.id, externalId: p.externalId, amountRial: '1000001' }, p.idempotencyKey), error => error.status === 409)
  await assert.rejects(views.payPaymentById(b, p.id))
  await payments.reportPayReference(p.id, 'REF000001')
  assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_CREDIT' } }), 0)
  const e = event(p, 'REF000001', 'one')
  const races = await Promise.allSettled([reconcile.acceptBankEvent(e, 'hash-one'), reconcile.acceptBankEvent(e, 'hash-one')])
  assert.ok(races.some(x => x.status === 'fulfilled'))
  assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_CREDIT' } }), 1)
  const journal = await db.payment.findUniqueOrThrow({ where: { eventKey: 'mobocom-pay:collection:' + p.id } })
  assert.equal(journal.amountMinor, p.amountMinor); assert.equal(journal.feeMinor, p.feeMinor)
  assert.equal(journal.provider, 'MOBOCOM_PAY'); assert.equal(journal.invoiceId, null)
  await assert.rejects(bankOwner.saveBankAccount({ ...bank, accountNumber: '987654321' }), error => error.status === 409)
  assert.equal((await db.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).accountNumber, '123456789')
  const retired = await bankHttp.DELETE_account(new NextRequest(`https://example.invalid/api/admin/bank-accounts?id=${bank.id}`, { method: 'DELETE', headers: { origin: 'https://example.invalid', 'x-fixture-user': String(admin.id) } }))
  assert.equal(retired.status, 200); assert.equal((await retired.json()).deactivated, true)
  assert.equal((await db.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).active, false)
  await bankOwner.saveBankAccount({ ...bank, active: true })
  await assert.rejects(reconcile.acceptBankEvent(e, 'different-hash'))
  const p2 = await makePayment('two'); await reconcile.acceptBankEvent(event(p2, 'REF000002', 'two'), 'hash-two'); await payments.reportPayReference(p2.id, 'REF000002')
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: p2.id } })).status, 'PAID')
  const p3 = await makePayment('mismatch'); await payments.reportPayReference(p3.id, 'REF000003'); await reconcile.acceptBankEvent(event(p3, 'REF000003', 'mismatch', '999999'), 'hash-three')
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: p3.id } })).status, 'PENDING')
  const attacker = await merchant.enrollMerchant(b, { name: seed, website: 'https://example.invalid' }); merchants.push(attacker.id)
  await merchant.changeMerchant(r, { id: attacker.id, status: 'ACTIVE' })
  const attackerTerminal = await merchant.createTerminal(b, { name: seed, returnUrl: 'https://example.invalid/return' })
  const attackerPayment = async suffix => {
    const row = await payments.createPayPayment(b, { terminalId: attackerTerminal.id, externalId: `${seed}-${suffix}`, amountRial: '1000000' }, key())
    return db.payPayment.update({ where: { id: row.id }, data: { payerVerifiedAt: new Date() } })
  }
  const unboundVictim = await makePayment('unbound-victim'), unboundAttacker = await attackerPayment('unbound-attacker')
  const unbound = event(unboundVictim, 'REFUNBOUND', 'unbound'); delete unbound.targetPaymentId
  await reconcile.acceptBankEvent(unbound, 'hash-unbound')
  await payments.reportPayReference(unboundAttacker.id, 'REFUNBOUND'); await payments.reportPayReference(unboundVictim.id, 'REFUNBOUND')
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: unboundVictim.id } })).status, 'PENDING')
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: unboundAttacker.id } })).status, 'PENDING')
  const boundVictim = await makePayment('bound-victim'), boundAttacker = await attackerPayment('bound-attacker')
  await reconcile.acceptBankEvent(event(boundVictim, 'REFBOUND1', 'bound'), 'hash-bound')
  await payments.reportPayReference(boundAttacker.id, 'REFBOUND1')
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: boundAttacker.id } })).status, 'PENDING')
  await payments.reportPayReference(boundVictim.id, 'REFBOUND1')
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: boundVictim.id } })).status, 'PAID')
  assert.equal(await db.walletTx.count({ where: { userId: other.id, type: 'PAY_CREDIT' } }), 0)
  const p4 = await makePayment('audit'); await payments.reportPayReference(p4.id, 'REF000004'); state.auditFails = true
  await assert.rejects(reconcile.acceptBankEvent(event(p4, 'REF000004', 'audit'), 'hash-four'), /fixture audit failure/); state.auditFails = false
  assert.equal((await db.payPayment.findUniqueOrThrow({ where: { id: p4.id } })).status, 'PENDING')
  assert.equal(await db.payBankEvent.count({ where: { externalId: `${seed}-audit` } }), 0)
  state.enabled = false; await assert.rejects(makePayment('disabled')); state.enabled = true
  const account = () => db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: owner.id, currency: 'IRR' } } })
  const move = (amount, type, funds) => wallet.moveWallet({ userId: owner.id, amount, currency: 'IRR', type, funds, idempotencyKey: key(), description: seed })
  for (const [amount, type] of [['1', 'PAY_CREDIT'], ['-1', 'PAY_RESERVE'], ['1', 'PAY_RELEASE']]) assert.equal((await move(amount, type)).ok, false)
  assert.equal((await move('1', 'TOPUP', 'WITHDRAWABLE')).ok, false)
  assert.equal((await account()).withdrawableMinor, 3000000n)
  await move('500000', 'TOPUP'); assert.equal((await account()).withdrawableMinor, 3000000n)
  await move('-750000', 'PURCHASE'); assert.equal((await account()).withdrawableMinor, 2750000n)
  await move('750000', 'TOPUP'); assert.equal((await account()).withdrawableMinor, 2750000n)
  const q1 = await settlement.createPayQuote(a, { railId: 'IRR_BANK', amountRial: '2000000' })
  const q2 = await settlement.createPayQuote(a, { railId: 'IRR_BANK', amountRial: '2000000' })
  const destination = 'IR820540102680020817909002'
  const k1 = key(), k2 = key()
  const requests = await Promise.allSettled([settlement.requestPaySettlement(a, { quoteId: q1.id, destination }, k1), settlement.requestPaySettlement(a, { quoteId: q2.id, destination }, k2)])
  const winners = requests.map((x, i) => x.status === 'fulfilled' ? i : -1).filter(i => i >= 0)
  assert.equal(winners.length, 1); const i = winners[0], won = requests[i].value
  assert.equal((await settlement.requestPaySettlement(a, { quoteId: [q1, q2][i].id, destination }, [k1, k2][i])).id, won.id)
  state.reviewer = owner.id
  await assert.rejects(settlement.decidePaySettlement(a, { id: won.id, action: 'approve' }), error => error.status === 403)
  state.reviewer = admin.id
  await settlement.decidePaySettlement(r, { id: won.id, action: 'reject', reason: 'fixture' })
  await assert.rejects(settlement.decidePaySettlement(r, { id: won.id, action: 'reject', reason: 'fixture' }))
  assert.equal(await db.walletTx.count({ where: { userId: owner.id, type: 'PAY_RELEASE' } }), 1)
  const cryptoSettings = { ...settings, rails: settings.rails.map(rail => ({ ...rail, enabled: true, rialPerUnit: rail.asset === 'IRR' ? '1' : rail.asset === 'TRX' ? '10000' : '1000000' })) }
  await db.setting.update({ where: { key: paySettingsAddress }, data: { value: JSON.stringify(cryptoSettings) } })
  for (const [railId, payoutAmount] of [['TRX_TRON', '10'], ['USDT_TRON', '0.1']]) {
    const cq = await settlement.createPayQuote(a, { railId, amountRial: '100000' })
    assert.equal(cq.payoutAmount, payoutAmount); assert.equal(cq.network, 'TRON')
    await assert.rejects(settlement.requestPaySettlement(a, { quoteId: cq.id, destination: '0x' + '1'.repeat(40) }, key()))
    const cs = await settlement.requestPaySettlement(a, { quoteId: cq.id, destination: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' }, key())
    await settlement.decidePaySettlement(r, { id: cs.id, action: 'approve' })
    await assert.rejects(settlement.decidePaySettlement(r, { id: cs.id, action: 'paid', reference: 'not-a-chain-hash' }))
    await settlement.decidePaySettlement(r, { id: cs.id, action: 'reject', reason: 'fixture: no transfer sent' })
  }
  const q3 = await settlement.createPayQuote(a, { railId: 'IRR_BANK', amountRial: '100000' })
  const storedQuote = await db.paySettlementQuote.findUniqueOrThrow({ where: { id: q3.id } })
  const expiredQuote = await db.paySettlementQuote.create({ data: { ...storedQuote, id: key(), createdAt: new Date(Date.now() - 600000), expiresAt: new Date(Date.now() - 300000) } })
  await assert.rejects(settlement.requestPaySettlement(a, { quoteId: expiredQuote.id, destination }, key()), error => error.code === 'QUOTE_EXPIRED')
  await assert.rejects(db.paySettlementQuote.update({ where: { id: q3.id }, data: { payoutAtoms: 1n } }))
  const s = await settlement.requestPaySettlement(a, { quoteId: q3.id, destination }, key())
  await settlement.decidePaySettlement(r, { id: s.id, action: 'approve' })
  await assert.rejects(settlement.decidePaySettlement(r, { id: s.id, action: 'paid', reference: 'bad' }))
  await settlement.decidePaySettlement(r, { id: s.id, action: 'paid', reference: 'BANKREF123456' })
  // Reserve mixed ordinary and withdrawable funds against an invoice; only the original
  // purchase can restore its exact provenance when the invoice is voided.
  const beforeInvoice = await account()
  const invoiceAmount = beforeInvoice.balanceMinor - beforeInvoice.withdrawableMinor + 100000n
  const invoice = await db.invoice.create({ data: { number: `${seed}-invoice`, userId: owner.id, status: 'UNPAID', kind: 'BILLING', currency: 'IRR', total: Number(invoiceAmount), totalMinor: invoiceAmount, walletApplied: Number(invoiceAmount), walletAppliedMinor: invoiceAmount } })
  const purchase = await wallet.moveWallet({ userId: owner.id, amount: `-${invoiceAmount}`, currency: 'IRR', type: 'PURCHASE', invoiceId: invoice.id, idempotencyKey: key() })
  assert.equal(purchase.ok, true)
  const original = await db.walletTx.findUniqueOrThrow({ where: { id: purchase.txId } })
  assert.equal(original.withdrawableDeltaMinor, -100000n)
  const invalidReverse = (userId, amount) => wallet.moveWallet({ userId, amount, currency: 'IRR', type: 'REFUND', reversalOfId: original.id, idempotencyKey: key() })
  assert.equal((await invalidReverse(other.id, invoiceAmount.toString())).ok, false)
  assert.equal((await invalidReverse(owner.id, (invoiceAmount - 1n).toString())).ok, false)
  const voids = await Promise.allSettled([billing.voidOpenInvoice(invoice.id), billing.voidOpenInvoice(invoice.id)])
  assert.ok(voids.some(result => result.status === 'fulfilled' && result.value.voided))
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).walletAppliedMinor, 0n)
  assert.equal((await account()).withdrawableMinor, beforeInvoice.withdrawableMinor)
  assert.equal(await db.walletTx.count({ where: { reversalOfId: original.id } }), 1)
  await billing.releaseInvoiceCredit(invoice.id)
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'VOID')
  assert.equal((await db.invoice.updateMany({ where: { id: invoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'PAID' } })).count, 0)
  assert.equal(await db.walletTx.count({ where: { reversalOfId: original.id } }), 1)
  const openInvoice = await db.invoice.create({ data: { number: `${seed}-release`, userId: owner.id, status: 'UNPAID', kind: 'BILLING', currency: 'IRR', total: 100000, totalMinor: 100000n, walletApplied: 100000, walletAppliedMinor: 100000n } })
  assert.equal((await wallet.moveWallet({ userId: owner.id, amount: '-100000', currency: 'IRR', type: 'PURCHASE', invoiceId: openInvoice.id, idempotencyKey: key() })).ok, true)
  assert.equal((await billing.releaseInvoiceCredit(openInvoice.id)).ok, true)
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: openInvoice.id } })).status, 'VOID')
  assert.equal((await db.invoice.updateMany({ where: { id: openInvoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'PAID' } })).count, 0)
  const remaining = await account()
  state.enabled = false // Core wallet spending must keep working while the optional module is off.
  assert.equal((await move(`-${remaining.balanceMinor}`, 'PURCHASE')).ok, true)
  assert.equal((await account()).withdrawableMinor, 0n)
  assert.equal((await move('100000', 'TOPUP')).ok, true)
  assert.equal((await account()).withdrawableMinor, 0n)
  state.enabled = true
  await assert.rejects(db.walletAccount.update({ where: { userId_currency: { userId: owner.id, currency: 'IRR' } }, data: { withdrawableMinor: -1n } }))
  await assert.rejects(db.payPayment.update({ where: { id: p.id }, data: { amountMinor: 1n } }))
  await assert.rejects(db.payPayment.update({ where: { id: p.id }, data: { status: 'PENDING' } }))
  await assert.rejects(db.walletTx.update({ where: { id: (await db.payPayment.findUniqueOrThrow({ where: { id: p.id } })).walletTxId }, data: { withdrawableDeltaMinor: 0n } }))
  console.log('MoboComPay native PostgreSQL checks passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.payBankEvent.deleteMany({ where: { bankAccountId: bank?.id || -1 } })
    await db.paySettlement.deleteMany({ where: { merchantId: { in: merchants } } })
    await db.paySettlementQuote.deleteMany({ where: { merchantId: { in: merchants } } })
    await db.payPayment.deleteMany({ where: { merchantId: { in: merchants } } })
    await db.payTerminal.deleteMany({ where: { merchantId: { in: merchants } } })
    await db.payMerchant.deleteMany({ where: { id: { in: merchants } } })
    await db.invoice.deleteMany({ where: { userId: { in: users } } })
    await db.payment.deleteMany({ where: { userId: { in: users }, provider: 'MOBOCOM_PAY' } })
    await db.walletTx.deleteMany({ where: { userId: { in: users } } })
    await db.walletAccount.deleteMany({ where: { userId: { in: users } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
    await db.userNotification.deleteMany({ where: { userId: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    if (bank) await db.bankAccount.delete({ where: { id: bank.id } })
    if (gateway) await db.gateway.delete({ where: { id: gateway.id } })
    if (createdSetting) await db.setting.deleteMany({ where: { key: paySettingsAddress } })
  } catch (error) { console.error('Fixture cleanup failed:', error); process.exitCode = 1 }
  finally { await db.$disconnect() }
})
