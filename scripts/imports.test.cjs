const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const zlib = require('node:zlib')
const ts = require('typescript')

/* Bulk import: pure rules (parsers, mapping and field policy, values, store
   rules, SSRF checks, reports) and the remote image downloader against local
   test servers. Database behaviour is covered by scripts/imports.integration.cjs. */

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

const parse = load('src/modules/imports/domain/parse.ts')
const mapping = load('src/modules/imports/domain/mapping.ts')
const values = load('src/modules/imports/domain/values.ts')
const coerce = load('src/modules/imports/domain/coerce.ts')
const net = load('src/modules/imports/domain/net.ts')
const items = load('src/modules/imports/domain/items.ts')
const settingsMod = load('src/modules/imports/domain/settings.ts')
const report = load('src/modules/imports/domain/report.ts')
const store = load('src/modules/imports/domain/store.ts')
const { LIMITS } = load('src/modules/imports/domain/types.ts')
const { safeJsonLd } = load('src/shared/seo/json-ld.ts')
const enc = (text) => new TextEncoder().encode(text)

// ------------------------------------------------------------------ a tiny ZIP writer for XLSX fixtures

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c }
  return (crc ^ 0xffffffff) >>> 0
}
function zip(files) {
  const locals = [], centrals = []
  let offset = 0
  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data)
    const body = f.store ? data : zlib.deflateRawSync(data)
    const name = Buffer.from(f.name)
    const size = f.claimSize ?? data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(f.flags || 0, 6); local.writeUInt16LE(f.store ? 0 : 8, 8)
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(f.flags || 0, 8); central.writeUInt16LE(f.store ? 0 : 8, 10)
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, body); centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, cd, end]))
}
const WORKBOOK = '<workbook xmlns:r="r"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>'
const RELS = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'
const SHARED = '<sst><si><t>title</t></si><si><t>price</t></si><si><t>formula</t></si><si><t>گوشی</t></si></sst>'
const SHEET = '<worksheet><sheetData>'
  + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
  + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1500000</v></c><c r="C2" t="str"><f>HYPERLINK("http://evil.test","x")+cmd|\'/c calc\'!A0</f><v>cached value</v></c></row>'
  + '<row r="3"><c r="A3" t="inlineStr"><is><t>کابل &amp; شارژر</t></is></c><c r="B3"><v>250</v></c></row>'
  + '</sheetData></worksheet>'
const xlsx = (extra = []) => zip([
  { name: 'xl/workbook.xml', data: WORKBOOK }, { name: 'xl/_rels/workbook.xml.rels', data: RELS },
  { name: 'xl/sharedStrings.xml', data: SHARED }, { name: 'xl/worksheets/sheet1.xml', data: SHEET },
  { name: 'xl/worksheets/sheet2.xml', data: '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData></worksheet>' },
  ...extra,
])

// ------------------------------------------------------------------ parsers

test('JSON: arrays, containers, depth and record limits', () => {
  assert.deepEqual(parse.parseFile('a.json', enc('[{"title":"A"},{"title":"B"}]')).rows.map((r) => r.title), ['A', 'B'])
  assert.equal(parse.parseFile('a.json', enc('{"products":[{"title":"A"}]}')).rows.length, 1)
  assert.equal(parse.parseFile('a.json', enc('﻿[{"title":"BOM"}]')).rows[0].title, 'BOM')
  const deep = '['.repeat(LIMITS.jsonDepth + 2) + ']'.repeat(LIMITS.jsonDepth + 2)
  assert.throws(() => parse.parseFile('a.json', enc(deep)), /عمق/)
  assert.equal(parse.jsonDepth('{"a":"[[[[[[[[[[[[[[[["}'), 1) // brackets inside strings do not count
  assert.throws(() => parse.parseFile('a.json', enc(JSON.stringify(Array.from({ length: LIMITS.rows + 1 }, () => ({ a: 1 }))))), /تعداد/)
  assert.throws(() => parse.parseFile('a.json', enc('{not json')), ImportFileErrorLike)
  assert.throws(() => parse.parseFile('a.json', new Uint8Array(0)), /خالی/)
})
function ImportFileErrorLike(error) { return error instanceof parse.ImportFileError }

