const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(relative, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(root, relative)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const mod = { exports: {} }
  cache.set(absolute, mod)
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(root, base + suffix), mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}
const read = (file) => fs.readFileSync(path.resolve(root, file), 'utf8')

// ------------------------------------------------------------------ per-link prices

test('link prices: toman input, VIP free or paying, empty = none', () => {
  const p = load('src/modules/paywall/domain/paywall.ts')
  assert.equal(p.normalizeLinkPrice({ price: '' }), null)
  assert.equal(p.normalizeLinkPrice({}), null)
  const rule = p.normalizeLinkPrice({ price: '۲۵۰,۰۰۰' })
  assert.equal(rule.priceMinor, 250000n)
  assert.equal(rule.currency, 'IRT')
  assert.equal(rule.vipAccess, 'FREE')
  assert.equal(p.normalizeLinkPrice({ price: '1000', priceVip: 'NONE' }).vipAccess, 'NONE')
  assert.throws(() => p.normalizeLinkPrice({ price: '0' }), /قیمت/)
  assert.deepEqual([...p.PRICED_LINK_OWNERS], ['title', 'game', 'software'])
  assert.deepEqual(p.parseContentKey('link:12'), { ownerType: 'link', ownerId: 12 })
})

test('a link with its own price wins over the item; buying the item does not open it', () => {
  const p = load('src/modules/paywall/domain/paywall.ts')
  const rules = [
    { ownerType: 'title', ownerId: 3, priceMinor: 100000n, currency: 'IRT', vipAccess: 'FREE', memberPriceMinor: null, active: true },
    { ownerType: 'link', ownerId: 9, priceMinor: 250000n, currency: 'IRT', vipAccess: 'NONE', memberPriceMinor: null, active: true },
  ]
  const chain = (linkId) => [{ ownerType: 'link', ownerId: linkId }, { ownerType: 'title', ownerId: 3 }]
  assert.equal(p.pickRule(rules, chain(9)).ownerType, 'link')
  assert.equal(p.pickRule(rules, chain(8)).ownerType, 'title')
  // VIP pays for the 4K link (NONE) but not for the item (FREE)
  assert.equal(p.decideAccess(p.pickRule(rules, chain(9)), { member: true, purchased: false }).open, false)
  assert.equal(p.decideAccess(p.pickRule(rules, chain(8)), { member: true, purchased: false }).open, true)
})

test('wiring: link gate, own-price buy button, admin link editor, saved prices', () => {
  const links = read('src/modules/media/server/links.ts')
  assert.equal((links.match(/\{ ownerType: 'link', ownerId: id \}, \.\.\.owner\.chain/g) || []).length, 2)
  const box = read('src/components/media/LinkBox.tsx')
  assert.match(box, /linkPaywalls\(viewer/)
  assert.match(box, /BuyLinkButton/)
  const admin = read('src/modules/media/server/admin.ts')
  assert.match(admin, /saveLinkPrice/)
  assert.match(admin, /paidItem\.deleteMany\(\{ where: \{ ownerType: 'link', ownerId: \{ in: unused/)
  assert.match(read('src/app/admin/cms/MediaCrud.tsx'), /priced=\{field\.upload === 'cinema'/)
  // A section manager can price only links of their own section
  assert.match(read('src/modules/paywall/server/http/paywall.ts'), /LINK_PERMS/)
})

// ------------------------------------------------------------------ seller variants

test('seller variants: every combination of the picked values, unique SKUs server side', () => {
  const src = read('src/app/seller/products/[id]/Variants.tsx')
  assert.match(src, /function combinations/)
  const market = read('src/modules/marketplace/server/marketplace.ts')
  assert.match(market, /sku: String\(variant\?\.sku \|\| ''\)\.trim\(\) \|\| `S\$\{seller\.id\}/)
  assert.match(market, /کد تنوع \(SKU\) تکراری/)
  const editor = read('src/app/seller/products/[id]/page.tsx')
  assert.match(editor, /<Variants /)
  assert.match(editor, /compareAtPrice: v\.compareAt/)
  // The combination builder itself
  const mod = load('src/app/seller/products/[id]/Variants.tsx', { react: { useMemo: (fn) => fn(), useState: (v) => [typeof v === 'function' ? v() : v, () => {}] }, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'f' } })
  assert.equal(typeof mod.default, 'function')
})

// ------------------------------------------------------------------ realtime bus + SSE

test('memory bus: publish reaches subscribers of the channel only; unsubscribe stops it', async () => {
  delete process.env.REDIS_URL
  delete globalThis.__mobocomBus
  const bus = load('src/platform/realtime/bus.ts', { '@/platform/observability/logger': { logEvent: () => {} } })
  const seen = []
  const stop = await bus.subscribe('chat:c:1', (event) => seen.push(event))
  const other = []
  await bus.subscribe('chat:c:2', (event) => other.push(event))
  await bus.publish('chat:c:1', { type: 'message', id: 5 })
  assert.deepEqual(seen, [{ type: 'message', id: 5 }])
  assert.deepEqual(other, [])
  stop()
  await bus.publish('chat:c:1', { type: 'message', id: 6 })
  assert.equal(seen.length, 1)
  assert.equal(await bus.busKind(), 'memory')
})

test('SSE response: event framing, ids, heartbeat headers, cleanup on abort', async () => {
  delete globalThis.__mobocomBus
  const bus = load('src/platform/realtime/bus.ts', { '@/platform/observability/logger': { logEvent: () => {} } })
  const controller = new AbortController()
  let cleaned = false
  const response = bus.sseResponse(controller.signal, async (send) => {
    send('ready', { status: 'OPEN' })
    send('message', { id: 7, body: 'سلام' }, 7)
    return () => { cleaned = true }
  })
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  assert.equal(response.headers.get('x-accel-buffering'), 'no')
  const reader = response.body.getReader()
  let text = ''
  while (!text.includes('سلام')) { const { value } = await reader.read(); text += new TextDecoder().decode(value) }
  assert.match(text, /^retry: 3000\n\n/)
  assert.match(text, /event: ready\ndata: \{"status":"OPEN"\}\n\n/)
  assert.match(text, /id: 7\nevent: message\ndata: \{"id":7,"body":"سلام"\}\n\n/)
  controller.abort()
  const end = await reader.read()
  assert.equal(end.done, true)
  assert.equal(cleaned, true)
})

test('chat wiring: messages and status changes are announced; streams catch up from Last-Event-ID', () => {
  const chat = read('src/modules/livechat/server/livechat.ts')
  assert.match(chat, /await announce\(conversation\.id, \{ type: 'message'/)
  assert.ok((chat.match(/await setStatus\(/g) || []).length >= 6)
  const http = read('src/modules/livechat/server/http/livechat.ts')
  assert.match(http, /last-event-id/)
  assert.match(http, /GET_visitorStream/)
  assert.match(http, /GET_agentStream/)
  assert.match(http, /input\.op === 'typing'/)
  assert.match(read('src/app/api/chat/stream/route.ts'), /GET_visitorStream as GET/)
  assert.match(read('src/app/api/admin/chat/stream/route.ts'), /GET_agentStream as GET/)
  // Widget and console fall back to polling when the stream is unavailable
  const widget = read('src/plugins/livechat/client.tsx')
  assert.match(widget, /new EventSource\(`\/api\/chat\/stream/)
  assert.match(widget, /if \(!status \|\| live\) return/)
  const console_ = read('src/app/admin/chat/page.tsx')
  assert.match(console_, /new EventSource\('\/api\/admin\/chat\/stream'\)/)
  assert.match(console_, /if \(live\) return/)
})
