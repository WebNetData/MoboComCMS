const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const m = load('src/modules/downloads/domain/mask')
const l = load('src/modules/downloads/domain/localize')

test('masking: other hosts are masked, own domain and excluded hosts are not', () => {
  const opts = { mode: 'external', siteHost: 'mobocom.net', exclude: ['cdn.example.com', '*.cloudfront.net'] }
  assert.equal(m.shouldMask('https://dl.biamusic.ir/Tak/Farhad/Farhad%20-%20Vay%20Az%20Dastet%20Ai%20(128).mp3', opts), true)
  assert.equal(m.shouldMask('https://mobocom.net/files/a.zip', opts), false)
  assert.equal(m.shouldMask('https://dl.mobocom.net/a.zip', opts), false)
  assert.equal(m.shouldMask('https://evilmobocom.net/a.zip', opts), true)
  assert.equal(m.shouldMask('https://cdn.example.com/a.zip', opts), false)
  assert.equal(m.shouldMask('https://x.cloudfront.net/a.zip', opts), false)
  assert.equal(m.shouldMask('ftp://x.com/a', opts), false)
  assert.equal(m.shouldMask('https://x.com/a', { ...opts, mode: 'off' }), false)
  assert.equal(m.isOwnHost('WWW.Mobocom.net', 'www.mobocom.net'), true)
})

test('masking: names, HLS siblings and headers', () => {
  assert.equal(m.fileNameOf('https://dl.biamusic.ir/Tak/Farhad/Farhad%20-%20Vay%20Az%20Dastet%20Ai%20(128).mp3'), 'Farhad - Vay Az Dastet Ai (128).mp3')
  assert.equal(m.fileNameOf('https://x.com/'), 'file')
  assert.equal(m.fileNameOf('https://x.com/a%22b%3Cc.zip'), 'a b c.zip')
  assert.equal(m.decodeNamePath([m.encodeName('آهنگ من (1).mp3')]), 'آهنگ من (1).mp3')
  const base = 'https://cdn.x.com/v/show/master.m3u8?sig=1'
  assert.equal(m.resolveSibling(base, 'master.m3u8', ''), base)
  assert.equal(m.resolveSibling(base, 'master.m3u8', '720p/seg 1.ts'), 'https://cdn.x.com/v/show/720p/seg%201.ts?sig=1')
  assert.equal(m.resolveSibling(base, 'master.m3u8', '../secret.ts'), null)
  assert.equal(m.resolveSibling(base, 'master.m3u8', 'a//b.ts'), null)
  assert.equal(m.contentTypeFor('a.mp3', 'application/octet-stream'), 'audio/mpeg')
  assert.equal(m.contentTypeFor('a.bin', 'text/html; charset=utf-8'), 'application/octet-stream')
  assert.equal(m.contentTypeFor('a.mp4', 'video/mp4'), 'video/mp4')
  assert.equal(m.contentTypeFor('x.svg', 'image/svg+xml'), 'application/octet-stream')
  assert.match(m.dispositionFor('آهنگ.mp3', true), /^attachment; filename="_+\.mp3"; filename\*=UTF-8''/)
  assert.match(m.dispositionFor('a.mp3', false), /^inline/)
})

test('pasted content: external images and file links are found and rewritten', () => {
  const html = '<p><img src="https://other.ir/a.jpg?x=1&amp;y=2" srcset="https://other.ir/a-2x.jpg 2x"> <img src="/api/media/covers/1.webp"> <img src="https://mobocom.net/b.png"> <img src="data:image/png;base64,AAAA"></p><p><a href="https://other.ir/files/App%201.zip">zip</a> <a href="https://other.ir/page">page</a> <a href="https://dl.mobocom.net/x.rar">own</a></p>'
  const assets = l.findAssets(html, 'mobocom.net')
  assert.deepEqual(assets.map((a) => `${a.kind}:${a.url.slice(0, 40)}`), ['image:https://other.ir/a.jpg?x=1&y=2', 'image:data:image/png;base64,AAAA', 'file:https://other.ir/files/App%201.zip'])
  const out = l.rewriteAssets(html, new Map([['https://other.ir/a.jpg?x=1&y=2', '/api/media/covers/n.webp'], ['https://other.ir/files/App%201.zip', '/files/uploads/posts/2026-09/App 1.zip']]))
  assert.ok(out.includes('src="/api/media/covers/n.webp"'))
  assert.ok(!out.includes('other.ir/a'))
  assert.ok(!out.includes('srcset'))
  assert.ok(out.includes('href="/files/uploads/posts/2026-09/App 1.zip"'))
  assert.ok(out.includes('href="https://other.ir/page"'), 'ordinary links stay')
})
