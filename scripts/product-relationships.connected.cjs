// Local PostgreSQL transactions/constraints. Creates and removes only owned products.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), seed = `relation-${Date.now()}`, products = []
let admin, settingsBefore, settingsRead = false, browser
async function browserChecks(source, a, b, token) {
  const { chromium } = require('playwright'), base = 'http://localhost:3000'
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran' }), page = await context.newPage()
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: base }])
  await page.goto(base + '/admin/products', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const row = page.getByRole('row').filter({ hasText: `${seed}-updated` })
  await row.getByRole('button', { name: 'ویرایش', exact: true }).click({ timeout: 60000 })
  const compatible = page.getByRole('region', { name: 'محصولات سازگار', exact: true })
  await compatible.getByRole('button', { name: `حذف ${a.name}`, exact: true }).waitFor()
  await compatible.getByRole('button', { name: `حذف ${a.name}`, exact: true }).click()
  await compatible.getByLabel('جست‌وجوی مورد', { exact: true }).fill(b.name)
  await compatible.getByRole('button', { name: `${b.name} +`, exact: true }).click()
  const saving = page.waitForResponse(r => r.url().includes('/api/admin/cms?type=products') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click()
  assert.equal((await saving).status(), 200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('row').filter({ hasText: `${seed}-updated` }).getByRole('button', { name: 'ویرایش', exact: true }).click()
  await compatible.getByRole('button', { name: `حذف ${b.name}`, exact: true }).waitFor()
  assert.deepEqual((await db.productRelationship.findMany({ where: { productId: source.id, kind: 'COMPATIBLE' } })).map(r => r.targetId), [b.id])
  await page.screenshot({ path: '.mobocom/product-relationships-editor.png', fullPage: true })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    await context.addCookies([{ name: 'theme', value: theme, url: base }]); await page.setViewportSize({ width, height: 900 })
    await page.goto(base + `/products/${source.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const tab = page.getByRole('tab', { name: 'محصولات سازگار', exact: true })
    await tab.click(); const card = page.locator('.store-related-card').filter({ hasText: b.name }); await card.waitFor()
    assert.equal(await card.getAttribute('href'), `/products/${b.slug}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width} overflow`)
    await tab.focus(); await page.keyboard.press('Home'); assert.equal(await page.getByRole('tab', { name: 'توضیحات', exact: true }).getAttribute('aria-selected'), 'true')
    await tab.click(); await page.locator('.store-tab-panel').screenshot({ path: `.mobocom/product-relationships-${theme}-${width}.png` })
    await page.getByRole('tab', { name: 'محصولات مکمل', exact: true }).click(); await card.waitFor()
  }
  await browser.close(); browser = undefined
  console.log('Actual relationship editor search/remove/add/save/reload and product RTL dark/light390/1440 links, keyboard and overflow checks passed')
}
async function apiChecks(source, a, b, hidden) {
  const { encode } = require('next-auth/jwt'), base = 'http://localhost:3000', key = 'store.merchandising.v1'
  settingsBefore = await db.setting.findUnique({ where: { key } }); settingsRead = true
  admin = await db.user.create({ data: { email: `${seed}-admin@example.invalid`, passwordHash: 'test-only', role: 'ADMIN', totpEnabledAt: new Date() } })
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, role: admin.role, authAt: Date.now() } })
  const call = (path, method = 'GET', data, auth = true) => fetch(base + path, { method, headers: { origin: base, 'content-type': 'application/json', ...(auth ? { cookie: `next-auth.session-token=${token}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(60000) })
  const save = async body => { const response = await call('/api/admin/store/settings', 'POST', body); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).settings }
  assert.equal((await call('/api/admin/products/relationship-items?q=relation', 'GET', undefined, false)).status, 403)
  await save({ showProductRelationships: true }); assert.equal((await save({ offerTitle: 'آزمایش حفظ ارتباط‌ها' })).showProductRelationships, true)
  const related = [{ kind: 'RELATED', targetId: b.id }, { kind: 'RELATED', targetId: a.id }, { kind: 'COMPATIBLE', targetId: a.id }, { kind: 'COMPLEMENTARY', targetId: b.id }]
  const patch = data => call('/api/admin/cms?type=products', 'PATCH', { id: source.id, ...data })
  let response = await patch({ relationships: related }); assert.equal(response.status, 200, await response.clone().text())
  assert.equal((await patch({ name: `${seed}-updated` })).status, 200)
  const sourceRows = await (await call(`/api/admin/cms?type=products&id=${source.id}`)).json()
  assert.deepEqual(sourceRows[0].relationships, related, 'legacy omission preserves references')
  const before = await db.product.findUniqueOrThrow({ where: { id: source.id } })
  const points = await db.productPricePoint.count({ where: { productId: source.id } })
  response = await patch({ name: 'must-roll-back', price: 2, relationships: [{ kind: 'RELATED', targetId: hidden.id }] }); assert.equal(response.status, 400)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: source.id } })).name, before.name)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: source.id } })).priceMinor, before.priceMinor)
  assert.equal(await db.productPricePoint.count({ where: { productId: source.id } }), points)
  assert.equal((await patch({ relationships: [{ kind: 'RELATED', targetId: source.id }] })).status, 400)
  const picker = await (await call(`/api/admin/products/relationship-items?sourceId=${source.id}&q=${seed}&refs=product:${a.id},product:${hidden.id}`)).json()
  assert.ok(picker.matches.some(row => row.id === b.id)); assert.ok(picker.matches.every(row => row.id !== source.id && row.id !== hidden.id))
  assert.deepEqual(picker.selected.map(row => row.id), [a.id])
  const tab = kind => call(`/api/products/${source.slug}/tabs?tab=${kind}`, 'GET', undefined, false)
  const items = async kind => { const response = await tab(kind); assert.equal(response.status, 200); return (await response.json()).items }
  assert.deepEqual((await items('related-products')).slice(0, 2).map(row => row.id), [b.id, a.id])
  assert.deepEqual((await items('compatible-products')).map(row => row.id), [a.id])
  assert.deepEqual((await items('complementary-products')).map(row => row.id), [b.id])
  if (process.env.HURL_BIN) {
    const { spawn } = require('node:child_process')
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.HURL_BIN, ['--test', '--variable', `base_url=${base}`, '--variable', `slug=${source.slug}`, '--variable', `compatible_id=${a.id}`, '--variable', `complementary_id=${b.id}`, 'docs/specs/store-product-relationships/editorial-relations.hurl'], { stdio: 'inherit' })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Hurl exited ${code}`)))
    })
  }
  await db.product.update({ where: { id: a.id }, data: { active: false } })
  assert.equal((await patch({ relationships: related })).status, 200)
  assert.deepEqual(await items('compatible-products'), [])
  assert.equal(await db.productRelationship.count({ where: { productId: source.id } }), 4)
  await db.product.update({ where: { id: a.id }, data: { active: true } })
  if (process.env.RELATION_BROWSER === '1') await browserChecks(source, a, b, token)
  await save({ showProductRelationships: false })
  assert.equal((await tab('compatible-products')).status, 404); assert.equal((await tab('related-products')).status, 200)
  assert.equal(await db.productRelationship.count({ where: { productId: source.id } }), 4)
  const created = await call('/api/admin/cms?type=products', 'POST', { slug: `${seed}-cms-created`, name: `${seed}-cms-created`, active: false, price: 1, relationships: [{ kind: 'COMPATIBLE', targetId: b.id }] })
  assert.equal(created.status, 200, await created.clone().text()); const newProduct = await created.json(); products.push(newProduct)
  assert.equal(await db.productRelationship.count({ where: { productId: newProduct.id } }), 1)
  console.log('Real CMS/lookup/public API: permission, omission, transactional price/name/history rollback, self rejection, public refs, editorial ordering, hidden preservation, pause and creation passed')
}
function load(file) {
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  for (let i = 0; i < 4; i++) products.push(await db.product.create({ data: { slug: `${seed}-${i}`, name: `${seed}-${i}`, price: 1, priceMinor: 100n, approval: i === 3 ? 'PENDING' : 'APPROVED' } }))
  const [source, a, b, hidden] = products, service = load('src/modules/catalog/server/product-relationships.ts')
  await db.$transaction(tx => service.replaceProductRelationships(tx, source.id, [{ kind: 'RELATED', targetId: b.id }, { kind: 'RELATED', targetId: a.id }, { kind: 'COMPATIBLE', targetId: a.id }]))
  assert.deepEqual(await service.publicProductRelationshipIds(source.id, 'RELATED'), [b.id, a.id])
  assert.deepEqual(await service.publicProductRelationshipIds(a.id, 'COMPATIBLE'), [], 'no inferred reverse compatibility')
  await assert.rejects(db.$transaction(async tx => {
    await tx.product.update({ where: { id: source.id }, data: { name: 'must-roll-back' } })
    await service.replaceProductRelationships(tx, source.id, [{ kind: 'RELATED', targetId: hidden.id }])
  }), /public product/)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: source.id } })).name, source.name)
  assert.equal(await db.productRelationship.count({ where: { productId: source.id } }), 3)
  await db.product.update({ where: { id: a.id }, data: { active: false } })
  await db.$transaction(tx => service.replaceProductRelationships(tx, source.id, [{ kind: 'RELATED', targetId: b.id }, { kind: 'RELATED', targetId: a.id }, { kind: 'COMPATIBLE', targetId: a.id }]))
  assert.deepEqual(await service.publicProductRelationshipIds(source.id, 'RELATED'), [b.id])
  assert.equal(await db.productRelationship.count({ where: { productId: source.id } }), 3, 'withdrawal retains editorial data')
  await db.product.update({ where: { id: a.id }, data: { active: true } })
  if (process.env.RELATION_API === '1') await apiChecks(source, a, b, hidden)
  for (const data of [{ kind: 'RELATED', productId: source.id, targetId: source.id }, { kind: 'UNKNOWN', productId: source.id, targetId: b.id }, { kind: 'COMPLEMENTARY', productId: source.id, targetId: b.id, position: -1 }]) await assert.rejects(db.productRelationship.create({ data }))
  await db.product.delete({ where: { id: b.id } }); assert.equal(await db.productRelationship.count({ where: { targetId: b.id } }), 0)
  await db.product.delete({ where: { id: source.id } }); assert.equal(await db.productRelationship.count({ where: { productId: source.id } }), 0)
  console.log('Real PostgreSQL editorial relationships: ordering/direction, atomic rollback, retained withdrawn refs, public filtering, DB checks and dependent deletion cascades passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await browser?.close()
    if (settingsRead) { const key = 'store.merchandising.v1'; if (settingsBefore) await db.setting.upsert({ where: { key }, create: { key, value: settingsBefore.value }, update: { value: settingsBefore.value } }); else await db.setting.deleteMany({ where: { key } }) }
    await db.searchDocument.deleteMany({ where: { itemType: 'product', itemId: { in: products.map(row => row.id) } } })
    await db.socialPost.deleteMany({ where: { itemType: 'product', itemId: { in: products.map(row => row.id) } } })
    await db.product.deleteMany({ where: { id: { in: products.map(row => row.id) }, slug: { startsWith: seed } } })
    if (admin) await db.user.delete({ where: { id: admin.id } })
  } finally { await db.$disconnect() }
})