test('CSV: quotes, delimiters, cell size and encodings', () => {
  const rows = parse.parseFile('a.csv', enc('title,price,desc\r\n"Phone, 5G",100,"say ""hi""\nline 2"\nCable,20,\n')).rows
  assert.deepEqual(rows[0], { title: 'Phone, 5G', price: '100', desc: 'say "hi"\nline 2' })
  assert.equal(rows[1].title, 'Cable')
  assert.equal(parse.parseFile('a.csv', enc('title;price\nA;1\n')).rows[0].price, '1')
  assert.throws(() => parse.parseFile('a.csv', enc(`title\n"${'x'.repeat(LIMITS.cellChars + 1)}"\n`)), /طول/)
  // UTF-16 with BOM (Excel "Unicode text") and Windows-1256 (older Persian Excel) are read; other bytes are refused.
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('title\tprice\nگوشی\t1\n', 'utf16le')])
  assert.equal(parse.parseFile('a.csv', new Uint8Array(utf16)).rows[0].title, 'گوشی')
  const cp1256 = Buffer.from([0x74, 0x69, 0x74, 0x6c, 0x65, 0x0a, 0xe3, 0xe6, 0xc8, 0xc7, 0xed, 0xe1, 0x0a]) // "title\nموبایل"
  assert.equal(values.normalizeName(parse.parseFile('a.csv', new Uint8Array(cp1256)).rows[0].title), values.normalizeName('موبایل'))
  assert.throws(() => parse.parseFile('a.csv', new Uint8Array([0x74, 0x0a, 0xe9, 0xe8, 0x0a])), /encoding|رمزگذاری/)
  assert.throws(() => parse.parseFile('a.csv', enc('a\n' + 'x\n'.repeat(LIMITS.rows + 2))), /تعداد/)
  assert.throws(() => parse.parseFile('a.xls', enc('x')), /XLS/)
})

test('XLSX: stored values only, sheets, macros, ZIP bombs and limits', () => {
  const book = parse.parseFile('p.xlsx', xlsx())
  assert.deepEqual(book.sheets, ['Products', 'Other'])
  assert.equal(book.rows[0].title, 'گوشی')
  assert.equal(book.rows[0].price, 1500000)
  assert.equal(book.rows[0].formula, 'cached value', 'a formula is never run: its stored value is used')
  assert.equal(book.rows[1].title, 'کابل & شارژر')
  assert.equal(parse.parseFile('p.xlsx', xlsx(), 'Other').sheet, 'Other')
  assert.throws(() => parse.parseFile('p.xlsm', xlsx([{ name: 'xl/vbaProject.bin', data: 'macro' }])), /ماکرو/)
  // 60 MB of zeros compresses to a few KB: refused by ratio before inflating.
  const bomb = zip([{ name: 'xl/workbook.xml', data: WORKBOOK }, { name: 'xl/_rels/workbook.xml.rels', data: RELS }, { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(60 * 1024 * 1024) }])
  assert.throws(() => parse.parseFile('bomb.xlsx', bomb), /ZIP bomb|بمب/)
  // A part that lies about its size (declares small, inflates large) is stopped by maxOutputLength.
  const liar = zip([{ name: 'xl/workbook.xml', data: WORKBOOK }, { name: 'xl/_rels/workbook.xml.rels', data: RELS }, { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(200_000, 65), claimSize: 100 }])
  assert.throws(() => parse.parseFile('liar.xlsx', liar), /اندازه|بزرگ/)
  assert.throws(() => parse.parseFile('enc.xlsx', zip([{ name: 'xl/workbook.xml', data: WORKBOOK, flags: 1 }])), /رمزدار/)
  const manySheets = '<workbook xmlns:r="r"><sheets>' + Array.from({ length: LIMITS.xlsxSheets + 1 }, (_x, i) => `<sheet name="S${i}" r:id="rId1"/>`).join('') + '</sheets></workbook>'
  assert.throws(() => parse.parseFile('s.xlsx', zip([{ name: 'xl/workbook.xml', data: manySheets }, { name: 'xl/_rels/workbook.xml.rels', data: RELS }, { name: 'xl/worksheets/sheet1.xml', data: SHEET }])), /برگه/)
  assert.throws(() => parse.parseFile('x.zip', zip([{ name: 'a.txt', data: 'x' }])), /workbook/)
  assert.throws(() => parse.parseFile('x.xlsx', enc('PK not a zip')), ImportFileErrorLike)
})

