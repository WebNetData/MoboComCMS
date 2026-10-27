// Real PostgreSQL: building the ready category tree adds only what is missing, puts every child under its template
// parent and in its parent's half, keeps an existing category where it stands (reported, not moved or renamed), and a
// second run adds nothing. Everything it made is removed afterwards and the categories are as they were.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), cache = new Map()
const mocks = { '@/platform/database/prisma': { db } }
function load(relative) {
  const file = path.resolve(relative); if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', source)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) { const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx') }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const snapshot = async () => (await db.productCategory.findMany({ select: { id: true, slug: true, name: true, parentId: true, kind: true }, orderBy: { id: 'asc' } }))
async function main() {
  const before = await snapshot(), beforeIds = new Set(before.map((row) => row.id))
  const template = load('src/modules/catalog/domain/category-template.ts'), build = load('src/modules/catalog/server/category-template.ts').buildCategoryTemplate
  const rows = template.templateRows()
  // A category the owner already has at an address of the template, but as a root with its own name.
  let fixture = before.find((row) => row.slug === 'switches')
  const madeFixture = !fixture
  if (!fixture) fixture = await db.productCategory.create({ data: { slug: 'switches', name: 'سوییچ‌های من', kind: 'PHYSICAL' } })
  try {
    const missing = rows.filter((row) => !before.some((item) => item.slug === row.slug) && row.slug !== 'switches').length
    const first = await build()
    assert.equal(first.created, missing, 'only the missing addresses are made')
    const after = await snapshot(), bySlug = new Map(after.map((row) => [row.slug, row]))
    const kept = bySlug.get('switches')
    assert.deepEqual([kept.parentId, kept.name], [fixture.parentId ?? null, fixture.name], 'an existing category is neither moved nor renamed')
    assert.ok(first.elsewhere.includes('switches'), 'and it is reported as standing elsewhere')
    for (const row of rows) {
      const made = bySlug.get(row.slug)
      assert.ok(made, row.slug)
      if (beforeIds.has(made.id) || row.slug === 'switches') continue
      const parent = row.parent ? bySlug.get(row.parent) : null
      assert.equal(made.parentId, parent ? parent.id : null, `${row.slug} under ${row.parent || 'top'}`)
      assert.equal(made.kind, parent ? parent.kind : row.kind, `${row.slug} in its parent's half`)
    }
    const second = await build()
    assert.equal(second.created, 0, 'a second run adds nothing')
    console.log(`PASS category template: ${first.created} made, ${first.kept} kept, existing kept in place, second run adds nothing`)
  } finally {
    const made = (await snapshot()).filter((row) => !beforeIds.has(row.id) && !(madeFixture && row.id === fixture.id))
    await db.productCategory.deleteMany({ where: { id: { in: made.map((row) => row.id) } } })
    if (madeFixture) await db.productCategory.delete({ where: { id: fixture.id } })
    const restored = await snapshot()
    assert.deepEqual(restored, before, 'categories are as they were')
    await db.$disconnect()
  }
}
main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1) })
