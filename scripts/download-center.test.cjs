const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name))) : require(name), mod, mod.exports)
  return mod.exports
}
const d = load('src/modules/server-panel/domain/downloads')
const edit = load('src/modules/server-panel/domain/archive-edits')

test('archive edit plans refuse traversal, option/list-file names and unbounded edits', () => {
  for (const value of ['../x','/etc/passwd','C:/a','a\\b','a/../b','a\nPath = x','@list','-switch','a/*','a//b']) assert.throws(() => edit.archivePath(value), value)
  assert.equal(edit.archivePath('docs/راهنما.txt'),'docs/راهنما.txt')
  assert.deepEqual(edit.archiveEdits([{op:'rename',path:'a.txt',to:'docs/b.txt'},{op:'text',path:'new.txt',text:'سلام'}]),[{op:'rename',path:'a.txt',to:'docs/b.txt'},{op:'text',path:'new.txt',text:'سلام'}])
  assert.throws(()=>edit.archiveEdits(Array.from({length:201},()=>({op:'delete',path:'a'}))))
  assert.throws(()=>edit.archiveEdits([{op:'text',path:'a.txt',text:'x'.repeat(2*1024**2+1)}]))
  assert.throws(()=>edit.archiveEdits([{op:'asset',path:'a',assetId:'untrusted-path'}]))
})

test('archive admission requires complete metadata, bounded sizes, unique paths and no links', () => {
  const listing=block=>'Header\n----------\n'+block+'\n\n'
  assert.deepEqual(edit.inspectTechnicalListing(listing('Path = docs/a.txt\nSize = 2\nAttributes = A -rw-r--r--')),[{path:'docs/a.txt',type:'file',size:2}])
  for(const block of ['Path = ../outside\nSize = 1','Path = a\nSize = 2\nSymbolic Link = ../../outside','Path = a\nSize = 2\nHard Link = b','Path = a\nSize = -1','Path = a\nSize = 1e20','Path = a','Path = a\nSize = 1\n\nPath = A\nSize = 1']) assert.throws(()=>edit.inspectTechnicalListing(listing(block)),block)
  assert.throws(()=>edit.inspectTechnicalListing('Path = a\nSize = 2'))
})

test('storage paths never escape the root', () => {
  assert.equal(d.normalizeRelPath('a//b/./c/'), '/a/b/c')
  assert.equal(d.normalizeRelPath(''), '/')
  assert.equal(d.normalizeRelPath('\\win\\dir'), '/win/dir')
  assert.equal(d.normalizeRelPath('/a/../../etc'), null)
  assert.equal(d.normalizeRelPath('a\u0000b'), null)
  assert.equal(d.cleanName('../x'), '..x')
  assert.equal(d.cleanName('..'), null)
  assert.equal(d.cleanName('a/b'), 'ab')
  assert.equal(d.parentRel('/a/b'), '/a')
  assert.equal(d.parentRel('/a'), '/')
})

test('storages validate host, port, root and public address', () => {
  const s = d.validateStorage({ kind: 'sftp', name: 'Germany', host: 'DL.example.com', username: 'root', root: '/var/www/dl/', baseUrl: 'https://dl.example.com/' })
  assert.equal(s.port, 22); assert.equal(s.host, 'dl.example.com'); assert.equal(s.root, '/var/www/dl'); assert.equal(s.baseUrl, 'https://dl.example.com')
  assert.equal(d.validateStorage({ kind: 'ftp', name: 'x', host: '1.2.3.4', username: 'u', secure: true }).port, 21)
  assert.throws(() => d.validateStorage({ kind: 'ftp', name: 'x', host: 'bad host', username: 'u' }), d.DownloadError)
  assert.throws(() => d.validateStorage({ kind: 'sftp', name: 'x', host: 'a.com', username: 'u', baseUrl: 'javascript:alert(1)' }), d.DownloadError)
  assert.throws(() => d.validateStorage({ kind: 'local', name: 'x' }), d.DownloadError)
  assert.equal(d.validateStorage({ id: 'keep-me', kind: 'sftp', name: 'x', host: 'a.com', username: 'u' }, ['keep-me']).id, 'keep-me')
  assert.equal(d.publicUrl('https://dl.x.com', '/فیلم ها/a b.mkv'), 'https://dl.x.com/%D9%81%DB%8C%D9%84%D9%85%20%D9%87%D8%A7/a%20b.mkv')
  assert.equal(d.publicUrl('', '/a'), '')
})