// ------------------------------------------------------------------ mapping and the field policy

const F = (key, extra = {}) => ({ key, label: key, type: 'text', ...extra })
const FIELDS = [F('title', { requiredOnCreate: true, synonyms: ['name', 'product_name'] }), F('price', { type: 'money', requiredOnCreate: true, synonyms: ['regular_price'] }), F('sku', { updatable: false }), F('description', { synonyms: ['desc'] }), F('stock', { type: 'int', synonyms: ['qty'] })]

test('auto mapping by synonyms, one column per field', () => {
  const m = mapping.autoMap(FIELDS, ['product_name', 'regular_price', 'SKU', 'qty', 'unrelated'])
  assert.deepEqual(m, { title: 'product_name', price: 'regular_price', sku: 'SKU', stock: 'qty' })
  const columns = mapping.discoverColumns([{ title: 'A', brand: { name: 'X' }, images: ['a', 'b'], variants: [{ color: 'Red' }] }]).map((c) => `${c.path}:${c.kind}`)
  assert.ok(columns.includes('brand.name:value') && columns.includes('images:list') && columns.includes('variants:objects') && columns.includes('variants[].color:value'))
})

test('create / update / ignore is enforced per field (manual, ignored, create-only, update-disabled)', () => {
  const policies = mapping.normalizePolicies(FIELDS, {
    title: { create: true, update: false }, // create only
    price: { create: false, update: false }, // ignored everywhere
    sku: { create: true, update: true }, // updatable:false wins
    description: { create: true, update: true },
  }, { title: 'name', price: 'p', sku: 's', description: 'd' })
  assert.deepEqual(policies.sku, { create: true, update: false })
  assert.deepEqual(policies.stock, { create: false, update: false }, 'an unmapped field is never written')
  const values = { title: 'T', price: '10', sku: 'S1', description: 'D', stock: 5 }
  assert.deepEqual(Object.keys(mapping.allowedValues(values, policies, 'create', 'update')).sort(), ['description', 'sku', 'title'])
  assert.deepEqual(Object.keys(mapping.allowedValues(values, policies, 'update', 'update')), ['description'])
  assert.deepEqual(mapping.allowedValues(values, policies, 'update', 'skip'), {})
  // fill-empty keeps what the row already has
  assert.deepEqual(Object.keys(mapping.allowedValues(values, policies, 'update', 'fill-empty', { description: 'current' })), [])
  assert.deepEqual(Object.keys(mapping.allowedValues(values, policies, 'update', 'fill-empty', { description: '' })), ['description'])
  // replace never overrides an update switched off (price stays untouched)
  assert.deepEqual(Object.keys(mapping.allowedValues(values, policies, 'update', 'replace')), ['description'])
  assert.deepEqual(mapping.missingForCreate(FIELDS, policies).map((f) => f.key), ['price'])
})

test('settings from the wizard are untrusted', () => {
  const s = settingsMod.normalizeSettings({ existing: 'drop-table', source: 'Supplier A!', mapping: { title: 'name', evil: 'x' }, attributes: Array.from({ length: 80 }, (_x, i) => ({ source: `c${i}`, name: `A${i}`, variation: true })), variants: { mode: 'weird' } }, 'store', FIELDS, [])
  assert.equal(s.existing, 'skip')
  assert.equal(s.source, 'supplier-a')
  assert.deepEqual(s.mapping, { title: 'name' })
  assert.equal(s.variants.mode, 'none')
  assert.ok(s.attributes.length <= 60 && s.attributes.every((a) => !a.variation), 'no variation attributes without variants')
})

// ------------------------------------------------------------------ values

