/**
 * i18n audit — finds translation keys used in the code that are missing from
 * one of the dictionaries, and keys present in `en` but not in `fa`.
 *
 *   node scripts/i18n-audit.cjs
 */
const fs = require('fs')
const path = require('path')

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, acc)
    // only components/pages use the t() helper (API routes have local `t` vars)
    else if (/\.tsx$/.test(entry.name)) acc.push(p)
  }
  return acc
}

const used = new Set()
for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\bt\.([A-Za-z_][A-Za-z0-9_]*)/g)) used.add(m[1])
}

const dict = fs.readFileSync('src/i18n/dictionaries.ts', 'utf8')
const [enPart, faPart] = dict.split(/^\s{2}fa: \{/m)
const keyRe = /^\s{4}([A-Za-z_][A-Za-z0-9_]*):\s/gm
const enKeys = new Set([...enPart.matchAll(keyRe)].map((m) => m[1]))
const faKeys = new Set([...(faPart || '').matchAll(keyRe)].map((m) => m[1]))

// keys built dynamically at runtime (status badges, expense categories, ...)
const dynamic = /^(st|exp|pay|crm|expense)/
// known false positives: `t.me` inside a telegram URL / local `t` variables
const ignore = new Set(['me'])

const missingEn = [...used].filter((k) => !enKeys.has(k) && !dynamic.test(k) && !ignore.has(k)).sort()
const missingFa = [...enKeys].filter((k) => !faKeys.has(k)).sort()

console.log(`used: ${used.size} · en: ${enKeys.size} · fa: ${faKeys.size}`)
console.log('missing in en:', missingEn.length ? missingEn.join(', ') : '—')
console.log('missing in fa:', missingFa.length ? missingFa.join(', ') : '—')
process.exit(missingEn.length || missingFa.length ? 1 : 0)
