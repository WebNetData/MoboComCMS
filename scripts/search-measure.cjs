// Search speed measurement on a LOCAL app with synthetic data. Not a test and not a production figure:
// it shows how the existing bounded search behaves as the index grows, so a deployment can be measured the same way.
//
//   node scripts/search-measure.cjs --scratch-database [--docs=20000] [--runs=5] [--base=http://localhost:3000] [--container=mobocom-app] [--keep]
//   node scripts/search-measure.cjs --scratch-database --real=20 [--runs=5]
//
// It needs DATABASE_URL of the same database the app at --base uses, and that database must be a local or staging copy
// (--scratch-database): the synthetic mode briefly adds PUBLISHED posts, which any visitor of that site could see.
// Synthetic mode adds posts and their search documents under one unique prefix, sets the index stamp so the app does not
// rebuild meanwhile, asks the public search API questions of known selectivity, prints median/p95/max per question and
// PostgreSQL's plan for one index batch, then removes everything it added and puts the stamp back (unless --keep).
// --real=N adds nothing: it times the N searches visitors asked most in the last 30 days (from the analytics counts), so
// a copy restored from a production backup shows that data's real distribution. Both modes take back the analytics
// counts their own requests added. It refuses any address that is not local.
const { PrismaClient } = require('@prisma/client')
const { execFileSync } = require('node:child_process')

const arg = (name, fallback) => { const hit = process.argv.find((value) => value.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback }
const flag = (name) => process.argv.includes(`--${name}`)
const DOCS = Math.max(100, Math.min(500_000, Math.floor(Number(arg('docs', 20_000)))))
const RUNS = Math.max(1, Math.min(20, Math.floor(Number(arg('runs', 5)))))
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '')
const CONTAINER = arg('container', '')
const KEEP = flag('keep')
const REAL = Math.max(0, Math.min(100, Math.floor(Number(arg('real', 0)) || 0)))
const CATALOGUE = Math.max(0, Math.min(100, Math.floor(Number(arg('catalogue', 0)) || 0)))
const REPORT = arg('report', '')
const measured = []
// The public search answers 60 requests a minute per address; staying under it keeps every sample a real answer.
const GAP_MS = 1_100

const host = new URL(BASE).hostname
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) { console.error(`Refused: ${BASE} is not a local address. Measure a deployment from its own server with its own copy of this tool.`); process.exit(2) }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required (the database of the app at --base).'); process.exit(2) }
if (!flag('scratch-database')) { console.error('Refused: pass --scratch-database to confirm DATABASE_URL is a local or staging copy, never the live site.'); process.exit(2) }

const db = new PrismaClient()
const prefix = `msr${Date.now().toString(36)}`
// Selectivity markers: every document has `all`, every 2nd `half`, every 10th `tenth`, every 100th `hund`, one has `one`.
const marker = (name) => `${prefix}${name}`
const WORDS = ['فیلم', 'سریال', 'آهنگ', 'بازی', 'نرم‌افزار', 'راهنما', 'آموزش', 'نقد', 'معرفی', 'تازه', 'قدیمی', 'ایرانی', 'خارجی', 'کمدی', 'درام', 'اکشن', 'مستند', 'کودک', 'خانواده', 'علمی', 'تخیلی', 'تاریخی', 'ورزشی', 'موسیقی', 'آلبوم', 'خواننده', 'کارگردان', 'بازیگر', 'فصل', 'قسمت', 'نسخه', 'دانلود', 'رایگان', 'ویژه', 'محبوب', 'برتر', 'ساده', 'کامل', 'سریع', 'امن']
const pick = (n, salt) => WORDS[(n * 31 + salt * 17) % WORDS.length]
const textOf = (n) => [
  marker('all'), n % 2 === 0 ? marker('half') : '', n % 10 === 0 ? marker('tenth') : '', n % 100 === 0 ? marker('hund') : '', n === 7 ? marker('one') : '',
  ...Array.from({ length: 28 }, (_, salt) => pick(n, salt)),
].filter(Boolean).join(' ')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] }
const memory = () => { if (!CONTAINER) return ''; try { return execFileSync('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', CONTAINER], { encoding: 'utf8', timeout: 20_000 }).trim() } catch { return 'n/a' } }

