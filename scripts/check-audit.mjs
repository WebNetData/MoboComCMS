import fs from 'node:fs'

const requiredFiles = [
  'src/platform/audit/server.ts',
  'src/platform/observability/logger.ts',
  'src/middleware.ts',
  'scripts/migrate-platform-audit.py',
  'src/modules/identity/server/http/admin/audit/route.ts',
]
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`audit/observability file missing: ${file}`)
}

for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) {
  const text = fs.readFileSync(schema, 'utf8')
  if (!/model\s+AuditLog\s*\{/.test(text)) throw new Error(`AuditLog model missing from ${schema}`)
}

const critical = [
  'src/modules/identity/server/http/admin/users/route.ts',
  'src/modules/identity/server/http/admin/users/[id]/route.ts',
  'src/modules/orders/server/http/admin/orders/route.ts',
  'src/modules/billing/server/http/admin/invoices/route.ts',
  'src/modules/reseller/server/http/admin/resellers/route.ts',
]
for (const file of critical) {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes("@/platform/audit/server") || !text.includes('auditAdmin(')) {
    throw new Error(`critical privileged route lacks audit logging: ${file}`)
  }
}

const rbac = fs.readFileSync('src/modules/identity/rbac.ts', 'utf8')
if (!rbac.includes("'audit.view'")) throw new Error('audit.view permission missing')
// The role definitions are shared by the seed and the web installer.
const seed = fs.readFileSync('prisma/system-roles.json', 'utf8')
if (!seed.includes('audit.view')) throw new Error('seed admin role lacks audit.view')

console.log('Audit/observability invariants OK')
