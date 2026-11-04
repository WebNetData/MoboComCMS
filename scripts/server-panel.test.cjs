const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
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

const m = load('src/modules/mail/domain/mail')

test('SMTP settings: validation, local mode and kept password', () => {
  const current = { ...m.SMTP_DEFAULTS, password: 'encv1:old' }
  const ok = m.normalizeSmtp({ enabled: true, host: 'SMTP.Example.com', port: '465', security: 'tls', user: 'u', password: '', fromName: 'موبوکام', fromEmail: 'No-Reply@Example.com' }, current)
  assert.equal(ok.ok, true)
  assert.equal(ok.value.host, 'smtp.example.com')
  assert.equal(ok.value.port, 465)
  assert.equal(ok.value.password, 'encv1:old')
  assert.equal(ok.value.fromEmail, 'no-reply@example.com')
  const local = m.normalizeSmtp({ enabled: true, mode: 'local', fromEmail: 'a@b.co', password: 'x' }, current)
  assert.deepEqual([local.value.host, local.value.port, local.value.security, local.value.password], ['127.0.0.1', 25, 'none', ''])
  assert.equal(m.normalizeSmtp({ enabled: true, host: 'smtp.x.com', port: 587, fromEmail: 'bad' }, current).ok, false)
  assert.equal(m.normalizeSmtp({ host: 'smtp.x.com', port: 70000 }, current).ok, false)
  assert.equal(m.normalizeSmtp({ host: 'smtp.x.com', port: 587, fromName: 'a<b>' }, current).ok, false)
  assert.equal(m.isEmail('a@b.co\r\nBcc: x@y.z'), false)
})

test('mailbox registry round-trips and disabled boxes stop login and delivery', () => {
  const registry = {
    domains: ['example.com', 'shop.example.org'],
    mailboxes: [
      { address: 'info@example.com', hash: '{BLF-CRYPT}$2y$10$abc', quotaMb: 1024, disabled: false },
      { address: 'old@example.com', hash: '{BLF-CRYPT}$2y$10$def', quotaMb: 0, disabled: true },
    ],
    aliases: [{ address: 'sales@example.com', targets: ['info@example.com', 'me@gmail.com'] }],
  }
  const files = m.serializeRegistry(registry)
  assert.match(files.domains, /^example\.com OK$/m)
  assert.match(files.mailboxes, /^info@example\.com example\.com\/info\/$/m)
  assert.doesNotMatch(files.mailboxes, /old@/)
  assert.match(files.passwd, /^old@example\.com:!\{BLF-CRYPT\}/m)
  assert.match(files.passwd, /^info@example\.com:\{BLF-CRYPT\}\$2y\$10\$abc::::::userdb_quota_rule=\*:storage=1024M$/m)
  assert.deepEqual(m.parseRegistry(files), registry)
  assert.equal(m.dovecotHash('$2a$10$xyz'), '{BLF-CRYPT}$2y$10$xyz')
})

test('mailbox names, passwords and domains', () => {
  for (const good of ['info', 'first.last', 'a+b', 'x_1']) assert.equal(m.isLocalPart(good), true, good)
  for (const bad of ['', '.a', 'a.', 'a..b', 'A', 'a b', 'a@b']) assert.equal(m.isLocalPart(bad), false, bad)
  assert.equal(m.passwordProblem('short1'), 'رمز صندوق باید دست‌کم ۱۰ نویسه باشد')
  assert.ok(m.passwordProblem('abcdefghijk'))
  assert.ok(m.passwordProblem('abc:defgh12'))
  assert.equal(m.passwordProblem('Strong-pass-2026'), null)
  assert.equal(m.isDomain('example.com'), true)
  assert.equal(m.isDomain('localhost'), false)
})

