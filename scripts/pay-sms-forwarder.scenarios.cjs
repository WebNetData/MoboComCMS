// Extends the existing disposable collection harness; uses its cleanup/clock and canonical owners.
const assert = require('node:assert/strict')
module.exports = async function forwarderScenarios(h) {
  const { prisma, load, admin, secondAdmin, limitedEditor, bank, gateway, invoice, prepare, quotes, upload, receiveTimestamped, envelope, sources, clock } = h
  const { saveSmsSource, smsSources } = load('src/modules/billing/server/pay/sms/admin.ts')
  const { receiveForwardedSms } = load('src/modules/billing/server/pay/sms/forwarder.ts')
  const { receiveSmsNotice } = load('src/modules/billing/server/pay/sms/intake.ts')
  const { changeBaleCheckout } = load('src/modules/billing/server/pay/bale/collection-view.ts')
  const { reviewCollectionReceipt } = load('src/modules/billing/server/pay/bale/collection-receipts.ts')
  const { NextRequest } = require('next/server')
  const template = { bankCode: 'bankmeli', sender: 'bankmeli', creditTemplate: 'CREDIT {amount}', debitTemplate: 'DEBIT {amount}', unit: 'IRR', calendar: 'GREGORIAN' }
  const settings = { label: 'Synthetic three-field source', bankAccountId: bank.id, template, format: 'FORWARDER_V1', verified: true, active: true }
  const credentialKey = process.env.PANEL_CREDENTIAL_KEY
  delete process.env.PANEL_CREDENTIAL_KEY
  try { await assert.rejects(saveSmsSource(admin, settings), error => error.status === 503) }
  finally { process.env.PANEL_CREDENTIAL_KEY = credentialKey }
  const created = await saveSmsSource(admin, settings)
  sources.push(created.source.id)
  assert.match(created.secret, /^[A-Za-z0-9_-]{43}$/)
  const where = { id: created.source.id }
  const original = await prisma.paySmsSource.findUniqueOrThrow({ where })
  assert.equal(original.secretCiphertext.includes(created.secret), false)
  assert.equal(JSON.stringify(await smsSources(admin)).includes(created.secret), false)
  const update = { ...settings, id: original.id, version: original.version }
  const noChange = await saveSmsSource(secondAdmin, update)
  assert.equal(noChange.source.version, original.version)
  assert.equal(noChange.secret, undefined)
  assert.equal((await smsSources(limitedEditor)).items.find(item => item.id === original.id).canEdit, false)
  await assert.rejects(saveSmsSource(limitedEditor, { ...update, label: 'Denied' }), error => error.status === 403)
  const edited = await saveSmsSource(secondAdmin, { ...update, label: 'Edited by second admin' })
  await assert.rejects(saveSmsSource(admin, update), error => error.status === 409)
  assert.equal(edited.secret, undefined)
  assert.equal(edited.source.version, original.version + 1)
  const saved = await prisma.paySmsSource.findUniqueOrThrow({ where })
  assert.equal(saved.ownerUserId, admin.id)
  assert.equal(saved.secretCiphertext, original.secretCiphertext)
  const damaged = await prisma.paySmsSource.update({ where, data: { templateJson: '{}', version: { increment: 1 } } })
  assert.equal((await smsSources(secondAdmin)).items.find(item => item.id === original.id).template, null)
  await prisma.bankAccount.update({ where: { id: bank.id }, data: { active: false } })
  let paused
  try {
    await assert.rejects(saveSmsSource(secondAdmin, { ...update, version: damaged.version }), error => error.status === 409)
    paused = await saveSmsSource(secondAdmin, { ...update, version: damaged.version, active: false })
    assert.equal(paused.source.active, false)
    assert.equal(paused.source.format, 'FORWARDER_V1')
  } finally {
    await prisma.bankAccount.update({ where: { id: bank.id }, data: { active: true } })
  }
  const resumed = await saveSmsSource(admin, { ...update, version: paused.source.version })
  const body = amount => ({ sms: `CREDIT ${amount}`, bank: 'bankmeli', token: created.secret })
  const receive = async input => receiveForwardedSms(created.source.id, Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)))
  async function quote(amount, accept = true) {
    const inv = await invoice(amount, 'IRR', 'WALLET_TOPUP')
    await prisma.invoice.updateMany({ where: { id: inv.id, status: 'UNPAID' }, data: { gatewayId: gateway.id } })
    const q = await prepare(gateway.id, inv.number); quotes.push(q.txnId)
    const request = new NextRequest('https://mobocom.invalid/pay/bank/' + q.txnId)
    if (accept) await changeBaleCheckout(q.txnId, request, 'accept')
    return { inv, request, row: await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: q.txnId } }) }
  }
  async function once(q) {
    const credits = await prisma.walletTx.findMany({ where: { invoiceId: q.inv.id, type: 'TOPUP', status: 'DONE' } })
    assert.equal(credits.length, 1); assert.equal(credits[0].amountMinor, q.row.principalRial)
    assert.equal(await prisma.payment.count({ where: { invoiceId: q.inv.id, status: 'CONFIRMED' } }), 1)
    assert.equal(await prisma.payment.count({ where: { providerTxnId: q.row.id, provider: 'MOBOCOM_PAY_ADJUSTMENT' } }), 1)
  }
  const first = await quote(20000000), payload = body(first.row.collectedRial)
  for (const bad of [{ ...payload, bank: 'bankmellat' }, { ...payload, token: 'x'.repeat(43) }, { ...payload, unknown: true }]) await assert.rejects(receive(bad))
  await assert.rejects(receive(`{"sms":"${payload.sms}","bank":"bankmeli","token":"${created.secret}","token":"${created.secret}"}`), e => e.status === 422)
  assert.equal((await receive(payload)).financialApproval, true)
  const stored = await prisma.payBaleNotice.findFirstOrThrow({ where: { smsSourceId: created.source.id } })
  assert.equal(stored.code, 'SMS_FORWARDER_CREDIT'); assert.equal(stored.sourceSentAt.getTime(), stored.receivedAt.getTime())
  assert.equal((await load('src/modules/billing/server/pay/transfer-operations/review-views.ts').transferReviewDetail(admin, stored.id)).notice.timeBasis, 'SERVER_RECEIPT')
  assert.equal((await receive({ ...payload, sms: 'DEBIT 1234567' })).financialApproval, false)
  assert.equal((await receive({ ...payload, sms: 'UNKNOWN 1234567' })).financialApproval, false)
  const monitor = await load('src/modules/billing/server/pay/transfer-operations/monitor.ts').transferMonitor(admin)
  assert.equal(monitor.sources.find(s => s.id === created.source.id).p95DeliveryMs, null)
  assert.equal((await receive(JSON.stringify({ token: created.secret, bank: 'bankmeli', sms: `  CREDIT   ${first.row.collectedRial}  ` }, null, 2))).duplicate, true)
  await receiveTimestamped(envelope(710, { amount: first.row.collectedRial.toString(), reference: 'SIMPLEFIRST710' }))
  await saveSmsSource(admin, { id: created.source.id, version: resumed.source.version, label: 'Updated label', bankAccountId: bank.id, template, verified: true, active: true })
  assert.equal((await smsSources(admin)).items.find(s => s.id === created.source.id).format, 'FORWARDER_V1')
  clock.set(clock.now() + 1000)
  assert.equal((await receive(payload)).duplicate, true)
  assert.equal((await prisma.payBaleNotice.findUniqueOrThrow({ where: { id: stored.id } })).sourceSentAt.getTime(), stored.sourceSentAt.getTime())
  await once(first)
  await assert.rejects(receiveSmsNotice(created.source.id, created.secret, Buffer.from(JSON.stringify({ message_id: 'format-downgrade', sender: 'bankmeli', message: payload.sms, received_at: new Date().toISOString() }))), e => e.code === 'SMS_FORMAT_MISMATCH')

  const timestampedFirst = await quote(21000000); await upload(timestampedFirst.row.id, timestampedFirst.row.collectedRial)
  const receipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: timestampedFirst.row.id } })
  await receiveTimestamped(envelope(711, { amount: timestampedFirst.row.collectedRial.toString(), reference: 'BALEFIRST711' }))
  assert.equal((await receive(body(timestampedFirst.row.collectedRial))).alreadyPaid, true)
  assert.equal((await reviewCollectionReceipt(admin, receipt.receiptId, 'approve', '')).alreadyPaid, true); await once(timestampedFirst)

  const manualFirst = await quote(22000000); await upload(manualFirst.row.id, manualFirst.row.collectedRial)
  const manualReceipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: manualFirst.row.id } })
  await reviewCollectionReceipt(admin, manualReceipt.receiptId, 'approve', '')
  assert.equal((await receive(body(manualFirst.row.collectedRial))).alreadyPaid, true)
  await receiveTimestamped(envelope(712, { amount: manualFirst.row.collectedRial.toString(), reference: 'MANUALFIRST712' })); await once(manualFirst)

  const race = await quote(23000000); await upload(race.row.id, race.row.collectedRial)
  const raceReceipt = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: race.row.id } })
  const results = await Promise.allSettled([receive(body(race.row.collectedRial)), receiveTimestamped(envelope(713, { amount: race.row.collectedRial.toString(), reference: 'TWOSMS713' })), reviewCollectionReceipt(admin, raceReceipt.receiptId, 'approve', '')])
  assert.ok(results.some(r => r.status === 'fulfilled')); await once(race)

  const beforeAccept = await quote(24000000, false), before = await receive(body(beforeAccept.row.collectedRial))
  assert.equal(before.financialApproval, false); clock.set(clock.now() + 1000)
  await changeBaleCheckout(beforeAccept.row.id, beforeAccept.request, 'accept')
  assert.equal((await receive(body(beforeAccept.row.collectedRial))).financialApproval, false)
  assert.equal(await prisma.walletTx.count({ where: { invoiceId: beforeAccept.inv.id, type: 'TOPUP', status: 'DONE' } }), 0)
  const late = await quote(25000000), originalTime = clock.now(); clock.set(late.row.expiresAt.getTime() + 1000)
  assert.equal((await receive(body(late.row.collectedRial))).financialApproval, false)
  assert.equal((await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: late.row.id } })).status, 'REVIEW')
  clock.set(originalTime)
  const heldLate = await quote(26000000)
  await upload(heldLate.row.id, heldLate.row.collectedRial)
  clock.set(heldLate.row.expiresAt.getTime() + 1000)
  const lateNotice = await receive(body(heldLate.row.collectedRial))
  assert.equal(lateNotice.financialApproval, false)
  assert.equal(lateNotice.reviewRequired, true)
  assert.equal(lateNotice.code, 'LATE_TRANSFER')
  const held = await prisma.payBaleCollection.findUniqueOrThrow({ where: { id: heldLate.row.id }, include: { receipt: true } })
  assert.equal(held.status, 'UNDER_REVIEW')
  assert.equal(held.receipt.status, 'PENDING')
  assert.equal(await prisma.walletTx.count({ where: { invoiceId: heldLate.inv.id, type: 'TOPUP' } }), 0)
  assert.equal((await receive(body(heldLate.row.collectedRial))).financialApproval, false)
  assert.equal((await reviewCollectionReceipt(admin, held.receiptId, 'approve', '')).status, 'APPROVED')
  await once(heldLate)
  clock.set(originalTime)
  return { sourceId: created.source.id, token: created.secret, bank: template.bankCode }
}
