// Real PostgreSQL coverage for merchant/terminal gateway policy and payment pinning.
const assert = require('node:assert/strict')
const { createHash, randomBytes, randomUUID } = require('node:crypto')
const { NextRequest } = require('next/server')

;(async () => {
  const h = await require('./pay-center.fixture.cjs')('gateway-access')
  const { db, pay, actors, merchant, terminal, gateway, stamp, cleanup } = h
  const access = h.load('src/modules/billing/server/pay/gateway-access.ts')
  const { encryptPanelCredential } = h.load('src/modules/providers/server/panel-credentials.ts')
  const catalog = [gateway]
  const ref = g => `db:${g.id}`
  const admin = actors[0], owner = actors[2], otherOwner = actors[3]
  let secondTerminal
  try {
    catalog.push(await db.gateway.create({ data: { name: stamp + '-manual', provider: 'MANUAL', active: true, fiat: 'IRR', instructions: 'Synthetic instructions' } }))
    catalog.push(await db.gateway.create({ data: { name: stamp + '-inactive', provider: 'MANUAL', active: false, fiat: 'IRR', instructions: 'Synthetic inactive instructions' } }))
    const frenzy = await db.gateway.create({ data: {
      name: stamp + '-precision', provider: 'FRENZYEX', active: true, fiat: 'TMN', apiKey: 'fixture-provider-id', secretKey: 'fixture-provider-key',
    } })
    catalog.push(frenzy)
    const invalid = await db.gateway.create({ data: { name: stamp + '-invalid', provider: 'CARD_TRANSFER', active: true, fiat: 'IRR', config: '{"autoVerify":true}' } })
    catalog.push(invalid)
    secondTerminal = await pay.createTerminal(owner, { name: 'Scoped terminal', channelType: 'PAYMENT_LINK' })

    const legacy = await access.terminalGatewayOptions(owner, terminal.id)
    assert.deepEqual(legacy.items.filter(x => catalog.some(gateway => ref(gateway) === x.ref)).map(x => x.ref),
      [ref(catalog[0]), ref(catalog[1]), ref(frenzy)], 'legacy empty policies inherit ready fixture gateways')
    assert.ok((await access.terminalGatewayOptions(owner, terminal.id, '1000000')).items.some(x => x.ref === ref(frenzy)))
    assert.ok(!(await access.terminalGatewayOptions(owner, terminal.id, '1000001')).items.some(x => x.ref === ref(frenzy)))
    const gatewayAdmin = h.load('src/modules/billing/server/http/admin/gateways/route.ts')
    const adminList = await gatewayAdmin.GET(admin.req)
    assert.equal(adminList.status, 200)
    assert.equal((await adminList.json()).gateways.find(row => row.id === invalid.id).usable, false)
    const repaired = await gatewayAdmin.PATCH(new NextRequest('https://mobocom.invalid/api/admin/gateways', {
      method: 'PATCH', headers: new Headers(admin.req.headers), body: JSON.stringify({ id: invalid.id, autoVerify: false, active: false }),
    }))
    assert.equal(repaired.status, 200)
    assert.equal((await db.gateway.findUniqueOrThrow({ where: { id: invalid.id } })).active, false)
    await assert.rejects(access.adminGatewayAccess(otherOwner, merchant.id), e => e.status === 404 || e.status === 403)

    const current = await access.adminGatewayAccess(admin, merchant.id)
    const merchantSaved = await access.saveGatewayAccess(admin, {
      merchantId: merchant.id, mode: 'ALLOWLIST', refs: [ref(catalog[1]), ref(catalog[0])],
      version: current.merchant.policy.version, note: 'Synthetic gateway policy test', confirmed: true,
    })
    assert.deepEqual(merchantSaved.merchant.policy.refs, [ref(catalog[1]), ref(catalog[0])], 'merchant allowlist order is retained')
    assert.deepEqual((await access.terminalGatewayOptions(owner, terminal.id)).items.map(x => x.ref), [ref(catalog[1]), ref(catalog[0])])

    const terminalPolicy = merchantSaved.terminals.find(x => x.id === terminal.id).policy
    const narrowed = await access.saveGatewayAccess(admin, {
      merchantId: merchant.id, terminalId: terminal.id, mode: 'ALLOWLIST', refs: [ref(catalog[1])],
      version: terminalPolicy.version, note: 'Narrow synthetic terminal methods', confirmed: true,
    })
    assert.deepEqual(narrowed.terminals.find(x => x.id === terminal.id).effectiveRefs, [ref(catalog[1])])
    assert.deepEqual((await access.terminalGatewayOptions(owner, secondTerminal.id)).items.map(x => x.ref), [ref(catalog[1]), ref(catalog[0])])
    await assert.rejects(access.saveGatewayAccess(admin, {
      merchantId: merchant.id, terminalId: terminal.id, mode: 'ALLOWLIST', refs: [ref(catalog[0])],
      version: terminalPolicy.version, note: 'Stale edit', confirmed: true,
    }), e => e.status === 409)
    await assert.rejects(access.saveGatewayAccess(otherOwner, {
      merchantId: merchant.id, terminalId: secondTerminal.id, mode: 'DISABLED', refs: [], version: 0,
      note: 'Cross owner edit', confirmed: true,
    }), e => e.status === 403 || e.status === 404)
    await assert.rejects(access.saveGatewayAccess(admin, {
      merchantId: merchant.id, terminalId: terminal.id, mode: 'ALLOWLIST', refs: [ref(catalog[2])],
      version: narrowed.terminals.find(x => x.id === terminal.id).policy.version,
      note: 'Inactive gateway must not be enabled', confirmed: true,
    }), e => e.code === 'PAY_GATEWAY_NOT_AVAILABLE')

    const first = await pay.createPayPayment(owner, {
      terminalId: terminal.id, externalId: stamp + '-pinned', amountRial: '1000000', gatewayRef: ref(catalog[1]),
    }, stamp + '-idem')
    const repeated = await pay.createPayPayment(owner, {
      terminalId: terminal.id, externalId: stamp + '-pinned', amountRial: '1000000', gatewayRef: ref(catalog[1]),
    }, stamp + '-idem')
    assert.equal(repeated.id, first.id, 'identical idempotent requests return the original payment')
    await assert.rejects(pay.createPayPayment(owner, {
      terminalId: terminal.id, externalId: stamp + '-pinned', amountRial: '1000000', gatewayRef: ref(catalog[0]),
    }, stamp + '-idem'), e => e.status === 409 && e.code === 'IDEMPOTENCY_CONFLICT')
    await assert.rejects(db.payPayment.update({ where: { id: first.id }, data: { requestedGatewayRef: ref(catalog[0]) } }))
    await assert.rejects(pay.createPayPayment(owner, {
      terminalId: terminal.id, externalId: stamp + '-denied', amountRial: '1000000', gatewayRef: ref(catalog[0]),
    }, randomUUID()), e => e.code === 'PAY_GATEWAY_NOT_AVAILABLE')

    const token = randomBytes(32).toString('base64url')
    await db.payPayment.updateMany({ where: { id: first.id, status: 'PENDING', payerSessionHash: '' }, data: {
      payerSessionHash: createHash('sha256').update(token).digest('hex'),
      payerPhoneCiphertext: encryptPanelCredential('09121234567'), payerPhoneLast4: '4567',
      payerVerifiedAt: new Date(), payerSessionExpiresAt: new Date(Date.now() + 60000),
    } })
    const req = new NextRequest('https://mobocom.invalid/api/pay/checkout/' + first.id + '/gateway', {
      headers: { origin: 'https://mobocom.invalid', cookie: 'pay_payer_' + first.id + '=' + token },
    })
    assert.deepEqual((await pay.checkoutView(first.id, req)).gateways.map(x => x.ref), [ref(catalog[1])])
    await assert.rejects(pay.startPayGateway(req, first.id, { gatewayRef: ref(catalog[0]) }), e => e.code === 'PAY_GATEWAY_NOT_AVAILABLE')
    assert.equal((await pay.startPayGateway(req, first.id, { gatewayRef: ref(catalog[1]) })).status, 'READY')
    const paused = await access.saveGatewayAccess(admin, {
      merchantId: merchant.id, terminalId: terminal.id, mode: 'DISABLED', refs: [],
      version: narrowed.terminals.find(x => x.id === terminal.id).policy.version, note: 'Pause new attempts', confirmed: true,
    })
    assert.deepEqual(paused.terminals.find(x => x.id === terminal.id).effectiveRefs, [])
    assert.deepEqual((await access.terminalGatewayOptions(owner, terminal.id)).items, [])
    const started = await pay.checkoutView(first.id, req)
    assert.deepEqual(started.gateways, [])
    assert.equal(started.selectedGateway.gatewayRef, ref(catalog[1]))
    assert.equal(started.selectedGateway.status, 'READY')
    const commands = h.load('src/modules/billing/server/pay/merchant-admin/commands.ts')
    const currentVersion = async () => (await db.payMerchant.findUniqueOrThrow({ where: { id: merchant.id } })).version
    const manage = async (patch, actor = admin) => commands.manageMerchant(actor, { id: merchant.id, version: await currentVersion(), note: 'Synthetic terminal operation', ...patch })
    await assert.rejects(manage({ action: 'terminal-add', name: stamp, channelType: 'PAYMENT_LINK' }, otherOwner), e => e.status === 403)
    await manage({ action: 'terminal-add', name: stamp, channelType: 'PAYMENT_LINK' })
    const added = await db.payTerminal.findFirstOrThrow({ where: { merchantId: merchant.id, name: stamp } })
    assert.equal(added.active, false)
    await manage({ action: 'terminal-edit', terminalId: added.id, name: stamp + '-edited', channelType: 'PAYMENT_LINK' })
    assert.equal((await db.payTerminal.findUniqueOrThrow({ where: { id: added.id } })).name, stamp + '-edited')
    await assert.rejects(manage({ action: 'terminal-delete', terminalId: terminal.id }), e => e.status === 409)
    await manage({ action: 'terminal-delete', terminalId: added.id })
    const archived = await db.payTerminal.findUniqueOrThrow({ where: { id: added.id } })
    assert.ok(archived.archivedAt)
    assert.equal(archived.active, false)
    await assert.rejects(pay.changeTerminal(owner, { id: added.id, active: true }), e => e.status === 404)
    assert.ok(!(await access.adminGatewayAccess(admin, merchant.id)).terminals.some(x => x.id === added.id))
    await assert.rejects(pay.createPayPayment(owner, {
      terminalId: terminal.id, externalId: stamp + '-terminal-paused', amountRial: '1000000',
    }, randomUUID()), e => e.status === 503 && e.code === 'PAY_NOT_READY')

    await h.setPolicy({ incomingEnabled: false })
    await assert.rejects(pay.createPayPayment(owner, {
      terminalId: secondTerminal.id, externalId: stamp + '-paused', amountRial: '1000000',
    }, randomUUID()), e => e.status === 503 && e.code === 'PAY_NOT_READY')
    console.log('Pay gateway access PASS: inheritance, owner and terminal scope, stale writes, pinning, idempotency, verified checkout and paused creation')
  } finally {
    try { await cleanup() }
    finally {
      if (catalog.length > 1) await db.gateway.deleteMany({ where: { id: { in: catalog.slice(1).map(g => g.id) } } })
      await db.$disconnect()
    }
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
