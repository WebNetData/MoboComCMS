const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Uploaded packages are admin-supplied but rendered for every visitor, so the
// pure format/sanitizer/zip code is tested against hostile input directly.
const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative)
  if (cache.has(file)) return cache.get(file)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  const localRequire = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), `${name}.ts`))) : require(name)
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  cache.set(file, mod.exports)
  return mod.exports
}
const { parseManifest, validPackagePath, normalizeEntries, PACKAGE_LIMITS } = load('src/modules/packages/domain/format.ts')
const { sanitizePackageHtml, sanitizePackageCss, renderPlaceholders } = load('src/modules/packages/domain/sanitize.ts')
const { readZip, writeZip } = load('src/modules/packages/domain/zip.ts')

const BASE = '/api/public/packages/demo/files'
const example = dir => {
  const root = path.join(__dirname, '..', 'docs/packages/examples', dir)
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.relative(root, path.join(folder, entry.name)).split(path.sep).join('/')])
  return { manifest: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')), files: new Set(walk(root)) }
}

test('bundled example packages are valid', () => {
  for (const dir of ['promo-banner', 'ocean-theme']) {
    const { manifest, files } = example(dir)
    assert.equal(parseManifest(manifest, files).id, manifest.id)
    for (const file of files) assert.equal(validPackagePath(file), true, file)
  }
})

test('manifests reject unknown slots, missing files, bad ids and code-only fields', () => {
  const { manifest, files } = example('promo-banner')
  assert.throws(() => parseManifest({ ...manifest, id: 'Bad_ID' }, files), /id/)
  assert.throws(() => parseManifest({ ...manifest, slots: { 'admin.secret': 'slots/banner.fa.html' } }, files), /unknown slot/)
  assert.throws(() => parseManifest({ ...manifest, styles: ['missing.css'] }, files), /missing file/)
  assert.throws(() => parseManifest({ ...manifest, requiresCore: '^2.0.0' }, files), /core version/)
  assert.throws(() => parseManifest({ ...manifest, design: { radius: 4 } }, files), /only allowed for themes/)
  const theme = example('ocean-theme')
  assert.throws(() => parseManifest({ ...theme.manifest, design: { ...theme.manifest.design, colors: { ...theme.manifest.design.colors, accent: 'red;x:y' } } }, theme.files), /colors/)
})

test('package paths refuse traversal, hidden files, executables and sources in declarative packages', () => {
  for (const bad of ['../x.html', 'a/../../x.css', '/etc/passwd', 'a\\b.css', '.env', 'x/.git/config', 'run.js', 'x.php', 'server.ts', 'a'.repeat(200) + '.css']) assert.equal(validPackagePath(bad), false, bad)
  assert.equal(validPackagePath('src/server.ts', 'code'), true)
  assert.equal(validPackagePath('assets/logo.webp'), true)
})

test('package HTML cannot run script or escape its sandbox', () => {
  const html = sanitizePackageHtml('<div onclick="x()"><script>alert(1)</script><img src="x.png" onerror="alert(1)"><a href="javascript:alert(1)">a</a><iframe src="https://evil"></iframe><style>*{}</style><form action="/x"><input></form><p style="color:red">t</p><svg onload="x()"></svg></div>', BASE)
  for (const needle of ['onclick', '<script', 'onerror', 'javascript:', '<iframe', '<style', '<form', '<input', 'style=', '<svg']) assert.equal(html.includes(needle), false, needle)
  assert.match(html, new RegExp(`src="${BASE}/x.png"`))
  assert.match(sanitizePackageHtml('<a href="https://example.org">x</a>', BASE), /rel="noopener noreferrer"/)
  assert.match(sanitizePackageHtml('<a href="/plans">x</a>', BASE), /href="\/plans"/)
})

test('placeholders are escaped before sanitizing', () => {
  const out = renderPlaceholders('<b>{{settings.name}}</b> {{site.brand}} {{settings.missing}}', { brand: 'A&B', locale: 'fa', settings: { name: '<img src=x onerror=alert(1)>' } })
  assert.equal(out, '<b>&lt;img src=x onerror=alert(1)&gt;</b> A&amp;B ')
})

test('package CSS drops imports, markup and foreign url() while keeping package assets', () => {
  const css = sanitizePackageCss('@import url(https://evil/x.css); </style><script>x</script> a{background:url(javascript:alert(1))} b{background:url("img/bg.png")} c{background:url(http://tracker/x)} d{background:url(https://cdn.example/x.png)} e{background:url(../../secret)} f{x:expression(alert(1))}', BASE)
  for (const needle of ['@import', '</style', '<script', 'javascript', 'http://tracker', '../../', 'expression(']) assert.equal(css.includes(needle), false, needle)
  assert.match(css, new RegExp(`url\\("${BASE}/img/bg.png"\\)`))
  assert.match(css, /url\("https:\/\/cdn.example\/x.png"\)/)
})

