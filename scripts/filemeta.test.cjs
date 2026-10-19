const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const file = path.resolve(__dirname, '../src/modules/downloads/domain/filemeta.ts')
const mod = { exports: {} }
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports, require)
const { cleanKindOf, id3v2Size, trailingTagSize, buildId3, archiveJunk, ffmpegArgs } = mod.exports

test('file kinds', () => {
  assert.equal(cleanKindOf('Song.MP3'), 'audio')
  assert.equal(cleanKindOf('movie.mkv'), 'video')
  assert.equal(cleanKindOf('setup.zip'), 'archive')
  assert.equal(cleanKindOf('setup.rar'), null)
  assert.equal(cleanKindOf('index.m3u8'), null)
})

test('ID3v2 size is read from the header; anything else is 0', () => {
  const tag = buildId3({ title: 'تست', artist: 'Artist' })
  assert.equal(id3v2Size(tag), tag.length)
  assert.equal(id3v2Size(Uint8Array.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0])), 0)
  const withFooter = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0x10, 0, 0, 1, 0])
  assert.equal(id3v2Size(withFooter), 10 + 128 + 10)
})

test('trailing ID3v1 and APEv2 tags are measured', () => {
  const audio = new Uint8Array(600).fill(0x55)
  const v1 = new Uint8Array(128); v1.set([0x54, 0x41, 0x47])
  const ape = new Uint8Array(64); ape.set([...'APETAGEX'].map((c) => c.charCodeAt(0)), 32)
  new DataView(ape.buffer).setUint32(32 + 12, 64, true)
  const file = new Uint8Array([...audio, ...ape, ...v1])
  assert.equal(trailingTagSize(file), 128 + 64)
  assert.equal(trailingTagSize(audio), 0)
})

test('new tag holds UTF-16 Persian text, the comment and the cover', () => {
  const tag = buildId3({ title: 'آهنگ', comment: 'موبوکام', url: 'https://mobocom.ir' }, Uint8Array.from([0xff, 0xd8, 0xff]))
  const text = Buffer.from(tag).toString('latin1')
  for (const id of ['TIT2', 'COMM', 'WXXX', 'APIC']) assert.ok(text.includes(id), id)
  assert.ok(!text.includes('TPE1'))
  assert.ok(Buffer.from(tag).includes(Buffer.from('آهنگ', 'utf16le')))
})

test('archive junk: shortcuts always, notes only when they name a source, never other files', () => {
  const junk = archiveJunk([
    { path: 'App/Setup.exe' }, { path: 'App/Visit Soft98.url' }, { path: 'App/site.html' },
    { path: 'App/Readme.txt', text: 'Downloaded from www.soft98.ir' }, { path: 'App/Serial.txt', text: 'KEY-1234' }, { path: 'Soft98.ir.nfo' },
  ], ['soft98.ir'])
  assert.deepEqual(junk, ['App/Visit Soft98.url', 'App/site.html', 'App/Readme.txt', 'Soft98.ir.nfo'])
})

test('ffmpeg keeps streams and languages, drops file metadata and stream titles', () => {
  const args = ffmpegArgs('/in.mkv', '/out.mkv', { title: 'Oppenheimer', comment: 'موبوکام' })
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 2), ['-map', '0'])
  assert.ok(args.includes('copy') && args.includes('-map_metadata:g') && args.includes('title=Oppenheimer'))
  assert.equal(args[args.length - 1], '/out.mkv')
  assert.ok(!args.includes('-movflags'))
  assert.ok(ffmpegArgs('/a.mp4', '/b.mp4', {}).includes('+faststart'))
})
