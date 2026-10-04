// Docker-local real PostgreSQL transaction/capture checks; only namespaced fixtures are mutated.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt'), db = new PrismaClient(), seed = `ph${Date.now().toString(36)}`
let product, admin
function load(relative) {
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name.startsWith('@/')) for (const suffix of ['.ts', '/index.ts']) { const file = `src/${name.slice(2)}${suffix}`; if (fs.existsSync(path.join(__dirname, '..', file))) return load(file) }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  const { prepareProductPriceCapture: prepare, capturePublicProductPrices: capture } = load('src/modules/catalog/server/price-history.ts')
  product = await db.product.create({ data: { slug: seed, name: seed, active: true, approval: 'APPROVED', currency: 'IRT', price: 10, priceMinor: 10n } })
  await db.productVariant.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ productId: product.id, sku: `${seed}-${i}`, name: `${seed}-${i}`, active: true, price: 20, priceMinor: 20n })) })
  const transact = fn => db.$transaction(async tx => { const before = await prepare(tx, product.id); await fn(tx); return capture(tx, product.id, before) }, { timeout: 20000 })
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { name: `${seed} edited`, stock: 5 } })), 0)
  assert.equal(await db.$transaction(async tx => { await prepare(tx, product.id); return capture(tx, product.id, new Map()) }, { timeout: 20000 }), 202)
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { memberPriceMinor: 1n, compareAtMinor: 100n } })), 0)
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { priceMinor: 11n, price: 11 } })), 1)
  let count = await db.productPricePoint.count({ where: { productId: product.id } })
  await assert.rejects(db.$transaction(async tx => { const before = await prepare(tx, product.id); await tx.product.update({ where: { id: product.id }, data: { priceMinor: 99n } }); await capture(tx, product.id, before); throw new Error('forced rollback') }), /forced rollback/)
  assert.equal(await db.productPricePoint.count({ where: { productId: product.id } }), count)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).priceMinor, 11n)
  const concurrent = await Promise.all([1, 2].map(() => transact(tx => tx.product.update({ where: { id: product.id }, data: { priceMinor: 15n, price: 15 } }))))
  assert.equal(concurrent.reduce((sum, n) => sum + n, 0), 1, 'same-price concurrent saves produce one point')
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { approval: 'PENDING', priceMinor: 777n } })), 0)
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { priceMinor: 888n } })), 0)
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { approval: 'APPROVED', priceMinor: 16n, price: 16 } })), 1)
  assert.equal(await db.productPricePoint.count({ where: { productId: product.id, amountMinor: { in: [777n, 888n, 99n] } } }), 0)
  assert.equal(await transact(tx => tx.product.update({ where: { id: product.id }, data: { currency: 'USD' } })), 202)
  await transact(tx => tx.product.update({ where: { id: product.id }, data: { currency: 'IRT' } }))
  admin = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } })
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, role: admin.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const patch = body => fetch('http://localhost:3000/api/admin/cms?type=products', { method: 'PATCH', headers: { cookie: `next-auth.session-token=${token}`, origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ id: product.id, ...body }), signal: AbortSignal.timeout(60000) })
  count = await db.productPricePoint.count({ where: { productId: product.id } })
  let response = await patch({ name: `${seed} metadata edit` }); assert.equal(response.status, 200, await response.clone().text())
  assert.equal(await db.productPricePoint.count({ where: { productId: product.id } }), count)
  response = await patch({ price: '17' }); assert.equal(response.status, 200, await response.clone().text())
  assert.equal(await db.productPricePoint.count({ where: { productId: product.id } }), count + 1)
  assert.equal((await db.productPricePoint.findFirst({ where: { productId: product.id, variantId: 0 }, orderBy: { id: 'desc' } })).amountMinor, 17n)
  console.log('Price capture PostgreSQL/CMS API: 201-variant paging, metadata/member/list no-op, baseline, rollback, concurrent dedupe, private exclusion and currency changes passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { if (product) await db.product.delete({ where: { id: product.id } }); if (admin) await db.user.delete({ where: { id: admin.id } }); await db.$disconnect() })
