/* Bulk import end-to-end, against a local dev server and its database.
   Creates only its own uniquely marked fixtures and removes them at the end.
   Run: IMPORT_ALLOW_LOOPBACK=1 npm run dev   (the local image server is on loopback)
        node --env-file=.env scripts/imports.integration.cjs */
const assert = require('node:assert/strict')
const http = require('node:http')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const sharp = require('sharp')

const db = new PrismaClient()
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Integration checks are restricted to localhost')
const m = `imp${Date.now().toString(36)}`
const M = m.toUpperCase()
const results = []
const scope = process.env.IMPORT_TEST_SCOPE || 'full'
if (!['full', 'modules'].includes(scope)) throw Error('Unknown IMPORT_TEST_SCOPE')
const pass = (name) => { results.push(name); console.log(`PASS: ${name}`) }

let cookie = ''
async function session(user, roleId = null) {
  const name = (process.env.NEXTAUTH_URL || base).startsWith('https:') ? '__Secure-next-auth.session-token' : 'next-auth.session-token'
  return `${name}=${await encode({ secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret-change-me', token: { uid: String(user.id), role: 'ADMIN', roleId, email: user.email, authAt: Date.now() }, maxAge: 3600 })}`
}
async function call(body, as = cookie) {
  const response = await fetch(`${base}/api/admin/imports`, { method: 'POST', headers: { cookie: as, 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) })
  return { status: response.status, data: await response.json().catch(() => null) }
}
async function view(query, as = cookie) {
  const response = await fetch(`${base}/api/admin/imports?${query}`, { headers: { cookie: as } })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: response.status, data }
}
/** The wizard's chunked upload: 8 MB pieces appended in order, the last one with final=1. */
async function upload(adapter, name, content, as = cookie) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content)
  const CHUNK = 8 * 1024 * 1024
  let token = '', last = null
  for (let offset = 0; offset < bytes.length || offset === 0; offset += CHUNK) {
    const final = offset + CHUNK >= bytes.length
    let response
    for (let attempt = 0; attempt < 3; attempt++) { // same retry as the wizard
      response = await fetch(`${base}/api/admin/imports/upload?adapter=${adapter}&offset=${offset}${token ? `&token=${token}` : ''}${final ? '&final=1' : ''}`, { method: 'POST', headers: { cookie: as, origin: base, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) }, body: bytes.subarray(offset, offset + CHUNK) })
      if (response.status < 500) break
    }
    last = { status: response.status, data: await response.json().catch(() => null) }
    if (response.status !== 200 || final) return last
    token = last.data.token
  }
  return last
}
const ok = (r, what) => { assert.equal(r.status, 200, `${what}: ${JSON.stringify(r.data).slice(0, 600)}`); return r.data }

async function waitJob(id, timeout = 300_000) {
  const until = Date.now() + timeout
  for (;;) {
    const job = ok(await view(`view=job&id=${id}`), 'job')
    if (!['QUEUED', 'RUNNING', 'ROLLING_BACK'].includes(job.status)) return job
    if (Date.now() > until) throw new Error(`job ${id} still ${job.status}`)
    await new Promise((r) => setTimeout(r, 700))
  }
}

/** Upload → settings → dry run (→ start and wait). */
async function importFile(adapter, name, content, settings, { start = true } = {}) {
  const up = ok(await upload(adapter, name, typeof content === 'string' ? content : JSON.stringify(content)), `upload ${name}`)
  const id = up.job.id
  ok(await call({ op: 'analyze', id }), 'analyze')
  ok(await call({ op: 'settings', id, settings }), 'settings')
  const dry = ok(await call({ op: 'dry-run', id, settings }), 'dry-run').summary
  if (!start) return { id, dry }
  ok(await call({ op: 'start', id, settings }), 'start')
  const job = await waitJob(id)
  return { id, dry, job }
}
async function records(id) {
  const all = []
  for (let page = 1; ; page++) {
    const r = ok(await view(`view=records&id=${id}&page=${page}`), 'records')
    all.push(...r.records)
    if (page >= r.pages) return all
  }
}
const allMessages = (rs) => rs.flatMap((r) => r.messages.map((x) => x.text)).join('\n')

// ------------------------------------------------------------------ local image server (loopback only)

let images
async function imageServer() {
  const png = (color) => sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer()
  const files = { '/p.png': await png('#3355ff'), '/orange.png': await png('#ff8800'), '/white.png': await png('#f5f5f5'), '/black.png': await png('#111111') }
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (files[path]) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(files[path]) }
    if (path === '/fake.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end('<?php echo "not an image"; ?>') }
    if (path === '/to-metadata.png') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); return res.end() }
    res.writeHead(404); res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, url: (p) => `http://127.0.0.1:${server.address().port}${p}` }
}

// ------------------------------------------------------------------ fixtures

