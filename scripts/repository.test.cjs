const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { generateKeyPairSync, sign, verify, randomBytes } = require('node:crypto')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const r = load('src/modules/repository/domain/repository.ts')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('license keys: 100 random bits, readable, and forgiving of how people type them', () => {
  const key = r.licenseKeyFromBytes(randomBytes(24))
  assert.match(key, /^MBC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/, 'no I, L, O or U')
  assert.equal(r.normalizeLicenseKey(key), key)
  assert.equal(r.normalizeLicenseKey(key.toLowerCase().replace(/-/g, ' ')), key)
  assert.equal(r.normalizeLicenseKey('mbc-0O0O0-1I1L1-UUUUU-00000'), 'MBC-00000-11111-VVVVV-00000', 'look-alike letters are read as Crockford does')
  for (const bad of ['', 'MBC', 'ABC-00000-00000-00000-00000', 'MBC-0000-00000-00000-00000', 'MBC-00000-00000-00000-000000', 'MBC-!!!!!-00000-00000-00000', null, 5]) assert.equal(r.normalizeLicenseKey(bad), '', String(bad))
  assert.throws(() => r.licenseKeyFromBytes(new Uint8Array(5)))
  const keys = new Set(Array.from({ length: 200 }, () => r.licenseKeyFromBytes(randomBytes(24))))
  assert.equal(keys.size, 200)
  assert.ok(!r.maskKey('ABCDE').includes('MBC-AAAAA'))
})

test('a site is identified by its host name only', () => {
  assert.equal(r.normalizeSiteHost('https://Shop.Example.com:8443/path?x=1'), 'shop.example.com')
  assert.equal(r.normalizeSiteHost('shop.example.com'), 'shop.example.com')
  assert.equal(r.normalizeSiteHost('shop.example.com/x'), 'shop.example.com')
  assert.equal(r.normalizeSiteHost('Example.COM.'), 'example.com')
  for (const bad of ['', 'not a host', 'a..b', '-x.com', 'x'.repeat(300), 'https://', 'exa mple.com', 'bad_host.com', 'x@y.com']) assert.throws(() => r.normalizeSiteHost(bad), r.RepoError, bad)
})

test('repository addresses must be public https unless development allows more', () => {
  assert.equal(r.safeRepositoryUrl('https://plugins.example.com/x?y=1'), 'https://plugins.example.com')
  assert.equal(r.safeRepositoryUrl(''), '')
  for (const bad of ['http://plugins.example.com', 'https://localhost', 'https://127.0.0.1', 'https://10.1.2.3', 'https://192.168.0.5', 'https://172.16.0.1', 'https://169.254.169.254', 'https://db.internal', 'https://a.local', 'https://user:pw@plugins.example.com', 'ftp://x.example.com', 'nope']) assert.throws(() => r.safeRepositoryUrl(bad), r.RepoError, bad)
  assert.equal(r.safeRepositoryUrl('http://localhost:3100', { allowPrivate: true }), 'http://localhost:3100')
  assert.throws(() => r.safeRepositoryUrl('https://user:pw@x.example.com', { allowPrivate: true }), r.RepoError, 'credentials in the address are never allowed')
})

test('products are validated: id, name, price, limits, images', () => {
  const ok = r.normalizeProduct({ slug: 'my-plugin', name: ' <b>My</b> plugin ', price: '۱۲۰٬۰۰۰', siteLimit: '3', supportDays: 30, icon: 'https://x.example.com/a.png', active: true, kind: 'THEME' })
  assert.equal(ok.priceMinor, 120000n); assert.equal(ok.siteLimit, 3); assert.equal(ok.kind, 'THEME'); assert.ok(!ok.name.includes('<'))
  assert.equal(r.normalizeProduct({ slug: 'free-one', name: 'Free' }).priceMinor, 0n)
  assert.equal(r.normalizeProduct({ slug: 'free-one', name: 'Free', active: 'yes' }).active, false, 'only a real boolean publishes')
  for (const bad of [{ slug: 'Bad', name: 'x' }, { slug: 'a', name: 'x' }, { slug: 'ok-one', name: '' }, { slug: 'ok-one', name: 'x', price: '-5' }, { slug: 'ok-one', name: 'x', price: 'abc' }, { slug: 'ok-one', name: 'x', icon: 'javascript:alert(1)' }, { slug: 'ok-one', name: 'x', icon: 'http://x.example.com/a.png' }]) assert.throws(() => r.normalizeProduct(bad), r.RepoError, JSON.stringify(bad))
})

