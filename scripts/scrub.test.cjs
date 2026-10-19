const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const file = path.resolve(__dirname, '../src/modules/downloads/domain/scrub.ts')
const mod = { exports: {} }
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports, require)
const { normalizeWords, scrubText, scrubHtml, downloadFileName, hostListed } = mod.exports

const words = normalizeWords('Musicfa\nhttps://www.film2media.ir/\nsoft98.ir')

test('word list: urls become hosts, duplicates and short entries dropped', () => {
  assert.deepEqual(words, ['Musicfa', 'film2media.ir', 'soft98.ir'])
  assert.deepEqual(normalizeWords(['ab', 'Musicfa', 'musicfa']), ['Musicfa'])
})

test('hosts of a listed source match, other hosts do not', () => {
  assert.ok(hostListed('dl.film2media.ir', words))
  assert.ok(hostListed('cdn.musicfa.com', words))
  assert.ok(!hostListed('music.ir', words))
})

test('plain text loses the source name with its lead-in', () => {
  assert.equal(scrubText('آهنگ جدید فرهاد – دانلود از سایت Musicfa', words), 'آهنگ جدید فرهاد')
  assert.equal(scrubText('کیفیت عالی (Film2Media.ir) با زیرنویس', words), 'کیفیت عالی با زیرنویس')
  assert.equal(scrubText('لینک: https://soft98.ir/x/y.html تست', words), 'لینک: تست')
  assert.equal(scrubText('بدون ردپا', words), 'بدون ردپا')
})

test('rich text: listed links unwrapped, other links kept, source images removed, empty blocks dropped', () => {
  const html = '<p>نسخهٔ جدید را از <a href="https://soft98.ir/app">این صفحه</a> ببینید. سازنده: <a href="https://vendor.com">Vendor</a></p><p><img src="https://soft98.ir/i.jpg" alt="Soft98"></p><p>منبع: Soft98.ir</p>'
  const out = scrubHtml(html, { words, links: 'listed', siteHost: 'mobocom.ir' })
  assert.equal(out, '<p>نسخهٔ جدید را از این صفحه ببینید. سازنده: <a href="https://vendor.com">Vendor</a></p>')
  const all = scrubHtml('<a href="https://vendor.com">V</a> <a href="/local">L</a> <a href="https://mobocom.ir/x">M</a>', { words, links: 'all', siteHost: 'mobocom.ir' })
  assert.equal(all, 'V <a href="/local">L</a> <a href="https://mobocom.ir/x">M</a>')
})

test('file names follow the pattern and keep the extension; playlists keep their own', () => {
  assert.equal(downloadFileName({ pattern: '{title} - {label} [{site}]', original: 'Farhad-Vay-320-(Musicfa).mp3', title: 'فرهاد - وای', label: '320', site: 'MoboCom', words }), 'فرهاد - وای - 320 [MoboCom].mp3')
  assert.equal(downloadFileName({ pattern: '{title} {quality}', original: 'x.mkv', title: 'Movie', quality: '', site: 'S', words }), 'Movie.mkv')
  assert.equal(downloadFileName({ pattern: '', original: 'Movie.2024.1080p.Film2Media.mkv', words }), 'Movie.2024.1080p.mkv')
  assert.equal(downloadFileName({ pattern: '{title}', original: 'index.m3u8', title: 'Movie', words }), 'index.m3u8')
  assert.equal(downloadFileName({ pattern: '{title}', original: 'Soft98.ir.zip', title: '', words }), 'file.zip')
})