test('download names and lists', () => {
  const url = new URL('https://x.com/files/My%20App.zip?token=1')
  assert.equal(d.downloadName('', null, url), 'My App.zip')
  assert.equal(d.downloadName('', "attachment; filename*=UTF-8''%D9%81%D8%A7%DB%8C%D9%84.rar", url), 'فایل.rar')
  assert.equal(d.downloadName('', 'attachment; filename="setup.exe"', url), 'setup.exe')
  assert.equal(d.downloadName('mine.zip', 'attachment; filename="x"', url), 'mine.zip')
  assert.equal(d.downloadName('', null, new URL('https://x.com/')), 'download')
  assert.deepEqual(d.parseFetchList('https://a.com/1.zip\n\n https://b.com/2 | two.bin \n'), [{ url: 'https://a.com/1.zip', name: '' }, { url: 'https://b.com/2', name: 'two.bin' }])
  assert.throws(() => d.parseFetchList('file:///etc/passwd'), d.DownloadError)
  assert.throws(() => d.parseFetchList('ftp://x.com/a'), d.DownloadError)
  assert.equal(d.numberedName('movie.mkv', 2), 'movie (2).mkv')
  assert.equal(d.numberedName('backup.tar.gz', 3), 'backup (3).tar.gz')
  assert.equal(d.numberedName('README', 2), 'README (2)')
})

test('private addresses are recognized', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(d.isPrivateAddress(ip), true, ip)
  for (const ip of ['8.8.8.8', '172.32.0.1', '2a01:4f8::1']) assert.equal(d.isPrivateAddress(ip), false, ip)
})

test('archive formats, passwords and listings', () => {
  assert.equal(d.archiveFormat('a.ZIP'), 'zip'); assert.equal(d.archiveFormat('a.part01.rar'), 'rar'); assert.equal(d.archiveFormat('a.tar.gz'), 'tar'); assert.equal(d.archiveFormat('a.mkv'), null)
  assert.equal(d.withFormat('movie.part1.rar', 'zip'), 'movie.zip')
  assert.equal(d.withFormat('a.tar.gz', '7z'), 'a.7z')
  assert.equal(d.validArchivePassword('', false), '')
  assert.throws(() => d.validArchivePassword('', true), d.DownloadError)
  assert.throws(() => d.validArchivePassword('a\nb', false), d.DownloadError)
  const seven = `Listing archive: t.7z\n\n--\nPath = t.7z\nType = 7z\n\n----------\nPath = d\nSize = 0\nPacked Size = 0\nAttributes = D drwxr-xr-x\nEncrypted = -\n\nPath = d/b.txt\nSize = 2\nPacked Size = \nModified = 2026-09-28 21:48:45.9487862\nEncrypted = +\n`
  const list = d.parse7zList(seven)
  assert.equal(list.length, 2)
  assert.equal(list[0].dir, true)
  assert.deepEqual({ path: list[1].path, size: list[1].size, packed: list[1].packed, enc: list[1].encrypted }, { path: 'd/b.txt', size: 2, packed: null, enc: true })
  const rar = `Archive: r.rar\nDetails: RAR 5\n\n        Name: a.txt\n        Type: File\n        Size: 6\n Packed size: 32\n       mtime: 2026-09-28 21:48:45,948786214\n       Flags: encrypted \n\n        Name: d\n        Type: Directory\n`
  const rows = d.parseUnrarList(rar)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].encrypted, true); assert.equal(rows[0].size, 6); assert.equal(rows[1].dir, true)
  assert.equal(d.wrongPassword('Incorrect password for a.txt'), true)
  assert.equal(d.wrongPassword('ERROR: t.7z : Cannot open encrypted archive. Wrong password?'), true)
  assert.equal(d.wrongPassword('Details: RAR 5, encrypted headers\nAll OK'), false)
  assert.equal(d.eta(100, 40, 20), 3)
  assert.equal(d.eta(null, 40, 20), null)
})