test('a release must match its product and move the version forward', () => {
  const product = { slug: 'my-plugin', kind: 'PLUGIN' }
  const m = (extra = {}) => ({ id: 'my-plugin', kind: 'plugin', version: '1.1.0', ...extra })
  assert.doesNotThrow(() => r.checkReleaseManifest(m(), product, ['1.0.0']))
  assert.throws(() => r.checkReleaseManifest(m({ id: 'other' }), product, []), /یکی نیست/)
  assert.throws(() => r.checkReleaseManifest(m({ kind: 'theme' }), product, []), /نوع/)
  assert.throws(() => r.checkReleaseManifest(m({ version: '1.0.0' }), product, ['1.0.0']), (e) => e.status === 409)
  assert.throws(() => r.checkReleaseManifest(m({ version: '1.0.5' }), product, ['1.0.0', '1.1.0']), /قدیمی‌تر/)
  assert.throws(() => r.checkReleaseManifest(m({ version: 'latest' }), product, []), /معتبر/)
  assert.equal(r.compareVersions('1.2.0', '1.10.0'), -1)
  assert.equal(r.compareVersions('2.0.0-rc.1', '2.0.0'), -1)
})

test('what a license entitles to: sites, updates period, revocation', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  const license = (extra = {}) => ({ status: 'ACTIVE', siteLimit: 1, updatesUntil: null, ...extra })
  assert.deepEqual(r.decideActivation(license(), [], 'a.example.com'), { ok: true, reuse: false })
  assert.deepEqual(r.decideActivation(license(), [{ site: 'a.example.com', active: true }], 'a.example.com'), { ok: true, reuse: true }, 'the same site refreshes')
  assert.deepEqual(r.decideActivation(license(), [{ site: 'a.example.com', active: true }], 'b.example.com'), { ok: false, reason: 'limit' })
  assert.deepEqual(r.decideActivation(license(), [{ site: 'a.example.com', active: false }], 'b.example.com'), { ok: true, reuse: false }, 'a released place is free again')
  assert.deepEqual(r.decideActivation(license({ siteLimit: 0 }), Array.from({ length: 50 }, (_, i) => ({ site: `s${i}.example.com`, active: true })), 'new.example.com'), { ok: true, reuse: false }, '0 = unlimited')
  assert.deepEqual(r.decideActivation(license({ status: 'REVOKED' }), [], 'a.example.com'), { ok: false, reason: 'revoked' })
  const until = r.updatesUntilFor(365, now)
  assert.equal(until.toISOString(), '2027-10-01T00:00:00.000Z')
  assert.equal(r.updatesUntilFor(0, now), null)
  assert.equal(r.releaseAllowed(new Date('2027-01-01'), { updatesUntil: until }), true)
  assert.equal(r.releaseAllowed(new Date('2028-01-01'), { updatesUntil: until }), false, 'releases after the period are not included')
  assert.equal(r.releaseAllowed(new Date('2099-01-01'), { updatesUntil: null }), true, 'a lifetime license gets everything')
})

test('certificates are signed over canonical JSON and checked for product, site, status and age', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  const cert = r.buildCertificate({ licenseId: 7, product: 'my-plugin', site: 'a.example.com', status: 'ACTIVE', updatesUntil: null, now })
  assert.equal(r.canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}')
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const sig = sign(null, Buffer.from(r.canonicalJson(cert)), privateKey)
  assert.equal(verify(null, Buffer.from(r.canonicalJson({ ...cert }).split('').join('')), publicKey, sig), true)
  assert.equal(verify(null, Buffer.from(r.canonicalJson({ ...cert, site: 'evil.example.com' })), publicKey, sig), false, 'a changed field breaks the signature')
  const expected = { product: 'my-plugin', site: 'a.example.com' }
  assert.equal(r.certificateProblem(cert, expected, now), '')
  assert.equal(r.certificateProblem(cert, { ...expected, site: 'b.example.com' }, now), 'site')
  assert.equal(r.certificateProblem(cert, { ...expected, product: 'x-plugin' }, now), 'product')
  assert.equal(r.certificateProblem({ ...cert, status: 'REVOKED' }, expected, now), 'revoked')
  assert.equal(r.certificateProblem(cert, expected, new Date(now.getTime() + 15 * 86_400_000)), 'expired', 'a certificate is trusted for 14 days offline')
  assert.equal(r.isCertificate(cert), true); assert.equal(r.isCertificate({ ...cert, status: 'MAYBE' }), false); assert.equal(r.isCertificate(null), false)
})

