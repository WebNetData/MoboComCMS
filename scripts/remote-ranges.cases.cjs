// The guarded remote reader over several connections (downloads/server/remote streamPublicFile `parallel`), against a
// local HTTP server that serves byte ranges: the same bytes in order, a host without ranges, a file that changes, a
// dropped part, the size limit, a redirect and a reader that goes away. Loopback is allowed for this test only.
const { test } = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), crypto = require('node:crypto')
const { Writable } = require('node:stream'), loadSource = require('./connected-source-loader.cjs')
process.env.IMPORT_ALLOW_LOOPBACK = '1'
const { streamPublicFile } = loadSource()('src/modules/downloads/server/remote.ts')

const PART = 8 * 1024 * 1024
const file = crypto.randomBytes(2 * PART + 12345)
const state = { ranges: true, active: 0, peak: 0, requests: 0, changeAt: -1, dropOnce: new Set(), dropAlways: new Set(), etag: '"v1"' }
const server = http.createServer((req, res) => {
  state.requests++
  if (req.url === '/moved') { res.writeHead(302, { location: '/film.mkv' }); return res.end() }
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '')
  if (!state.ranges || !range) { res.writeHead(200, { 'content-length': file.length, 'content-type': 'video/x-matroska' }); return res.end(file) }
  const from = Number(range[1]), to = Math.min(Number(range[2]), file.length - 1)
  // The file was replaced: If-Range no longer matches, so the whole new file comes back (200), as HTTP says.
  if (state.changeAt >= 0 && from >= state.changeAt && req.headers['if-range'] && req.headers['if-range'] !== '"v2"') { res.writeHead(200, { 'content-length': file.length, etag: '"v2"' }); return res.end(file) }
  state.active++; state.peak = Math.max(state.peak, state.active)
  res.on('close', () => { state.active-- })
  const part = file.subarray(from, to + 1)
  // A host that ends a part cleanly but short: its own length header agrees, only the range it claims does not.
  const sent = state.shortAt === from ? part.subarray(0, part.length - 10) : part
  res.writeHead(206, { 'content-range': `bytes ${from}-${to}/${file.length}`, 'content-length': sent.length, 'content-type': 'video/x-matroska', etag: state.etag })
  if (sent !== part) return setTimeout(() => res.end(sent), 5)
  if (state.dropAlways.has(from) || state.dropOnce.delete(from)) { res.write(part.subarray(0, 1000)); return setTimeout(() => res.destroy(), 5) }
  // A little delay per part, so several are in flight together.
  setTimeout(() => res.end(part), 30)
})
const reset = () => Object.assign(state, { shortAt: -1, ranges: true, active: 0, peak: 0, requests: 0, changeAt: -1, dropOnce: new Set(), dropAlways: new Set() })
const collect = (slow = false) => { const chunks = []; const sink = new Writable({ highWaterMark: 1024 * 1024, write(chunk, _e, done) { chunks.push(chunk); slow ? setTimeout(done, 2) : done() } }); sink.bytes = () => Buffer.concat(chunks); return sink }
let base = ''
test.before(() => new Promise(resolve => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve() })))
test.after(() => new Promise(resolve => server.close(resolve)))

test('remote ranges: the same bytes in order over several connections, with a slow reader too', async () => {
  for (const slow of [false, true]) {
    reset()
    const sink = collect(slow)
    const result = await streamPublicFile(`${base}/film.mkv`, sink, { maxBytes: 10 * 1024 ** 3, parallel: 3 })
    assert.equal(result.bytes, file.length)
    assert.ok(sink.bytes().equals(file), 'byte for byte, in order')
    assert.ok(state.peak > 1, `more than one connection at once (peak ${state.peak})`)
    assert.equal(state.requests, 3, 'one request per part, the first part from the first request')
  }
})

