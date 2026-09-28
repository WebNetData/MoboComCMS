const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : specifier.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), specifier))) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const media = load('src/modules/media/domain/media')
const { toEmbedUrl } = load('src/modules/site/domain/builder')
const kind = (url, k = 'DOWNLOAD') => media.playbackKind(url, k, toEmbedUrl)

test('browser-playable files get the in-site player', () => {
  assert.equal(kind('https://dl.example.com/movie.720p.mp4'), 'video')
  assert.equal(kind('https://dl.example.com/Movie%20Name.WEBM'), 'video')
  assert.equal(kind('https://cdn.example.com/hls/master.m3u8?token=1'), 'hls')
  assert.equal(kind('https://cdn.example.com/play?file=master.m3u8', 'STREAM'), 'hls')
  assert.equal(kind('https://dl.example.com/movie.1080p.x265.mkv'), 'maybe')
})

test('video sites are embedded, archives and plain http are download-only', () => {
  assert.equal(kind('https://www.aparat.com/v/abc123'), 'embed')
  assert.equal(kind('https://youtu.be/dQw4w9WgXcQ'), 'embed')
  assert.equal(kind('https://dl.example.com/pack.zip'), 'none')
  assert.equal(kind('https://dl.example.com/movie.avi'), 'none')
  assert.equal(kind('http://dl.example.com/movie.mp4'), 'none', 'mixed content cannot play on an https site')
  assert.equal(kind('not a url'), 'none')
  assert.equal(kind('https://stream.example.com/watch/123', 'STREAM'), 'maybe')
  assert.equal(kind('https://dl.example.com/get/123'), 'none')
})

test('player page keeps the same access rules and quota exemption', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/media/server/links.ts'), 'utf8')
  const watch = source.slice(source.indexOf('export async function watchSource'))
  assert.match(watch, /canAccess\('MEMBERS', viewer\.member\)/)
  assert.match(watch, /checkPageToken\(token, `l\$\{id\}`/)
  assert.doesNotMatch(watch, /logDownload/, 'watching does not use the daily download quota')
})
