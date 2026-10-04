const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
function route({replayed = false, failed = false, empty = false, staleClear = false} = {}) {
  let removed = 0, recovered = 0, executions = 0
  class StoreError extends Error { constructor() {super('empty'); this.code = 'CART_EMPTY'; this.status = 409} }
  const mocks = {
    '@/platform/http/response': {ok: data => ({status: 200, data}), err: (_message, status, meta) => ({status, ...meta})},
    '@/extensions/server/modules': {moduleGuard: async () => null},
    '@/modules/identity/server/access': {requireUser: async () => ({id: 9, email: 'checkout@example.invalid'})},
    '@/modules/settings/server': {getSettings: async () => ({})},
    '@/modules/store/domain/store': {StoreError},
    '@/modules/store/server/cart': {
      cartCheckoutLines: async () => {if (empty) throw new StoreError(); return {lines: [{lineId: 42, productId: 10, quantity: 3}] }},
      removePurchasedLines: async () => {removed++},
      clearCart: async () => {if (staleClear) throw Object.assign(new StoreError(), {code: 'CART_CHANGED'})},
      cartView: async () => {throw Error('Unexpected view after failed clear')},
    },
    '@/modules/store/server/marketing': {markCartRecovered: async () => {recovered++}},
    '@/modules/checkout/server/checkout': {executeCheckout: async () => {executions++; return failed ? {ok: false, status: 409, code: 'DENIED', message: 'denied'} : {ok: true, data: {orderId: 21, ...(replayed ? {replayed: true} : {})}}}},
  }
  const mod = {exports: {}}
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/modules/store/server/http/routes.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => mocks[name] || {}, mod, mod.exports)
  const req = {headers: {get: () => 'checkout-replay-key'}, cookies: {get: () => null}, json: async () => ({})}
  return {call: () => mod.exports.POST_cartCheckout(req), clear: () => mod.exports.DELETE_cart(req), counts: () => ({removed, recovered, executions})}
}
test('replaying an existing order preserves the current cart and recovery cycle', async () => {
  const fixture = route({replayed: true})
  assert.equal((await fixture.call()).status, 200)
  assert.deepEqual(fixture.counts(), {removed: 0, recovered: 0, executions: 1})
})
test('ownership change during cart clear returns the existing structured conflict response', async () => {
  const fixture = route({staleClear: true})
  assert.deepEqual(await fixture.clear(), {status: 409, code: 'CART_CHANGED'})
})
test('new order still removes purchased lines and marks the cart recovered once', async () => {
  const fixture = route()
  assert.equal((await fixture.call()).status, 200)
  assert.deepEqual(fixture.counts(), {removed: 1, recovered: 1, executions: 1})
})
test('empty-cart lost-response replay and failed checkout never mutate cart recovery', async () => {
  const empty = route({empty: true, replayed: true})
  assert.equal((await empty.call()).status, 200)
  assert.deepEqual(empty.counts(), {removed: 0, recovered: 0, executions: 1})
  const failed = route({failed: true})
  assert.equal((await failed.call()).status, 409)
  assert.deepEqual(failed.counts(), {removed: 0, recovered: 0, executions: 1})
})