test('values: numbers, money, booleans, dates, durations, URLs and attribute values', () => {
  assert.equal(values.toNumber('۱٬۲۵۰٬۰۰۰ تومان'), 1250000)
  assert.equal(values.toMoney('12,500.50'), '12500.5')
  assert.equal(values.toBool('بله'), true)
  assert.equal(values.toBool('no'), false)
  assert.equal(values.toDate('1403/01/01').toISOString().slice(0, 10), '2024-03-20')
  assert.equal(values.toDuration('3:45'), 225)
  assert.equal(values.toDuration('1:02:03'), 3723)
  assert.equal(values.toDuration('۲۲۵'), 225)
  assert.equal(values.toDuration('3m 5s'), 185)
  assert.throws(() => values.toDuration('3:75'))
  assert.throws(() => values.toUrl('javascript:alert(1)'))
  assert.throws(() => values.toUrl('file:///etc/passwd'))
  assert.equal(values.toUrl('/api/media/covers/x.webp'), '/api/media/covers/x.webp')
  assert.equal(values.normalizeValue('256GB'), values.normalizeValue('256 gb'))
  assert.equal(values.normalizeValue('۲۵۶ گیگ'), values.normalizeValue('256GB'))
  assert.equal(values.normalizeName('كتاب  عربي'), values.normalizeName('کتاب عربی'))
  assert.deepEqual(values.toCategoryPaths('Electronics > Mobile > Apple, Cables'), [['Electronics', 'Mobile', 'Apple'], ['Cables']])
  // one bad field is an error on that field only
  const typed = coerce.coerceValues([F('price', { type: 'money' }), F('title')], { price: 'abc', title: 'OK' })
  assert.equal(typed.values.title, 'OK')
  assert.ok(!('price' in typed.values) && typed.messages.length === 1)
})

// ------------------------------------------------------------------ SSRF rules