const MOBILE_FIELDS = [
  { key: 'camera', label: 'Camera', labelEn: '', kind: 'text', options: [], required: false, variant: false },
  { key: 'ram', label: 'RAM', labelEn: '', kind: 'select', options: ['8GB', '12GB'], required: false, variant: false },
  { key: 'battery', label: 'Battery', labelEn: '', kind: 'text', options: [], required: false, variant: false },
  { key: 'color', label: 'Color', labelEn: '', kind: 'select', options: ['Orange', 'White', 'Black'], required: true, variant: true },
  { key: 'storage', label: 'Storage', labelEn: '', kind: 'select', options: ['128GB', '256GB', '512GB'], required: true, variant: true },
]
const CABLE_FIELDS = [
  { key: 'length', label: 'Length', labelEn: '', kind: 'text', options: [], required: false, variant: false },
  { key: 'connector', label: 'Connector', labelEn: '', kind: 'select', options: ['USB-C', 'Lightning'], required: true, variant: true },
  { key: 'power', label: 'Power', labelEn: '', kind: 'text', options: [], required: false, variant: false },
]
const fx = {}
async function fixtures() {
  fx.mobile = await db.productAttributeGroup.create({ data: { name: `Mobile Phone ${m}`, appliesTo: 'PHYSICAL', fields: JSON.stringify(MOBILE_FIELDS) } })
  fx.cable = await db.productAttributeGroup.create({ data: { name: `Charging Cable ${m}`, appliesTo: 'ANY', fields: JSON.stringify(CABLE_FIELDS) } })
  fx.electronics = await db.productCategory.create({ data: { slug: `${m}-electronics`, name: `Electronics ${m}` } })
  // The group sits on "Mobile"; products land two levels below it and inherit it.
  fx.mobileCat = await db.productCategory.create({ data: { slug: `${m}-mobile`, name: `Mobile ${m}`, parentId: fx.electronics.id, attributeGroupId: fx.mobile.id } })
  fx.cables = await db.productCategory.create({ data: { slug: `${m}-cables`, name: `Cables ${m}`, parentId: fx.electronics.id, attributeGroupId: fx.cable.id } })
}
const PATH = `Electronics ${m} > Mobile ${m} > Apple ${m} > iPhone ${m}`

const STORE_SETTINGS = (extra = {}) => ({
  source: `supplier-${m}`,
  mapping: { externalId: 'id', title: 'title', category: 'category', brand: 'brand', description: 'description', image: 'image', stock: 'stock', ...(extra.mapping || {}) },
  variants: { mode: 'nested', source: 'variants', groupBy: '' },
  variantMapping: { externalId: 'variants[].vid', sku: 'variants[].sku', price: 'variants[].price', stock: 'variants[].stock', image: 'variants[].image', ...(extra.variantMapping || {}) },
  attributes: [
    { source: 'camera', name: 'Camera', variation: false }, { source: 'ram', name: 'RAM', variation: false }, { source: 'battery', name: 'Battery', variation: false },
    { source: 'variants[].color', name: 'Color', variation: true }, { source: 'variants[].storage', name: 'Storage', variation: true },
    ...(extra.attributes || []),
  ],
  existing: extra.existing || 'skip',
  policies: extra.policies || {},
  variantPolicies: extra.variantPolicies || {},
  options: { productType: 'PHYSICAL', groupMode: 'category', currency: 'IRT', ...(extra.options || {}) },
})
const COLORS = ['Orange', 'White'], STORAGES = ['128GB', '256GB']
function product(i, extra = {}) {
  return {
    id: `${m}-p${i}`, title: `iPhone ${m} #${i}`, category: PATH, brand: `Brand ${m} ${i % 5}`,
    description: `<p>Model ${i}</p><script>alert(1)</script><img src="x" onerror="alert(1)">`, image: images.url('/p.png'), stock: 10,
    camera: '48MP', ram: '8GB', battery: `${3000 + i}mAh`,
    variants: COLORS.flatMap((color) => STORAGES.map((storage) => ({
      vid: `${m}-p${i}-${color}-${storage}`, sku: `${M}-P${i}-${color.slice(0, 2).toUpperCase()}-${storage}`, color, storage,
      price: 10_000_000 + i * 1000 + (storage === '256GB' ? 2_000_000 : 0), stock: 5, image: images.url(`/${color.toLowerCase()}.png`),
    }))),
    ...extra,
  }
}

// ------------------------------------------------------------------ scenarios

