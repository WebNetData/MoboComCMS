const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

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
const playback = load('src/components/media/playback-session')

test('ASS fallback escapes dialogue HTML and recognizes local Library subtitles and browser audio', () => {
  const source = '[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:04.50,Default,{\\b1}سلام\\N<img src=x>, comma\n'
  assert.equal(media.subtitleFormat('/files/download/movie/test/images/sub.ASS'), 'ass')
  assert.match(media.assToWebVtt(source), /00:00:01\.000 --> 00:00:04\.500/)
  assert.match(media.assToWebVtt(source), /سلام\n&lt;img src=x&gt;, comma/)
  assert.doesNotMatch(media.assToWebVtt(source), /<img|\\b1/)
  assert.equal(media.assToWebVtt('<html>Not found</html>'), '')
  assert.deepEqual(['/files/a.mp3', 'https://files.invalid/a.m4a?t=x', '/files/film.srt', '/files/audio.zip'].map(media.playableAudioFile), [true, true, false, false])
})

test('browser-playable files get the in-site player', () => {
  assert.equal(kind('/files/download/movie/example/video/local.mp4'), 'video')
  assert.equal(kind('/files/movie%ZZ.mp4'), 'none')
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

test('subtitles: what the player can show, and SubRip as WebVTT', () => {
  assert.deepEqual(['https://dl.example.com/a%20b.SRT', 'https://dl.example.com/a.vtt?x=1', 'https://dl.example.com/a.ass', 'nonsense'].map(media.subtitleFormat), ['srt', 'vtt', 'ass', ''])
  assert.equal(media.toWebVtt('1\r\n00:00:01,5 --> 00:00:02,000\r\n<b>a</b><script>x</script>\r\n', 'srt'), 'WEBVTT\n\n00:00:01.5 --> 00:00:02.000\n<b>a</b>x\n')
  assert.equal(media.toWebVtt('just text', 'srt'), '')
  assert.equal(media.decodeSubtitle(Uint8Array.from([0xD3, 0xE1, 0xC7, 0xE3])), 'سلام')
  assert.equal(media.decodeSubtitle(new TextEncoder().encode('سلام')), 'سلام')
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/media/server/links.ts'), 'utf8'), served = source.slice(source.indexOf('export async function openSubtitle'), source.indexOf('export async function saveCinemaWatchProgress'))
  assert.match(served, /await gate\(viewer, \[\{ ownerType: 'link', ownerId: id \}, \.\.\.owner\.chain\]/); assert.match(served, /checkPageToken\(/); assert.match(served, /subtitleBytes/, 'read through the bounded Library/remote subtitle owner')
})

test('player page keeps the same access rules and quota exemption', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/media/server/links.ts'), 'utf8')
  const watch = source.slice(source.indexOf('export async function watchSource'))
  // VIP and paid content share one gate with the download redirect.
  // (a link with its own price is checked first, then the item's rule)
  assert.match(watch, /await gate\(viewer, \[\{ ownerType: 'link', ownerId: id \}, \.\.\.owner\.chain\]/)
  assert.match(source.slice(source.indexOf('async function gate('), source.indexOf('function denied(')), /canAccess\('MEMBERS', viewer\.member\)/)
  assert.match(watch, /checkPageToken\(token, `l\$\{id\}`/)
  assert.doesNotMatch(watch, /logDownload/, 'watching does not use the daily download quota')
})

test('music source keeps quality and access checks behind the protected track route', () => {
  const track = { id: 42, hasHq: true }
  assert.equal(playback.sourceUrl(playback.trackSource(track, false)), '/api/media/track/42')
  assert.equal(playback.sourceUrl(playback.trackSource(track, true), true), '/api/media/track/42?check=1&q=hq')
  assert.equal(playback.trackSource({ id: 42, hasHq: false }, true).quality, 'standard')
})

test('restored music queue rejects malformed tracks and clamps position', () => {
  const track = { id: 42, slug: 'song-42', title: 'Song', artist: 'Artist', artistSlug: 'artist', cover: '/cover.jpg', access: 'MEMBERS', hasHq: true, duration: 180 }
  const session = playback.parsePlaybackSession({ queue: [{ ...track, id: -1 }, track, { ...track, slug: 'javascript:bad' }], index: 8, time: 999 })
  assert.equal(session.queue.length, 1)
  assert.equal(session.index, 0)
  assert.equal(session.time, 180)
  assert.equal(session.queue[0].access, 'MEMBERS')
  assert.equal(playback.parsePlaybackSession({ queue: [{ ...track, slug: 'آهنگ-تازه' }], index: 0, time: 0 }).queue.length, 1)
  assert.equal(playback.parsePlaybackSession({ queue: [] }), null)
})