// Page-1 searches are counted in analytics (dim 'search'); remember how many this run added so they can be taken back.
const asked = new Map()
async function ask(query) {
  const params = new URLSearchParams(query)
  const counted = params.get('suggest') !== '1' && !params.get('cursor') && (params.get('page') || '1') === '1'
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now()
    const response = await fetch(`${BASE}/api/search?${query}`, { signal: AbortSignal.timeout(120_000) })
    const body = await response.json().catch(() => null)
    const ms = performance.now() - started
    await sleep(GAP_MS)
    if (response.status === 429) { await sleep(60_000); continue }
    if (response.status !== 200) throw new Error(`${query}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`)
    if (counted && body?.query) asked.set(body.query, (asked.get(body.query) || 0) + 1)
    return { ms, body }
  }
  throw new Error(`${query}: still limited after waiting`)
}

async function measure(label, query, expect) {
  const first = await ask(query) // warm-up, also the answer checked for sanity
  if (expect && !expect(first.body)) throw new Error(`${label}: unexpected answer ${JSON.stringify(first.body).slice(0, 300)}`)
  const samples = []
  for (let run = 0; run < RUNS; run++) samples.push((await ask(query)).ms)
  // A capped search (owner, 2026-10-20) reports what it read, at most its cap: shown as N+.
  const result = { label, total: `${first.body?.total ?? first.body?.results?.length ?? ''}${first.body?.capped ? '+' : ''}`, median: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples), body: first.body }
  measured.push({ label, total: result.total, samples, medianMs: result.median, p95Ms: result.p95, maxMs: result.max })
  return result
}