test('DNS suggestions and presence check', () => {
  const records = m.dnsRecords('example.com', 'mail.example.com', '203.0.113.7', { selector: 'mobocom', publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAabcdefghijklmnopqrstuvwxyz' })
  assert.deepEqual(records.map((r) => `${r.type} ${r.name}`), ['A mail.example.com', 'MX example.com', 'TXT example.com', 'TXT _dmarc.example.com', 'TXT mobocom._domainkey.example.com'])
  const mx = records.find((r) => r.type === 'MX')
  assert.equal(m.recordPresent(mx, ['10 mail.example.com']), true)
  assert.equal(m.recordPresent(mx, ['10 mx.other.net']), false)
  const spf = records.find((r) => r.name === 'example.com' && r.type === 'TXT')
  assert.equal(m.recordPresent(spf, ['google-site-verification=x', 'v=spf1 include:_spf.google.com ~all']), true)
  const dkim = records.at(-1)
  assert.equal(m.recordPresent(dkim, ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAabcdefghijklmnopqrstuvwxyz']), true)
})

test('Gmail: app password spaces removed, From defaults to the account, daily cap, TLS required', () => {
  const r = m.normalizeSmtp({ enabled: true, host: 'smtp.gmail.com', port: 587, security: 'starttls', user: 'Mobocom.Net@gmail.com', password: 'abcd efgh ijkl mnop' }, m.SMTP_DEFAULTS)
  assert.equal(r.ok, true)
  assert.equal(r.value.password, 'abcdefghijklmnop')
  assert.equal(r.value.fromEmail, 'mobocom.net@gmail.com')
  assert.equal(r.value.dailyLimit, m.GMAIL_DAILY_LIMIT)
  assert.equal(r.value.events.PAYMENT_PAID, true)
  assert.equal(m.normalizeSmtp({ host: 'smtp.gmail.com', port: 25, security: 'none', user: 'a@gmail.com' }, m.SMTP_DEFAULTS).ok, false)
  assert.equal(m.normalizeSmtp({ host: 'smtp.gmail.com', port: 587, user: 'mobocom' }, m.SMTP_DEFAULTS).ok, false)
  const off = m.normalizeSmtp({ host: 'smtp.gmail.com', port: 465, security: 'tls', user: 'a@gmail.com', dailyLimit: 100, notifyUsers: true, events: { TICKET_REPLY: false } }, m.SMTP_DEFAULTS)
  assert.equal(off.value.dailyLimit, 100)
  assert.equal(off.value.events.TICKET_REPLY, false)
  assert.equal(m.readSmtp({ events: { TICKET_REPLY: false } }).events.TICKET_REPLY, false)
})

test('notification email is escaped, RTL and links to the site; placeholder inboxes are skipped', () => {
  const email = m.notificationEmail({ brand: 'موبوکام', site: 'https://mobocom.net', name: '<b>علی</b>', title: 'پاسخ تیکت', body: 'متن\nدوم', href: '/tickets/5' })
  assert.match(email.html, /dir="rtl"/)
  assert.match(email.html, /&lt;b&gt;علی&lt;\/b&gt;/)
  assert.match(email.html, /href="https:\/\/mobocom\.net\/tickets\/5"/)
  assert.match(email.html, /متن<br>دوم/)
  assert.match(email.text, /مشاهده: https:\/\/mobocom\.net\/tickets\/5/)
  assert.equal(email.subject, 'پاسخ تیکت — موبوکام')
  assert.equal(m.deliverableEmail('user@gmail.com'), true)
  for (const bad of ['989121112233@phone.mobocom.local', 'ai-assistant@bot.mobocom.local', 'x@telegram.local', 'not-an-email']) assert.equal(m.deliverableEmail(bad), false, bad)
})

// ------------------------------------------------------------------ archives and symbolic links

const a = load('src/modules/server-panel/domain/archive')

/** One tar header block (and the data blocks of a file), the way tar writes them. */
function tarBlock({ name, type = '0', size = 0, link = '', prefix = '', magic = 'ustar\0' + '00', data }) {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8'); block.write((type === '5' ? '0000755' : '0000644') + '\0', 100); block.write('0000000\0', 108); block.write('0000000\0', 116)
  const body = data ?? Buffer.alloc(type === '0' ? size : 0)
  block.write((data ? data.length : size).toString(8).padStart(11, '0') + '\0', 124); block.write('00000000000\0', 136)
  block.write('        ', 148); block.write(type, 156); block.write(link, 157, 100, 'utf8'); block.write(magic, 257, 8, 'latin1'); block.write(prefix, 345, 155, 'utf8')
  let sum = 0
  for (const byte of block) sum += byte
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  return Buffer.concat([block, body, Buffer.alloc((512 - (body.length % 512)) % 512)])
}
const tarOf = (...blocks) => Buffer.concat([...blocks.map((block) => (Buffer.isBuffer(block) ? block : tarBlock(block))), Buffer.alloc(1024)])
const listed = (bytes, step = bytes.length) => { const reader = new a.TarReader(); for (let at = 0; at < bytes.length; at += step) reader.push(bytes.subarray(at, at + step)); return reader.entries }
const reason = (entries, limits) => a.archiveRefusal(entries, limits)?.reason ?? null

test('an archive entry stays below the folder it is unpacked into', () => {
  assert.deepEqual(a.entrySegments('a/./b//c.txt'), ['a', 'b', 'c.txt'])
  for (const bad of ['/etc/passwd', '../x', 'a/../../x', 'a/..', 'C:/x', 'a\\b', 'a\0b', '']) assert.equal(a.entrySegments(bad), null, JSON.stringify(bad))
  assert.equal(a.linkStaysInside(['a', 'b', 'link'], '../c/file'), true)
  assert.equal(a.linkStaysInside(['a', 'link'], '../../etc'), false, 'one step too many')
  assert.equal(a.linkStaysInside(['link'], '..'), false)
  for (const bad of ['/etc', '', 'C:/x', 'a\\..\\b']) assert.equal(a.linkStaysInside(['a', 'link'], bad), false, JSON.stringify(bad))
  const file = (path, size = 1) => ({ path, type: 'file', size })
  assert.equal(reason([file('a/b.txt'), { path: 'a/', type: 'dir', size: 0 }, { path: 'a/l', type: 'symlink', size: 0, link: 'b.txt' }, { path: 'h', type: 'hardlink', size: 0, link: 'a/b.txt' }]), null)
  assert.equal(reason([file('../evil')]), 'outside')
  assert.equal(reason([file('/etc/cron.d/evil')]), 'outside')
  assert.equal(reason([{ path: 'l', type: 'symlink', size: 0, link: '/etc' }]), 'link')
  assert.equal(reason([{ path: 'a/l', type: 'symlink', size: 0, link: '../../etc' }]), 'link')
  assert.equal(reason([{ path: 'l', type: 'symlink', size: 0, link: '' }]), 'link', 'a link whose target is not known')
  assert.equal(reason([{ path: 'h', type: 'hardlink', size: 0, link: '/etc/passwd' }]), 'link')
  assert.equal(reason([{ path: 'h', type: 'hardlink', size: 0, link: '../x' }]), 'link')
  // The classic: a link that stays inside by its text, and a file "below" it.
  assert.equal(reason([{ path: 'l', type: 'symlink', size: 0, link: 'a' }, file('l/passwd')]), 'below-link')
  assert.equal(reason([file('l/passwd'), { path: 'l', type: 'symlink', size: 0, link: 'a' }]), 'below-link', 'whatever the order')
  assert.equal(reason([{ path: 'dev/sda', type: 'special', size: 0 }]), 'special')
  assert.equal(reason([file('a'), file('b'), file('c')], { maxEntries: 2, maxTotalBytes: 100 }), 'entries')
  assert.equal(reason([file('a', 60), file('b', 60)], { maxEntries: 10, maxTotalBytes: 100 }), 'bytes')
  assert.equal(reason([file('a', -1)]), 'size')
  assert.equal(reason([file('a', NaN)]), 'size')
})

test('tar names are read where tar reads them: prefixes, GNU long names and pax headers', () => {
  const plain = tarOf({ name: 'dir/', type: '5' }, { name: 'dir/a.txt', data: Buffer.from('hello') }, { name: 'dir/l', type: '2', link: 'a.txt' }, { name: 'h', type: '1', link: 'dir/a.txt' })
  assert.deepEqual(listed(plain), [{ path: 'dir/', type: 'dir', size: 0, link: undefined }, { path: 'dir/a.txt', type: 'file', size: 5, link: undefined }, { path: 'dir/l', type: 'symlink', size: 0, link: 'a.txt' }, { path: 'h', type: 'hardlink', size: 0, link: 'dir/a.txt' }])
  assert.deepEqual(listed(plain, 97), listed(plain), 'the same entries however the bytes arrive')
  assert.equal(reason(listed(plain)), null)
  assert.deepEqual(listed(tarOf({ name: 'a.txt', prefix: 'deep/er', data: Buffer.from('x') })).map((e) => e.path), ['deep/er/a.txt'])
  assert.deepEqual(listed(tarOf({ name: 'a.txt', prefix: 'not-a-prefix', magic: 'ustar  \0', data: Buffer.from('x') })).map((e) => e.path), ['a.txt'], 'an old GNU archive keeps other things there')
  // A harmless short name in the header, the real one in a GNU long-name record.
  const long = Buffer.from('../../../../etc/cron.d/evil\0')
  const hidden = tarOf({ name: '././@LongLink', type: 'L', data: long }, { name: 'innocent.txt', data: Buffer.from('x') })
  assert.deepEqual(listed(hidden).map((e) => e.path), ['../../../../etc/cron.d/evil'])
  assert.equal(reason(listed(hidden)), 'outside')
  const longLink = tarOf({ name: '././@LongLink', type: 'K', data: Buffer.from('/etc/shadow\0') }, { name: 'l', type: '2', link: 'short' })
  assert.deepEqual(listed(longLink).map((e) => e.link), ['/etc/shadow'])
  assert.equal(reason(listed(longLink)), 'link')
  // The same through a pax header.
  const record = (key, value) => { const body = ' ' + key + '=' + value + '\n'; let length = body.length + 1; while (String(length).length + body.length !== length) length = String(length).length + body.length; return length + body }
  const pax = tarOf({ name: 'PaxHeader/x', type: 'x', data: Buffer.from(record('path', '/abs/evil') + record('linkpath', '../../out') + record('size', '3')) }, { name: 'ok.txt', type: '2', link: 'fine', size: 0 })
  assert.deepEqual(listed(pax).map((e) => [e.path, e.link]), [['/abs/evil', '../../out']])
  assert.equal(reason(listed(pax)), 'outside')
  const paxSize = tarOf({ name: 'PaxHeader/x', type: 'x', data: Buffer.from(record('size', '600')) }, Buffer.concat([tarBlock({ name: 'big.bin', size: 0 }), Buffer.alloc(1024, 1)]), { name: 'after.txt', data: Buffer.from('x') })
  assert.deepEqual(listed(paxSize).map((e) => [e.path, e.size]), [['big.bin', 600], ['after.txt', 1]], 'the size of the pax header is the size that is skipped')
  for (const type of ['3', '4', '6']) assert.equal(reason(listed(tarOf({ name: 'node', type }))), 'special', type)
  // A global pax header does not rename the entries after it.
  assert.deepEqual(listed(tarOf({ name: 'pax_global_header', type: 'g', data: Buffer.from(record('comment', 'abc')) }, { name: 'a.txt', data: Buffer.from('x') })).map((e) => e.path), ['a.txt'])
  assert.throws(() => listed(tarOf((() => { const block = tarBlock({ name: 'a.txt' }); block.write('zzzzzzzzzzz', 124); return block })())), /damaged header/)
  const many = new a.TarReader({ maxEntries: 2, maxTotalBytes: 1e9 })
  assert.throws(() => many.push(tarOf({ name: 'a' }, { name: 'b' }, { name: 'c' })), /more than 2 entries/)
})

test('a zip is listed from its directory; links, zip64 and cut files are refused', () => {
  const { writeZip } = load('src/modules/packages/domain/zip')
  const zip = writeZip(new Map([['a.txt', Buffer.from('hello')], ['dir/b.txt', Buffer.from('world!')]]))
  assert.deepEqual(a.zipEntries(zip, 0), [{ path: 'a.txt', type: 'file', size: 5, link: undefined }, { path: 'dir/b.txt', type: 'file', size: 6, link: undefined }])
  const directory = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  assert.deepEqual(a.zipEntries(zip.subarray(directory + 10), directory + 10), { needFrom: directory }, 'the piece read did not reach the directory')
  assert.deepEqual(a.zipEntries(zip.subarray(directory), directory).map((e) => e.path), ['a.txt', 'dir/b.txt'])
  // The first entry marked as a Unix symbolic link.
  const linked = Buffer.from(zip); linked.writeUInt16LE((3 << 8) | 20, directory + 4); linked.writeUInt32LE((0o120777 << 16) >>> 0, directory + 38)
  assert.equal(a.zipEntries(linked, 0)[0].type, 'symlink')
  assert.equal(reason(a.zipEntries(linked, 0)), 'link')
  const device = Buffer.from(zip); device.writeUInt16LE((3 << 8) | 20, directory + 4); device.writeUInt32LE((0o020644 << 16) >>> 0, directory + 38)
  assert.equal(reason(a.zipEntries(device, 0)), 'special')
  const evil = writeZip(new Map([['ok.txt', Buffer.from('x')]])); const at = evil.indexOf(Buffer.from('ok.txt'), evil.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))); evil.write('../x.t', at)
  assert.equal(reason(a.zipEntries(evil, 0)), 'outside')
  const end = zip.length - 22
  const zip64 = Buffer.from(zip); zip64.writeUInt16LE(0xffff, end + 10)
  assert.throws(() => a.zipEntries(zip64, 0), /zip64/)
  assert.throws(() => a.zipEntries(zip.subarray(0, zip.length - 5), 0), /no directory/)
  assert.throws(() => a.zipEntries(Buffer.from('not a zip at all, just some text that is long enough'), 0), /no directory/)
})

// The file manager itself, on a real file system. The policy speaks POSIX paths, so this runs where the server runs.
const onLinux = process.platform === 'linux'
test('the file manager applies its policy to where a path really leads', { skip: !onLinux && 'POSIX paths and symbolic links' }, async () => {
  const os = require('node:os'), fsp = require('node:fs/promises'), { execFileSync } = require('node:child_process')
  const files = load('src/modules/server-panel/server/files')
  const box = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'panel-links-')))
  const root = path.join(box, 'root'), outside = path.join(box, 'outside')
  await fsp.mkdir(path.join(root, 'docs'), { recursive: true }); await fsp.mkdir(outside)
  await fsp.writeFile(path.join(outside, 'secret.txt'), 'secret'); await fsp.writeFile(path.join(root, 'docs', 'note.txt'), 'note')
  await fsp.symlink(outside, path.join(root, 'out')); await fsp.symlink(path.join(outside, 'secret.txt'), path.join(root, 'peek.txt'))
  await fsp.symlink('docs', path.join(root, 'same')); await fsp.symlink('/proc', path.join(root, 'kernel')); await fsp.symlink('/usr/bin', path.join(root, 'tools'))
  await fsp.symlink(path.join(outside, 'not-there'), path.join(root, 'dangling')); await fsp.symlink('loop', path.join(root, 'loop'))
  const refused = async (work, status, label) => { const error = await work().then(() => null, (e) => e); assert.ok(error instanceof files.FileError, label + ': ' + (error ? error.message : 'went through')); assert.equal(error.status, status, label + ': ' + error.message) }
  const R = (...parts) => path.join(root, ...parts)
  try {
    // ---- a panel limited to one folder: a link does not lead out of it
    await refused(() => files.listDir(R('out'), root), 403, 'list through a link out')
    await refused(() => files.readText(R('out', 'secret.txt'), root), 403, 'read through a link out')
    await refused(() => files.readText(R('peek.txt'), root), 403, 'read a link to a file outside')
    await refused(() => files.writeText(R('peek.txt'), 'changed', '', root), 403, 'write a link to a file outside')
    await refused(() => files.createEntry(R('out'), 'new.txt', 'file', root), 403, 'create through a link out')
    await refused(() => files.saveUpload(R('out'), 'up.txt', Buffer.from('x'), false, root), 403, 'upload through a link out')
    await refused(() => files.saveUpload(root, 'peek.txt', Buffer.from('x'), true, root), 403, 'upload over a link to a file outside')
    await refused(() => files.saveUpload(root, 'dangling', Buffer.from('x'), true, root), 403, 'upload over a link that leads nowhere yet')
    await refused(() => files.transfer([R('docs', 'note.txt')], R('out'), 'copy', root), 403, 'copy into a link out')
    await refused(() => files.transfer([R('out', 'secret.txt')], R('docs'), 'move', root), 403, 'move out of a link out')
    await refused(() => files.changeMode(R('peek.txt'), '777', root), 403, 'chmod through a link')
    await refused(() => files.openDownload(R('out'), root), 403, 'download a link out')
    await refused(() => files.findByName(R('out'), 'secret', root), 403, 'search through a link out')
    await refused(() => files.archive(R('out'), ['secret.txt'], 'tar.gz', 'x', root), 403, 'archive inside a link out')
    await refused(() => files.renameEntry(R('out', 'secret.txt'), 'renamed.txt', root), 403, 'rename through a link out')
    await refused(() => files.removeEntries([R('out', 'secret.txt')], root), 403, 'remove through a link out')
    await refused(() => files.listDir(R('loop'), root), 403, 'a link in a circle')
    assert.deepEqual([await fsp.readFile(path.join(outside, 'secret.txt'), 'utf8'), (await fsp.readdir(outside)).sort(), (await fsp.stat(path.join(outside, 'secret.txt'))).mode & 0o777], ['secret', ['secret.txt'], 0o644], 'nothing outside was touched')
    // ---- a link that stays inside works like the folder it names
    assert.deepEqual((await files.listDir(R('same'), root)).entries.map((entry) => entry.name), ['note.txt'])
    assert.equal((await files.readText(R('same', 'note.txt'), root)).content, 'note')
    await files.writeText(R('same', 'note.txt'), 'edited', '', root)
    assert.equal(await fsp.readFile(R('docs', 'note.txt'), 'utf8'), 'edited')
    // The listing still shows the links, with where they point; it does not follow them.
    const shown = Object.fromEntries((await files.listDir(root, root)).entries.map((entry) => [entry.name, entry.target]))
    assert.deepEqual([shown.out, shown.same, shown['peek.txt']], [outside, 'docs', path.join(outside, 'secret.txt')])
    // ---- the whole server as the area: the system rules apply to where a link leads
    await refused(() => files.listDir(R('kernel'), '/'), 403, 'a link into /proc')
    await refused(() => files.readText(R('kernel', 'version'), '/'), 403, 'read through a link into /proc')
    assert.ok((await files.listDir(R('tools'), '/')).entries.length > 0, 'a read-only place may be read through a link')
    assert.equal((await files.listDir(R('tools'), '/')).writable, false)
    await refused(() => files.createEntry(R('tools'), 'evil', 'file', '/'), 403, 'create in a read-only place through a link')
    await refused(() => files.saveUpload(R('tools'), 'evil', Buffer.from('x'), false, '/'), 403, 'upload into a read-only place through a link')
    await refused(() => files.changeMode(R('tools', 'env'), '777', '/'), 403, 'chmod in a read-only place through a link')
    assert.equal((await files.listDir(R('out'), '/')).entries.length, 1, 'with the whole server allowed, a link to an ordinary folder is followed')
    // A link to a protected place: what may not be changed directly may not be changed through a link either.
    await fsp.symlink('/tmp', R('anchor')); await fsp.symlink('/', R('slash'))
    await refused(() => files.changeMode(R('anchor'), '1777', '/'), 403, 'chmod of a protected folder through a link')
    await refused(() => files.renameEntry(R('slash', 'tmp'), 'tmp-renamed', '/'), 403, 'rename of a protected folder through a link')
    await fsp.rm(R('anchor')); await fsp.rm(R('slash'))
    // ---- a link itself is renamed and removed as a link
    await files.renameEntry(R('out'), 'exit', root)
    assert.equal(await fsp.readlink(R('exit')), outside)
    await files.removeEntries([R('exit'), R('dangling'), R('loop')], root)
    assert.deepEqual([await fsp.readdir(outside), fs.existsSync(R('exit'))], [['secret.txt'], false], 'the link is gone, what it pointed at is not')

    // ---- unpacking
    const drop = async (name, bytes) => { await fsp.writeFile(R(name), bytes); return R(name) }
    await fsp.mkdir(R('unpack'))
    const good = await drop('good.tar', tarOf({ name: 'pkg/', type: '5' }, { name: 'pkg/readme.txt', data: Buffer.from('read me') }, { name: 'pkg/link', type: '2', link: 'readme.txt' }))
    assert.deepEqual(await files.extract(good, R('unpack'), root), { path: R('unpack'), entries: 3 })
    assert.deepEqual([await fsp.readFile(R('unpack', 'pkg', 'readme.txt'), 'utf8'), await fsp.readlink(R('unpack', 'pkg', 'link'))], ['read me', 'readme.txt'])
    execFileSync('tar', ['-czf', R('good.tar.gz'), '-C', R('unpack'), 'pkg'])
    await fsp.mkdir(R('unpack2'))
    assert.equal((await files.extract(R('good.tar.gz'), R('unpack2'), root)).entries, 3, 'a compressed tar is read through its compression')
    const evil = {
      'climb.tar': tarOf({ name: '../climbed.txt', data: Buffer.from('x') }),
      'absolute-link.tar': tarOf({ name: 'l', type: '2', link: outside }, { name: 'l2/', type: '5' }),
      'through-link.tar': tarOf({ name: 'l', type: '2', link: 'pkg' }, { name: 'l/passwd', data: Buffer.from('x') }),
      'long-name.tar': tarOf({ name: '././@LongLink', type: 'L', data: Buffer.from('../../climbed-long.txt\0') }, { name: 'ok.txt', data: Buffer.from('x') }),
      'hardlink.tar': tarOf({ name: 'h', type: '1', link: path.join(outside, 'secret.txt') }),
      'device.tar': tarOf({ name: 'null', type: '3' }),
    }
    for (const [name, bytes] of Object.entries(evil)) {
      await fsp.mkdir(R('target'), { recursive: true })
      await refused(async () => files.extract(await drop(name, bytes), R('target'), root), 422, name)
      assert.deepEqual(await fsp.readdir(R('target')), [], name + ': nothing was written')
    }
    assert.deepEqual([(await fsp.readdir(box)).sort(), await fsp.readdir(outside)], [['outside', 'root'], ['secret.txt']], 'nothing climbed out')
    // A link that already stands in the destination: the archive is innocent, the folder is not.
    await fsp.symlink(outside, R('target', 'pkg'))
    await refused(() => files.extract(good, R('target'), root), 409, 'a link in the way')
    assert.deepEqual(await fsp.readdir(outside), ['secret.txt'])
    await fsp.rm(R('target', 'pkg')); await fsp.symlink(outside, R('via'))
    await refused(() => files.extract(good, R('via'), root), 403, 'the destination is a link out')
    // A zip is refused before unzip is even looked for.
    const { writeZip } = load('src/modules/packages/domain/zip')
    const zip = writeZip(new Map([['ok.txt', Buffer.from('x')]])); zip.write('../x.t', zip.indexOf(Buffer.from('ok.txt'), zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))))
    await refused(async () => files.extract(await drop('evil.zip', zip), R('target'), root), 422, 'a zip that climbs')
    await refused(async () => files.extract(await drop('cut.zip', zip.subarray(0, 20)), R('target'), root), 422, 'a zip cut short')
    await refused(async () => files.extract(await drop('broken.tar.gz', Buffer.from('not gzip')), R('target'), root), 422, 'a tar that is not one')
    // Packing: the names are those of the folder that was asked for.
    const packed = await files.archive(R('docs'), ['note.txt'], 'tar.gz', 'kept', root)
    assert.match(execFileSync('tar', ['-tzf', packed.path], { encoding: 'utf8' }), /^note\.txt\n$/)
  } finally { await fsp.rm(box, { recursive: true, force: true }) }
})

