const { test } = require('node:test')
const assert = require('node:assert/strict')
const source = require('./connected-source-loader.cjs')

module.exports = function proxmoxCases() {
  const connection = { driver: 'PROXMOX', url: 'https://pve.example.test:8006', username: 'user@pve!monitor', secret: 'private-token', config: {} }
  function setup(reply) {
    const calls = []
    const load = source({ '@/modules/hosting/server/drivers/http': { hostingRequest: async (...args) => {
      calls.push(args)
      if (reply instanceof Error) throw reply
      return reply
    } } })
    return { calls, Driver: load('src/modules/hosting/server/drivers/proxmox.ts').ProxmoxDriver }
  }
  test('Proxmox tests authenticated permissions with token in header', async () => {
    for (const data of [{}, { '/vms': { 'VM.Audit': 1 }, '/': { 'Sys.Audit': 0 } }]) {
      const { calls, Driver } = setup({ status: 200, text: JSON.stringify({ data }) })
      const driver = new Driver(connection)
      assert.deepEqual(driver.capabilities, [])
      assert.equal((await driver.testConnection()).ok, true)
      assert.equal(calls[0][0], 'https://pve.example.test:8006/api2/json/access/permissions')
      assert.equal(calls[0][1].method, 'GET')
      assert.equal(calls[0][1].headers.authorization, 'PVEAPIToken=user@pve!monitor=private-token')
      assert.doesNotMatch(calls[0][0], /private-token|user@/)
    }
  })
  test('Proxmox rejects unsafe URL and invalid credentials without a request', async () => {
    const { calls, Driver } = setup({ status: 200, text: '{"data":{}}' })
    const urls = ['http://pve.example.test', 'https://u:p@pve.example.test', 'https://pve.example.test/x', 'https://pve.example.test/a/..', 'https://pve.example.test?x=1', 'https://pve.example.test#x', 'https://pve.example.test:8443', 'https://pve.example.test\\@evil.test']
    for (const url of urls) assert.equal((await new Driver({ ...connection, url }).testConnection()).ok, false, url)
    for (const username of ['user@pve', 'user!token', 'user@pve!token\r\nX: x']) assert.equal((await new Driver({ ...connection, username }).testConnection()).ok, false)
    assert.equal((await new Driver({ ...connection, secret: 'x\r\ny' }).testConnection()).ok, false)
    assert.equal(calls.length, 0)
  })
  test('Proxmox requires successful HTTP and a valid permission map', async () => {
    const replies = [{ status: 401, text: '{"data":{}}' }, { status: 403, text: 'private-token' }, { status: 500, text: '{"data":{}}' }, { status: 200, text: 'private-token' }, { status: 200, text: '{"data":[]}' }, { status: 200, text: '{"data":{"bad":{}}}' }, { status: 200, text: '{"data":{"/vms":{"VM.Audit":"yes"}}}' }, new Error('private-token')]
    for (const reply of replies) {
      const { Driver } = setup(reply)
      const result = await new Driver(connection).testConnection()
      assert.equal(result.ok, false)
      assert.doesNotMatch(result.message, /private-token/)
    }
  })
}
