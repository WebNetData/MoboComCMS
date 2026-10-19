const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(file, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, '..', file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const mod = { exports: {} }; cache.set(absolute, mod)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(path.resolve(__dirname, '..'), base + suffix), mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

test('Journal picker retains selected older posts and searches beyond its initial 800', async () => {
  const recent = Array.from({ length: 800 }, (_, index) => ({ id: 1001 - index, title: `Post ${1001 - index}`, cover: '', publishedAt: new Date() }))
  const old = { id: 1, title: 'Old feature', cover: '', publishedAt: new Date('2020-01-01') }
  const queries = []
  const db = {
    post: { findMany: async args => {
      queries.push(args)
      if (args.where.id?.in) return [old]
      if (args.where.OR) return [old]
      return recent
    } },
    postCategory: { findMany: async () => [{ id: 3, name: 'News', parentId: null }] },
  }
  const journal = load('src/modules/journal/server/admin.ts', {
    '@/platform/database/prisma': { db },
    '@/modules/settings/server': { readJsonSetting: async () => null, writeJsonSetting: async () => {} },
  })
  const picker = await journal.journalPickers([1])
  assert.equal(picker.posts.length, 801)
  assert.equal(picker.posts.filter(post => post.id === 1).length, 1)
  assert.equal(picker.posts.find(post => post.id === 1).title, 'Old feature')
  assert.deepEqual(picker.categories, [{ id: 3, title: 'News', cover: '' }])
  assert.deepEqual(await journal.searchJournalPicker('old'), [{ id: 1, title: 'Old feature', cover: '' }])
  assert.equal(queries.at(-1).take, 25)
  assert.equal(queries.at(-1).where.status, 'PUBLISHED')
  const before = queries.length
  assert.deepEqual(await journal.searchJournalPicker('x'), [])
  assert.equal(queries.length, before, 'one-character searches do not query the database')
})

test('Journal picker search keeps the existing admin permission boundary', async () => {
  let allowed = false
  const queries = []
  const routes = load('src/modules/journal/server/http/routes.ts', {
    '@/platform/http/response': { ok: value => value },
    '@/platform/audit/server': { auditAdmin: async () => {} },
    '@/modules/journal/server/item-links': { searchPostLinkProducts: async () => ({ matches: [], selected: [] }) },
    '@/modules/identity/server/admin-guard': { adminGuard: async (_req, module, permissions) => {
      assert.equal(module, 'journal')
      assert.deepEqual(permissions, ['cms.posts'])
      return allowed ? { admin: { id: 1 } } : { response: 'denied' }
    } },
    '@/modules/journal/server/admin': { searchJournalPicker: async query => { queries.push(query); return [{ id: 1, title: 'Old feature', cover: '' }] } },
  })
  const request = { url: 'http://localhost:3000/api/admin/journal/picker?q=old' }
  assert.equal(await routes.GET_picker(request), 'denied')
  assert.deepEqual(queries, [])
  allowed = true
  assert.deepEqual(await routes.GET_picker(request), { posts: [{ id: 1, title: 'Old feature', cover: '' }] })
  assert.deepEqual(queries, ['old'])
})

test('Journal settings preload selected hero and editor posts beyond the recent list', async () => {
  let selected = []
  const settings = { heroIds: [1, 2], editorIds: [3] }
  const routes = load('src/modules/journal/server/http/routes.ts', {
    '@/platform/audit/server': { auditAdmin: async () => {} },
    '@/modules/journal/server/item-links': { searchPostLinkProducts: async () => ({ matches: [], selected: [] }) },
    '@/modules/identity/server/admin-guard': { adminGuard: async () => ({ admin: { id: 1 } }) },
    '@/modules/journal/server/admin': {
      getJournalSettings: async () => settings,
      journalPickers: async ids => { selected = ids; return { posts: [], categories: [] } },
    },
  })
  const response = await routes.GET_settings({ url: 'http://localhost:3000/api/admin/journal/settings' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json()
  assert.match(body.settingsRevision, /^[a-f0-9]{64}$/)
  assert.deepEqual({ settings: body.settings, picker: body.picker }, { settings, picker: { posts: [], categories: [] } })
  assert.deepEqual(selected, [1, 2, 3])
})