test('remote addresses: only public http(s)', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2002:a00:1::1', 'ff02::1'])
    assert.equal(net.isBlockedAddress(ip), true, ip)
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5']) assert.equal(net.isBlockedAddress(ip), false, ip)
  for (const url of ['file:///etc/passwd', 'ftp://example.com/a.png', 'gopher://x', 'http://localhost/a.png', 'http://metadata/computeMetadata', 'http://x.internal/a', 'http://printer.local/a', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/a', 'http://user:pw@example.com/a', 'http://example.com:22/a', 'http://2130706433/a'])
    assert.throws(() => net.checkRemoteUrl(url), url)
  assert.equal(net.checkRemoteUrl('https://cdn.example.com/p.png').hostname, 'cdn.example.com')
})

// ------------------------------------------------------------------ items (nested, flat)

const base = (extra) => settingsMod.normalizeSettings({ mapping: { title: 'title', sku: 'parent_sku' }, ...extra }, 'store', FIELDS, [F('price', { type: 'money' }), F('sku')])

test('flat rows group into one product; ambiguity is reported', () => {
  const rows = [
    { parent_sku: 'IP17', title: 'iPhone 17', color: 'Orange', storage: '128GB', price: '1' },
    { parent_sku: 'IP17', title: 'iPhone 17', color: 'Orange', storage: '256GB', price: '2' },
    { parent_sku: 'IP17', title: 'iPhone 17 Pro', color: 'White', storage: '128GB', price: '3' },
    { parent_sku: '', title: 'Loose', color: 'Black', storage: '64GB', price: '4' },
  ]
  const s = base({ variants: { mode: 'flat', groupBy: 'parent_sku' }, variantMapping: { price: 'price' }, attributes: [{ source: 'color', name: 'Color', variation: true }, { source: 'storage', name: 'Storage', variation: true }] })
  const built = items.buildItems(rows, s)
  assert.equal(built.length, 2)
  assert.equal(built[0].variants.length, 3)
  assert.deepEqual(built[0].variantAttributes[1], { Color: 'Orange', Storage: '256GB' })
  assert.deepEqual(built[0].rows, [1, 2, 3])
  assert.match(built[0].notes[0].text, /مقدار متفاوت/)
  assert.match(built[1].notes[0].text, /خالی/)
})

test('nested variants; specifications stay on the product, not on every variant', () => {
  const rows = [{ title: 'iPhone 17', specs: { Camera: '48MP', Battery: '3500mAh' }, variants: [{ color: 'Orange', storage: '256GB', price: 100 }, { color: 'White', storage: '256GB', price: 100 }] }]
  const s = base({ variants: { mode: 'nested', source: 'variants' }, variantMapping: { price: 'variants[].price' }, specsSource: 'specs', attributes: [{ source: 'variants[].color', name: 'Color', variation: true }, { source: 'variants[].storage', name: 'Storage', variation: true }] })
  const [item] = items.buildItems(rows, s)
  assert.deepEqual(item.specs, { Camera: '48MP', Battery: '3500mAh' })
  assert.equal(item.variants.length, 2)
  assert.ok(item.variantAttributes.every((a) => !('Camera' in a)))
  assert.deepEqual(items.duplicateCombinations([{ C: 'Red', S: '256GB' }, { C: 'red', S: '256 gb' }], values.normalizeValue), [1])
})

// ------------------------------------------------------------------ store rules

test('store rules: price split, options, variant identity, product type', () => {
  assert.deepEqual(store.splitPrice('1000', '800'), { price: '800', compareAt: '1000' })
  assert.deepEqual(store.splitPrice('1000', '1200'), { price: '1000', compareAt: null })
  assert.deepEqual(store.splitPrice(null, null), { price: null, compareAt: null })
  const storage = { key: 'storage', label: 'Storage', labelEn: '', kind: 'select', options: ['128GB', '256 GB', '512GB'], required: false, variant: true }
  assert.equal(store.matchOption(storage, '256gb'), '256 GB')
  assert.equal(store.matchOption(storage, '1TB'), null, 'a value outside the options is never stored silently')
  const fields = [storage, { key: 'camera', label: 'دوربین', labelEn: 'Camera', kind: 'text', options: [], required: false, variant: false }]
  assert.equal(store.findAttribute(fields, 'camera').key, 'camera')
  assert.equal(store.findAttribute(fields, 'Cable Length'), null)
  assert.equal(store.findAttribute(fields, 'Kamera', { Kamera: 'camera' }).key, 'camera')
  assert.equal(store.combinationKey({ storage: '256 GB', color: 'Orange' }), store.combinationKey({ color: 'orange', storage: '256gb' }))
  assert.equal(store.generatedSku('IP17', { color: 'Orange', storage: '256GB' }), store.generatedSku('IP17', { storage: '256 gb', color: 'orange' }))
  assert.equal(store.detectKind({ weight: 200, dimensions: '10x5' }).kind, 'PHYSICAL')
  assert.equal(store.detectKind({ license_key: 'x', download_url: 'y' }).kind, 'VIRTUAL')
  assert.equal(store.detectKind({ title: 'Mystery' }).kind, null, 'uncertain → no guess')
  assert.equal(store.stockOf(null, 'in'), -1)
  assert.equal(store.stockOf(7, 'out'), 7)
})

// ------------------------------------------------------------------ reports and output safety

test('CSV exports cannot run formulas; JSON-LD cannot close its script', () => {
  assert.equal(report.csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`)
  for (const bad of ['+1', '-1+2', '@SUM(A1)', '\tcmd', '\rcmd']) assert.ok(report.csvCell(bad).replace(/^"/, '').startsWith("'"), bad)
  assert.equal(report.csvCell('Plain'), 'Plain')
  assert.ok(report.toCsv(['a'], [['=1']]).startsWith('﻿'))
  const ld = safeJsonLd({ name: '</script><script>alert(1)</script>', note: 'a & b' })
  assert.ok(!ld.includes('<') && !ld.includes('>') && !ld.includes('&'))
  assert.equal(JSON.parse(ld).name, '</script><script>alert(1)</script>')
})

// ------------------------------------------------------------------ remote images (SSRF at connect time, redirects, limits)

function loadMedia({ allowLoopback = false, dnsTable = {} } = {}) {
  const realDns = require('node:dns')
  const dns = { ...realDns, lookup: (host, options, callback) => (host in dnsTable ? callback(null, dnsTable[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))) : realDns.lookup(host, options, callback)) }
  const stored = []
  const media = load('src/modules/imports/server/media.ts', {
    'node:dns': dns,
    '@/platform/database/prisma': { db: {} },
    '@/platform/config/env': { env: (name) => (name === 'IMPORT_ALLOW_LOOPBACK' && allowLoopback ? '1' : '') },
    '@/modules/site/server/cover-store': { CoverImageError: class extends Error {}, storeCoverImage: async (bytes) => { stored.push(bytes); return '/api/media/covers/x.webp' } },
  })
  return { media, stored }
}
function server(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)) })
}

test('downloader: internal addresses refused, also through DNS and redirects', async () => {
  const { media } = loadMedia({ dnsTable: { 'rebind.test': ['10.0.0.7'], 'mixed.test': ['93.184.216.34', '127.0.0.1'] } })
  await assert.rejects(media.safeFetch('http://127.0.0.1/a.png'), /داخلی|internal/i)
  await assert.rejects(media.safeFetch('http://169.254.169.254/latest/meta-data/'), /داخلی|رزرو/)
  // The name looks public, but resolves to a private address: refused when the socket resolves it.
  await assert.rejects(media.safeFetch('http://rebind.test/a.png'), /داخلی/)
  await assert.rejects(media.safeFetch('http://mixed.test/a.png'), /داخلی/)
})

test('downloader: redirects are re-checked, limited, and size/time are enforced while reading', async () => {
  const { media } = loadMedia({ allowLoopback: true, dnsTable: { 'lan.test': ['192.168.1.20'] } })
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d2f0a40000000049454e44ae426082', 'hex')
  let hits = 0
  const s = await server((req, res) => {
    hits++
    if (req.url === '/ok.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(png) }
    if (req.url === '/to-metadata') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); return res.end() }
    if (req.url === '/to-lan') { res.writeHead(302, { location: 'http://lan.test/a.png' }); return res.end() }
    if (req.url === '/to-file') { res.writeHead(302, { location: 'file:///etc/passwd' }); return res.end() }
    if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end() }
    if (req.url === '/big') { res.writeHead(200, { 'content-type': 'image/png' }); const chunk = Buffer.alloc(1024 * 1024); let n = 0; const push = () => { while (n++ < 20) if (!res.write(chunk)) return res.once('drain', push); res.end() }; return push() }
    if (req.url === '/slow') return setTimeout(() => res.end('late'), 3000)
    res.writeHead(404); res.end()
  })
  const at = `http://127.0.0.1:${s.address().port}`
  try {
    const ok = await media.safeFetch(`${at}/ok.png`)
    assert.equal(ok.bytes.length, png.length)
    await assert.rejects(media.safeFetch(`${at}/to-metadata`), /داخلی|رزرو/)
    await assert.rejects(media.safeFetch(`${at}/to-lan`), /داخلی/, 'a redirect to a name resolving into the LAN is refused at connect time')
    await assert.rejects(media.safeFetch(`${at}/to-file`), /پروتکل/)
    await assert.rejects(media.safeFetch(`${at}/loop`), /تغییر مسیر/)
    await assert.rejects(media.safeFetch(`${at}/big`), /حجم/)
    const saved = media.MEDIA_LIMITS.timeoutMs
    media.MEDIA_LIMITS.timeoutMs = 400
    await assert.rejects(media.safeFetch(`${at}/slow`), /زمان/)
    media.MEDIA_LIMITS.timeoutMs = saved
    await assert.rejects(media.safeFetch(`${at}/missing.png`), /404/)
    assert.ok(hits >= 6)
  } finally { s.close() }
})

// ------------------------------------------------------------------ wiring and architecture

test('import commands preserve state guards and immediate background queue nudge', async () => {
  const updates = [], queued = [], ran = [], logged = []
  class ImportError extends Error {}
  const core = { ImportError, adapterFor: () => ({}), ensureModule: async () => {}, settingsFor: () => ({ options: {} }), settingsHash: () => 'current' }
  const commands = load('src/modules/imports/server/commands.ts', {
    '@/platform/database/prisma': { db: { importJob: { update: async args => { updates.push(args); return args.data } } } },
    '@/platform/observability/logger': { logEvent: (...args) => logged.push(args) },
    '@/modules/imports/server/files': {}, '@/modules/imports/server/execution': core,
    '@/modules/operations/server/queue': { enqueue: async (kind, payload) => queued.push({ kind, payload }), runQueue: async budget => { ran.push(budget); throw Error('queue nudge failure') } },
  })
  await assert.rejects(commands.startJob({ status: 'DONE' }, {}), ImportError)
  await assert.rejects(commands.startJob({ status: 'DRAFT', dryRun: '{}' }, {}), ImportError)
  assert.equal(updates.length, 0)
  const job = { id: 7, status: 'DRAFT', fileHash: 'file', dryRun: JSON.stringify({ settingsHash: 'current', fileHash: 'file', total: 3 }) }
  assert.equal((await commands.startJob(job, {})).status, 'QUEUED')
  await commands.setJobState({ id: 7, status: 'RUNNING' }, 'pause')
  await commands.setJobState({ id: 7, status: 'PAUSED' }, 'resume')
  await commands.setJobState({ id: 7, status: 'RUNNING' }, 'cancel')
  await assert.rejects(commands.startRollback({ id: 7, status: 'RUNNING' }), ImportError)
  await commands.startRollback({ id: 7, status: 'DONE' })
  assert.deepEqual(updates.map(update => update.data.status), ['QUEUED', 'PAUSED', 'QUEUED', 'CANCELLED', 'ROLLING_BACK'])
  assert.deepEqual(queued.map(job => job.kind), ['imports.run', 'imports.run', 'imports.rollback'])
  assert.ok(queued.every(job => job.payload.jobId === 7))
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.deepEqual(ran, [40_000, 40_000, 40_000])
  assert.ok(logged.every(args => args[1] === 'imports.queue_failed'))
  assert.equal(logged.length, 3)
})

test('bulk import wiring: own permission, audit, real models, no parallel systems', () => {
  const rbac = read('src/modules/identity/rbac.ts')
  assert.match(rbac, /'imports\.manage'/)
  assert.match(read('prisma/system-roles.json'), /imports\.manage/)
  const routes = read('src/modules/imports/server/http/routes.ts')
  assert.match(routes, /adminGuard\(req, null, \['imports\.manage'\]\)/)
  assert.ok(!routes.includes('settings.manage'), 'imports never fall back to settings.manage')
  for (const action of ['import.file_uploaded', 'import.mapping_saved', 'import.template_created', 'import.started', 'import.paused', 'import.resumed', 'import.cancelled', 'import.rollback_started', 'import.variants_delete_confirmed']) assert.ok(routes.includes(`'${action}'`) || routes.includes(action.replace(/^import\./, '')), action)
  const engine = read('src/modules/imports/server/execution.ts')
  assert.match(engine, /'import\.completed'/)
  assert.match(engine, /'import\.rolled_back'/)
  assert.match(read('src/modules/operations/server/queue.ts'), /'imports\.run'/, 'slices run on the BackgroundJob queue')
  const schema = read('prisma/schema.prisma')
  for (const model of ['ImportJob', 'ImportTemplate', 'ImportRecord', 'ImportExternalRef', 'ImportMedia']) assert.match(schema, new RegExp(`model ${model} \\{`))
  for (const parallel of ['Attribute', 'AttributeValue', 'ProductAttributeValue', 'MagazineArticle', 'Article', 'MagazinePost', 'Movie', 'Series', 'ImportedMediaAsset', 'ImportVariant']) assert.doesNotMatch(schema, new RegExp(`^model ${parallel} \\{`, 'm'), parallel)
  assert.match(schema, /@@unique\(\[source, entityType, externalId\]\)/)
  assert.equal(read('prisma/schema.prisma').replace(/provider\s*=\s*"[^"]+"/g, ''), read('prisma/schema.postgresql.prisma').replace(/provider\s*=\s*"[^"]+"/g, ''))
  const storeAdapter = read('src/modules/imports/server/adapters/store.ts')
  assert.match(storeAdapter, /inheritedAttributeGroup/, 'the store group resolver is shared, not copied')
  assert.match(storeAdapter, /validateSpecifications/, 'the store spec validator is used')
  assert.match(storeAdapter, /missingVariants: pick\(raw\.missingVariants, \['keep', 'disable', 'delete'\], 'keep'\)/)
  assert.doesNotMatch(storeAdapter, /saveVariants\(/, 'the form save path (which disables missing variants) is not used')
  assert.match(read('src/modules/imports/server/adapters/magazine.ts'), /row\.categories = .*create: categoryIds\.map/, 'posts use PostCategoryAssignment rows')
  assert.match(read('src/modules/imports/server/adapters/sections.ts'), /fixed: \{ kind: 'SERIES' \}/)
  assert.match(read('src/modules/imports/server/media.ts'), /storeCoverImage/, 'images go through the site image store')
  assert.match(read('src/modules/site/server/http/admin/media/route.ts'), /storeCoverImage/)
  for (const file of ['src/modules/catalog/server/pages/products/[slug]/page.tsx', 'src/modules/site/server/pages/blog/[slug]/page.tsx', 'src/app/cinema/[slug]/page.tsx', 'src/app/layout.tsx']) assert.match(read(file), /safeJsonLd\(/, file)
})
