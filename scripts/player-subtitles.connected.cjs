// Real PostgreSQL film and links through the real watch and subtitle code. The viewer, the download-protection
// settings and the remote file are test doubles; nothing is fetched from the network.
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'player-subtitles-check'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `psub${Date.now()}`
const state = { viewer: { userId: null, member: false }, guard: true, cinema: true, ass: false, separateAudio: false, files: new Map(), fetched: [] }
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/modules/cinema/server/admin') return { getCinemaSettings: async () => ({ enableAssSubtitles: state.ass, enableSeparateAudio: state.separateAudio }) }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => id === 'download-guard' ? state.guard : id === 'cinema' ? state.cinema : true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => state.viewer, isMember: async () => state.viewer.member }
    if (name === '@/modules/downloads/server/guard') {
      const real = load('src/modules/downloads/server/guard.ts')
      return { ...real, getDownloadSettings: async () => ({ enforceTokens: true, requireLogin: false, tokenTtlMinutes: 60, hosts: [] }), signOriginUrl: url => url, linkHref: async (id, userId) => state.guard ? `/api/media/link/${id}?t=${real.pageToken(`l${id}`, userId, 60)}` : `/api/media/link/${id}` }
    }
    if (name === '@/modules/downloads/server/mask') return { maskedHref: async () => '/dl/masked' }
    if (name === '@/modules/identity/server/access') return { requireUser: async () => (state.viewer.userId ? { id: state.viewer.userId } : null) }
    if (name === '@/modules/downloads/server/files') return { fetchRemoteBytes: async (url, max) => { state.fetched.push(url); const file = state.files.get(url); if (file === undefined) throw new Error('unreachable'); const bytes = Buffer.isBuffer(file) ? file : Buffer.from(file); if (bytes.length > max) throw new Error('too large'); return bytes } }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const links = load('src/modules/media/server/links.ts'), guard = load('src/modules/downloads/server/guard.ts')
const prefs = load('src/modules/media/server/playback-prefs.ts'), prefRules = load('src/modules/media/domain/playback-prefs.ts'), mediaRules = load('src/modules/media/domain/media.ts')
const u = name => `https://dl.example.invalid/${seed}/${name}`
const SRT = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<font color="#fff">سلام</font> <i>دنیا</i>\r\n\r\n2\r\n00:01:02,040 --> 00:01:04,000\r\n{\\an8}خط دوم\r\n42\r\n'
const get = (id, token) => links.openSubtitle(new Request(`http://site.invalid/api/media/subtitle/${id}${token ? `?t=${encodeURIComponent(token)}` : ''}`), String(id))
const token = (id, userId = state.viewer.userId) => guard.pageToken(`l${id}`, userId, 60)
const answer = async response => [response.status, response.status === 200 ? response.headers.get('content-type') : (await response.json()).error]

