const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
function fixture(replies, cartReply = {cart: {count: 7}}) {
 const keys = [], events = [], store = new Map(); let issued = 0
 const session = {getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key)}
 const fetch = async (url, input) => {
  if (url === '/api/cart') return cartReply instanceof Error ? Promise.reject(cartReply) : new Response(JSON.stringify(cartReply))
  keys.push(input.headers['Idempotency-Key']); const reply = replies.shift()
  if (reply instanceof Error) throw reply
  return new Response(JSON.stringify(reply.body), {status: reply.status})
 }
 const mod = {exports: {}}
 new Function('require', 'module', 'exports', 'fetch', 'sessionStorage', 'window', 'CustomEvent', ts.transpileModule(fs.readFileSync('src/modules/store/ui/cart-client.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(() => ({newIdempotencyKey: () => `test-checkout-${++issued}`}), mod, mod.exports, fetch, session, {dispatchEvent: event => events.push(event.detail)}, class {constructor(name, input) {this.detail = input.detail}})
 return {checkout: () => mod.exports.checkoutCart({}), keys, events, store}
}
const tick = () => new Promise(resolve => setImmediate(resolve))
test('server failure retains the key for replay and success refreshes the real current badge', async () => {
 const f = fixture([{status: 503, body: {error: 'unavailable'}}, {status: 200, body: {orderId: 21, replayed: true}}])
 assert.equal((await f.checkout()).ok, false); assert.equal((await f.checkout()).ok, true); await tick()
 assert.equal(f.keys[0], f.keys[1]); assert.equal(f.store.size, 0)
 assert.deepEqual(f.events, [{count: 7}])
})
test('transport failure and malformed success keep an unresolved checkout key', async () => {
 const f = fixture([new Error('network lost'), {status: 200, body: null}])
 await assert.rejects(f.checkout()); assert.equal(f.store.size, 1)
 assert.equal((await f.checkout()).ok, false); assert.equal(f.keys[0], f.keys[1]); assert.equal(f.store.size, 1)
 assert.deepEqual(f.events, [])
})
test('definitive client rejection resets the key but ambiguous gateway preserves it', async () => {
 const f = fixture([{status: 409, body: {code: 'CART_BLOCKED'}}, {status: 502, body: {code: 'GATEWAY_AMBIGUOUS'}}])
 await f.checkout(); assert.equal(f.store.size, 0)
 await f.checkout(); assert.notEqual(f.keys[0], f.keys[1]); assert.equal(f.store.size, 1)
})
test('failed badge refresh cannot overwrite a current cart count with zero', async () => {
 const f = fixture([{status: 200, body: {orderId: 21}}], new Error('cart unavailable'))
 assert.equal((await f.checkout()).ok, true); await tick(); assert.deepEqual(f.events, [])
})
