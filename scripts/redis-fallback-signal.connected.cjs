// The Redis signal of the operations monitor on native PostgreSQL (audit 2026-11-10, P1), with the real kv store:
// REDIS_URL pointing at a port where nothing listens gives a warning that names the fallback; no REDIS_URL is "disabled".
// Writes nothing. Run (project root): node scripts/redis-fallback-signal.connected.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client'), prisma = new PrismaClient()
function graph() {
  const modules = new Map(), logs = []
  const mocks = { '@/platform/database/prisma': { db: prisma }, '@/platform/observability/logger': { logEvent: (level, event, fields) => logs.push({ level, event, fields }) } }
  const load = (file) => {
    if (modules.has(file)) return modules.get(file).exports
    const mod = { exports: {} }; modules.set(file, mod)
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/') && /\.(json|cjs)$/.test(name)) return require(path.resolve('src', name.slice(2)))
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
        const canonical = '@/' + path.relative(path.resolve('src'), base).replaceAll('\\', '/')
        if (Object.hasOwn(mocks, canonical)) return mocks[canonical]
        for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (fs.existsSync(candidate)) return load(candidate)
      }
      return require(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return { load, logs }
}
async function main() {
  const before = process.env.REDIS_URL
  try {
    process.env.REDIS_URL = 'redis://127.0.0.1:1'
    delete globalThis.__mobocomKvState
    const one = graph()
    const { sampleMonitoring } = one.load(path.resolve('src/modules/notifications/server/operations-monitor.ts'))
    const report = await sampleMonitoring({})
    const signal = report.signals.find(s => s.id === 'redis')
    assert.equal(signal?.status, 'warning', JSON.stringify(signal))
    assert.match(signal.detail, /not answering since .*in-process store.*Last error: .*(ECONNREFUSED|connect)/i)
    assert.ok(one.logs.some(l => l.event === 'kv.redis_unavailable'), 'the fallback is logged')
    clearTimeout(globalThis.__mobocomKvState?.timer)

    delete process.env.REDIS_URL
    delete globalThis.__mobocomKvState
    const two = graph()
    const quiet = await two.load(path.resolve('src/modules/notifications/server/operations-monitor.ts')).sampleMonitoring({})
    assert.equal(quiet.signals.find(s => s.id === 'redis')?.status, 'disabled', 'a one-instance install is not alerted')
    console.log('redis-fallback-signal connected: all checks passed')
  } finally {
    if (before === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = before
    await prisma.$disconnect()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
