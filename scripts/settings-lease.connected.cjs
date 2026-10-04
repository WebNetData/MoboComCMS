// Run inside the app container: node --env-file=.env scripts/settings-lease.connected.cjs
// Optional SQLITE_PRISMA_CLIENT points at an isolated generated SQLite client.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const {PrismaClient} = require(process.env.SQLITE_PRISMA_CLIENT || '@prisma/client')
const db = new PrismaClient({log: [{emit: 'event', level: 'error'}]})
const errors = []; db.$on('error', event => errors.push(event))
const name = `test.settings-lease.${Date.now()}.${process.pid}`, key = `lease.${name}`
function load() {
  const mod = {exports: {}}
  const code = ts.transpileModule(fs.readFileSync('src/modules/settings/server.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/platform/database/prisma') return {db}
    if (name === '@/platform/cache/kv') return {cached: (_key, _ttl, fn) => fn()}
    throw Error(`Unexpected dependency ${name}`)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  if (process.env.SQLITE_PRISMA_CLIENT) await db.$executeRaw`CREATE TABLE IF NOT EXISTS "Setting" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL)`
  const service = load()
  const contenders = () => Promise.all(Array.from({length: 20}, () => service.acquireLease(name, 60000)))
  assert.equal((await contenders()).filter(Boolean).length, 1, 'one winner on simultaneous first creation')
  const held = await db.setting.findUniqueOrThrow({where: {key}})
  assert.equal(await service.acquireLease(name, 60000), false)
  assert.equal((await contenders()).filter(Boolean).length, 0, 'no winner while held')
  assert.deepEqual(await db.setting.findUniqueOrThrow({where: {key}}), held, 'losers cannot extend expiry')
  await db.setting.update({where: {key}, data: {value: '2000-01-01T00:00:00.000Z'}})
  assert.equal((await contenders()).filter(Boolean).length, 1, 'one winner when expired')
  assert.ok((await db.setting.findUniqueOrThrow({where: {key}})).value > held.value)
  assert.equal((await service.getSettings())[key], undefined, 'lease rows remain outside ordinary settings reads')
  assert.equal(await db.setting.count({where: {key}}), 1)
  assert.deepEqual(errors, [], 'contention must not emit Prisma errors')
  console.log(`${process.env.SQLITE_PRISMA_CLIENT ? 'SQLite' : 'PostgreSQL'}: 20-way first/held/expired lease contention, unchanged held expiry, settings exclusion and zero Prisma error events passed`)
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
  try {await db.setting.deleteMany({where: {key}})} finally {await db.$disconnect()}
})
