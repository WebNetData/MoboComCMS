const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

// Minimal TS loader with "@/" path mapping (domain modules only import each other).
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

const tx = load('src/modules/taxonomy/domain/taxonomy')
// windows(1) > security(2) > antivirus(3); android(4); orphan(9 → missing parent 99)
const nodes = [
  { id: 1, parentId: null, slug: 'windows', name: 'ویندوز', sortOrder: 0 },
  { id: 2, parentId: 1, slug: 'security', name: 'امنیت', sortOrder: 0 },
  { id: 3, parentId: 2, slug: 'antivirus', name: 'آنتی‌ویروس', sortOrder: 0 },
  { id: 4, parentId: null, slug: 'android', name: 'اندروید', sortOrder: 10 },
  { id: 5, parentId: 4, slug: 'security', name: 'امنیت', sortOrder: 0 },
  { id: 9, parentId: 99, slug: 'orphan', name: 'یتیم', sortOrder: 5 },
]

test('slugs keep Persian words and drop unsafe characters', () => {
  assert.equal(tx.slugify('آنتی‌ویروس'), 'آنتی-ویروس')
  assert.equal(tx.slugify('Windows 11 / Tools!'), 'windows-11-tools')
  assert.equal(tx.slugify('كيبورد ۱۲'), 'کیبورد-12')
  assert.equal(tx.slugify('<script>'), 'script')
  assert.equal(tx.slugify('  '), '')
})

test('term validation cleans input and rejects bad parents', () => {
  const term = tx.validateTerm({ name: ' امنیت  ', color: '#ABCDEF', image: 'javascript:1', parentId: '2', inMenu: false })
  assert.equal(term.name, 'امنیت')
  assert.equal(term.slug, 'امنیت')
  assert.equal(term.color, '#abcdef')
  assert.equal(term.image, '')
  assert.equal(term.parentId, 2)
  assert.equal(term.inMenu, false)
  assert.throws(() => tx.validateTerm({ name: 'x' }), /حداقل/)
  assert.throws(() => tx.validateTerm({ name: 'ابزار', parentId: -3 }), /والد/)
})

test('descendants, ancestry and paths follow the tree', () => {
  assert.deepEqual(tx.descendants(nodes, 1), [1, 2, 3])
  assert.deepEqual(tx.ancestry(nodes, 3).map((n) => n.id), [1, 2, 3])
  assert.equal(tx.termPath('software', nodes, 3), '/software/category/windows/security/antivirus')
  assert.equal(tx.termBySlugs(nodes, ['android', 'security']).id, 5, 'same slug under another parent resolves by chain')
  assert.equal(tx.termBySlugs(nodes, ['windows', 'security']).id, 2)
  assert.equal(tx.termBySlugs(nodes, ['security']), null, 'a sub-term is not reachable without its parents')
  assert.equal(tx.termBySlugs(nodes, [encodeURIComponent('windows')]).id, 1)
})

test('moves cannot create loops or exceed four levels', () => {
  assert.throws(() => tx.assertParent(nodes, 1, 3), /زیرمجموعهٔ خودش/)
  assert.throws(() => tx.assertParent(nodes, 1, 1), /زیرمجموعهٔ خودش/)
  assert.throws(() => tx.assertParent(nodes, 4, 3), /سطح/, 'android(2 levels) under antivirus(level 3) would be 5 deep')
  assert.doesNotThrow(() => tx.assertParent(nodes, null, 3), 'a new leaf at level 4 is fine')
  assert.throws(() => tx.assertParent(nodes, null, 404), /پیدا نشد/)
})

test('tree building orders siblings and lifts orphans', () => {
  const tree = tx.buildTree(nodes)
  assert.deepEqual(tree.map((n) => n.id), [1, 9, 4])
  assert.deepEqual(tx.flatten(tree).map((n) => [n.id, n.depth]), [[1, 1], [2, 2], [3, 3], [9, 1], [4, 1], [5, 2]])
})

test('assignment keeps valid unique ids and a primary term', () => {
  const valid = new Set([1, 2, 3])
  assert.deepEqual(tx.normalizeAssignment({ ids: [2, '3', 3, 77], primary: 3 }, valid), { ids: [2, 3], primary: 3 })
  assert.deepEqual(tx.normalizeAssignment({ ids: [2, 3], primary: 77 }, valid), { ids: [2, 3], primary: 2 })
  assert.deepEqual(tx.normalizeAssignment([1], valid), { ids: [1], primary: 1 })
  assert.deepEqual(tx.normalizeAssignment(null, valid), { ids: [], primary: null })
})
