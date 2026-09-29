#!/usr/bin/env node
// Load test for a MoboComCMS site (no dependencies).
//   node scripts/load-test.mjs https://example.com --users 50 --seconds 60 [--paths /,/products,/blog] [--cookie "next-auth.session-token=…"]
// Virtual users request the paths in turn as fast as the server answers; the
// report shows throughput, latency percentiles and errors per path. Run it
// from another machine, and against production only when traffic is low.

const args = process.argv.slice(2)
const base = (args.find((arg) => /^https?:\/\//.test(arg)) || '').replace(/\/+$/, '')
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback }
if (!base) {
  console.error('usage: node scripts/load-test.mjs <base-url> [--users 20] [--seconds 30] [--paths /,/products] [--cookie "…"]')
  process.exit(1)
}
const users = Math.max(1, Math.min(2000, Number(option('users', 20))))
const seconds = Math.max(5, Math.min(3600, Number(option('seconds', 30))))
const paths = option('paths', '/,/products,/blog,/software,/api/search?q=test').split(',').map((p) => p.trim()).filter(Boolean)
const cookie = option('cookie', '')
const stats = new Map(paths.map((p) => [p, { times: [], errors: 0, codes: {} }]))
const until = Date.now() + seconds * 1000
let total = 0

async function user(index) {
  let turn = index
  while (Date.now() < until) {
    const path = paths[turn++ % paths.length]
    const row = stats.get(path)
    const started = performance.now()
    try {
      const response = await fetch(base + path, { headers: { 'user-agent': 'MoboCom-LoadTest/1.0', ...(cookie ? { cookie } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
      await response.arrayBuffer()
      row.codes[response.status] = (row.codes[response.status] || 0) + 1
      if (response.status >= 500) row.errors++
    } catch { row.errors++; row.codes.ERR = (row.codes.ERR || 0) + 1 }
    row.times.push(performance.now() - started)
    total++
  }
}

const pct = (values, p) => { if (!values.length) return 0; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
const ms = (n) => `${Math.round(n)}ms`.padStart(8)
console.log(`Load test: ${base} — ${users} users for ${seconds}s on ${paths.length} paths…`)
const ticker = setInterval(() => process.stdout.write(`\r  ${total} requests`), 1000)
const started = Date.now()
await Promise.all(Array.from({ length: users }, (_, i) => user(i)))
clearInterval(ticker)
const elapsed = (Date.now() - started) / 1000
console.log(`\n\n${'path'.padEnd(34)}${'reqs'.padStart(7)}${'p50'.padStart(8)}${'p95'.padStart(8)}${'p99'.padStart(8)}${'err'.padStart(6)}  codes`)
const all = []
let errors = 0
for (const [path, row] of stats) {
  all.push(...row.times); errors += row.errors
  console.log(`${path.slice(0, 33).padEnd(34)}${String(row.times.length).padStart(7)}${ms(pct(row.times, 50))}${ms(pct(row.times, 95))}${ms(pct(row.times, 99))}${String(row.errors).padStart(6)}  ${JSON.stringify(row.codes)}`)
}
console.log(`\nTotal: ${total} requests in ${elapsed.toFixed(1)}s = ${(total / elapsed).toFixed(1)} req/s · p50 ${Math.round(pct(all, 50))}ms · p95 ${Math.round(pct(all, 95))}ms · p99 ${Math.round(pct(all, 99))}ms · errors ${errors} (${((errors / Math.max(1, total)) * 100).toFixed(2)}%)`)
process.exit(errors / Math.max(1, total) > 0.01 ? 2 : 0)