async function security(admin) {
  // no session, wrong permission, destination switched off in the request
  assert.equal((await view('view=destinations', '')).status, 403)
  const role = await db.role.create({ data: { name: `${m}-settings-only`, permissions: 'dashboard.view,settings.manage' } })
  const staff = await db.user.create({ data: { email: `${m}-staff@example.test`, passwordHash: 'x', role: 'ADMIN', roleId: role.id } })
  fx.staff = staff; fx.role = role
  const staffCookie = await session(staff, role.id)
  assert.equal((await view('view=destinations', staffCookie)).status, 403, 'settings.manage alone must not reach imports')
  assert.equal((await upload('store', 'a.json', '[{"title":"x"}]', staffCookie)).status, 403)
  const d = ok(await view('view=destinations'), 'destinations')
  for (const id of ['store', 'magazine', 'movies', 'series', 'games', 'software', 'music']) assert.ok(d.destinations.some((x) => x.id === id), id)
  // malicious and oversized files
  assert.equal((await upload('store', 'evil.xlsm', Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(40)]))).status, 400)
  const bomb = await upload('store', 'deep.json', '['.repeat(40) + ']'.repeat(40))
  assert.equal(bomb.status, 400); assert.match(bomb.data.error, /عمق/)
  const big = await upload('store', 'big.json', Buffer.alloc(26 * 1024 * 1024, 32))
  assert.equal(big.status, 413)
  const audit = await db.auditLog.count({ where: { action: 'import.file_uploaded', actorUserId: admin.id } })
  pass('authorization (own permission), malicious and oversized files')
  return audit
}

