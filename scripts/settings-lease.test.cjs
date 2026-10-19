const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api')
function load(query) {
  const mod = {exports: {}}
  const code = ts.transpileModule(fs.readFileSync('src/modules/settings/server.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/platform/database/prisma') return {db: {$queryRaw: query}}
    if (name === '@/platform/cache/kv') return {}
    throw Error(`Unexpected dependency ${name}`)
  }, mod, mod.exports)
  return mod.exports.acquireLease
}
test('lease acquisition distinguishes the granted slot from normal contention', async () => {
  assert.equal(await load(async () => [{key: 'lease.job'}])('job', 60000), true)
  assert.equal(await load(async () => [])('job', 60000), false)
})
test('lease database outages propagate rather than masquerading as contention', async () => {
  const outage = new Error('database unavailable')
  await assert.rejects(load(async () => {throw outage})('job', 60000), error => error === outage)
})
test('invalid lease duration cannot write a constantly reacquirable slot', async () => {
  let calls = 0
  const acquire = load(async () => {calls++; return []})
  for (const duration of [0, -1, NaN, Infinity]) await assert.rejects(acquire('job', duration), RangeError)
  assert.equal(calls, 0)
})