test('zip packs the folder that was asked for, not the folder the site runs in', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/server-panel/server/files.ts'), 'utf8')
  assert.match(source, /command\('zip', \['-r', '-q', '-y', file, '--', \.\.\.names\], 10 \* 60_000, dir\)/)
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/server-panel/server/system.ts'), 'utf8'), /\.\.\.\(cwd \? \{ cwd \} : \{\}\)/)
})

// ============ Hosting catalogue (docs/specs/hosting-cloud/SPEC.md, slice 1) ============
const h = load('src/modules/hosting/domain/catalog')
const hostingProduct = (extra = {}) => ({ kind: 'VPS', name: 'VPS Pro', slug: 'vps-pro', prices: [{ cycle: 'MONTH', amountMinor: '500000' }], ...extra })

test('hosting: hourly is offered only for cloud kinds, every kind has the fixed terms', () => {
  assert.deepEqual(h.cyclesFor('CLOUD_SERVER'), ['HOURLY', 'MONTH', 'QUARTER', 'HALF', 'YEAR'])
  assert.deepEqual(h.cyclesFor('SHARED'), ['MONTH', 'QUARTER', 'HALF', 'YEAR'])
  assert.throws(() => h.normalizeProduct(hostingProduct({ prices: [{ cycle: 'HOURLY', amountMinor: '100' }] })), /دوره/)
  assert.equal(h.normalizeProduct(hostingProduct({ kind: 'CLOUD_SERVER', prices: [{ cycle: 'HOURLY', amountMinor: '120' }] })).prices[0].amountMinor, 120n)
})