async function variable100() {
  const file = Array.from({ length: 100 }, (_x, i) => product(i))
  const { id, dry } = await importFile('store', `${m}-100.json`, file, STORE_SETTINGS(), { start: false })
  assert.equal(dry.total, 100); assert.equal(dry.invalid, 0, JSON.stringify(dry.problems.slice(0, 3)))
  assert.equal(dry.actions.CREATE, 100)
  assert.equal(dry.counters.variantsCreated, 400)
  assert.equal(dry.counters.brandsCreated, 5)
  assert.equal(dry.counters.categoriesCreated, 2, 'Apple and iPhone are planned once each')
  // the dry run wrote nothing
  assert.equal(await db.productCategory.count({ where: { name: `Apple ${m}` } }), 0)
  assert.equal(await db.productBrand.count({ where: { name: { startsWith: `Brand ${m}` } } }), 0)
  assert.equal(await db.product.count({ where: { name: { startsWith: `iPhone ${m} #` } } }), 0)
  assert.equal(await db.productAttributeGroup.count({ where: { name: { contains: m } } }), 2)
  ok(await call({ op: 'start', id, settings: STORE_SETTINGS() }), 'start')
  const job = await waitJob(id)
  assert.equal(job.status, 'DONE', JSON.stringify(job.stats))
  assert.equal(job.stats.created, 100)
  const leaf = await db.productCategory.findFirst({ where: { name: `iPhone ${m}` }, include: { parent: true } })
  assert.equal(leaf.parent.name, `Apple ${m}`)
  assert.equal(leaf.attributeGroupId, null, 'the leaf inherits the group from Mobile; no link is written')
  const products = await db.product.findMany({ where: { name: { startsWith: `iPhone ${m} #` } }, include: { variants: true } })
  assert.equal(products.length, 100)
  assert.ok(products.every((p) => p.categoryId === leaf.id), 'single category: the leaf')
  assert.ok(products.every((p) => p.kind === 'PHYSICAL' && p.currency === 'IRT'))
  assert.equal(await db.productBrand.count({ where: { name: { startsWith: `Brand ${m}` } } }), 5)
  const sample = products.find((p) => p.name === `iPhone ${m} #7`)
  assert.deepEqual(JSON.parse(sample.specifications), { camera: '48MP', ram: '8GB', battery: '3007mAh' })
  assert.ok(!/script|onerror/.test(sample.description), 'imported HTML is sanitized')
  assert.equal(sample.variants.length, 4)
  const v = sample.variants.find((x) => x.sku === `${M}-P7-OR-256GB`)
  assert.deepEqual(JSON.parse(v.attributes), { color: 'Orange', storage: '256GB' }, 'variants carry only variation attributes')
  assert.equal(v.priceMinor, 12_007_000n); assert.equal(v.stock, 5)
  assert.equal(sample.priceMinor, 10_007_000n, 'a new variable product without a base price takes its lowest variant price')
  assert.equal(await db.productVariant.count({ where: { sku: { startsWith: `${M}-P` } } }), 400)
  // images: through the site store, one file per distinct picture
  assert.match(sample.image, /^\/api\/media\/covers\/[0-9a-f-]{36}\.webp$/)
  assert.equal(new Set(products.map((p) => p.image)).size, 1, 'the same remote image is stored once')
  assert.match(v.image, /^\/api\/media\/covers\//)
  assert.equal(new Set(products.flatMap((p) => p.variants.map((x) => x.image))).size, 2, 'orange and white variant pictures')
  // 100 product images + 400 variant images, each resolved once per product/variant; identical content is stored once.
  assert.equal((job.stats.imagesDownloaded || 0) + (job.stats.imagesReused || 0), 500, JSON.stringify(job.stats))
  assert.ok((job.stats.imagesDownloaded || 0) <= 3, 'at most one download per distinct remote address')
  assert.ok(!job.stats.imagesFailed)
  // external ids are kept per source
  assert.equal(await db.importExternalRef.count({ where: { source: `supplier-${m}`, entityType: 'store.product' } }), 100)
  assert.equal(await db.importExternalRef.count({ where: { source: `supplier-${m}`, entityType: 'store.variant' } }), 400)
  pass('100 variable products: categories, brands, inherited group, attributes, variants, prices, stock, images')

  // Same file again, existing records updated: nothing is duplicated.
  const again = await importFile('store', `${m}-100b.json`, file, STORE_SETTINGS({ existing: 'update' }))
  assert.equal(again.dry.actions.UPDATE, 100)
  assert.ok(['DONE', 'DONE_WITH_ERRORS'].includes(again.job.status))
  assert.equal(await db.product.count({ where: { name: { startsWith: `iPhone ${m} #` } } }), 100)
  assert.equal(await db.productVariant.count({ where: { sku: { startsWith: `${M}-P` } } }), 400)
  assert.equal(await db.productBrand.count({ where: { name: { startsWith: `Brand ${m}` } } }), 5)
  pass('same import twice: no duplicate products, variants or brands')
  return id
}

async function attributesAndOptions() {
  const cableSpec = product(200, { id: `${m}-p200`, title: `iPhone ${m} cable-spec`, variants: product(200).variants.slice(0, 1), cable_length: '1m' })
  const extra = { attributes: [{ source: 'cable_length', name: 'Cable Length', variation: false }] }
  // reject: the record fails and the dry run names attribute, product and group
  let r = await importFile('store', `${m}-unknown.json`, [cableSpec], STORE_SETTINGS({ ...extra, options: { missingAttributes: 'reject' } }), { start: false })
  assert.equal(r.dry.invalid, 1)
  const finding = r.dry.findings.find((f) => f.type === 'unknownAttribute')
  assert.equal(finding.attribute, 'Cable Length'); assert.equal(finding.group, `Mobile Phone ${m}`); assert.match(finding.product, /cable-spec/); assert.equal(finding.outcome, 'rejected')
  // ignore (default): imported without it
  r = await importFile('store', `${m}-unknown2.json`, [cableSpec], STORE_SETTINGS(extra))
  const p = await db.product.findFirst({ where: { name: `iPhone ${m} cable-spec` } })
  assert.ok(!('cable_length' in JSON.parse(p.specifications)) && !JSON.stringify(JSON.parse(p.specifications)).includes('1m'))
  assert.equal((await db.productAttributeGroup.findUnique({ where: { id: fx.mobile.id } })).fields, JSON.stringify(MOBILE_FIELDS), 'the group is not changed')
  pass('mobile product rejects/ignores a cable-only attribute (reported with product and group)')

  // cable product forced into the Mobile category with the cable group: refused
  const cable = { id: `${m}-c1`, title: `Cable ${m}`, category: PATH, image: images.url('/p.png'), variants: [{ vid: `${m}-c1-a`, sku: `${M}-C1-A`, connector: 'USB-C', price: 50000 }] }
  r = await importFile('store', `${m}-wrong-group.json`, [cable], { ...STORE_SETTINGS(), attributes: [{ source: 'variants[].connector', name: 'Connector', variation: true }], options: { productType: 'PHYSICAL', groupMode: 'fixed', groupFixed: fx.cable.id } }, { start: false })
  assert.equal(r.dry.invalid, 1)
  assert.match(allMessages(r.dry.problems), /مجاز نیست|نامرتبط/)
  pass('wrong attribute group for the category is refused')

  // a value outside the options: reject (default) → map → add
  const tb = product(300, { id: `${m}-p300`, title: `iPhone ${m} 1TB`, variants: [{ vid: `${m}-p300-o1t`, sku: `${M}-P300-OR-1TB`, color: 'Orange', storage: '1TB', price: 40_000_000, stock: 1 }] })
  r = await importFile('store', `${m}-1tb.json`, [tb], STORE_SETTINGS(), { start: false })
  const opt = r.dry.findings.find((f) => f.type === 'newOption')
  assert.equal(opt.label, 'Storage'); assert.equal(opt.value, '1TB'); assert.equal(opt.group, `Mobile Phone ${m}`); assert.equal(opt.outcome, 'rejected')
  assert.deepEqual(opt.options, ['128GB', '256GB', '512GB'])
  r = await importFile('store', `${m}-1tb-map.json`, [tb], STORE_SETTINGS({ options: { missingValues: 'map', optionMap: { [opt.mapKey]: '512GB' } } }), { start: false })
  assert.equal(r.dry.invalid, 0); assert.equal(r.dry.findings[0].outcome, 'mapped')
  r = await importFile('store', `${m}-1tb-add.json`, [tb], STORE_SETTINGS({ options: { missingValues: 'add' } }))
  const fields = JSON.parse((await db.productAttributeGroup.findUnique({ where: { id: fx.mobile.id } })).fields)
  assert.deepEqual(fields.find((f) => f.key === 'storage').options, ['128GB', '256GB', '512GB', '1TB'], 'the option is appended, nothing else changes')
  assert.equal(fields.length, MOBILE_FIELDS.length)
  assert.deepEqual(fields.find((f) => f.key === 'camera'), MOBILE_FIELDS[0])
  pass('unknown attribute option follows the configured policy (reject / map / add)')
}

async function variantPolicies() {
  const four = product(400, { id: `${m}-p400`, title: `iPhone ${m} policy` })
  await importFile('store', `${m}-p400.json`, [four], STORE_SETTINGS())
  const productRow = await db.product.findFirst({ where: { name: `iPhone ${m} policy` } })
  const before = await db.productVariant.findMany({ where: { productId: productRow.id }, orderBy: { id: 'asc' } })
  assert.equal(before.length, 4)
  const orangeOnly = { ...four, variants: four.variants.filter((v) => v.color === 'Orange').map((v) => ({ ...v, price: v.price + 1, stock: 99 })) }

  // default KEEP: the white variants are not touched
  let r = await importFile('store', `${m}-keep.json`, [orangeOnly], STORE_SETTINGS({ existing: 'update', variantPolicies: { price: { create: true, update: false }, stock: { create: true, update: true } } }))
  assert.equal(r.job.status, 'DONE')
  let now = await db.productVariant.findMany({ where: { productId: productRow.id }, orderBy: { id: 'asc' } })
  for (const white of before.filter((v) => JSON.parse(v.attributes).color === 'White')) {
    const same = now.find((v) => v.id === white.id)
    assert.deepEqual([same.active, same.priceMinor, same.stock, same.sku], [white.active, white.priceMinor, white.stock, white.sku])
  }
  // partial variant update: stock written, price (update off) untouched
  for (const orange of now.filter((v) => JSON.parse(v.attributes).color === 'Orange')) {
    assert.equal(orange.stock, 99)
    assert.equal(orange.priceMinor, before.find((v) => v.id === orange.id).priceMinor)
  }
  assert.equal(now.length, 4)
  pass('missing imported variants default to KEEP; partial variant update (stock yes, price no)')

  // excluded price does not modify an existing product
  const priced = { ...four, price: 99_000_000, stock: 3 }
  r = await importFile('store', `${m}-price-off.json`, [priced], STORE_SETTINGS({ existing: 'update', mapping: { price: 'price' }, policies: { price: { create: false, update: false }, stock: { create: true, update: true } } }))
  const afterPrice = await db.product.findUnique({ where: { id: productRow.id } })
  assert.equal(afterPrice.priceMinor, productRow.priceMinor); assert.equal(afterPrice.stock, 3)
  // excluded price prevents creation when nothing else can price it
  r = await importFile('store', `${m}-price-new.json`, [{ id: `${m}-simple`, title: `Simple ${m}`, category: `Cables ${m}`, price: 5000, length: '1m' }],
    { source: `supplier-${m}`, mapping: { externalId: 'id', title: 'title', category: 'category', price: 'price' }, policies: { price: { create: false, update: false } }, options: { productType: 'PHYSICAL', groupMode: 'none' } }, { start: false })
  assert.equal(r.dry.invalid, 1)
  assert.match(allMessages(r.dry.problems), /قیمت.*کنار گذاشته شده و مقدار جایگزین معتبری وجود ندارد/)
  // and a new variant without an allowed price is refused too
  const newVariant = { ...four, variants: [{ vid: `${m}-p400-black`, sku: `${M}-P400-BL-128GB`, color: 'Black', storage: '128GB', price: 1, stock: 1 }] }
  r = await importFile('store', `${m}-variant-price-off.json`, [newVariant], STORE_SETTINGS({ existing: 'update', variantPolicies: { price: { create: false, update: false } } }), { start: false })
  assert.match(allMessages(r.dry.problems), /قیمت تنوع/)
  pass('excluded price: existing product untouched; creation refused without a valid price')

  // DISABLE
  r = await importFile('store', `${m}-disable.json`, [orangeOnly], STORE_SETTINGS({ existing: 'update', options: { missingVariants: 'disable' } }))
  now = await db.productVariant.findMany({ where: { productId: productRow.id } })
  assert.ok(now.filter((v) => JSON.parse(v.attributes).color === 'White').every((v) => !v.active))
  assert.ok(now.filter((v) => JSON.parse(v.attributes).color === 'Orange').every((v) => v.active))
  // DELETE needs its own confirmation
  const del = await importFile('store', `${m}-delete.json`, [orangeOnly], STORE_SETTINGS({ existing: 'update', options: { missingVariants: 'delete' } }), { start: false })
  const refused = await call({ op: 'start', id: del.id, settings: STORE_SETTINGS({ existing: 'update', options: { missingVariants: 'delete' } }) })
  assert.equal(refused.status, 400)
  const confirmed = STORE_SETTINGS({ existing: 'update', options: { missingVariants: 'delete', confirmDelete: true } })
  r = await importFile('store', `${m}-delete2.json`, [orangeOnly], confirmed)
  assert.equal(await db.productVariant.count({ where: { productId: productRow.id } }), 2)
  assert.equal(await db.auditLog.count({ where: { action: 'import.variants_delete_confirmed', targetId: String(r.id) } }), 1)
  pass('missing variants: DISABLE, and DELETE only with separate confirmation (audited)')
}

async function flatFile() {
  const csv = ['parent_sku,title,category,color,storage,price,camera',
    `${M}-FLAT,Flat ${m},${PATH},Orange,128GB,1000000,12MP`,
    `${M}-FLAT,Flat ${m},${PATH},Orange,256GB,1200000,12MP`,
    `${M}-FLAT,Flat ${m},${PATH},White,128GB,1000000,12MP`].join('\n')
  const settings = {
    source: `supplier-${m}`, mapping: { sku: 'parent_sku', title: 'title', category: 'category' }, variants: { mode: 'flat', groupBy: 'parent_sku', source: '' },
    variantMapping: { price: 'price' }, attributes: [{ source: 'camera', name: 'Camera', variation: false }, { source: 'color', name: 'Color', variation: true }, { source: 'storage', name: 'Storage', variation: true }],
    options: { productType: 'PHYSICAL', groupMode: 'category' },
  }
  const r = await importFile('store', `${m}-flat.csv`, csv, settings)
  assert.equal(r.dry.total, 1); assert.equal(r.job.stats.created, 1)
  const p = await db.product.findFirst({ where: { sku: `${M}-FLAT` }, include: { variants: true } })
  assert.equal(p.variants.length, 3)
  assert.deepEqual(JSON.parse(p.specifications), { camera: '12MP' })
  const again = await importFile('store', `${m}-flat2.csv`, csv, { ...settings, existing: 'update' })
  assert.equal(again.dry.actions.UPDATE, 1)
  assert.equal(await db.productVariant.count({ where: { productId: p.id } }), 3)
  pass('flat CSV rows group into one product; re-import creates no duplicate variants')
}

async function magazineCinemaMusic() {
  // Magazine: Post + PostCategory + PostCategoryAssignment
  const posts = [{ id: `${m}-a1`, title: `Article ${m}`, content: `<p>Hello</p><script>steal()</script>`, categories: `News ${m} > Tech ${m}, Reviews ${m}` }]
  let r = await importFile('magazine', `${m}-posts.json`, posts, { source: `mag-${m}`, mapping: { externalId: 'id', title: 'title', content: 'content', categories: 'categories' } })
  assert.equal(r.job.status, 'DONE', JSON.stringify(r.job))
  const post = await db.post.findFirst({ where: { title: `Article ${m}` }, include: { categories: { include: { category: true } } } })
  assert.ok(post && !post.content.includes('script'))
  assert.deepEqual(post.categories.map((c) => c.category.name).sort(), [`Reviews ${m}`, `Tech ${m}`])
  assert.equal(await db.productCategory.count({ where: { name: { in: [`News ${m}`, `Tech ${m}`] } } }), 0, 'magazine categories never become store categories')
  pass('magazine uses Post / PostCategory / PostCategoryAssignment; HTML sanitized')
  if (scope === 'modules') {
    ok(await call({ op: 'rollback', id: r.id, confirm: true }), 'module rollback')
    assert.equal((await waitJob(r.id)).status, 'ROLLED_BACK')
    assert.equal(await db.post.findUnique({ where: { id: post.id } }), null)
    pass('existing rollback command dispatches the worker and removes only its imported article')
  }

  // Movie and series on CinemaTitle; seasons/episodes without duplicates
  r = await importFile('movies', `${m}-movies.json`, [{ id: `${m}-mv`, title: `Film ${m}`, imdb: 'tt9990001', year: 2024 }], { source: `imdb-${m}`, mapping: { externalId: 'id', title: 'title', imdbId: 'imdb', year: 'year' } })
  const movie = await db.cinemaTitle.findFirst({ where: { title: `Film ${m}` } })
  assert.equal(movie.kind, 'MOVIE')
  const episodeUrl=`https://cdn.example.invalid/${m}/pilot.mkv`
  const seriesFile = [{ id: `${m}-sr`, title: `Series ${m}`, episodes: [{ season: 1, episode: 1, title: 'Pilot',summary:'<p><strong>Episode story</strong></p><script>bad()</script>',links:[{url:episodeUrl,quality:'1080p'}] }, { season: 1, episode: 2, title: 'Two' }, { season: 2, episode: 1, title: 'Back' }] }]
  const seriesSettings = { source: `imdb-${m}`, options:{copyAssets:false}, mapping: { externalId: 'id', title: 'title' }, variants: { mode: 'nested', source: 'episodes', groupBy: '' }, variantMapping: { season: 'episodes[].season', episode: 'episodes[].episode', title: 'episodes[].title',summary:'episodes[].summary',links:'episodes[].links' } }
  r = await importFile('series', `${m}-series.json`, seriesFile, seriesSettings)
  const series = await db.cinemaTitle.findFirst({ where: { title: `Series ${m}` }, include: { seasons: { include: { episodes: true } } } })
  assert.equal(series.kind, 'SERIES')
  assert.equal(series.seasons.length, 2); assert.equal(series.seasons.flatMap((s) => s.episodes).length, 3)
  const pilot=series.seasons.find(s=>s.number===1).episodes.find(e=>e.number===1)
  assert.match(pilot.summary,/<strong>/);assert.doesNotMatch(pilot.summary,/<script/)
  assert.equal((await db.mediaLink.findFirstOrThrow({where:{ownerType:'episode',ownerId:pilot.id}})).url,episodeUrl,'unchecked copy keeps the external episode file')
  r = await importFile('series', `${m}-series2.json`, seriesFile, { ...seriesSettings, existing: 'update' })
  const again = await db.cinemaSeason.findMany({ where: { titleId: series.id }, include: { episodes: true } })
  assert.equal(again.length, 2); assert.equal(again.flatMap((s) => s.episodes).length, 3)
  assert.equal(await db.mediaLink.count({where:{ownerType:'episode',ownerId:pilot.id,url:episodeUrl}}),1,'re-import keeps one episode link')
  pass('movie and series on CinemaTitle (MOVIE/SERIES) with CinemaSeason/CinemaEpisode, no duplicates')

  // Music: artist → album → track, each artist and album once
  const tracks = [1, 2, 3].map((n) => ({ id: `${m}-t${n}`, title: `Track ${n} ${m}`, artist: `Artist ${m}`, album: `Album ${m}`, duration: `3:0${n}`, no: n }))
  r = await importFile('music', `${m}-music.json`, tracks, { source: `music-${m}`, mapping: { externalId: 'id', title: 'title', artist: 'artist', album: 'album', duration: 'duration', trackNo: 'no' } })
  assert.equal(r.job.stats.created, 3)
  assert.equal(await db.musicArtist.count({ where: { name: `Artist ${m}` } }), 1)
  assert.equal(await db.musicAlbum.count({ where: { title: `Album ${m}` } }), 1)
  const t = await db.musicTrack.findFirst({ where: { title: `Track 2 ${m}` } })
  assert.equal(t.duration, 182)
  pass('music: one artist, one album, three tracks')
}

async function mediaFailures() {
  const bad = [
    product(500, { id: `${m}-p500`, title: `iPhone ${m} fake-image`, image: images.url('/fake.png'), variants: product(500).variants.slice(0, 1) }),
    product(501, { id: `${m}-p501`, title: `iPhone ${m} ssrf-image`, image: images.url('/to-metadata.png'), variants: product(501).variants.slice(0, 1) }),
    product(502, { id: `${m}-p502`, title: `iPhone ${m} metadata`, image: 'http://169.254.169.254/latest/meta-data/iam', variants: product(502).variants.slice(0, 1) }),
  ]
  const r = await importFile('store', `${m}-badimg.json`, bad, STORE_SETTINGS())
  assert.equal(r.job.status, 'DONE', 'a broken image never fails the record')
  assert.equal(r.job.stats.created, 3)
  assert.ok(r.job.stats.imagesFailed >= 3)
  const rs = await records(r.id)
  assert.ok(rs.every((x) => x.status === 'WARNING'))
  assert.match(allMessages(rs), /معتبر نیست|تصویر/)
  assert.match(allMessages(rs), /داخلی|رزرو/)
  const rows = await db.product.findMany({ where: { name: { in: bad.map((b) => b.title) } } })
  assert.ok(rows.every((p) => !p.image.includes('169.254') && !p.image.includes('fake')))
  pass('media: invalid image, redirect to metadata and metadata URL are refused without failing the record')
}

async function jobsControl() {
  // pause → resume, cancel, partial failure, rollback with a conflict
  const file = Array.from({ length: 40 }, (_x, i) => product(600 + i, { id: `${m}-j${i}`, title: `Job ${m} ${i}`, variants: product(600 + i).variants.slice(0, 1) }))
  file[5].variants[0].storage = '2TB' // invalid option → this record fails, the rest import
  const settings = STORE_SETTINGS()
  const { id } = await importFile('store', `${m}-jobs.json`, file, settings, { start: false })
  ok(await call({ op: 'start', id, settings }), 'start')
  const paused = await call({ op: 'pause', id })
  if (paused.status === 200) {
    let job = await waitJob(id, 60_000)
    assert.equal(job.status, 'PAUSED')
    ok(await call({ op: 'resume', id }), 'resume')
  }
  const job = await waitJob(id)
  assert.equal(job.status, 'DONE_WITH_ERRORS')
  assert.equal(job.stats.created, 39); assert.equal(job.stats.failed, 1)
  assert.equal(await db.importRecord.count({ where: { jobId: id } }), 40, 'one history row per record, never duplicated by resume')
  const failedRow = (await records(id)).find((r) => r.status === 'FAILED')
  assert.match(failedRow.messages.map((x) => x.text).join(' '), /2TB/)
  // error export (CSV is formula-safe, JSON parses)
  const csv = await view(`view=export&id=${id}&format=csv`)
  assert.equal(csv.status, 200); assert.match(String(csv.data), /2TB/)
  assert.equal(JSON.parse(JSON.stringify((await view(`view=export&id=${id}&format=json`)).data)).records.length, 1)
  pass('jobs: pause/resume, partial failure isolated, history and error export')

  // someone edits one imported product: rollback keeps it and reports it
  const edited = await db.product.findFirst({ where: { name: `Job ${m} 3` } })
  await db.product.update({ where: { id: edited.id }, data: { name: `Job ${m} 3 edited` } })
  ok(await call({ op: 'rollback', id, confirm: true }), 'rollback')
  const rolled = await waitJob(id)
  assert.equal(rolled.status, 'ROLLED_BACK')
  assert.equal(await db.product.count({ where: { name: { startsWith: `Job ${m} ` } } }), 1)
  assert.ok(await db.product.findUnique({ where: { id: edited.id } }), 'a row changed after the import is never removed')
  assert.ok(rolled.stats.rollbackConflicts >= 1)
  pass('rollback removes what the import made and keeps rows edited since')

  // cancel before it runs
  const c = await importFile('store', `${m}-cancel.json`, file.slice(0, 3).map((p, i) => ({ ...p, id: `${m}-cx${i}`, title: `Cancel ${m} ${i}` })), settings, { start: false })
  ok(await call({ op: 'start', id: c.id, settings }), 'start')
  const cancelled = await call({ op: 'cancel', id: c.id })
  if (cancelled.status === 200) assert.equal((await waitJob(c.id)).status, 'CANCELLED')
  else assert.equal((await waitJob(c.id)).status, 'DONE') // finished before the cancel arrived
  pass('cancel stops the job between records')
}

async function cleanup(admin) {
  const byMarker = { contains: m }
  const jobs = await db.importJob.findMany({ where: { fileName: byMarker }, select: { id: true } })
  await db.backgroundJob.deleteMany({ where: { kind: { in: ['imports.run', 'imports.rollback'] }, payload: { in: jobs.map(job => JSON.stringify({ jobId: job.id })) } } })
  const productIds = (await db.product.findMany({ where: { OR: [{ name: byMarker }, { sku: { contains: M } }] }, select: { id: true } })).map((p) => p.id)
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } })
  await db.product.deleteMany({ where: { id: { in: productIds } } })
  await db.productCategory.deleteMany({ where: { name: byMarker, parentId: { not: null }, children: { none: {} } } })
  for (let i = 0; i < 4; i++) await db.productCategory.deleteMany({ where: { name: byMarker, children: { none: {} } } })
  await db.productBrand.deleteMany({ where: { name: byMarker } })
  await db.productAttributeGroup.deleteMany({ where: { name: byMarker } })
  const postIds = (await db.post.findMany({ where: { title: byMarker }, select: { id: true } })).map((p) => p.id)
  await db.postCategoryAssignment.deleteMany({ where: { postId: { in: postIds } } })
  await db.post.deleteMany({ where: { id: { in: postIds } } })
  for (let i = 0; i < 3; i++) await db.postCategory.deleteMany({ where: { name: byMarker, children: { none: {} } } })
  const titles = await db.cinemaTitle.findMany({ where: { title: byMarker }, select: { id: true } })
  await db.cinemaTitle.deleteMany({ where: { id: { in: titles.map((t) => t.id) } } })
  await db.musicArtist.deleteMany({ where: { name: byMarker } }) // albums and tracks cascade
  await db.importExternalRef.deleteMany({ where: { source: { contains: m } } })
  await db.importJob.deleteMany({ where: { fileName: byMarker } })
  if (fx.staff) await db.user.delete({ where: { id: fx.staff.id } }).catch(() => undefined)
  if (fx.role) await db.role.delete({ where: { id: fx.role.id } }).catch(() => undefined)
  void admin
}

async function main() {
  const admin = await db.user.create({ data: { email: `${m}-admin@example.invalid`, passwordHash: 'integration-only', role: 'ADMIN', totpEnabledAt: new Date() } })
  cookie = await session(admin, null)
  images = await imageServer()
  try {
    if (scope === 'full') {
      await fixtures()
      await security(admin)
      await variable100()
      await attributesAndOptions()
      await variantPolicies()
      await flatFile()
    }
    await magazineCinemaMusic()
    if (scope === 'full') {
      await mediaFailures()
      await jobsControl()
    }
    console.log(`\n${results.length} integration scenarios passed (scope: ${scope})`)
  } finally {
    images.server.close()
    await cleanup(admin).catch((error) => console.error('cleanup failed:', error.message))
    await db.user.delete({ where: { id: admin.id } })
    await db.$disconnect()
  }
}

main().catch((error) => { console.error('FAIL:', error); process.exitCode = 1 })
