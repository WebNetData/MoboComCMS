const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const m = load('src/modules/billing/infrastructure/mellat')

test('order ids are numeric, unique per retry and tied to the invoice', () => {
  const a = m.mellatOrderId('MB-2026-000010', 1_700_000_123_456)
  const b = m.mellatOrderId('MB-2026-000010', 1_700_000_123_999)
  assert.equal(a, 26000010123456)
  assert.notEqual(a, b)
  assert.ok(Number.isSafeInteger(m.mellatOrderId('INV-99999999999999', Date.now())))
  assert.equal(m.mellatOrderMatches('MB-2026-000010', String(a)), true)
  assert.equal(m.mellatOrderMatches('MB-2026-000011', String(a)), false)
  assert.equal(m.mellatOrderMatches('MB-2026-000010', '26000010123'), false)
  assert.equal(m.mellatOrderMatches('MB-2026-000010', 'x'), false)
})

test('SOAP return values and messages', () => {
  assert.equal(m.parseReturn('<soap:Body><ns2:bpPayRequestResponse><return>0,AF82041a2Bf6989c</return></ns2:bpPayRequestResponse></soap:Body>'), '0,AF82041a2Bf6989c')
  assert.equal(m.parseReturn('<html>error</html>'), null)
  assert.equal(m.mellatMessage('17'), 'کاربر از انجام تراکنش منصرف شد')
  assert.match(m.mellatMessage('9999'), /کد 9999/)
})

test('the start page posts the escaped RefId to the bank', () => {
  const html = m.mellatStartPage('AB12"><script>x</script>')
  assert.match(html, /action="https:\/\/bpm\.shaparak\.ir\/pgwchannel\/startpay\.mellat"/)
  assert.doesNotMatch(html, /<script>x<\/script>/)
  assert.match(html, /name="RefId" value="AB12&quot;&gt;&lt;script&gt;/)
})
