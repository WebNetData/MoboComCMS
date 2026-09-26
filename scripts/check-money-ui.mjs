import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src')
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
}
walk(root)

const violations = []
for (const file of files) {
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    // Literal dollar prefixes are not valid money rendering in a global product.
    // `$1`/`$2` regex replacement tokens and ordinary `${...}` templates are intentionally allowed.
    if (/`\$\$\{/.test(line) || />\s*\$[0-9]/.test(line) || (/["']\$[0-9]/.test(line) && !line.includes('.replace('))) {
      violations.push(`${rel}:${index + 1}: hard-coded dollar money display`)
    }
    if (rel !== 'src/i18n/dictionaries.ts' && /\b(?:revenueUsd|amountUsd|priceUsd|totalUsd)\b/.test(line)) {
      violations.push(`${rel}:${index + 1}: currency-specific field name in runtime source`)
    }
  })
}

if (violations.length) {
  console.error('Money UI invariants failed:\n' + violations.join('\n'))
  process.exit(1)
}
console.log(`Money UI invariants OK (${files.length} TS/TSX files scanned)`)