test('hosting: saving compares a term with paying month by month, in exact integers', () => {
  const prices = [{ cycle: 'MONTH', amountMinor: 100000n, currency: 'IRT' }, { cycle: 'YEAR', amountMinor: 1000000n, currency: 'IRT' }, { cycle: 'QUARTER', amountMinor: 400000n, currency: 'IRT' }]
  assert.equal(h.savingPercent(prices, 'YEAR', 'IRT'), 16)
  assert.equal(h.savingPercent(prices, 'QUARTER', 'IRT'), 0, 'a dearer term shows no saving')
  assert.equal(h.savingPercent(prices, 'MONTH', 'IRT'), 0)
  assert.equal(h.savingPercent(prices.slice(1), 'YEAR', 'IRT'), 0, 'no monthly price, nothing to compare')
  assert.equal(h.monthlyEquivalent({ cycle: 'HOURLY', amountMinor: 100n }), 73000n)
  assert.equal(h.monthlyEquivalent({ cycle: 'HALF', amountMinor: 600000n }), 100000n)
})

test('hosting: products are refused when unpriced, duplicated, negative or delivered by nothing', () => {
  assert.throws(() => h.normalizeProduct(hostingProduct({ prices: [] })), /قیمت/)
  assert.equal(h.normalizeProduct(hostingProduct({ prices: [], active: false })).active, false)
  assert.throws(() => h.normalizeProduct(hostingProduct({ prices: [{ cycle: 'MONTH', amountMinor: '1' }, { cycle: 'MONTH', amountMinor: '2' }] })), /یک قیمت/)
  for (const amountMinor of ['-1', '1.5', '1e3', 'NaN', '9999999999999999']) assert.throws(() => h.normalizeProduct(hostingProduct({ prices: [{ cycle: 'MONTH', amountMinor }] })), /مبلغ/)
  assert.throws(() => h.normalizeProduct(hostingProduct({ fulfillment: 'DRIVER' })), /سامانه/)
  assert.throws(() => h.normalizeProduct(hostingProduct({ slug: 'VPS Pro' })), /نامک/)
  assert.throws(() => h.normalizeProduct(hostingProduct({ allowTraffic: true })), /ترافیک/)
  const manual = h.normalizeProduct(hostingProduct({ allowTraffic: true, trafficPackGb: '100', trafficPackMinor: '90000', stoppedHourlyMinor: '50' }))
  assert.deepEqual([manual.fulfillment, manual.trafficPackMinor, manual.stoppedHourlyMinor], ['MANUAL', 90000n, 0n], 'a stopped-server charge belongs to hourly kinds only')
})

