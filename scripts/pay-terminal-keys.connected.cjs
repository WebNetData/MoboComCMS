// Real PostgreSQL tests for one-time terminal credentials and their machine API scope.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { NextRequest } = require('next/server')

;(async () => {
  const h = await require('./pay-center.fixture.cjs')('terminal-keys')
  const { db, pay, actors, merchant, terminal, stamp, cleanup } = h
  const http = h.load('src/modules/billing/server/http/pay.ts')
  const keys = []
  let secondTerminal
  const admin = actors[0], owner = actors[2]
  const cookie = admin.req.headers.get('cookie')
  const route = (method, url, body, actorCookie = cookie, extra = {}) => new NextRequest(url, {
    method, headers: { ...(actorCookie ? { cookie: actorCookie } : {}), origin: 'https://mobocom.invalid', host: 'mobocom.invalid', ...(body ? { 'content-type': 'application/json' } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const adminCall = (method, url, body) => http.payAdminHttp(route(method, url, body), { params: Promise.resolve({ resource: 'terminal-keys' }) })
  const machineCall = (method, path, body, token, extra = {}) => http.payHttp(route(method, 'https://mobocom.invalid' + path, body, undefined, { authorization: `Bearer ${token}`, ...extra }), { params: Promise.resolve({ resource: path.split('/').filter(Boolean).slice(3) }) })
  const json = async response => ({ status: response.status, body: await response.json() })
  const issue = async (terminalId, label = 'Synthetic API key') => json(await adminCall('POST', 'https://mobocom.invalid/api/admin/mobocom-pay/terminal-keys', {
    merchantId: merchant.id, terminalId, label, note: 'Synthetic terminal credential test', confirmed: true,
  }))
  try {
    secondTerminal = await pay.createTerminal(owner, { name: 'Second scoped link', channelType: 'PAYMENT_LINK' })
    const listed = await json(await adminCall('GET', `https://mobocom.invalid/api/admin/mobocom-pay/terminal-keys?id=${merchant.id}`))
    assert.equal(listed.status, 200)
    assert.deepEqual(listed.body.data.terminals.map(t => t.id).sort(), [terminal.id, secondTerminal.id].sort())
    assert.ok(listed.body.data.terminals.every(t => t.keys.length === 0))

    const created = await issue(terminal.id)
    assert.equal(created.status, 201)
    assert.match(created.body.data.token, /^mcpterm_[0-9a-f]{64}$/)
    const token = created.body.data.token, key = created.body.data.key
    keys.push(key.id)
    const reread = await json(await adminCall('GET', `https://mobocom.invalid/api/admin/mobocom-pay/terminal-keys?id=${merchant.id}`))
    const safeKey = reread.body.data.terminals.find(t => t.id === terminal.id).keys[0]
    assert.equal(safeKey.id, key.id)
    assert.equal('token' in safeKey, false)
    assert.equal('keyHash' in safeKey, false)

    const options = await json(await machineCall('GET', `/api/v2/pay/terminals/${terminal.id}/gateways`, null, token))
    assert.equal(options.status, 200)
    const createdPayment = await json(await machineCall('POST', '/api/v2/pay/payments', {
      terminalId: terminal.id, externalId: stamp + '-key-payment', amountRial: '1000000',
    }, token, { 'idempotency-key': stamp + '-key-idem' }))
    assert.equal(createdPayment.status, 201)
    const paymentId = createdPayment.body.data.id
    const visiblePayment = await json(await machineCall('GET', `/api/v2/pay/payments/${paymentId}`, null, token))
    assert.equal(visiblePayment.status, 200)
    const wrongTerminalCreate = await json(await machineCall('POST', '/api/v2/pay/payments', {
      terminalId: secondTerminal.id, externalId: stamp + '-cross-terminal', amountRial: '1000000',
    }, token, { 'idempotency-key': stamp + '-cross-idem' }))
    assert.equal(wrongTerminalCreate.status, 404)

    const v1 = await json(await machineCall('GET', '/api/v1/pay/overview', null, token))
    assert.equal(v1.status, 401)
    const settlements = await json(await machineCall('GET', '/api/v2/pay/settlements', null, token))
    assert.equal(settlements.status, 403)
    assert.equal(settlements.body.code, 'PAY_TERMINAL_KEY_SCOPE')
    const rotate = await json(await adminCall('PATCH', 'https://mobocom.invalid/api/admin/mobocom-pay/terminal-keys', {
      merchantId: merchant.id, terminalId: terminal.id, id: key.id, version: key.version,
      action: 'rotate', note: 'Synthetic rotation', confirmed: true,
    }))
    assert.equal(rotate.status, 200)
    assert.equal(rotate.body.data.key.id, key.id)
    assert.equal(rotate.body.data.key.version, key.version + 1)
    assert.match(rotate.body.data.token, /^mcpterm_[0-9a-f]{64}$/)
    const rotatedToken = rotate.body.data.token
    assert.equal((await machineCall('GET', `/api/v2/pay/terminals/${terminal.id}/gateways`, null, token)).status, 401)
    const rotatedOptions = await json(await machineCall('GET', `/api/v2/pay/terminals/${terminal.id}/gateways`, null, rotatedToken))
    assert.equal(rotatedOptions.status, 200)
    const replay = await json(await machineCall('POST', '/api/v2/pay/payments', {
      terminalId: terminal.id, externalId: stamp + '-key-payment', amountRial: '1000000',
    }, rotatedToken, { 'idempotency-key': stamp + '-key-idem' }))
    assert.equal(replay.status, 201)
    assert.equal(replay.body.data.id, paymentId, 'rotation preserves terminal idempotency')
    const stale = await json(await adminCall('PATCH', 'https://mobocom.invalid/api/admin/mobocom-pay/terminal-keys', {
      merchantId: merchant.id, terminalId: terminal.id, id: key.id, version: key.version,
      action: 'revoke', note: 'Stale revocation', confirmed: true,
    }))
    assert.equal(stale.status, 409)

    const crossRead = await json(await machineCall('GET', `/api/v2/pay/payments/${paymentId}`, null, rotatedToken))
    assert.equal(crossRead.status, 200)
    const foreignPayment = await pay.createPayPayment(owner, { terminalId: secondTerminal.id, externalId: stamp + '-foreign', amountRial: '1000000' }, randomUUID())
    const deniedForeignRead = await json(await machineCall('GET', `/api/v2/pay/payments/${foreignPayment.id}`, null, rotatedToken))
    assert.equal(deniedForeignRead.status, 404)

    const revoked = await json(await adminCall('PATCH', 'https://mobocom.invalid/api/admin/mobocom-pay/terminal-keys', {
      merchantId: merchant.id, terminalId: terminal.id, id: key.id, version: rotate.body.data.key.version,
      action: 'revoke', note: 'Synthetic revocation', confirmed: true,
    }))
    assert.equal(revoked.status, 200)
    assert.ok(revoked.body.data.key.revokedAt)
    assert.equal(await db.auditLog.count({ where: { targetId: key.id, action: { in: ['mobocom-pay.terminal-key.issue', 'mobocom-pay.terminal-key.rotate', 'mobocom-pay.terminal-key.revoke'] } } }), 3)
    assert.equal((await json(await machineCall('GET', `/api/v2/pay/terminals/${terminal.id}/gateways`, null, rotatedToken))).status, 401)
    console.log('Pay terminal keys PASS: one-time disclosure, terminal-scoped v2, V1/settlement denial, rotation replay, revocation, stale versions and audit trail')
  } finally {
    if (keys.length) await db.payTerminalApiKey.deleteMany({ where: { id: { in: keys } } })
    await db.payPayment.deleteMany({ where: { merchantId: merchant.id } })
    await cleanup()
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
