const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const p = load('src/modules/server-panel/domain/policy')

test('paths are normalised and relative escapes collapse at the root', () => {
  assert.equal(p.normalizePath('/etc/../var//log/./nginx/'), '/var/log/nginx')
  assert.equal(p.normalizePath('/../../etc/passwd'), '/etc/passwd')
  assert.equal(p.normalizePath('etc/passwd'), null)
  assert.equal(p.normalizePath('/etc/\0x'), null)
  assert.equal(p.normalizePath(42), null)
  assert.equal(p.parentOf('/var/log'), '/var')
  assert.equal(p.parentOf('/var'), '/')
  assert.equal(p.joinPath('/', 'etc'), '/etc')
})

test('names cannot carry separators or dot segments', () => {
  assert.equal(p.safeName('site.conf'), 'site.conf')
  for (const bad of ['', '.', '..', 'a/b', 'x\0', 'a'.repeat(256)]) assert.equal(p.safeName(bad), null)
})

test('virtual filesystems are off limits; system binaries are read-only', () => {
  assert.equal(p.pathAccess('/proc/1/environ'), 'none')
  assert.equal(p.pathAccess('/sys'), 'none')
  assert.equal(p.pathAccess('/dev/sda'), 'none')
  assert.equal(p.pathAccess('/usr/bin/node'), 'read')
  assert.equal(p.pathAccess('/boot/grub'), 'read')
  assert.equal(p.pathAccess('/etc/nginx/nginx.conf'), 'write')
  assert.equal(p.pathAccess('/procfs-backup'), 'write')
})

test('anchor folders and extra protected roots are never removed', () => {
  for (const anchor of ['/', '/etc', '/home', '/var', '/var/log', '/usr']) assert.equal(p.canRemove(anchor), false)
  assert.equal(p.canRemove('/etc/nginx/sites-enabled/old.conf'), true)
  assert.equal(p.canRemove('/opt/app', ['/opt/app']), false)
  assert.equal(p.canRemove('/opt/app/tmp.txt', ['/opt/app']), true)
  assert.equal(p.canRemove('/usr/bin/node'), false)
})

test('IP allowlist: exact, CIDR, IPv4-mapped IPv6 and empty list', () => {
  const list = p.parseAllowlist('203.0.113.7, 10.8.0.0/24 2001:db8::1 junk 300.1.1.1 10.0.0.0/40')
  assert.deepEqual(list, ['203.0.113.7', '10.8.0.0/24', '2001:db8::1'])
  assert.equal(p.ipAllowed('203.0.113.7', list), true)
  assert.equal(p.ipAllowed('::ffff:203.0.113.7', list), true)
  assert.equal(p.ipAllowed('10.8.0.200', list), true)
  assert.equal(p.ipAllowed('10.8.1.1', list), false)
  assert.equal(p.ipAllowed('2001:DB8::1', list), true)
  assert.equal(p.ipAllowed('198.51.100.1', list), false)
  assert.equal(p.ipAllowed('local', list), false)
  assert.equal(p.ipAllowed('198.51.100.1', []), true)
  assert.equal(p.ipAllowed('5.6.7.8', ['0.0.0.0/0']), true)
})

test('SQL console accepts one read statement only', () => {
  for (const sql of ['SELECT * FROM "User"', 'with x as (select 1) select * from x', 'EXPLAIN SELECT 1', "SELECT 'drop table x' AS s", 'select 1 -- delete', 'PRAGMA table_info("User");']) assert.equal(p.readOnlySql(sql).ok, true, sql)
  for (const sql of ['DELETE FROM "User"', 'SELECT 1; DROP TABLE "User"', 'UPDATE x SET a=1', 'WITH d AS (DELETE FROM x RETURNING *) SELECT * FROM d', 'SELECT * INTO backup FROM "User" /* create */ ; ', 'PRAGMA query_only = 0', '', 'select pg_sleep(1); select 1', 'SELECT set_config(\'a\',\'b\',false)']) {
    const result = p.readOnlySql(sql)
    assert.equal(result.ok, false, sql)
  }
  assert.equal(p.safeIdent('User'), true)
  assert.equal(p.safeIdent('User"; drop'), false)
})

test('TOTP matches RFC 6238 test vectors (SHA-1)', () => {
  const secret = p.base32Encode(new Uint8Array(Buffer.from('12345678901234567890')))
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.deepEqual(Buffer.from(p.base32Decode(secret)).toString(), '12345678901234567890')
  const code = (seconds) => p.hotpFromDigest(new Uint8Array(crypto.createHmac('sha1', Buffer.from(p.base32Decode(secret))).update(Buffer.from(p.totpCounter(seconds * 1000))).digest()), 8)
  assert.equal(code(59), '94287082')
  assert.equal(code(1111111109), '07081804')
  assert.equal(code(2000000000), '69279037')
  assert.match(p.totpUri(secret, 'a@b.c', 'MoboCom Server'), /^otpauth:\/\/totp\/MoboCom%20Server%3Aa%40b\.c\?secret=GEZD/)
})

test('text detection and mode strings', () => {
  assert.equal(p.looksText('nginx.conf', new Uint8Array(Buffer.from('server {\n  listen 80;\n}\n'))), true)
  assert.equal(p.looksText('photo.png', new Uint8Array(Buffer.from('abc'))), false)
  assert.equal(p.looksText('blob', new Uint8Array([1, 2, 0, 4])), false)
  assert.equal(p.modeString(0o755), 'rwxr-xr-x')
  assert.equal(p.modeString(0o640), 'rw-r-----')
  assert.equal(p.isImageName('a.WEBP'), true)
})
