// Canonical invoice page guard with real PostgreSQL identities and signed request cookies.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const db = new PrismaClient(), prefix = `invoice-viewer-${Date.now()}`, users = [], roles = [], cache = new Map()
const secret = crypto.randomBytes(32).toString('hex')
process.env.NEXTAUTH_SECRET = secret
process.env.NEXTAUTH_URL = 'http://localhost:3000'
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  let text = fs.readFileSync(file, 'utf8')
  if (file.endsWith('/invoice-access.ts') && process.env.INVOICE_VIEWER_FAULT === 'permission') text = text.replace("'invoices.manage'", "'cms.posts'")
  const mod = { exports: {} }; cache.set(file, mod)
  const req = name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.join(path.posix.dirname(file), name)
      if (base.endsWith('.json') && fs.existsSync(base)) return JSON.parse(fs.readFileSync(base, 'utf8'))
      for (const candidate of [base + '.ts', base + '/index.ts', base + '.json']) if (fs.existsSync(candidate)) return candidate.endsWith('.json') ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : load(candidate)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)(req, mod, mod.exports)
  return mod.exports
}
let policyBefore, prepared, policyChanged = false
async function main() {
  const guard = load('src/modules/billing/server/invoice-access.ts'), access = load('src/modules/identity/server/access.ts')
  const request = async user => new Headers({ cookie: `next-auth.session-token=${await encode({ secret, token: { uid: String(user.id), sub: String(user.id), role: 'ADMIN', authAt: Date.now() } })}` })
  const permits = async user => guard.invoiceStaffAccess(await request(user))
  assert.equal(await guard.invoiceStaffAccess(new Headers()), false)
  for (const [kind, permissions] of [['customer', null], ['full', null], ['magazine', ['cms.posts']], ['finance', ['invoices.manage']], ['financeOnly', ['finance.manage']], ['empty', []]]) {
    let roleId = null
    if (permissions) { const role = await db.role.create({ data: { name: `${prefix}-${kind}`, permissions: permissions.join(',') } }); roles.push(role.id); roleId = role.id }
    const user = await db.user.create({ data: { email: `${prefix}-${kind}@example.invalid`, passwordHash: 'test-only', role: kind === 'customer' ? 'CUSTOMER' : 'ADMIN', roleId, totpEnabledAt: new Date() } })
    users.push(user)
    assert.equal(await permits(user), ['full', 'finance'].includes(kind), kind)
  }
  const finance = users[3], token = await request(finance)
  const role = await db.role.findUniqueOrThrow({ where: { id: finance.roleId } })
  assert.equal((await db.role.updateMany({ where: { id: role.id, permissions: role.permissions }, data: { permissions: '' } })).count, 1)
  assert.equal(await guard.invoiceStaffAccess(token), false, 'same cookie loses access immediately on role downgrade')
  await db.role.updateMany({ where: { id: role.id, permissions: '' }, data: { permissions: role.permissions } })
  assert.equal(await guard.invoiceStaffAccess(token), true)
  await db.user.updateMany({ where: { id: finance.id, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } })
  assert.equal(await guard.invoiceStaffAccess(token), false)
  await db.user.updateMany({ where: { id: finance.id, status: 'SUSPENDED' }, data: { status: 'ACTIVE' } })
  await db.user.updateMany({ where: { id: finance.id }, data: { passwordChangedAt: new Date(Date.now() + 60_000) } })
  assert.equal(await guard.invoiceStaffAccess(token), false, 'password-reset session revocation')
  await db.user.updateMany({ where: { id: finance.id }, data: { passwordChangedAt: null } })
  const restriction = await db.accessRestriction.create({ data: { userId: finance.id, scope: 'GLOBAL', effectKey: 'identity.suspend', capabilities: '["identity.authenticate"]', startsAt: new Date(Date.now() - 1000), reason: prefix } })
  assert.equal(await guard.invoiceStaffAccess(token), false)
  await db.accessRestriction.deleteMany({ where: { id: restriction.id, reason: prefix } })
  policyBefore = await db.setting.findUnique({ where: { key: 'security.policy.v1' } })
  prepared = JSON.stringify({ ...JSON.parse(policyBefore?.value || '{}'), requireAdmin2fa: true })
  if (policyBefore) assert.equal((await db.setting.updateMany({ where: { key: policyBefore.key, value: policyBefore.value }, data: { value: prepared } })).count, 1)
  else await db.setting.create({ data: { key: 'security.policy.v1', value: prepared } })
  policyChanged = true; access.clearAdminPolicyCache()
  await db.user.updateMany({ where: { id: finance.id }, data: { totpEnabledAt: null } })
  assert.equal(await guard.invoiceStaffAccess(token), false, 'canonical staff 2-step policy applies to pages')
  await db.user.updateMany({ where: { id: finance.id }, data: { totpEnabledAt: new Date() } })
  assert.equal(await guard.invoiceStaffAccess(token), true)
  console.log('Invoice viewer guard: real signed cookies, current scoped roles, downgrade, suspension, password reset, global restriction and staff 2-step policy passed')
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  try {
    if (policyChanged) {
      if (policyBefore) assert.equal((await db.setting.updateMany({ where: { key: policyBefore.key, value: prepared }, data: { value: policyBefore.value } })).count, 1)
      else assert.equal((await db.setting.deleteMany({ where: { key: 'security.policy.v1', value: prepared } })).count, 1)
    }
    const ids = users.map(u => u.id)
    await db.accessRestriction.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids }, email: { startsWith: prefix } } })
    await db.role.deleteMany({ where: { id: { in: roles }, name: { startsWith: prefix } } })
  } finally { await db.$disconnect() }
})
