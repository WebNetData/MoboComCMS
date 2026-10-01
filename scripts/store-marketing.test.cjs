const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const ts = require('typescript')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const m = load('src/modules/store/domain/marketing')
const inst = load('src/modules/billing/infrastructure/installments')

test('stock alerts require a public purchasable product and active matching variant', () => {
  const base = { active: true, approval: 'APPROVED', stock: 5, variantCount: 2, variants: [{ id: 2, stock: 0 }, { id: 3, stock: 4 }] }
  assert.equal(m.stockAlertAvailable(base, 0), true)
  assert.equal(m.stockAlertAvailable(base, 2), false)
  assert.equal(m.stockAlertAvailable(base, 3), true)
  assert.equal(m.stockAlertAvailable(base, 4), false)
  assert.equal(m.stockAlertAvailable({ ...base, approval: 'PENDING' }, 3), false)
  assert.equal(m.stockAlertAvailable({ ...base, active: false }, 3), false)
  assert.equal(m.stockAlertAvailable({ ...base, stock: 0 }, 3), false)
  assert.equal(m.stockAlertAvailable({ ...base, variants: [] }, 0), false)
  assert.equal(m.stockAlertAvailable({ ...base, variantCount: 0, variants: [] }, 0), true)
})

test('club: points, tiers, reversals and redemption value', () => {
  const s = m.normalizeLoyalty({ enabled: true, earnPoints: 1, earnStepToman: 10000, pointValueToman: 100 })
  assert.equal(m.pointsFor(s, 1_250_000n), 125)
  assert.equal(m.pointsFor(s, 9_999n), 0)
  assert.equal(m.pointsFor(s, 1_000_000n, 1.5), 150)
  assert.equal(m.tomanOf(2_000_000n, 'IRR'), 200_000n)
  assert.equal(m.tomanOf(5n, 'USD'), 0n)
  assert.equal(m.tierFor(s, 0).tier.id, 'bronze')
  const silver = m.tierFor(s, 600)
  assert.equal(silver.tier.id, 'silver'); assert.equal(silver.next.id, 'gold'); assert.equal(silver.toNext, 1400)
  assert.equal(m.tierFor(s, 10_000).next, null)
  assert.equal(m.reversalPoints(100, 500n, 1000n), 50)
  assert.equal(m.reversalPoints(100, 1000n, 1000n), 100)
  assert.equal(m.reversalPoints(100, 1n, 3n), 34)
  assert.equal(m.reversalPoints(0, 5n, 10n), 0)
  assert.equal(m.redeemValue(s, 250), 25_000n)
  // Tiers are sorted, the first always starts at 0, bad values are clamped.
  const t = m.normalizeLoyalty({ tiers: [{ name: 'B', minLifetime: 900, multiplier: 2 }, { name: 'A', minLifetime: 50, multiplier: 'x' }] })
  assert.equal(t.tiers[0].name, 'A'); assert.equal(t.tiers[0].minLifetime, 0); assert.equal(t.tiers[0].multiplier, 1); assert.equal(t.tiers[1].multiplier, 2)
  assert.equal(m.normalizeLoyalty({ earnStepToman: 5 }).earnStepToman, 100)
})

test('abandoned carts: steps fire in order, once, within the age window', () => {
  const s = m.normalizeRecovery({ enabled: true, steps: [{ afterHours: 24, message: 'b' }, { afterHours: 1, message: 'a', couponCode: 'cart 10!' }] })
  assert.deepEqual(s.steps.map((step) => step.afterHours), [1, 24])
  assert.equal(s.steps[0].couponCode, 'CART10')
  const now = new Date('2026-09-29T12:00:00Z')
  const at = (hours) => new Date(now.getTime() - hours * 3_600_000)
  assert.equal(m.dueStep(s, { updatedAt: at(0.5), reminderCount: 0 }, now), null)
  assert.equal(m.dueStep(s, { updatedAt: at(2), reminderCount: 0 }, now), 0)
  assert.equal(m.dueStep(s, { updatedAt: at(2), reminderCount: 1 }, now), null)
  assert.equal(m.dueStep(s, { updatedAt: at(30), reminderCount: 1 }, now), 1)
  assert.equal(m.dueStep(s, { updatedAt: at(30), reminderCount: 2 }, now), null)
  assert.equal(m.dueStep(s, { updatedAt: at(24 * 8), reminderCount: 0 }, now), null)
  assert.equal(m.dueStep({ ...s, enabled: false }, { updatedAt: at(5), reminderCount: 0 }, now), null)
})

test('gift cards: codes, normalization, state and amounts', () => {
  let n = 0
  const code = m.giftCode(() => (n++ * 7) % 32)
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.ok(!/[01OI]/.test(code))
  assert.equal(m.normalizeGiftCode(' k7qm-2xrd 9pla-w4zn '), 'K7QM2XRD9PLAW4ZN')
  assert.equal(m.normalizeGiftCode('۲۳۴۵'), '2345')
  assert.equal(m.giftCodeLooksValid('K7QM2XRD9PLAW4ZN'), true)
  assert.equal(m.giftCodeLooksValid('K7QM2XRD9PLAW4Z0'), false)
  assert.equal(m.giftCodeLooksValid('SHORT'), false)
  const now = new Date('2026-09-29T00:00:00Z')
  assert.equal(m.giftCardState({ status: 'ACTIVE', expiresAt: null }, now), 'ACTIVE')
  assert.equal(m.giftCardState({ status: 'ACTIVE', expiresAt: new Date('2026-01-01') }, now), 'EXPIRED')
  assert.equal(m.giftCardState({ status: 'REDEEMED', expiresAt: new Date('2026-01-01') }, now), 'REDEEMED')
  const g = m.normalizeGift({ amounts: [5000, 100000, 100000, 999999999], minToman: 50000, maxToman: 1000000 })
  assert.deepEqual(g.amounts, [100000, 1000000])
  assert.equal(m.validGiftAmount(g, '250000'), 250000)
  assert.throws(() => m.validGiftAmount(g, 10), m.MarketingError)
  assert.throws(() => m.validGiftAmount(g, 'abc'), m.MarketingError)
  assert.deepEqual(m.installmentPreview(1_000_000, 4), { count: 4, each: 250000 })
  assert.equal(m.installmentPreview(0, 4), null)
})

