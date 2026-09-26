import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src')
const allowedDevSecret = 'src/platform/config/env.ts'
const violations = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) inspect(full)
  }
}
function inspect(file) {
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (line.includes('dev-secret-change-me') && rel !== allowedDevSecret) {
      violations.push(`${rel}:${index + 1}: development auth secret leaked outside the centralized env policy`)
    }
    if (/process\.env\.NEXTAUTH_SECRET\s*(?:\|\||\?\?)/.test(line)) {
      violations.push(`${rel}:${index + 1}: NEXTAUTH_SECRET fallback bypasses authSecret()`)
    }
    if (/process\.env\.(?:INTERNAL_JOBS_SECRET|TELEGRAM_BOT_TOKEN|PLISIO_API_KEY|FRENZYEX_API_KEY|FRENZYEX_CALLBACK_SECRET)\s*(?:\|\||\?\?)\s*["'][^"']+["']/.test(line)) {
      violations.push(`${rel}:${index + 1}: sensitive environment variable has a literal fallback`)
    }
  })
}
walk(root)

const seed = fs.readFileSync('prisma/seed.cjs', 'utf8')
for (const weak of ['admin123', 'customer123', 'support123']) {
  if (seed.includes(weak)) violations.push(`prisma/seed.cjs: predictable seeded credential ${weak} is forbidden`)
}
if (!seed.includes("SEED_DEMO_DATA === 'true'")) violations.push('prisma/seed.cjs: demo identities/data must be explicitly gated')

if (violations.length) {
  console.error('Security invariants failed:\n' + violations.join('\n'))
  process.exit(1)
}
console.log('Security invariants OK')
