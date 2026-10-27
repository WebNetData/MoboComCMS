// Real PostgreSQL: a product listed under further categories beside its main one. The main category is not stored
// twice; a category of the other half of the shop is refused; the product is listed under a further category; a
// product ticked under a parent and its child counts once in the parent's total; unticking removes the listing.
// Fixtures are removed afterwards.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), cache = new Map(), memo = new Map(), stamp = `xcat${Date.now().toString(36)}`
const mocks = {
  '@/platform/database/prisma': { db }, react: { cache: (fn) => fn },
  '@/platform/cache/kv': { cached: async (key, ttl, work) => { if (!memo.has(key)) memo.set(key, await work()); return memo.get(key) }, invalidate: async () => { memo.clear() } },
}
function load(relative) {
  const file = path.resolve(relative); if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') && /\.(json|cjs)$/.test(name)) return require(path.resolve('src', name.slice(2)))
    if (name.startsWith('@/') || name.startsWith('.')) { const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : fs.existsSync(base + '.tsx') ? base + '.tsx' : path.join(base, 'index.ts')) }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  const made = { categories: [], products: [] }
  try {
    const cat = async (slug, kind, parentId = null) => { const row = await db.productCategory.create({ data: { slug: `${stamp}-${slug}`, name: `${stamp} ${slug}`, kind, parentId } }); made.categories.push(row.id); return row }
    const parent = await cat('parent', 'PHYSICAL'), child = await cat('child', 'PHYSICAL', parent.id), other = await cat('other', 'PHYSICAL'), digital = await cat('digital', 'VIRTUAL')
    const product = await db.product.create({ data: { slug: `${stamp}-p`, name: `${stamp} product`, kind: 'PHYSICAL', currency: 'IRT', priceMinor: 1000n, price: 1000, active: true, approval: 'APPROVED', categoryId: child.id } })
    made.products.push(product.id)
    const rules = load('src/modules/catalog/server/product-categories.ts')
    const ids = await db.$transaction((tx) => rules.validateExtraCategories(tx, [parent.id, child.id, other.id, other.id], child.id, 'PHYSICAL'))
    assert.deepEqual(ids.sort(), [parent.id, other.id].sort(), 'the main category is not stored twice; duplicates collapse')
    await assert.rejects(db.$transaction((tx) => rules.validateExtraCategories(tx, [digital.id], child.id, 'PHYSICAL')), (error) => error instanceof rules.ProductCategoryError, 'a category of the other half is refused')
    await assert.rejects(db.$transaction((tx) => rules.validateExtraCategories(tx, [2147483000], child.id, 'PHYSICAL')), (error) => error instanceof rules.ProductCategoryError, 'a missing category is refused')
    await db.$transaction((tx) => rules.replaceExtraCategories(tx, product.id, ids))
    const listed = async (categoryId) => (await db.product.findMany({ where: { AND: [{ id: product.id }, rules.inCategories([categoryId])] }, select: { id: true } })).length
    assert.deepEqual([await listed(child.id), await listed(other.id), await listed(digital.id)], [1, 1, 0], 'found under its main and further categories only')
    const catalog = load('src/modules/store/server/catalog.ts')
    const tree = await catalog.categoryTree()
    const find = (nodes, id) => { for (const node of nodes) { if (node.id === id) return node; const deeper = find(node.children, id); if (deeper) return deeper } return null }
    assert.equal(find(tree, parent.id).total, 1, 'ticked under a parent and its child, the product counts once in the parent')
    assert.equal(find(tree, other.id).total, 1)
    const listing = await catalog.shopListing({ ...load('src/modules/store/domain/store.ts').parseShopQuery({}), category: other.slug })
    assert.ok(listing.products.some((card) => card.id === product.id), 'the store listing of a further category shows the product')
    await db.$transaction((tx) => rules.replaceExtraCategories(tx, product.id, []))
    assert.equal(await listed(other.id), 0, 'unticked, it is no longer listed there')
    console.log('PASS product extra categories: main not repeated, other half refused, listed under further categories, counted once per branch, unticking removes')
  } finally {
    await db.productCategoryAssignment.deleteMany({ where: { productId: { in: made.products } } })
    await db.product.deleteMany({ where: { id: { in: made.products } } })
    await db.productCategory.deleteMany({ where: { id: { in: made.categories.slice().reverse() } } })
    await db.$disconnect()
  }
}
main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1) })
