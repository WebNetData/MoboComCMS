// Real PostgreSQL film and links, saved through the admin save path and read through the public read path
// and the continue-watching list. Only this script's film and member are touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `trk${Date.now()}`
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/content/server/events') return { contentChanged: () => {}, MEDIA_RESOURCE_TYPE: {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const media = load('src/modules/media/server/admin.ts'), queries = load('src/modules/media/server/queries.ts'), domain = load('src/modules/media/domain/media.ts')
const u = name => `https://dl.example.invalid/${seed}/${name}`

async function main() {
  const { row: film } = await media.saveMediaItem('cinema-titles', { title: `${seed} film`, slug: seed, kind: 'MOVIE', links: [
    { url: u('sub-en.srt'), kind: 'SUBTITLE', language: 'en', quality: 'SRT', audio: 'DUBBED', subtitle: true },
    { url: u('film-1080.mp4'), kind: 'DOWNLOAD', quality: '1080p', audio: 'DUBBED', language: 'fa', subtitle: true },
    { url: u('sub-fa.srt'), kind: 'SUBTITLE', language: 'fa', quality: 'SRT' },
    { url: u('dub-fa.mka'), kind: 'AUDIO', language: 'fa', size: '180 MB' },
    { url: u('sub-xx.srt'), kind: 'SUBTITLE', language: 'klingon' },
    { url: u('film-720.mkv'), kind: 'DOWNLOAD', quality: '720p', audio: 'ORIGINAL' },
    { url: u('odd.bin'), kind: 'TORRENT' },
  ] }, null)
  const stored = await prisma.mediaLink.findMany({ where: { ownerType: 'title', ownerId: film.id }, orderBy: { sortOrder: 'asc' } })
  const facts = row => [row.url.split('/').pop(), row.kind, row.language, row.audio, row.subtitle]
  assert.deepEqual(stored.map(facts), [
    ['sub-en.srt', 'SUBTITLE', 'en', '', false], ['film-1080.mp4', 'DOWNLOAD', '', 'DUBBED', true], ['sub-fa.srt', 'SUBTITLE', 'fa', '', false], ['dub-fa.mka', 'AUDIO', 'fa', '', false],
    ['sub-xx.srt', 'SUBTITLE', '', '', false], ['film-720.mkv', 'DOWNLOAD', '', 'ORIGINAL', false], ['odd.bin', 'DOWNLOAD', '', '', false],
  ], 'a track has a language and no dub/original side; a release has no language; an unknown language or kind is not stored as given')

  // ---- the public read: releases grouped as before, tracks in groups of their own, by the language list
  const links = (await queries.publicLinks('title', [film.id])).get(film.id)
  assert.deepEqual(domain.groupLinks(links).map(group => [group.audio, group.items.map(link => link.url === undefined ? link.quality : 'leak')]), [['DUBBED', ['1080p']], ['ORIGINAL', ['720p']], ['', ['']]], 'tracks are not among the releases; the address of a file is not sent to the page')
  const tracks = domain.trackLinks(links)
  assert.deepEqual([tracks.subtitles.map(link => link.language), tracks.audio.map(link => link.language)], [['fa', 'en', ''], ['fa']], 'Persian first, then the rest of the list, unfiled last')
  assert.deepEqual([domain.trackLanguage('fa', true), domain.trackLanguage('en', false), domain.trackLanguage('klingon', true)], ['فارسی', 'English', ''])

  // ---- a track is never the thing that plays: not offered to the player, not what "continue watching" opens
  assert.deepEqual([domain.playbackKind(u('dub-fa.mp4'), 'AUDIO'), domain.playbackKind(u('sub.mp4'), 'SUBTITLE'), domain.playbackKind(u('film.mp4'), 'DOWNLOAD')], ['none', 'none', 'video'])
  const viewer = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  // The film's first link by order is now an audio file with a video extension: resume must still open the film.
  const audioFirst = await prisma.mediaLink.create({ data: { ownerType: 'title', ownerId: film.id, kind: 'AUDIO', language: 'fa', url: u('commentary.mp4'), sortOrder: -5 } })
  await prisma.cinemaWatchProgress.create({ data: { userId: viewer.id, ownerType: 'title', ownerId: film.id, positionSeconds: 600, durationSeconds: 6000 } })
  const progress = load('src/modules/cinema/server/progress.ts')
  const listing = Object.values(progress).find(fn => typeof fn === 'function' && /continue|history|watching/i.test(fn.name))
  const page = await progress.continueWatching?.(viewer.id) ?? await listing(viewer.id)
  const rows = Array.isArray(page) ? page : page.items || page.rows
  const opened = JSON.stringify(rows)
  assert.ok(rows.length === 1 && opened.includes(String(stored[1].id)) && !opened.includes(`/watch/${audioFirst.id}`), `resume opens the film's own file, not a track: ${opened.slice(0, 300)}`)

  // ---- the editor is given what was saved, and saving what it was given changes nothing
  const given = (await media.mediaLinksOf('title', film.id)).filter(row => row.id !== audioFirst.id)
  assert.deepEqual(given.filter(row => domain.isTrack(row.kind)).map(row => [row.kind, row.language]), [['SUBTITLE', 'en'], ['SUBTITLE', 'fa'], ['AUDIO', 'fa'], ['SUBTITLE', '']])
  await prisma.mediaLink.delete({ where: { id: audioFirst.id } })
  await media.saveMediaItem('cinema-titles', { links: given }, film.id)
  assert.deepEqual((await prisma.mediaLink.findMany({ where: { ownerType: 'title', ownerId: film.id }, orderBy: { sortOrder: 'asc' } })).map(facts), stored.map(facts), 'opening the form and saving it loses no language')

  // ---- saving again without touching them keeps the tracks; removing one removes only it
  await media.saveMediaItem('cinema-titles', { links: stored.filter(row => row.url !== u('sub-xx.srt')).map(row => ({ url: row.url, kind: row.kind, language: row.language, quality: row.quality, audio: row.audio, subtitle: row.subtitle })) }, film.id)
  const after = await prisma.mediaLink.findMany({ where: { ownerType: 'title', ownerId: film.id, kind: { in: ['SUBTITLE', 'AUDIO'] } }, orderBy: { id: 'asc' } })
  assert.deepEqual(after.map(row => [row.id, row.language]), [[stored[0].id, 'en'], [stored[2].id, 'fa'], [stored[3].id, 'fa']], 'the same rows, so their counters and prices stay')
  console.log('PostgreSQL media tracks: subtitle and audio files saved with a language, shown apart from the releases in language order, never played or resumed as the film, and kept across saves passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await prisma.cinemaTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.mediaLink.deleteMany({ where: { ownerType: 'title', ownerId: { in: ids } } })
    await prisma.cinemaTitle.deleteMany({ where: { id: { in: ids } } }); await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