test('remote ranges: a host without ranges is read as one stream; one connection when parallel is not asked', async () => {
  reset(); state.ranges = false
  const sink = collect()
  await streamPublicFile(`${base}/film.mkv`, sink, { maxBytes: 10 * 1024 ** 3, parallel: 4 })
  assert.ok(sink.bytes().equals(file))
  reset()
  const single = collect()
  await streamPublicFile(`${base}/film.mkv`, single, { maxBytes: 10 * 1024 ** 3 })
  assert.ok(single.bytes().equals(file))
  assert.equal(state.peak, 0, 'no range request without parallel')
})

test('remote ranges: a file replaced part-way is refused, never stitched; a dropped part is asked once more', async () => {
  reset(); state.changeAt = PART
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, collect(), { maxBytes: 10 * 1024 ** 3, parallel: 3 }), /تغییر کرد/)
  reset(); state.dropOnce.add(PART)
  const sink = collect()
  await streamPublicFile(`${base}/film.mkv`, sink, { maxBytes: 10 * 1024 ** 3, parallel: 3 })
  assert.ok(sink.bytes().equals(file), 'the retried part arrives whole')
  reset(); state.shortAt = PART
  const short = collect()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, short, { maxBytes: 10 * 1024 ** 3, parallel: 3 }), /کامل/, 'a part that ends short is never passed on as whole')
  assert.ok(short.bytes().length <= PART)
  reset(); state.dropAlways.add(2 * PART)
  const broken = collect()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, broken, { maxBytes: 10 * 1024 ** 3, parallel: 3 }))
  assert.ok(broken.destroyed, 'the reader is stopped, not left waiting')
})

test('remote ranges: the size limit before anything is read; a redirect is followed; a reader that leaves ends the read', async () => {
  reset()
  const limited = collect()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, limited, { maxBytes: PART, parallel: 3 }), /سقف/)
  assert.equal(limited.bytes().length, 0)
  reset()
  const moved = collect()
  const result = await streamPublicFile(`${base}/moved`, moved, { maxBytes: 10 * 1024 ** 3, parallel: 3 })
  assert.ok(moved.bytes().equals(file)); assert.match(result.finalUrl, /\/film\.mkv$/)
  reset()
  let taken = 0
  const leaving = new Writable({ highWaterMark: 1024, write(chunk, _e, done) { taken += chunk.length; if (taken > 1000) { done(); this.destroy() } else done() } })
  const t0 = Date.now()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, leaving, { maxBytes: 10 * 1024 ** 3, parallel: 3, timeoutMs: 30_000 }))
  assert.ok(Date.now() - t0 < 10_000, 'no wait for a reader that is gone')
})

test('remote ranges: a read continues from a byte of the same file; another file or size is refused before a byte is kept', async () => {
  reset()
  const from = PART + 777, sink = collect(), seen = []
  const result = await streamPublicFile(`${base}/film.mkv`, sink, { maxBytes: 10 * 1024 ** 3, parallel: 3, resume: { from, validator: state.etag, total: file.length }, onStart: async info => { seen.push(info) } })
  assert.ok(sink.bytes().equals(file.subarray(from)), 'only the rest, in order')
  assert.deepEqual([result.total, result.validator, seen], [file.length, state.etag, [{ total: file.length, validator: state.etag }]])
  reset(); state.changeAt = 0
  const other = collect()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, other, { maxBytes: 10 * 1024 ** 3, parallel: 3, resume: { from, validator: '"old"', total: file.length } }), error => error.changed === true)
  assert.equal(other.bytes().length, 0)
  reset()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, collect(), { maxBytes: 10 * 1024 ** 3, parallel: 3, resume: { from, validator: state.etag, total: file.length + 1 } }), error => error.changed === true, 'a different size is another file')
  reset(); state.ranges = false
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, collect(), { maxBytes: 10 * 1024 ** 3, parallel: 3, resume: { from, validator: state.etag, total: file.length } }), error => error.changed === true, 'a host that stopped serving ranges cannot continue')
  reset()
  const refused = collect()
  await assert.rejects(streamPublicFile(`${base}/film.mkv`, refused, { maxBytes: 10 * 1024 ** 3, parallel: 3, onStart: async () => { throw new Error('no room') } }), /no room/)
  assert.equal(refused.bytes().length, 0, 'the start can refuse before anything is written')
})
