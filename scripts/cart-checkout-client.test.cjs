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

test('cloud checkout is a closed service surface and preserves public gateways',()=>{
 const {checkoutPath,storedCheckoutSurface,checkoutDestination,cloudOrderMeta}=require('./connected-source-loader.cjs')()('src/modules/checkout/domain/surface.ts')
 for(const kind of ['hosting','hosting-renewal','hosting-addon','domain','domain-renewal'])assert.equal(storedCheckoutSurface(JSON.stringify({kind,checkoutSurface:'cloud'})),'cloud')
 for(const raw of ['bad','[]','null','{}',JSON.stringify({kind:['hosting'],checkoutSurface:'cloud'}),JSON.stringify({kind:'product',checkoutSurface:'cloud'})]){assert.equal(storedCheckoutSurface(raw),'public');assert.equal(cloudOrderMeta(raw),null)}
 assert.equal(checkoutPath('/invoice/INV-1','cloud'),'/cloud/dashboard/invoices/INV-1')
 assert.equal(checkoutPath('/dashboard/services/12','cloud'),'/cloud/dashboard/services/12')
 assert.equal(checkoutPath('/dashboard/domains/12','cloud'),'/cloud/dashboard/domains/12')
 for(const path of ['/checkout/cart','/cart','//foreign.invalid','https://bank.invalid/pay','/dashboard/services/0','/dashboard/services/12/other'])assert.equal(checkoutPath(path,'cloud'),path)
 assert.equal(checkoutDestination({paid:true,invoiceNumber:'INV-1'},'cloud'),'/cloud/dashboard/payment/result?invoice=INV-1')
 assert.equal(checkoutDestination({paid:false,invoiceNumber:'INV-1',paymentUrl:'https://bank.invalid/pay'},'cloud'),'https://bank.invalid/pay')
})
test('cloud workspace stays canonical, private and uncached with custom public aliases',()=>{
 const load=require('./connected-source-loader.cjs')(),aliases=load('src/shared/routing/aliases.ts'),hosts=load('src/modules/site/domain/section-hosts.ts'),cache=load('src/modules/performance/domain/pagecache.ts'),seo=load('src/modules/seo/domain/seo.ts'),analytics=load('src/modules/analytics/domain/analytics.ts')
 assert.equal(analytics.normalizeTrackedPath('/cloud/dashboard/invoices'),'');assert.equal(analytics.normalizeTrackedPath('/cloud'),'/cloud');const map={'/cloud':'/abr'};assert.equal(aliases.toPublicPath('/cloud/dashboard/new?kind=servers',map),'/cloud/dashboard/new?kind=servers');assert.equal(aliases.routeDecision('/cloud/dashboard',map),null);assert.deepEqual(aliases.routeDecision('/abr/dashboard/invoices',map),{kind:'redirect',path:'/cloud/dashboard/invoices'})
 const config={...cache.DEFAULT_PAGECACHE,mode:'balanced',include:['/cloud'],exclude:[]};assert.equal(cache.decide(config,{method:'GET',accept:'text/html',pathname:'/cloud/dashboard/invoices',search:'',host:'owned.test',cookie:''}).cache,false);assert.ok(seo.PRIVATE_PATHS.includes('/cloud/dashboard'))
 for(const path of ['/cloud/dashboard','/abr/dashboard/new']){const decision=hosts.sectionHostRoute({host:'cloud.owned.test',path,origin:'https://owned.test',hosts:{'/cloud':'cloud.owned.test'},sections:[{module:'hosting',base:'/cloud'}],aliases:map});assert.equal(decision.kind,'redirect');assert.equal(decision.origin,'https://owned.test');assert.ok(decision.path.startsWith('/cloud/dashboard'))}
})
