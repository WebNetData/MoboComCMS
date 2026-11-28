const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const setup = require('./pay-center.fixture.cjs')

const origin = 'https://mobocom.invalid'

function request(actor, path, method = 'GET', body) {
  const headers = new Headers(actor.req.headers)
  if (body) headers.set('content-type', 'application/json')
  return new NextRequest(origin + path, { method, headers, body: body && JSON.stringify(body) })
}

async function main() {
  const fixture = await setup('pay-account-lifecycle')
  const { db, load, pay, actors: [admin, , merchant], stamp } = fixture
  const { DELETE_account } = load('src/modules/billing/server/http/card-transfer/admin.ts')
  const template = load('src/modules/billing/domain/pay-sms-template.ts').smsBankPresets.find(item => item.bankCode === 'bankmeli')
  const bank = await db.bankAccount.create({ data: {
    bankName: stamp, holderName: 'Synthetic receiving account',
    accountNumber: '59001', cardNumber: '7777777777777777', collectionUse: 'GENERAL', active: true,
  } })
  try {
    const { source } = await pay.saveSmsSource(admin, {
      label: 'Synthetic verified SMS source', bankAccountId: bank.id,
      template, verified: true, active: true, format: 'FORWARDER_V1',
    })
    const remove = actor => DELETE_account(request(actor, '/api/admin/bank-accounts?id=' + bank.id, 'DELETE'))
    assert.equal((await remove(merchant)).status, 403)
    const missingOriginHeaders = new Headers(admin.req.headers)
    missingOriginHeaders.delete('origin')
    const missingOrigin = await DELETE_account(new NextRequest(origin + '/api/admin/bank-accounts?id=' + bank.id,
      { method: 'DELETE', headers: missingOriginHeaders }))
    assert.equal(missingOrigin.status, 403)
    assert.equal((await db.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).active, true)
    const removals = await Promise.all([remove(admin), remove(admin)])
    for (const response of removals) {
      assert.equal(response.status, 200, 'A verified SMS source must not make its bank account impossible to remove')
      assert.equal((await response.json()).deactivated, true)
    }
    assert.equal((await db.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).active, false)
    assert.equal((await db.paySmsSource.findUniqueOrThrow({ where: { id: source.id } })).active, false)
    assert.equal((await remove(admin)).status, 200)
    const { GET_accounts } = load('src/modules/billing/server/http/card-transfer/admin.ts')
    const accounts = await GET_accounts(request(admin, '/api/admin/bank-accounts'))
    assert.equal(accounts.status, 200)
    assert.equal((await accounts.json()).accounts.some(account => account.id === bank.id), false)
    console.log('Verified account archive is authorized, repeatable, and removes the account from new receiving options.')
  } finally {
    await db.paySmsSource.deleteMany({ where: { bankAccountId: bank.id } })
    await db.bankAccount.deleteMany({ where: { id: bank.id } })
    await fixture.cleanup()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