test('installments: mobile formats and Azki signature', () => {
  assert.equal(inst.mobileFor('SNAPPPAY', '09121234567'), '+989121234567')
  assert.equal(inst.mobileFor('DIGIPAY', '+98 912 123 4567'), '09121234567')
  assert.equal(inst.mobileFor('AZKI', '00989121234567'), '09121234567')
  assert.equal(inst.mobileFor('AZKI', '021123'), '')
  const a = inst.azkiSignature('/payment/purchase', 'post', 'k'.repeat(10), 1700000000)
  assert.equal(a, inst.azkiSignature('/payment/purchase', 'POST', 'k'.repeat(10), 1700000000))
  assert.notEqual(a, inst.azkiSignature('/payment/verify', 'POST', 'k'.repeat(10), 1700000000))
  assert.match(a, /^[0-9a-f]+$/)
})

function fakeProvider() {
  const seen = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body })
      const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
      if (req.url.endsWith('/oauth/token')) return req.headers.authorization === `Basic ${Buffer.from('cid:secret').toString('base64')}` && body.includes('username=merchant') ? json({ access_token: 'tok', expires_in: 3600 }) : json({ error: 'bad' }, 401)
      if (req.url === '/api/online/payment/v1/token') return json({ successful: true, response: { paymentToken: 'PT-1', paymentPageUrl: 'https://pay.example/PT-1' } })
      if (req.url === '/api/online/payment/v1/verify') return json({ successful: true, response: { transactionId: 'INV-1', paymentToken: 'PT-1' } })
      if (req.url === '/api/online/payment/v1/settle') return json({ successful: true })
      if (req.url.startsWith('/digipay/api/tickets/business')) return json({ result: { status: 0 }, ticket: 'T-9', redirectUrl: 'https://dp.example/T-9' })
      if (req.url.startsWith('/digipay/api/purchases/verify')) return json({ result: { status: 0 }, providerId: 'INV-2', trackingCode: 'TR-1' })
      json({}, 404)
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}` })))
}

test('installments: SnappPay and DigiPay round trips against a fake provider', async () => {
  const { server, seen, base } = await fakeProvider()
  try {
    const snapp = { provider: 'SNAPPPAY', baseUrl: base, clientId: 'cid', clientSecret: 'secret', username: 'merchant', password: 'pw' }
    const items = [{ id: '7', name: 'گوشی', count: 2, amountRial: 5_000_000n, category: 'general' }]
    const created = await inst.createInstallment(snapp, { reference: 'INV-1', amountRial: 9_500_000n, shippingRial: 500_000n, mobile: '09121234567', returnUrl: 'https://shop.example/cb?ref=INV-1', items })
    assert.deepEqual(created, { ok: true, token: 'PT-1', paymentUrl: 'https://pay.example/PT-1' })
    const payload = JSON.parse(seen.find((r) => r.url === '/api/online/payment/v1/token').body)
    assert.equal(payload.amount, 9_500_000); assert.equal(payload.mobile, '+989121234567'); assert.equal(payload.transactionId, 'INV-1')
    assert.equal(payload.cartList[0].totalAmount, 10_500_000); assert.equal(payload.discountAmount, 1_000_000); assert.equal(payload.cartList[0].shippingAmount, 500_000)
    assert.equal((await inst.verifyInstallment(snapp, { token: 'PT-1', reference: 'INV-1' })).ok, true)
    assert.equal((await inst.verifyInstallment(snapp, { token: 'PT-1', reference: 'OTHER' })).ok, false, 'transaction id must match')
    assert.equal((await inst.settleInstallment(snapp, { token: 'PT-1', reference: 'INV-1' })).ok, true)
    assert.equal((await inst.createInstallment(snapp, { reference: 'X', amountRial: 1n, shippingRial: 0n, mobile: '123', returnUrl: 'x', items })).ok, false)
    const bad = await inst.testInstallment({ ...snapp, clientSecret: 'wrong', username: 'u2' })
    assert.equal(bad.ok, false)
    const digi = { provider: 'DIGIPAY', baseUrl: base, clientId: 'cid', clientSecret: 'secret', username: 'merchant', password: 'pw' }
    const ticket = await inst.createInstallment(digi, { reference: 'INV-2', amountRial: 1_000_000n, shippingRial: 0n, mobile: '+989121234567', returnUrl: 'https://shop.example/cb', items })
    assert.equal(ticket.ok, true); assert.equal(ticket.token, 'T-9')
    assert.equal(JSON.parse(seen.find((r) => r.url.startsWith('/digipay/api/tickets')).body).cellNumber, '09121234567')
    assert.equal((await inst.verifyInstallment(digi, { token: 'T-9', reference: 'INV-2', trackingCode: 'TR-1', type: '11' })).ok, true)
    assert.equal((await inst.verifyInstallment(digi, { token: 'T-9', reference: 'INV-2' })).ok, false, 'tracking code required')
  } finally { server.close() }
})
