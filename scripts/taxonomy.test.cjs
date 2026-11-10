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

test('a count that fails after a save is logged with its operation and retried by the queue, never swallowed (audit 2026-11-10, P1)', async () => {
  // taxonomy.ts with database, queue and log doubles: the recount fails on purpose.
  const logs = [], queued = []
  let failRead = true, failQueue = false
  // Every model answers an empty list; reading assignments fails on purpose while failRead is set.
  const empty = { findMany: async () => [], update: async () => ({}) }
  const db = new Proxy({
    taxonomyAssignment: { findMany: async () => { if (failRead) throw Object.assign(new Error('deadlock detected'), { name: 'PrismaClientKnownRequestError' }); return [] } },
  }, { get: (target, key) => target[key] || empty })
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: (level, event, fields) => logs.push({ level, event, fields }) },
    '@/modules/operations/server/enqueue': { enqueue: async (kind, payload, options) => { if (failQueue) throw new Error('queue down'); queued.push({ kind, payload, options }); return { id: 1 } } },
  }
  // A small loader of its own: '@/', relative paths and the doubles above, each module once.
  const seen = new Map()
  const loadOwn = (file) => {
    if (seen.has(file)) return seen.get(file).exports
    const own = { exports: {} }; seen.set(file, own)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', code)((name) => {
      if (mocks[name]) return mocks[name]
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name)
      const base = name.startsWith('@/') ? path.resolve(__dirname, '..', 'src', name.slice(2)) : path.resolve(path.dirname(file), name)
      return loadOwn(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
    }, own, own.exports)
    return own.exports
  }
  const mod = { exports: loadOwn(path.resolve(__dirname, '..', 'src/modules/taxonomy/server/taxonomy.ts')) }
  const taxonomy = mod.exports

  assert.equal(await taxonomy.recountAfterWrite('music', { operation: 'update', resource: 'music-tracks', id: 42 }), 'queued')
  assert.deepEqual(logs[0].fields, { taxonomy: 'music', operation: 'update', resource: 'music-tracks', id: 42, errorName: 'PrismaClientKnownRequestError', message: 'deadlock detected' })
  assert.equal(logs[0].event, 'taxonomy.recount_failed'); assert.equal(logs[0].level, 'error')
  assert.deepEqual(queued, [{ kind: 'taxonomy.recount', payload: { taxonomy: 'music' }, options: { dedupeKey: 'taxonomy-recount:music' } }])
  failQueue = true
  assert.equal(await taxonomy.recountAfterWrite('games', { operation: 'bulk-delete', resource: 'games', id: '3,4' }), 'lost')
  assert.equal(logs.at(-1).event, 'taxonomy.recount_unqueued')
  failRead = false; failQueue = false
  assert.equal(await taxonomy.recountAfterWrite('software', { operation: 'create', resource: 'software', id: 7 }), 'counted')

  // No caller swallows a count any more; the job kind exists and runs the same recount.
  for (const owner of ['src/modules/media/server/admin.ts', 'src/modules/games/server/admin.ts']) {
    const text = fs.readFileSync(path.resolve(__dirname, '..', owner), 'utf8')
    assert.doesNotMatch(text, /recount\([^)]*\)\.catch\(\(\) => undefined\)/, owner)
  }
  assert.equal((fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/media/server/admin.ts'), 'utf8').match(/await recountFor\(resource, \{ type, operation: /g) || []).length, 7)
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/operations/domain/job-kinds.ts'), 'utf8'), /'taxonomy\.recount':/)
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/operations/server/queue.ts'), 'utf8'), /'taxonomy\.recount': \{ run: async payload => \{\s*const \{ isTaxonomy \}[\s\S]*?\.recount\(payload\.taxonomy\)/)
})