test('zip reader round-trips, unwraps a top-level folder and refuses oversized entries', () => {
  const files = new Map([['pkg/manifest.json', Buffer.from('{"id":"x"}')], ['pkg/slots/a.html', Buffer.from('<p>hi</p>'.repeat(50))]])
  const zip = writeZip(files)
  const read = normalizeEntries(readZip(zip, PACKAGE_LIMITS))
  assert.deepEqual([...read.keys()].sort(), ['manifest.json', 'slots/a.html'])
  assert.equal(read.get('slots/a.html').toString(), '<p>hi</p>'.repeat(50))
  const bomb = writeZip(new Map([['manifest.json', Buffer.alloc(PACKAGE_LIMITS.maxEntryBytes + 1)]]))
  assert.throws(() => readZip(bomb, PACKAGE_LIMITS), /too large/)
  assert.throws(() => readZip(Buffer.from('not a zip at all, definitely not'), PACKAGE_LIMITS), /not a zip/)
})

test('git apply replaces the package directory in one fast-forward commit', async () => {
  const { commitDirectory, validGitTarget } = load('src/modules/packages/domain/github.ts')
  const target = { token: 't', repo: 'owner/repo', branch: 'main' }
  assert.equal(validGitTarget(target), true)
  for (const bad of [{ ...target, repo: 'no-slash' }, { ...target, branch: '../x' }, { ...target, token: '' }]) assert.equal(validGitTarget(bad), false)
  const calls = []
  const reply = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })
  const fetcher = async (url, init = {}) => {
    const route = `${init.method || 'GET'} ${url.replace('https://api.github.com/repos/owner/repo', '')}`
    calls.push({ route, body: init.body ? JSON.parse(init.body) : undefined })
    if (route === 'GET /git/ref/heads/main') return reply({ object: { sha: 'head' } })
    if (route === 'GET /git/commits/head') return reply({ tree: { sha: 'base' } })
    if (route === 'GET /git/trees/base?recursive=1') return reply({ tree: [{ path: 'src/plugins/demo/old.tsx', type: 'blob', sha: 'o' }, { path: 'src/plugins/demo/manifest.json', type: 'blob', sha: 'm' }, { path: 'src/plugins/other/x.ts', type: 'blob', sha: 'x' }] })
    if (route === 'POST /git/blobs') return reply({ sha: `blob-${calls.length}` })
    if (route === 'POST /git/trees') return reply({ sha: 'tree2' })
    if (route === 'POST /git/commits') return reply({ sha: 'commit2' })
    if (route === 'PATCH /git/refs/heads/main') return reply({})
    throw new Error(`unexpected ${route}`)
  }
  const result = await commitDirectory(target, 'src/plugins/demo', [{ path: 'manifest.json', data: Buffer.from('{}') }, { path: 'client.tsx', data: Buffer.from('x') }], 'msg', fetcher)
  assert.equal(result.commit, 'commit2')
  const tree = calls.find(call => call.route === 'POST /git/trees').body
  assert.equal(tree.base_tree, 'base')
  assert.deepEqual(tree.tree.map(entry => [entry.path, entry.sha === null]).sort(), [['src/plugins/demo/client.tsx', false], ['src/plugins/demo/manifest.json', false], ['src/plugins/demo/old.tsx', true]])
  assert.equal(calls.find(call => call.route === 'PATCH /git/refs/heads/main').body.force, false)
})

test('code packages need apiVersion and may carry build-time settings', () => {
  const root = path.join(__dirname, '..', 'docs/packages/examples/hello-code')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
  const files = new Set(['manifest.json', 'client.tsx'])
  assert.equal(parseManifest(manifest, files).runtime, 'code')
  assert.throws(() => parseManifest({ ...manifest, apiVersion: undefined }, files), /apiVersion/)
  assert.equal(validPackagePath('client.tsx', 'declarative'), false)
})

