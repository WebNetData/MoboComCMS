// The `taxonomy.recount` job on native PostgreSQL (audit 2026-11-10, P1): the real queue runs the real handler and the
// real recount repairs an owned term whose stored count is wrong. The queue only sees this script's job; every other
// term of the taxonomy gets its stored count back, and the owned term and job are removed.
// Run (project root, migrated database): node scripts/taxonomy-recount.connected.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client'), prisma = new PrismaClient(), seed = `taxonomy-recount-${Date.now()}`, TAXONOMY = 'software'
const own = args => ({ ...args, where: { ...args.where, dedupeKey: { startsWith: seed } } })
const jobs = new Proxy(prisma.backgroundJob, { get(target, key) { return ['findFirst', 'updateMany', 'deleteMany'].includes(key) ? args => target[key](own(args)) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] } })
const db = new Proxy(prisma, { get(target, key) { return key === 'backgroundJob' ? jobs : typeof target[key] === 'function' ? target[key].bind(target) : target[key] } })
const logs = []
const mocks = { '@/platform/database/prisma': { db }, '@/platform/observability/logger': { logEvent: (level, event, fields) => logs.push({ level, event, fields }) } }
const modules = new Map()
function load(file) {
  if (modules.has(file)) return modules.get(file).exports
  const mod = { exports: {} }; modules.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
      const canonical = '@/' + path.relative(path.resolve('src'), base).replaceAll('\\', '/')
      if (Object.hasOwn(mocks, canonical)) return mocks[canonical]
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
async function main() {
  const before = await prisma.taxonomyTerm.findMany({ where: { taxonomy: TAXONOMY }, select: { id: true, count: true } })
  let term = null, job = null
  try {
    const queue = load(path.resolve('src/modules/operations/server/queue.ts'))
    term = await prisma.taxonomyTerm.create({ data: { taxonomy: TAXONOMY, slug: seed, name: seed, count: 99 } })
    job = await prisma.backgroundJob.create({ data: { kind: 'taxonomy.recount', payload: JSON.stringify({ taxonomy: TAXONOMY }), dedupeKey: seed } })
    await queue.runQueue(20_000, ['taxonomy.recount'])
    const ran = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })
    assert.equal(ran.status, 'DONE', ran.lastError || '')
    assert.equal((await prisma.taxonomyTerm.findUniqueOrThrow({ where: { id: term.id } })).count, 0, 'the job repaired the wrong count')
    // A job naming something that is not a taxonomy fails instead of reporting success.
    const bad = await prisma.backgroundJob.create({ data: { kind: 'taxonomy.recount', payload: JSON.stringify({ taxonomy: 'nope' }), dedupeKey: `${seed}-bad` } })
    await queue.runQueue(20_000, ['taxonomy.recount'])
    const refused = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: bad.id } })
    assert.notEqual(refused.status, 'DONE'); assert.match(refused.lastError || '', /Invalid taxonomy/)
    // The helper itself counts on the real database.
    await prisma.taxonomyTerm.update({ where: { id: term.id }, data: { count: 7 } })
    const taxonomy = load(path.resolve('src/modules/taxonomy/server/taxonomy.ts'))
    assert.equal(await taxonomy.recountAfterWrite(TAXONOMY, { operation: 'update', resource: 'software', id: 0 }), 'counted')
    assert.equal((await prisma.taxonomyTerm.findUniqueOrThrow({ where: { id: term.id } })).count, 0)
    console.log('taxonomy-recount connected: all checks passed')
  } finally {
    await prisma.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: seed } } })
    if (term) await prisma.taxonomyTerm.deleteMany({ where: { id: term.id } })
    for (const row of before) await prisma.taxonomyTerm.updateMany({ where: { id: row.id }, data: { count: row.count } })
    await prisma.$disconnect()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
