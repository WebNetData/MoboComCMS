// Subtitles inside an MKV read through its own index (media/domain/matroska, found-subtitles/indexed): the track list,
// the Cues, each line's block by itself, over a local HTTP server that counts every byte it sends. The file is built
// here (scripts/mkv-fixture.cjs), with filler standing in for the picture, so "only the lines are read" is measured.
const { test } = require('node:test'), assert = require('node:assert/strict'), http = require('node:http')
const loadSource = require('./connected-source-loader.cjs'), { buildMkv } = require('./mkv-fixture.cjs')
process.env.IMPORT_ALLOW_LOOPBACK = '1'
const load = loadSource({ '@/platform/database/prisma': { db: {} }, '@/platform/observability/logger': { logEvent: () => {} } })
const mkv = load('src/modules/media/domain/matroska.ts'), { indexedSubtitles } = load('src/modules/media/server/found-subtitles/indexed.ts')

const ASS_HEADER = '[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Arial,20\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
const fa = Array.from({ length: 40 }, (_, i) => ({ start: 2000 + i * 1400, duration: 1100, text: i === 3 ? '<i>...یک چهره</i>' : `خط ${i + 1}` }))
const en = Array.from({ length: 4 }, (_, i) => ({ start: 3000 + i * 9000, duration: 2000, text: `${i},0,Default,,0,0,0,,{\\b1}Hello ${i}` }))
const tracks = [{ number: 2, codec: 'S_TEXT/UTF8', language: 'per', name: 'HEXDL.COM', forced: true }, { number: 3, codec: 'S_TEXT/ASS', language: 'eng', header: ASS_HEADER, zlib: true }]
const files = new Map()
const state = { sent: 0, requests: 0, ranges: true, failRange: [Infinity, Infinity], delay: 0 }
const server = http.createServer((req, res) => {
  const file = files.get(req.url.split('?')[0]); state.requests++
  if (!file) { res.writeHead(404); return res.end() }
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '')
  if (!state.ranges || !range) { res.writeHead(200, { 'content-length': file.length }); state.sent += file.length; return res.end(file) }
  const from = Number(range[1]), to = Math.min(Number(range[2]), file.length - 1)
  if (from >= state.failRange[0] && from < state.failRange[1]) { res.writeHead(500); return res.end() }
  if (from >= file.length) { res.writeHead(416); return res.end() }
  res.writeHead(206, { 'content-range': `bytes ${from}-${to}/${file.length}`, 'content-length': to - from + 1 })
  state.sent += to - from + 1
  setTimeout(() => res.end(file.subarray(from, to + 1)), state.delay)
})
let base = ''
const reset = () => Object.assign(state, { sent: 0, requests: 0, ranges: true, failRange: [Infinity, Infinity], delay: 0 })
const source = name => ({ kind: 'remote', url: `${base}/${name}`, sign: url => url })
test.before(() => new Promise(resolve => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve() })))
test.after(() => new Promise(resolve => server.close(resolve)))