test('every migration belongs to exactly one release, and a shipped one is never edited', () => {
  const { verify, seal, readMigrations, compareVersions } = require('./release-migrations.cjs')
  const m = (name, sha256 = name) => ({ name, sha256 })
  const disk = [m('2026_a'), m('2026_b'), m('2026_c')]
  const manifest = { releases: { '1.0.0': { migrations: [m('2026_a'), m('2026_b')] } }, unreleased: ['2026_c'] }
  assert.deepEqual(verify(manifest, disk), [])
  const says = (changed, diskNow = disk) => verify(changed, diskNow).join(' | ')
  assert.match(says({ ...manifest, unreleased: [] }), /2026_c belongs to no release/)
  assert.match(says({ ...manifest, unreleased: ['2026_c', '2026_b'] }), /2026_b is listed twice/)
  assert.match(says(manifest, [m('2026_a', 'edited'), m('2026_b'), m('2026_c')]), /2026_a of release 1\.0\.0 was edited after it shipped/)
  assert.match(says(manifest, [m('2026_b'), m('2026_c')]), /2026_a of release 1\.0\.0 is missing/)
  assert.match(says({ ...manifest, unreleased: ['2026_c', '2026_d'] }), /2026_d is listed as unreleased but is not in prisma\/migrations/)
  assert.match(says({ releases: { '1.0.0': { migrations: [m('2026_b'), m('2026_c')] } }, unreleased: ['2026_a'] }), /2026_a is unreleased but sorts before 2026_c, which already shipped/)
  assert.match(says({ releases: { '1.0.0': { migrations: [m('2026_c')] }, '1.1.0': { migrations: [m('2026_a'), m('2026_b')] } }, unreleased: [] }), /release 1\.1\.0 holds 2026_a, which sorts before a migration of an earlier release/)
  assert.match(says({ releases: { next: { migrations: [m('2026_a'), m('2026_b')] } }, unreleased: ['2026_c'] }), /"next" is not a release version/)
  // An edit of an unreleased migration is allowed: it has not shipped.
  assert.deepEqual(verify(manifest, [m('2026_a'), m('2026_b'), m('2026_c', 'still being written')]), [])
  const closed = seal(manifest, disk, '1.1.0')
  assert.deepEqual([closed.unreleased, closed.releases['1.1.0'].migrations, verify(closed, disk)], [[], [m('2026_c')], []])
  assert.throws(() => seal(manifest, disk, '1.0.0'), /already closed/)
  assert.throws(() => seal(manifest, disk, '0.9.0'), /not newer/)
  assert.throws(() => seal(manifest, disk, 'soon'), /not a release version/)
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0)
  // The repository's own manifest agrees with its migrations.
  assert.deepEqual(verify(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'prisma/release-manifest.json'), 'utf8')), readMigrations()), [])
})

test('the states the database accepts are the states the code declares', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  const sql = read('prisma/migrations/20261216120000_money_state_rules/migration.sql')
  const allowed = (constraint) => { const m = sql.match(new RegExp('"' + constraint + '" CHECK \\("\\w+" IN \\(([^)]*)\\)\\)')); assert.ok(m, constraint); return m[1].split(',').map((value) => value.trim().replace(/'/g, '')).sort() }
  const union = (source, name) => { const m = source.match(new RegExp('type ' + name + ' = ([^\\n]+)')); assert.ok(m, name); return [...m[1].matchAll(/'([A-Z_]*)'/g)].map((x) => x[1]).sort() }
  const list = (source, name) => { const m = source.match(new RegExp(name + ' = \\[([^\\]]+)\\]')); assert.ok(m, name); return [...m[1].matchAll(/'([A-Z_]*)'/g)].map((x) => x[1]).sort() }
  // A wallet row type or an invoice state added in code needs a migration that lets the database accept it.
  assert.deepEqual(allowed('WalletTx_type_check'), union(read('src/modules/wallet/server/wallet.ts'), 'WalletTxType'))
  assert.deepEqual(allowed('Invoice_status_check'), list(read('src/modules/billing/server/billing.ts'), 'INVOICE_STATUSES'))
  assert.deepEqual(allowed('ReturnRequest_status_check'), union(read('src/modules/store/domain/returns.ts'), 'ReturnStatus'))
  assert.deepEqual(allowed('Order_status_check'), ['CANCELLED', 'EXPIRED', 'FAILED', 'PAID', 'PENDING', 'REFUNDED'])
  // Every state the payment rail can report is a state an order may hold.
  const rail = read('src/modules/billing/infrastructure/plisio.ts').match(/mapPlisioStatus\(status: string\): ([^{]+)\{/)[1]
  for (const [, state] of rail.matchAll(/'([A-Z_]+)'/g)) assert.ok(allowed('Order_status_check').includes(state), state)
  // Code that closes or reopens money rows claims the state it decided on; the database refuses the rest.
  const unconditional = /\.(invoice|order)\.update\(\{ where: \{ id[^}]*\}, data: \{ status: /
  for (const file of ['src/modules/checkout/server/checkout.ts', 'src/modules/reseller/server/reseller.ts', 'src/modules/wallet/server/topup.ts', 'src/modules/store/server/returns.ts', 'src/modules/orders/server/http/admin/orders/route.ts', 'src/modules/identity/server/http/admin/users/[id]/route.ts']) assert.doesNotMatch(read(file), unconditional, file)
})