test('hosting: provider addresses are https (ssh for CloudPanel), never carry credentials, fixed for Hetzner', () => {
  assert.equal(h.normalizeProvider({ driver: 'HETZNER_CLOUD', name: 'H', url: 'https://evil.example', secret: 't' }).url, 'https://api.hetzner.cloud/v1')
  assert.throws(() => h.normalizeProvider({ driver: 'PROXMOX', name: 'P', url: 'http://pve:8006', username: 'root@pam!site' }), /https/)
  assert.throws(() => h.normalizeProvider({ driver: 'PROXMOX', name: 'P', url: 'https://u:p@pve:8006', username: 'x' }), /رمز/)
  assert.throws(() => h.normalizeProvider({ driver: 'DIRECTADMIN', name: 'D', url: 'https://da:2222' }), /نام کاربری/)
  assert.equal(h.normalizeProvider({ driver: 'CLOUDPANEL', name: 'C', url: 'ssh://cp.example:22', username: 'root' }).family, 'WEB_PANEL')
  assert.throws(() => h.normalizeProvider({ driver: 'CLOUDPANEL', name: 'C', url: 'https://cp.example', username: 'root' }), /ssh/)
  assert.throws(() => h.normalizeProvider({ driver: 'NOPE', name: 'N' }), /نوع/)
  for (const kind of h.HOSTING_KINDS) assert.ok(h.HOSTING_DRIVERS.some((driver) => driver.family === kind.family), kind.id)
})

test('hosting: a secret is never sent to a browser and every admin call is guarded by hosting.manage', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '../src/modules/hosting/server/catalog.ts'), 'utf8')
  assert.match(server, /providers\.map\(\(\{ secret, config: _config, _count, \.\.\.provider \}\)/)
  assert.match(server, /secret: encryptPanelCredential\(input\.secret\)/)
  const http = fs.readFileSync(path.resolve(__dirname, '../src/modules/hosting/server/http.ts'), 'utf8')
  assert.equal((http.match(/adminGuard\(req, 'hosting', PERMISSIONS\)/g) || []).length, 2)
  assert.match(http, /const PERMISSIONS = \['hosting\.manage'\]/)
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/plugins/hosting/manifest.json'), 'utf8'))
  assert.equal(manifest.defaultEnabled, false)
  for (const page of ['hosting', 'servers']) assert.match(fs.readFileSync(path.resolve(__dirname, `../src/app/${page}/page.tsx`), 'utf8'), /await requireModule\('hosting'\)/)
})