test('matroska: the track list, the index and a block read from where the index says', () => {
  const { file, placed } = buildMkv({ tracks, lines: { 2: fa, 3: en } })
  const head = mkv.readHead(file.subarray(0, 4096))
  assert.equal(head.docType, 'matroska')
  assert.deepEqual(head.tracks.map(t => [t.number, t.codec, t.language, t.forced, t.encoding?.kind || null]), [[1, 'V_MPEG4/ISO/AVC', '', false, null], [2, 'S_TEXT/UTF8', 'per', true, null], [3, 'S_TEXT/ASS', 'eng', false, 'zlib']])
  const cuesAt = head.segmentStart + head.seek.get(mkv.ID.Cues)
  const lines = mkv.readCues(file.subarray(cuesAt), new Set([2, 3]))
  assert.equal(lines.length, fa.length + en.length, 'every subtitle line is in the index; the video cue is not taken')
  const first = lines.find(line => line.track === 2), at = head.segmentStart + first.cluster + 12 + first.relative
  const block = mkv.readBlock(file.subarray(at, at + 1024), head.tracks[1])
  assert.deepEqual([block.complete, mkv.blockText(block.payload, head.tracks[1]), first.duration], [true, 'خط 1', 1100])
  assert.equal(mkv.readBlock(file.subarray(at + 1, at + 1024), head.tracks[1]), null, 'a position that is not that block is refused')
  assert.equal(mkv.readBlock(file.subarray(at, at + 1024), head.tracks[2]), null, 'another track\'s block is refused')
  assert.equal(placed.length, fa.length + en.length)
  assert.equal(mkv.readHead(Buffer.from('not a video at all')), null)
  // A laced block (flags 0x02) holds several frames; it is refused, not read as one line.
  const laced = Buffer.from([0xA0, 0x88, 0xA1, 0x86, 0x82, 0x00, 0x00, 0x02, 0x61, 0x62])
  assert.equal(mkv.readBlock(laced, head.tracks[1]), null)
  assert.equal(mkv.readBlock(Buffer.from([0xA0, 0x88, 0xA1, 0x86, 0x82, 0x00, 0x00, 0x00, 0x61, 0x62]), head.tracks[1]).complete, true, 'the same block unlaced is read')
  assert.equal(mkv.textCodec('S_HDMV/PGS'), 'image')
  assert.match(mkv.subtitleFile('srt', [{ start: 3_723_004, end: 3_724_000, text: 'a' }]), /^1\n01:02:03,004 --> 01:02:04,000\na\n/)
  assert.match(mkv.subtitleFile('ass', [{ start: 1000, end: 2500, text: '0,0,Default,,0,0,0,,Hi, there' }], ASS_HEADER), /\[Events\][\s\S]*Dialogue: 0,0:00:01\.00,0:00:02\.50,Default,,0,0,0,,Hi, there\n$/)
})

test('indexed subtitles: only the lines are read, a small part of the file; SubRip and zlib-compressed ASS come out whole', async () => {
  const built = buildMkv({ tracks, lines: { 2: fa, 3: en }, filler: 512 * 1024 })
  files.set('/film.mkv', built.file); reset()
  const notes = [], found = await indexedSubtitles(source('film.mkv?v=1'), { deadline: Date.now() + 30_000 }, notes)
  assert.deepEqual(found.map(f => [f.source, f.language, f.format]), [['stream:2', 'fa', 'srt'], ['stream:3', 'en', 'ass']], JSON.stringify(notes))
  assert.match(found[0].content, /^1\n00:00:02,000 --> 00:00:03,100\nخط 1\n/)
  assert.match(found[0].content, /<i>\.\.\.یک چهره<\/i>/)
  assert.equal((found[0].content.match(/-->/g) || []).length, fa.length)
  assert.match(found[1].content, /Dialogue: 0,0:00:03\.00,0:00:05\.00,Default,,0,0,0,,\{\\b1\}Hello 0/)
  assert.equal(found[0].label, 'فارسی · HEXDL.COM', 'marked forced but the longest track: a full subtitle')
  assert.ok(built.file.length > 6 * 1024 * 1024 && state.sent < built.file.length / 10, `read ${state.sent} of ${built.file.length} bytes`)
  assert.ok(state.requests < (fa.length + en.length) / 2, `lines close together are read together: ${state.requests} requests for ${fa.length + en.length} lines`)
})

test('indexed subtitles: a cluster size field of another length is read from the cluster itself', async () => {
  files.set('/short.mkv', buildMkv({ tracks: [tracks[0]], lines: { 2: fa.slice(0, 6) }, shortClusterSize: true }).file); reset()
  const found = await indexedSubtitles(source('short.mkv'), { deadline: Date.now() + 30_000 }, [])
  assert.equal((found[0].content.match(/-->/g) || []).length, 6)
})

