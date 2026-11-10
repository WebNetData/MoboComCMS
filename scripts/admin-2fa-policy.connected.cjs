// The staff 2-step rule on native PostgreSQL (audit 2026-11-10, P0): no row, switched off, switched on and an unreadable
// value, read the ordinary way and inside a command's transaction. The policy row is restored at the end.
// Run (project root, migrated database): node scripts/admin-2fa-policy.connected.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client'), prisma = new PrismaClient(), cache = new Map(), KEY = 'security.policy.v1', warnings = []
const mocks = {
  '@/platform/database/prisma': { db: prisma }, '@/platform/config/env': { authSecret: () => 'owned-2fa-policy-fixture' },
  '@/platform/observability/logger': { logEvent: (level, event, fields) => warnings.push({ level, event, fields }) },
}
function load(relative) {
  const file = path.resolve(relative); if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') && /\.(json|cjs)$/.test(name)) return require(path.resolve('src', name.slice(2)))
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
  const before = await prisma.setting.findUnique({ where: { key: KEY } })
  try {
    const access = load('src/modules/identity/server/access.ts')
    const staff = { id: 1, email: 'staff@example.com', role: 'ADMIN', permissions: null, twoFactor: false }
    const put = async (value) => { if (value === null) await prisma.setting.deleteMany({ where: { key: KEY } }); else await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } }) }
    const plain = async () => { access.clearAdminPolicyCache(); return access.adminNeedsTwoFactor(staff) }
    const inTx = () => prisma.$transaction(tx => access.adminNeedsTwoFactor(staff, tx))
    await put(null); assert.equal(await plain(), false, 'no row'); assert.equal(await inTx(), false)
    await put('{"requireAdmin2fa":false,"emailReset":true,"smsReset":true,"emailOtp":true}'); assert.equal(await plain(), false, 'off'); assert.equal(await inTx(), false)
    await put('{"requireAdmin2fa":true}'); assert.equal(await plain(), true, 'on'); assert.equal(await inTx(), true)
    assert.equal(await access.adminNeedsTwoFactor({ ...staff, twoFactor: true }), false, 'staff with 2-step pass')
    await put('{"requireAdmin2fa":fal')
    assert.equal(await plain(), true, 'an unreadable value holds staff without 2-step back')
    await assert.rejects(inTx, /Security policy unavailable/, 'a command stops on it')
    assert.ok(warnings.some(w => w.event === 'security.policy.unreadable' && w.fields.reason === 'invalid-value'))
    console.log('admin-2fa-policy connected: all checks passed')
  } finally {
    if (before) await prisma.setting.upsert({ where: { key: KEY }, create: before, update: { value: before.value } }); else await prisma.setting.deleteMany({ where: { key: KEY } })
    await prisma.$disconnect()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