test("another site's catalog is never trusted as-is", () => {
  const sha = 'a'.repeat(64)
  const list = r.normalizeCatalog({ products: [
    { slug: 'good-one', kind: 'THEME', name: ' Good <script> ', summary: 's', icon: 'javascript:x', price: '1500', siteLimit: 3, latest: { version: '1.2.0', size: 1000, sha256: sha, runtime: 'code', signature: 'A'.repeat(86) } },
    { slug: 'Bad Slug', name: 'x' }, { slug: 'no-release', name: 'n', price: 'abc', latest: { version: 'x', sha256: 'zz' } }, 'junk', null, { slug: 'x'.repeat(80) },
  ] })
  assert.deepEqual(list.map((p) => p.slug), ['good-one', 'no-release'])
  const good = list[0]
  assert.ok(!good.name.includes('<')); assert.equal(good.icon, ''); assert.equal(good.free, false); assert.equal(good.latest.runtime, 'code'); assert.equal(good.latest.signature.length, 86)
  assert.equal(list[1].latest, null, 'a release with a bad version or checksum is dropped'); assert.equal(list[1].free, true, 'an unreadable price is not a price')
  assert.deepEqual(r.normalizeCatalog('nope'), []); assert.deepEqual(r.normalizeCatalog({ products: 5 }), [])
  assert.equal(r.coreSatisfies('^1.2.0', '1.5.0'), true); assert.equal(r.coreSatisfies('^1.6.0', '1.5.0'), false); assert.equal(r.coreSatisfies('^2.0.0', '1.5.0'), false); assert.equal(r.coreSatisfies('', '1.0.0'), true); assert.equal(r.coreSatisfies('weird', '1.0.0'), false)
})

test('wiring: public API is gated and signed, downloads check the license, the client verifies everything', () => {
  for (const file of ['src/app/api/repo/v1/meta/route.ts', 'src/app/api/repo/v1/catalog/route.ts', 'src/app/api/repo/v1/licenses/[action]/route.ts', 'src/app/api/repo/v1/download/[slug]/[version]/route.ts', 'src/app/api/repo/mine/route.ts', 'src/app/api/admin/repository/route.ts', 'src/app/api/admin/repository/upload/route.ts', 'src/app/api/admin/repository/client/route.ts', 'src/app/repository/page.tsx', 'src/app/repository/[slug]/page.tsx', 'src/app/dashboard/licenses/page.tsx', 'src/app/admin/repository/page.tsx', 'src/app/admin/repository/products/page.tsx', 'src/app/admin/repository/licenses/page.tsx', 'src/app/admin/repository/settings/page.tsx', 'src/plugins/repository/manifest.json']) assert.ok(fs.existsSync(path.join(root, file)), file)
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) for (const model of ['RepoProduct', 'RepoRelease', 'RepoLicense', 'RepoActivation']) assert.match(read(schema), new RegExp(`model ${model} `), `${schema} ${model}`)
  const pub = read('src/modules/repository/server/http/public.ts')
  assert.match(pub, /vendorGate/); assert.match(pub, /rateLimitHit/); assert.match(pub, /moduleGuard\('repository'\)/)
  const vendor = ['src/modules/repository/server/vendor.ts', ...fs.readdirSync(path.join(root, 'src/modules/repository/server/vendor')).filter(file => file.endsWith('.ts')).map(file => `src/modules/repository/server/vendor/${file}`)].map(read).join('\n')
  assert.match(vendor, /signPayload/); assert.match(vendor, /releaseAllowed/); assert.match(vendor, /idempotencyKey/); assert.match(vendor, /keyHash/)
  assert.ok(!/fileId/.test(pub), 'storage names never reach the public API')
  const client = read('src/modules/repository/server/client.ts')
  for (const needle of ['verifyPayload', 'sha256(r.buffer) !== latest.sha256', "redirect: 'error'", 'assertPublicHost', 'safeRepositoryUrl', 'setPackageEnabled']) assert.ok(client.includes(needle), needle)
  const admin = read('src/modules/repository/server/http/admin.ts')
  assert.match(admin, /repository\.manage/)
  assert.match(admin, /deleteProduct\(idOf\(body.id\), \{ req, actor: guard.admin \}\)/)
  assert.match(admin, /uploadRelease\([^\n]+\{ req, actor: guard.admin \}\)/)
  assert.match(vendor, /await auditAdminStrict/)
  assert.match(read('src/modules/repository/server/vendor/release-commands.ts'), /commitVendorCommand\(context/)
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /name: 'repository'/)
  assert.ok(fs.readdirSync(path.join(root, 'prisma/migrations')).some((d) => d.endsWith('_plugin_repository')))
})