test('indexed subtitles: no answer (null) when the index does not point at the lines, the host has no ranges, or it is not MKV', async () => {
  files.set('/nocues.mkv', buildMkv({ tracks: [tracks[0]], lines: { 2: fa }, subtitleCues: false }).file); reset()
  assert.equal(await indexedSubtitles(source('nocues.mkv'), { deadline: Date.now() + 30_000 }, []), null)
  assert.ok(state.sent < 1024 * 1024, 'it stopped after the index')
  files.set('/whole.mkv', buildMkv({ tracks: [tracks[0]], lines: { 2: fa } }).file); reset(); state.ranges = false
  const notes = []
  assert.equal(await indexedSubtitles(source('whole.mkv'), { deadline: Date.now() + 30_000 }, notes), null)
  assert.match(notes.join(' '), /بخشی از فایل را پشتیبانی نمی‌کند/)
  reset()
  files.set('/clip.mp4', Buffer.alloc(300_000, 1))
  assert.equal(await indexedSubtitles(source('clip.mp4'), { deadline: Date.now() + 30_000 }, []), null)
  files.set('/pictures.mkv', buildMkv({ tracks: [{ number: 2, codec: 'S_HDMV/PGS', language: 'per' }], lines: {} }).file)
  const pictureNotes = []
  assert.deepEqual(await indexedSubtitles(source('pictures.mkv'), { deadline: Date.now() + 30_000 }, pictureNotes), [])
  assert.match(pictureNotes.join(' '), /زیرنویس تصویری/)
})

test('indexed subtitles: a host that stops answering part-way leaves the whole Persian subtitle, not half of every track', async () => {
  const persian = Array.from({ length: 12 }, (_, i) => ({ start: 1000 + i * 2000, duration: 900, text: `خط ${i + 1}` }))
  const english = Array.from({ length: 6 }, (_, i) => ({ start: 41_000 + i * 3000, duration: 900, text: `line ${i + 1}` }))
  const built = buildMkv({ tracks: [{ number: 3, codec: 'S_TEXT/UTF8', language: 'eng' }, { number: 2, codec: 'S_TEXT/UTF8', language: 'per' }], lines: { 2: persian, 3: english } })
  files.set('/part.mkv', built.file); reset()
  // The English lines' part of the file fails (500); the start, the index at the end and the Persian lines answer.
  const segment = mkv.readHead(built.file.subarray(0, 4096)).segmentStart, englishAt = built.placed.filter(p => p.track === 3).map(p => segment + p.cluster + 12 + p.relative)
  // Only its last two lines fail: the English lines before them are read, and still no half subtitle is offered.
  const lastTwo = englishAt.sort((a, b) => a - b).slice(-2)
  state.failRange = [lastTwo[0], lastTwo[1] + 1]
  const notes = [], found = await indexedSubtitles(source('part.mkv'), { deadline: Date.now() + 60_000 }, notes)
  assert.deepEqual(found.map(f => [f.language, (f.content.match(/-->/g) || []).length]), [['fa', 12]])
  assert.match(notes.join(' '), /همهٔ زیرنویس‌های داخل فایل خوانده نشد/)
})

test('indexed subtitles: a read the job cannot finish is kept and continued by the next job, never repeated', async () => {
  const built = buildMkv({ tracks, lines: { 2: fa, 3: en }, filler: 64 * 1024 })
  files.set('/later.mkv', built.file); reset(); state.delay = 120
  let kept = null, saves = 0
  const progress = { load: async () => kept, save: async lines => { kept = JSON.parse(JSON.stringify(lines)); saves++ } }
  // A job with a moment left before its stop time: some lines are read, the rest is handed on.
  const first = await indexedSubtitles(source('later.mkv'), { deadline: Date.now() + 45_000 + 400, progress }, [])
  assert.ok(first && first.pending && first.pending.done > 0 && first.pending.done < first.pending.total, JSON.stringify(first))
  assert.equal(Object.keys(kept).length, first.pending.done)
  state.requests = 0; state.delay = 0
  const second = await indexedSubtitles(source('later.mkv'), { deadline: Date.now() + 60_000, progress }, [])
  assert.deepEqual(second.map(f => [f.language, (f.content.match(/-->|Dialogue:/g) || []).length]), [['fa', fa.length], ['en', en.length]])
  const secondRequests = state.requests
  reset()
  const once = await indexedSubtitles(source('later.mkv'), { deadline: Date.now() + 60_000 }, [])
  assert.ok(secondRequests < state.requests, `the lines read before are not asked for again (${secondRequests} requests, a whole read takes ${state.requests})`)
  assert.deepEqual(second.map(f => f.content), once.map(f => f.content), 'the same subtitles as one uninterrupted read')
  // The last job allowed gives what is whole rather than handing on.
  kept = null; reset(); state.delay = 120
  const last = await indexedSubtitles(source('later.mkv'), { deadline: Date.now() + 45_000 + 400, progress, final: true }, [])
  assert.ok(last === null || Array.isArray(last), 'final: no pending')
})