async function main() {
  const film = await prisma.cinemaTitle.create({ data: { slug: seed, title: `${seed} film`, kind: 'MOVIE' } })
  let order = 0
  const link = data => prisma.mediaLink.create({ data: { ownerType: 'title', ownerId: film.id, sortOrder: order++, ...data } })
  const video = await link({ kind: 'DOWNLOAD', url: u('film.mp4'), quality: '1080p' })
  const en = await link({ kind: 'SUBTITLE', language: 'en', url: u('en.vtt') })
  const fa = await link({ kind: 'SUBTITLE', language: 'fa', url: u('fa.srt'), label: 'فارسی هماهنگ با بلوری' })
  const ass = await link({ kind: 'SUBTITLE', language: 'fa', url: u('styled.ass') })
  const gone = await link({ kind: 'SUBTITLE', language: 'ar', url: u('ar.srt'), disabled: true })
  const vip = await link({ kind: 'SUBTITLE', language: 'tr', url: u('tr.srt'), access: 'MEMBERS' })
  const audio = await link({ kind: 'AUDIO', language: 'fa', url: u('dub.srt') })
  state.files.set(u('fa.srt'), SRT); state.files.set(u('tr.srt'), SRT)
  state.files.set(u('en.vtt'), 'WEBVTT - made by a tool\nNOTE a comment\n\nSTYLE\n::cue { color: red }\n\nintro\n00:01.000 --> 00:02.000 align:start\nHello <c.loud>there</c>\n')

  // ---- what the player is offered: the files it can show and this viewer may open, Persian first
  const watch = async () => links.watchSource(String(video.id), token(video.id), new Headers())
  let page = await watch()
  assert.deepEqual([page.ok, page.subtitles.map(row => [row.id, row.language, row.label])], [true, [[fa.id, 'fa', 'فارسی هماهنگ با بلوری'], [en.id, 'en', 'انگلیسی']]], 'not the styled file the browser cannot show, the one taken down, the members\' one, or the audio file')
  assert.ok(page.subtitles.every(row => row.src.startsWith(`/api/media/subtitle/${row.id}?t=`) && !JSON.stringify(page).includes('example.invalid')), 'served by the site; the file\'s own address is not in the page')
  const member = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  state.viewer = { userId: member.id, member: true }
  assert.deepEqual((await watch()).subtitles.map(row => row.language), ['fa', 'en', 'tr'], 'a member is offered the members\' subtitle too')
  state.viewer = { userId: null, member: false }

  // ---- what a member prefers is kept with the account and reaches the player and the download box
  const put = body => prefs.PUT_playbackPrefs({ headers: new Headers(), json: async () => body })
  assert.deepEqual([await prefs.getPlaybackPrefs(null), await prefs.getPlaybackPrefs(member.id), (await put({ subtitle: 'en' })).status], [prefRules.NO_PLAYBACK_PREFS, prefRules.NO_PLAYBACK_PREFS, 401], 'no preference until chosen; a visitor has none to save')
  assert.equal((await watch()).subtitlePreference, null, 'a visitor: the device remembers')
  state.viewer = { userId: member.id, member: false }
  assert.equal((await watch()).subtitlePreference, '', 'a member who never chose')
  assert.deepEqual(await (await put({ subtitle: 'en' })).json(), { audio: '', subtitle: 'en' })
  assert.deepEqual(await (await put({ audio: 'ORIGINAL' })).json(), { audio: 'ORIGINAL', subtitle: 'en' }, 'what is not sent is kept')
  assert.equal((await watch()).subtitlePreference, 'en')
  assert.deepEqual(await (await put({ subtitle: 'klingon', audio: 'LOUD' })).json(), { audio: '', subtitle: '' }, 'an unknown language or side is no preference')
  assert.deepEqual(await (await put({ subtitle: 'off' })).json(), { audio: '', subtitle: 'off' })
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).playbackPrefs, '{"audio":"","subtitle":"off"}')
  assert.equal((await prefs.PUT_playbackPrefs({ headers: new Headers({ origin: 'https://elsewhere.invalid', host: 'site.invalid' }), json: async () => ({ subtitle: 'fa' }) })).status, 403, 'not from another site')
  const releases = [{ audio: 'DUBBED', quality: '1080p' }, { audio: 'ORIGINAL', quality: '1080p' }, { audio: '', quality: '720p' }]
  assert.deepEqual([mediaRules.groupLinks(releases).map(g => g.audio), mediaRules.groupLinks(releases, prefRules.audioOrder({ audio: 'ORIGINAL', subtitle: '' })).map(g => g.audio), prefRules.audioOrder({ audio: 'DUBBED', subtitle: '' })[0]], [['DUBBED', 'ORIGINAL', ''], ['ORIGINAL', 'DUBBED', ''], 'DUBBED'], 'the preferred side first, nothing hidden')
  state.viewer = { userId: null, member: false }

  // ---- the file itself, as the browser needs it
  const served = await get(fa.id, token(fa.id))
  assert.deepEqual([served.status, served.headers.get('content-type'), served.headers.get('x-content-type-options'), /private/.test(served.headers.get('cache-control'))], [200, 'text/vtt; charset=utf-8', 'nosniff', true])
  assert.equal(await served.text(), 'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nسلام <i>دنیا</i>\n\n00:01:02.040 --> 00:01:04.000\nخط دوم\n42\n', 'SubRip becomes WebVTT: header, decimal point, no cue numbers, no markup but italics; a number that is text stays')
  assert.equal(await (await get(en.id, token(en.id))).text(), 'WEBVTT\n\nintro\n00:00:01.000 --> 00:00:02.000 align:start\nHello there\n', 'a WebVTT file keeps its cues and settings; its header block and classes are not passed on')

  // A Persian file saved as Windows-1256, as many are: read as what it is, not as broken UTF-8.
  state.files.set(u('tr.srt'), Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n'), Buffer.from([0xD3, 0xE1, 0xC7, 0xE3]), Buffer.from('\n')]))
  state.viewer = { userId: member.id, member: true }
  assert.equal(await (await get(vip.id, token(vip.id))).text(), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nسلام\n')
  state.viewer = { userId: null, member: false }
  state.files.set(u('tr.srt'), SRT)

  // ---- the same rules as the film's own links
  assert.deepEqual(await answer(await get(fa.id, null)), [403, 'EXPIRED'], 'no page token')
  assert.deepEqual(await answer(await get(fa.id, token(en.id))), [403, 'EXPIRED'], 'another link\'s token')
  assert.deepEqual(await answer(await get(fa.id, token(fa.id, member.id))), [403, 'EXPIRED'], 'another viewer\'s token')
  state.guard = false
  assert.deepEqual(await answer(await get(fa.id, null)), [200, 'text/vtt; charset=utf-8'], 'without download protection no token is asked for')
  assert.ok((await watch()).subtitles.every(row => row.src === `/api/media/subtitle/${row.id}`))
  state.guard = true
  assert.deepEqual(await answer(await get(vip.id, token(vip.id))), [401, 'LOGIN_REQUIRED'])
  state.viewer = { userId: member.id, member: false }
  assert.deepEqual(await answer(await get(vip.id, token(vip.id))), [403, 'MEMBERS_ONLY'])
  state.viewer = { userId: member.id, member: true }
  assert.deepEqual(await answer(await get(vip.id, token(vip.id))), [200, 'text/vtt; charset=utf-8'])
  state.viewer = { userId: null, member: false }
  state.fetched.length = 0
  for (const [row, why] of [[ass, 'a format the player cannot show'], [gone, 'taken down'], [video, 'the film itself'], [audio, 'an audio file, whatever its extension'], [{ id: 2_000_000_000 }, 'no such link']]) assert.deepEqual(await answer(await get(row.id, token(row.id))), [404, 'NOT_FOUND'], why)
  state.cinema = false
  assert.deepEqual(await answer(await get(fa.id, token(fa.id))), [404, 'NOT_FOUND'], 'the section is switched off')
  state.cinema = true
  await prisma.cinemaTitle.update({ where: { id: film.id }, data: { status: 'DRAFT' } })
  assert.deepEqual(await answer(await get(fa.id, token(fa.id))), [404, 'NOT_FOUND'], 'the film is not published')
  await prisma.cinemaTitle.update({ where: { id: film.id }, data: { status: 'PUBLISHED' } })
  assert.deepEqual(state.fetched, [], 'nothing is fetched for a request that is refused')

  // ---- a file that cannot be had or is not a subtitle
  state.files.delete(u('fa.srt'))
  assert.deepEqual(await answer(await get(fa.id, token(fa.id))), [502, 'UNAVAILABLE'])
  state.files.set(u('fa.srt'), '<html><body>Not found</body></html>')
  assert.deepEqual(await answer(await get(fa.id, token(fa.id))), [502, 'UNAVAILABLE'], 'an error page is not served as a subtitle')
  state.files.set(u('fa.srt'), `1\n00:00:01,000 --> 00:00:02,000\n${'x'.repeat(2 * 1024 * 1024)}\n`)
  assert.deepEqual(await answer(await get(fa.id, token(fa.id))), [502, 'UNAVAILABLE'], 'larger than a subtitle is')
  const styled = '[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:04.00,Default,{\\b1}سلام\\N<img src=x onerror=bad()>\n'
  state.files.set(u('styled.ass'), styled); state.ass = true; state.separateAudio = true
  const soundtrack = await link({ kind: 'AUDIO', language: 'fa', label: 'صدای دوبله', url: u('dub.mp3') }), privateAudio = await link({ kind: 'AUDIO', language: 'en', url: u('vip.mp3'), access: 'MEMBERS' })
  page = await watch()
  assert.equal(page.subtitles.find(row => row.id === ass.id).format, 'ass')
  assert.ok(page.subtitles.find(row => row.id === ass.id).styledSrc.includes('format=ass'))
  assert.deepEqual(page.audioTracks.map(row => row.id), [soundtrack.id], 'invalid-format and unauthorized audio stay out')
  const styledGet = t => links.openSubtitle(new Request(`http://site.invalid/api/media/subtitle/${ass.id}?format=ass${t ? '&t='+encodeURIComponent(t) : ''}`), String(ass.id))
  const raw = await styledGet(token(ass.id)); assert.equal(raw.status,200); assert.match(raw.headers.get('content-type'),/^text\/plain/); assert.equal(await raw.text(),styled); assert.match(raw.headers.get('cache-control'),/no-store/)
  assert.equal((await styledGet(null)).status,403,'styled source still requires its own page token')
  const plainAss = await (await get(ass.id, token(ass.id))).text(); assert.match(plainAss,/WEBVTT/); assert.match(plainAss,/&lt;img/); assert.doesNotMatch(plainAss,/<img/,'plain fallback escapes dialogue markup')
  state.viewer = { userId: member.id, member: true }; assert.ok((await watch()).audioTracks.some(row => row.id === privateAudio.id)); state.viewer = { userId: null, member: false }
  state.ass = false; state.separateAudio = false
  assert.equal((await styledGet(token(ass.id))).status,404,'Admin ASS policy also controls raw serving')
  assert.equal((await watch()).audioTracks.length,0,'Admin separate-audio policy controls player choices')
  console.log('PostgreSQL player subtitles/audio: protected ASS source/plain fallback, policy switches, language and account preferences, audio format/VIP filtering, tokens/publication/takedown/module and bounded file behavior passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await prisma.cinemaTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.mediaLink.deleteMany({ where: { ownerType: 'title', ownerId: { in: ids } } })
    await prisma.cinemaTitle.deleteMany({ where: { id: { in: ids } } }); await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
