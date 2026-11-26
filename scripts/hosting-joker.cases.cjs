const { test } = require('node:test')
const assert = require('node:assert/strict')
const source = require('./connected-source-loader.cjs')

module.exports = function jokerCases() {
  const connection = { driver: 'JOKER', url: 'https://evil.invalid', username: 'user@example.test', secret: 'secret & value', config: {} }
  const ack = 'Result: ACK\nStatus-Code: 1000\nAuth-SID: private-session\n\ncom'
  const logout = 'Result: ACK\nStatus-Code: 0\n\n'
  function setup(replies) {
    const calls = []
    const load = source({ '@/modules/hosting/server/drivers/http': { hostingRequest: async (...args) => {
      calls.push(args)
      const reply = replies.shift()
      if (reply instanceof Error) throw reply
      return reply
    } } })
    return { calls, Driver: load('src/modules/hosting/server/drivers/joker.ts').JokerDriver }
  }
  test('Joker accepts its documented minimal session response and empty logout, but negative status wins', async()=>{
    let fixture=setup([{status:200,text:'Auth-SID: documented-session\n\ncom\nnet'},{status:200,text:''}])
    assert.equal((await new fixture.Driver(connection).testConnection()).ok,true)
    for(const text of ['Auth-SID: documented-session\nResult: NACK\n\n','Auth-SID: documented-session\nStatus-Code: 2200\n\n','Auth-SID: <invalid>\n\n']){
      fixture=setup([{status:200,text},{status:200,text:''}]);assert.equal((await new fixture.Driver(connection).testConnection()).ok,false)
    }
  })
  test('Joker uses POST form credentials and closes the session', async () => {
    const { calls, Driver } = setup([{ status: 200, text: ack }, { status: 200, text: logout }])
    const driver = new Driver(connection)
    assert.deepEqual(driver.capabilities,['check','register','renew'])
    assert.equal((await driver.testConnection()).ok, true)
    assert.deepEqual(calls.map(c => c[0]), ['https://dmapi.joker.com/request/login', 'https://dmapi.joker.com/request/logout'])
    assert.equal(calls[0][1].method, 'POST')
    assert.equal(new URLSearchParams(calls[0][1].body).get('api-key'), connection.secret)
    assert.equal(new URLSearchParams(calls[1][1].body).get('auth-sid'), 'private-session')
    assert.equal(calls.some(c => /secret|private-session|user@example/.test(c[0])), false)
  })
  test('Joker password mode sends username and password in form', async () => {
    const { calls, Driver } = setup([{ status: 200, text: ack }, { status: 200, text: logout }])
    assert.equal((await new Driver({ ...connection, config: { authMode: 'PASSWORD' } }).testConnection()).ok, true)
    const form = new URLSearchParams(calls[0][1].body)
    assert.equal(form.get('username'), connection.username)
    assert.equal(form.get('password'), connection.secret)
    assert.equal(form.has('api-key'), false)
  })
  test('Joker rejects malformed or negative replies and never leaks provider text', async () => {
    for (const text of ['Result: NACK\nStatus-Code: 1000\nError: secret & value', 'Result: ACK\nStatus-Code: 2200\nAuth-SID: private-session', 'Result: ACK\nStatus-Code: 1000', 'Result: ACK\nResult: NACK\nStatus-Code: 1000', 'invalid secret & value']) {
      const { Driver } = setup([{ status: 200, text }, { status: 200, text: logout }])
      const result = await new Driver(connection).testConnection()
      assert.equal(result.ok, false)
      assert.doesNotMatch(result.message, /secret|private-session/)
    }
  })
  test('Joker handles HTTP, network, and logout failures safely', async () => {
    for (const replies of [[{ status: 403, text: ack }, { status: 200, text: logout }], [new Error('secret & value')], [{ status: 200, text: ack }, new Error('private-session')]]) {
      const { Driver } = setup(replies)
      const result = await new Driver(connection).testConnection()
      assert.equal(result.ok, false)
      assert.doesNotMatch(result.message, /secret|private-session/)
    }
  })
  test('Joker validates mode and credentials before making requests', async () => {
    const { Driver, calls } = setup([])
    for (const override of [{ secret: '' }, { config: { authMode: 'unknown' } }, { username: '', config: { authMode: 'PASSWORD' } }]) {
      assert.equal((await new Driver({ ...connection, ...override }).testConnection()).ok, false)
    }
    assert.equal(calls.length, 0)
  })
}
