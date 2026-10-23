// Real Setting-row claims through the actual maintenance service. Only this run's key is touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), key = `test-maintenance-${Date.now()}-${process.pid}`
let reads = 0, release, barrier
function gate() { reads = 0; barrier = new Promise(resolve => { release = resolve }) }
function model(client) { return {
  findUnique: async () => {
    const row = await client.setting.findUnique({ where: { key } })
    if (++reads <= 2) { if (reads === 2) release(); await barrier }
    return row
  },
  create: ({ data }) => client.setting.create({ data: { ...data, key } }),
  updateMany: ({ where, data }) => client.setting.updateMany({ where: { ...where, key }, data }),
} }
const setting = model(db)
const database = { setting, $transaction: (callback, options) => db.$transaction(tx => callback({ ...tx, setting: model(tx) }), options) }
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => {
    if (name === '@/platform/database/prisma') return { db: database }
    if (name === '@/extensions/generated/catalog') return { extensionCatalog: [] }
    if (name.startsWith('@/')) { const base = 'src/' + name.slice(2); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts') }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const service = load('src/modules/site/server/maintenance.ts')
const stored = async () => JSON.parse((await db.setting.findUniqueOrThrow({ where: { key } })).value)
async function main() {
  // Both see the absent row: the unique-key loser must re-read and merge.
  gate()
  await Promise.all([service.saveSectionMaintenance('store', { enabled: true, title: 'store notice' }), service.saveSectionMaintenance('music', { enabled: true, message: 'music notice' })])
  let state = await stored()
  assert.equal(state.store.enabled, true); assert.equal(state.music.enabled, true)
  assert.equal(state.store.title, 'store notice'); assert.equal(state.music.message, 'music notice')
  assert.ok(reads >= 3, 'a losing writer reads the current row again')
  // Both see the same existing row: the value claim loser must re-read and merge.
  gate()
  await Promise.all([service.saveSectionMaintenance('store', { enabled: false }), service.saveSectionMaintenance('music', { title: 'new music notice' })])
  state = await stored()
  assert.equal(state.store.enabled, false); assert.equal(state.store.title, 'store notice')
  assert.equal(state.music.enabled, true); assert.equal(state.music.title, 'new music notice'); assert.equal(state.music.message, 'music notice')
  assert.ok(reads >= 3)
  // Separate fields of the same section also survive a race.
  gate()
  await Promise.all([service.saveSectionMaintenance('music', { title: 'same section title' }), service.saveSectionMaintenance('music', { message: 'same section message' })])
  state = await stored()
  assert.equal(state.music.title, 'same section title'); assert.equal(state.music.message, 'same section message')
  assert.equal((await service.loadMaintenance()).music.message, state.music.message)
  await assert.rejects(() => service.saveSectionMaintenance('unknown', {}), /unknown section/)
  await db.setting.update({ where: { key }, data: { value: 'not json' } })
  await assert.rejects(() => service.saveSectionMaintenance('store', { enabled: true }), /تنظیمات|JSON/)
  assert.equal((await db.setting.findUniqueOrThrow({ where: { key } })).value, 'not json', 'bad stored data is never silently reset')
  database.$transaction = async () => { throw new Error('database unavailable') }
  await assert.rejects(() => service.saveSectionMaintenance('store', { enabled: true }), /database unavailable/)
  console.log('PostgreSQL maintenance: concurrent creation, different sections and same-section field claims preserve each change; invalid stored JSON and database failure cannot write a fallback state')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try { await db.setting.deleteMany({ where: { key } }) } finally { await db.$disconnect() }
})
