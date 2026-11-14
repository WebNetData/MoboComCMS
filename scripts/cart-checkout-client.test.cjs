const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api')
require('./dashboard-service-ordering.cases.cjs')
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

test('the actual cart checkout sends unpaid bank payments to the gateway before its invoice', async () => {
 const source = ts.transpileModule(fs.readFileSync('src/components/store/CartCheckout.tsx', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}}).outputText
 const surfaceOwner = require('./connected-source-loader.cjs')()('src/modules/checkout/domain/surface.ts')
 const giftOptions = require('./connected-source-loader.cjs')()('src/components/store/GiftOptions.tsx')
 for (const surface of ['public', 'dashboard']) for (const scenario of [
  {paid: false, paymentUrl: 'https://bank.example.invalid/pay', invoiceUrl: '/invoice/MB-TEST', expected: 'https://bank.example.invalid/pay', full: true},
  {paid: false, paymentUrl: '', invoiceUrl: '/invoice/MB-TEST', expected: surface === 'dashboard' ? '/dashboard/invoices/MB-TEST' : '/invoice/MB-TEST', full: surface === 'dashboard'},
  {paid: true, paymentUrl: 'https://bank.example.invalid/old', invoiceUrl: '/invoice/MB-TEST', expected: surface === 'dashboard' ? '/dashboard/payment/result?invoice=MB-TEST' : '/payment/result?invoice=MB-TEST', full: surface === 'dashboard'},
 ]) {
  const navigations = [], mod = {exports: {}}
  new Function('require', 'module', 'exports', 'window', source)(name => {
   if (name === 'react') return {useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: fn => fn(), useEffect: () => {}, useRef: () => ({current: null})}
   if (name === '@/platform/routing/navigation') return {useRouter: () => ({push: url => navigations.push({url, full: false})})}
   if (name === '@/modules/checkout/domain/surface') return surfaceOwner
   if (name === '@/modules/store/ui/cart-client') return {checkoutCart: async () => ({ok: true, invoiceNumber: 'MB-TEST', ...scenario})}
   if (name === '@/components/store/AddressBook') return {useAddresses: () => ({addresses: [], error: '', reload: async () => {}})}
   if (name === './useCarrierQuotes') return {useCarrierQuotes: () => ({carriers: null, error: '', retry: () => {}})}
   if (name === './GiftOptions') return giftOptions
   if (name.startsWith('@/')) return {}
   return require(name)
  }, mod, mod.exports, {location: {assign: url => navigations.push({url, full: true})}})
  const tree = mod.exports.default({surface, cart: {lines: [], currency: 'IRT', count: 1, itemsTotal: 100, listTotal: 100, saving: 0, shipping: 0, hasPhysical: false, blocked: false}, delivery: {enabled: false, days: []}, gateways: []})
  let pay
  function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk); if (node.type === 'button' && node.props.className?.includes('sh-pay')) pay = node; walk(node.props?.children) }
  walk(tree); assert.ok(pay); pay.props.onClick(); await tick()
  assert.deepEqual(navigations, [{url: scenario.expected, full: scenario.full}], `${surface}: ${JSON.stringify(scenario)}`)
 }
})

test('cart checkout waits for session resolution and retains authenticated/guest destinations', () => {
 const source = ts.transpileModule(fs.readFileSync('src/components/store/CartPage.tsx', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}}).outputText
 for (const status of ['loading', 'authenticated', 'unauthenticated']) {
  const routes = [], mod = {exports: {}}
  new Function('require', 'module', 'exports', source)(name => {
   if (name === 'react') return {useState: initial => [initial, () => {}]}
   if (name === 'next-auth/react') return {useSession: () => ({status})}
   if (name === '@/platform/routing/navigation') return {useRouter: () => ({push: value => routes.push(value)})}
   if (name === '@/modules/checkout/domain/surface') return {checkoutPath: value => value}
   if (name === './SharedCart') return {ShareCartControl: () => null}
   if (name.startsWith('@/')) return {}
   return require(name)
  }, mod, mod.exports)
  const tree = mod.exports.default({initial: {lines: [{id: 1, name: 'Synthetic', slug: 'synthetic', attributes: {}, kind: 'PHYSICAL', quantity: 1, maxQuantity: 2, unitPrice: 10, lineTotal: 10, listPrice: 10, currency: 'IRT'}], currency: 'IRT', count: 1, itemsTotal: 10, listTotal: 10, saving: 0, hasPhysical: false}, note: ''})
  const buttons = []
  function walk(node) {
   if (!node || typeof node !== 'object') return
   if (Array.isArray(node)) return node.forEach(walk)
   if (node.type === 'button' && ['تکمیل سفارش', 'تأیید و تکمیل سفارش'].includes(node.props.children)) buttons.push(node)
   walk(node.props?.children)
  }
  walk(tree)
  assert.equal(buttons.length, 2, 'both desktop and mobile checkout controls are covered')
  for (const button of buttons) {
   assert.equal(button.props.disabled, status === 'loading')
   button.props.onClick()
  }
  assert.deepEqual(routes, status === 'loading' ? [] : Array(2).fill(status === 'authenticated' ? '/checkout/cart' : '/login?next=%2Fcheckout%2Fcart'))
 }
})
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
