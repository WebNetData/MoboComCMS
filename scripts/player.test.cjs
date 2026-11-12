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
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/media/server/links.ts'), 'utf8'), checks = source.slice(source.indexOf('async function trackAccess'), source.indexOf('function subtitleBody'))
  const served = source.slice(source.indexOf('export async function openSubtitle'), source.indexOf('export async function openFoundSubtitle')), found = source.slice(source.indexOf('export async function openFoundSubtitle'), source.indexOf('export async function saveCinemaWatchProgress'))
  assert.match(checks, /await gate\(viewer, \[\{ ownerType: 'link', ownerId: link\.id \}, \.\.\.owner\.chain\]/); assert.match(checks, /checkPageToken\(new URL\(request\.url\)\.searchParams\.get\('t'\), `l\$\{link\.id\}`/)
  assert.match(served, /await trackAccess\(request, link\)/); assert.match(served, /subtitleBytes/, 'read through the bounded Library/remote subtitle owner')
  assert.match(found, /await trackAccess\(request, link\)/, 'a subtitle found with a video passes that video\'s own gate and token')
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

test('subtitles that come with a video file: names beside it, directory listings, stream tags and codecs', () => {
  const found = load('src/modules/media/domain/found-subtitles')
  const video = 'Oppenheimer.2023.1080p.BluRay.x264.mkv'
  const match = name => found.sidecarMatch(video, name)
  assert.deepEqual(match('Oppenheimer.2023.1080p.BluRay.x264.srt'), { language: '', forced: false, hearing: false }, 'the same name')
  assert.deepEqual(match('Oppenheimer.2023.1080p.BluRay.x264.fa.srt'), { language: 'fa', forced: false, hearing: false })
  assert.deepEqual(match('Oppenheimer.2023.1080p.BluRay.x264.Persian.Forced.ass'), { language: 'fa', forced: true, hearing: false })
  assert.deepEqual(match('Oppenheimer.2023.English.SDH.srt'), { language: 'en', forced: false, hearing: true }, 'one subtitle for every quality of the release')
  assert.deepEqual(match('oppenheimer.2023.vtt'), { language: '', forced: false, hearing: false }, 'letter case does not matter')
  for (const other of ['Oppenheimer.2023.1080p.BluRay.x264.mkv', 'Oppenheimer.2023.1080p.BluRay.x264.nfo', 'Oppenheimer.srt', 'Barbie.2023.srt', 'Oppenheimer.2023.1080p.BluRay.x2640.srt', 'Oppenheimer.20.srt']) assert.equal(match(other), null, other)
  const episode = 'Shogun.S01E02.720p.WEB.mkv'
  assert.ok(found.sidecarMatch(episode, 'Shogun.S01E02.fa.srt'))
  assert.equal(found.sidecarMatch(episode, 'Shogun.S01E03.fa.srt'), null, 'another episode')
  assert.equal(found.sidecarMatch(episode, 'Shogun.S01.fa.srt'), null, 'a season-wide name says too little')
  assert.equal(found.sidecarMatch('Shogun.2024.S01E02.720p.mkv', 'Shogun.2024.fa.srt'), null, 'a series-wide name is not any one episode\'s subtitle')
  assert.ok(found.sidecarMatch('Shogun.2024.S01E02.720p.mkv', 'Shogun.2024.S01E02.fa.srt'))
  assert.ok(found.sidecarMatch('فیلم.دوبله.mkv', 'فیلم.دوبله.fa.srt'), 'Persian file names')

  const listing = '<html><a href="../">../</a><a href="Film.2020.fa.srt">x</a><a href="Film%202020.en.srt">x</a><a href="sub/Film.srt">x</a><a href="https://elsewhere.invalid/Film.srt">x</a><a href="/other/Film.srt">x</a><a href="/movies/2020/Film.2020.mkv?x=1">x</a></html>'
  assert.deepEqual(found.listingFileNames(listing, 'https://dl.invalid/movies/2020/'), ['Film.2020.fa.srt', 'Film 2020.en.srt', 'Film.2020.mkv'], 'only files in that same folder of that same server')
  assert.deepEqual(found.sidecarGuesses('Film.2020.mkv'), ['Film.2020.srt', 'Film.2020.fa.srt', 'Film.2020.per.srt', 'Film.2020.ass', 'Film.2020.vtt'])

  assert.deepEqual(['per', 'fas', 'fa', 'eng', 'en-US', 'chi', 'und', '', 'xyz', 'hi'].map(found.subtitleLanguage), ['fa', 'fa', 'fa', 'en', 'en', 'zh', '', '', '', ''], 'ISO 639-1/2 tags; unknown is none')
  assert.deepEqual(['subrip', 'mov_text', 'webvtt', 'ass', 'ssa', 'hdmv_pgs_subtitle', 'dvd_subtitle', 'eia_608'].map(found.embeddedFormat), ['vtt', 'vtt', 'vtt', 'ass', 'ass', 'image', 'image', ''])
  assert.equal(found.foundLabel({ language: 'fa', title: 'Persian' }), 'فارسی', 'a title that only repeats the language adds nothing')
  assert.equal(found.foundLabel({ language: 'en', title: 'SDH <b>', forced: true }), 'انگلیسی · SDH b · فقط گفت‌وگوهای خارجی')
  assert.equal(found.foundLabel({ language: '', title: '' }), 'زیرنویس')
  assert.deepEqual([found.cueCount('WEBVTT\n\n00:01.000 --> 00:02.000\na\n\n00:03.000 --> 00:04.000\nb\n', 'vtt'), found.cueCount('[Events]\nDialogue: 0,a\nDialogue: 0,b\nComment: c\n', 'ass')], [2, 2])
  assert.deepEqual(found.trulyForced([{ forced: true, cues: 1400 }, { forced: false, cues: 1450 }]), [false, false], 'a full Persian track marked forced is not «only foreign dialogue»')
  assert.deepEqual(found.trulyForced([{ forced: true, cues: 40 }, { forced: false, cues: 1450 }]), [true, false], 'a short forced track beside a full one is')
  assert.deepEqual(found.trulyForced([{ forced: true, cues: 1400 }]), [false], 'a lone forced track cannot be told apart: no claim')
  assert.deepEqual(found.sortFound([{ id: 1, language: '' }, { id: 2, language: 'en' }, { id: 3, language: 'fa' }, { id: 4, language: 'fa' }]).map(row => row.id), [3, 4, 2, 1], 'Persian first, then the language list, unknown last')
  assert.equal(found.readScan('{"key":"abc","status":"done","found":2,"notes":["x"],"at":"t"}').found, 2)
  assert.equal(found.readScan('nope'), null)
  assert.equal(found.readScan('{"key":"abc","status":"queued"}'), null)
})

// «پخش در برنامهٔ دیگر»: KMPlayer, MX Player and VLC launch addresses.
require('./external-players.cases.cjs')

test('link notes: what a file holds, said beside its link before anyone presses play', () => {
  const info = require('./connected-source-loader.cjs')()('src/modules/media/domain/media-info.ts')
  const odyssey = info.mediaInfo([{ type: 1, codec: 'V_MPEG4/ISO/AVC', language: 'und' }, { type: 2, codec: 'A_EAC3', language: 'eng' }, { type: 17, codec: 'S_TEXT/UTF8', language: 'per' }], ['per', 'eng'])
  assert.deepEqual(odyssey, { video: 'H.264', audio: [{ codec: 'E-AC3', language: 'en' }], subtitles: ['fa', 'en'] })
  assert.deepEqual(info.mediaNotes(odyssey).map(n => [n.text, !!n.warn]), [['صدای E-AC3: در مرورگر پخش نمی‌شود؛ با KMPlayer یا VLC', true], ['زیرنویس داخل فایل: فارسی، انگلیسی', false]])
  const dubbed = info.mediaInfo([{ type: 1, codec: 'V_MPEGH/ISO/HEVC', language: '' }, { type: 2, codec: 'A_AAC', language: 'per' }, { type: 2, codec: 'A_AC3', language: 'eng' }], [])
  assert.deepEqual(info.mediaNotes(dubbed).map(n => n.text), ['HEVC (x265): همهٔ مرورگرها پخش نمی‌کنند', 'صدا: فارسی، انگلیسی'], 'one playable sound track is enough; no warning about the AC3 one')
  assert.equal(info.readMediaInfo({ video: 'H.264<script>', audio: [{ codec: 'AAC', language: 'fa' }], subtitles: ['fa', '<b>'] }).video, 'H.264script')
  assert.equal(info.readMediaInfo('junk'), null)
})