async function plan(token) {
  // Match the current owner's newest-first scan, including its date/id index.
  const rows = await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM "SearchDocument" WHERE "text" LIKE $1 ORDER BY "publishedAt" DESC, id DESC LIMIT 500`, `%${token}%`)
  const root = rows[0]['QUERY PLAN'][0]
  const nodes = []
  const walk = (node) => { nodes.push(node['Node Type'] + (node['Index Name'] ? ` (${node['Index Name']})` : '')); for (const child of node.Plans || []) walk(child) }
  walk(root.Plan)
  return { nodes: nodes.join(' > '), ms: root['Execution Time'], shared: (root.Plan['Shared Hit Blocks'] || 0) + (root.Plan['Shared Read Blocks'] || 0) }
}

let originalStamp = null, stampRead = false
async function seed() {
  originalStamp = await db.setting.findUnique({ where: { key: 'search.indexedAt' } }); stampRead = true
  const publishedAt = new Date(Date.now() - 86_400_000)
  for (let start = 1; start <= DOCS; start += 1000) {
    const size = Math.min(1000, DOCS - start + 1)
    await db.post.createMany({ data: Array.from({ length: size }, (_, offset) => { const n = start + offset; return { slug: `${prefix}-${n}`, title: `${pick(n, 1)} ${pick(n, 2)} ${n}`, content: textOf(n), status: 'PUBLISHED', publishedAt } }) })
    const posts = await db.post.findMany({ where: { slug: { in: Array.from({ length: size }, (_, offset) => `${prefix}-${start + offset}`) } }, select: { id: true, slug: true, title: true } })
    await db.searchDocument.createMany({ data: posts.map((post) => { const n = Number(post.slug.slice(prefix.length + 1)); return { itemType: 'post', itemId: post.id, title: post.title, text: textOf(n), url: `/blog/${post.slug}`, boost: n % 50, publishedAt } }) })
    process.stdout.write(`\rseeded ${Math.min(DOCS, start + size - 1)}/${DOCS}`)
  }
  process.stdout.write('\n')
  // A fresh stamp: the app trusts the index for ten minutes instead of rebuilding it under the measurement.
  await db.setting.upsert({ where: { key: 'search.indexedAt' }, create: { key: 'search.indexedAt', value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
}

/** Takes back the analytics search counts this run added (today's row, or yesterday's if the day turned meanwhile). */
async function forgetSearches() {
  for (const [value, times] of asked) {
    for (const dim of ['search', 'search-empty']) {
      const rows = await db.$queryRawUnsafe('SELECT "day", "count" FROM "AnalyticsDimension" WHERE "dim" = $1 AND "value" = $2 ORDER BY "day" DESC LIMIT 2', dim, value.slice(0, 120))
      let left = times
      for (const row of rows) {
        if (left <= 0) break
        const take = Math.min(left, Number(row.count)); left -= take
        if (take === Number(row.count)) await db.$executeRawUnsafe('DELETE FROM "AnalyticsDimension" WHERE "dim" = $1 AND "value" = $2 AND "day" = $3', dim, value.slice(0, 120), row.day)
        else await db.$executeRawUnsafe('UPDATE "AnalyticsDimension" SET "count" = "count" - $4 WHERE "dim" = $1 AND "value" = $2 AND "day" = $3', dim, value.slice(0, 120), row.day, take)
      }
    }
  }
}

async function cleanup() {
  await forgetSearches().catch((error) => console.error('could not take back the analytics counts:', error.message))
  if (REAL) return
  if (KEEP) { console.log(`--keep: left posts/documents with prefix ${prefix}`); return }
  await db.searchDocument.deleteMany({ where: { itemType: 'post', url: { startsWith: `/blog/${prefix}-` } } })
  for (;;) {
    const batch = await db.post.findMany({ where: { slug: { startsWith: `${prefix}-` } }, select: { id: true }, take: 5000 })
    if (!batch.length) break
    await db.post.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } })
  }
  if (stampRead) {
    if (originalStamp) await db.setting.update({ where: { key: 'search.indexedAt' }, data: { value: originalStamp.value } })
    else await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
  }
  const left = await db.post.count({ where: { slug: { startsWith: `${prefix}-` } } }) + await db.searchDocument.count({ where: { url: { startsWith: `/blog/${prefix}-` } } })
  console.log(left ? `cleanup left ${left} rows with prefix ${prefix}` : 'cleanup: all synthetic rows removed, index stamp restored')
}

async function real() {
  // The most asked searches of the last 30 days, as the analytics module counted them.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const top = await db.$queryRawUnsafe('SELECT "value", SUM("count")::int AS "times" FROM "AnalyticsDimension" WHERE "dim" = \'search\' AND "day" >= $1 GROUP BY "value" ORDER BY "times" DESC LIMIT $2', since, REAL)
  if (!top.length) { console.log('No searches were counted in the last 30 days (analytics off, or a fresh database): nothing to replay.'); return }
  console.log(`Replaying the ${top.length} most asked searches of the last 30 days against ${await db.searchDocument.count()} documents; ${RUNS} runs each; ${BASE}`)
  const results = []
  for (const row of top) results.push({ ...await measure(row.value.slice(0, 28), `q=${encodeURIComponent(row.value)}`), asked: row.times })
  console.log('\nsearch                          asked   matches    median ms   p95 ms   max ms')
  for (const row of results) console.log(`${row.label.padEnd(30)}  ${String(row.asked).padStart(5)}  ${String(row.total).padStart(8)}  ${row.median.toFixed(0).padStart(10)}  ${row.p95.toFixed(0).padStart(7)}  ${row.max.toFixed(0).padStart(7)}`)
  const weighted = results.reduce((sum, row) => sum + row.median * row.asked, 0) / results.reduce((sum, row) => sum + row.asked, 0)
  console.log(`\nmedian weighted by how often each was asked: ${weighted.toFixed(0)} ms`)
}

async function main() {
  if (REAL) return real()
  if (CATALOGUE) {
    const kinds = await db.searchDocument.groupBy({ by: ['itemType'] })
    const rows = []
    for (const kind of kinds) rows.push(...await db.searchDocument.findMany({ where: { itemType: kind.itemType }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: Math.ceil(CATALOGUE / kinds.length), select: { title: true, itemType: true } }))
    const queries = [...new Map(rows.map(row => { const query = row.title.trim().split(/\s+/).slice(0, 3).join(' '); return [query, { query, type: row.itemType }] })).values()].filter(row => row.query.length >= 2).slice(0, CATALOGUE)
    console.log(`Catalogue-derived sample: ${queries.length} queries from ${await db.searchDocument.count()} actual indexed documents; not visitor traffic`)
    for (let i = 0; i < queries.length; i++) {
      const row = queries[i], result = await measure(`${row.type} sample ${i + 1}`, `q=${encodeURIComponent(row.query)}`)
      console.log(`${result.label}: ${result.total} matches, median ${result.median.toFixed(1)} ms, p95 ${result.p95.toFixed(1)} ms`)
    }
    return
  }
  const existing = await db.searchDocument.count()
  console.log(`Local synthetic measurement — ${DOCS} added documents on top of ${existing} existing; ${RUNS} runs per question; ${BASE}`)
  const before = memory()
  const seeded = performance.now()
  await seed()
  console.log(`seeding took ${Math.round((performance.now() - seeded) / 1000)} s`)
  const q = (token, extra = '') => `q=${encodeURIComponent(token)}${extra}`
  const results = []
  results.push(await measure('one match', q(marker('one')), (body) => body.total === 1))
  results.push(await measure('1% match', q(marker('hund')), (body) => (body.capped ? body.total <= Math.floor(DOCS / 100) : body.total === Math.floor(DOCS / 100))))
  results.push(await measure('10% match', q(marker('tenth')), (body) => (body.capped ? body.total <= Math.floor(DOCS / 10) : body.total === Math.floor(DOCS / 10))))
  results.push(await measure('50% match', q(marker('half')), (body) => (body.capped ? body.total <= Math.floor(DOCS / 2) : body.total === Math.floor(DOCS / 2))))
  results.push(await measure('100% match', q(marker('all')), (body) => (body.capped ? body.total <= DOCS : body.total === DOCS)))
  results.push(await measure('two words (5%)', q(`${marker('half')} ${marker('tenth')}`), (body) => (body.capped ? body.total <= Math.floor(DOCS / 10) : body.total === Math.floor(DOCS / 10))))
  results.push(await measure('100%, posts only', q(marker('all'), '&type=post'), (body) => (body.capped ? body.total <= DOCS : body.total === DOCS)))
  const fifty = await measure('100%, page 50', q(marker('all'), '&page=50'), (body) => body.hits?.length > 0)
  results.push(fifty)
  if (fifty.body.nextCursor) results.push(await measure('100%, past page 50 (cursor)', q(marker('all'), `&cursor=${encodeURIComponent(fifty.body.nextCursor)}`), (body) => body.page === 51))
  results.push(await measure('100%, newest first', q(marker('all'), '&sort=newest'), (body) => (body.capped ? body.total <= DOCS : body.total === DOCS)))
  results.push(await measure('autocomplete', q(marker('all'), '&suggest=1'), (body) => Array.isArray(body.results)))
  results.push(await measure('common Persian word', q('راهنما'), (body) => typeof body.total === 'number'))
  const after = memory()

  console.log('\nquestion                        matches    median ms   p95 ms   max ms')
  for (const row of results) console.log(`${row.label.padEnd(30)}  ${String(row.total).padStart(8)}  ${row.median.toFixed(0).padStart(10)}  ${row.p95.toFixed(0).padStart(7)}  ${row.max.toFixed(0).padStart(7)}`)
  console.log('\nPostgreSQL plan for one 500-row index batch (the search repeats it until the matches run out):')
  for (const name of ['one', 'tenth', 'all']) { const p = await plan(marker(name)); console.log(`  ${name.padEnd(6)} ${p.ms.toFixed(1)} ms  ${p.shared} buffers  ${p.nodes}`) }
  if (CONTAINER) console.log(`\napp memory (${CONTAINER}): before ${before} → after ${after}`)
  console.log('\nThese are local numbers on synthetic text. They show growth with index size and selectivity, not production latency.')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    try {
      if (REPORT) require('node:fs').writeFileSync(REPORT, JSON.stringify({ recordedAt: new Date().toISOString(), mode: REAL ? 'recorded-local-queries' : CATALOGUE ? 'catalogue-derived-queries' : 'synthetic', runs: RUNS, indexedDocuments: await db.searchDocument.count(), measurements: measured, successful: !process.exitCode }, null, 2))
    } finally { await cleanup() }
  } finally { await db.$disconnect() }
})
