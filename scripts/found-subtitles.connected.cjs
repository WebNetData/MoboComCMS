// Subtitles that come with a video file, through the real scan job, watch page and subtitle route on real PostgreSQL,
// with real ffprobe/ffmpeg on MKV/MP4 files made here. The viewer, the download-protection settings and the remote
// download server are test doubles; nothing is fetched from the network. Needs ffmpeg with libx264 (as in the Dockerfile).
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'found-subtitles-check'
const assert = require('node:assert/strict'), fs = require('node:fs'), fsp = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process')
const { Readable } = require('node:stream'), { pipeline } = require('node:stream/promises')
const ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `fsub${Date.now()}`
const state = { viewer: { userId: null, member: false }, guard: true, cinema: { enableAssSubtitles: true, enableSeparateAudio: false, findSubtitles: true, subtitleScanMaxGB: 10 }, remote: new Map(), drop: new Map(), ranged: new Map(), fetched: [], root: '' }
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/modules/cinema/server/admin') return { getCinemaSettings: async () => ({ ...state.cinema }) }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => id === 'download-guard' ? state.guard : true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => state.viewer, isMember: async () => state.viewer.member }
    if (name === '@/modules/downloads/server/guard') {
      const real = load('src/modules/downloads/server/guard.ts')
      return { ...real, getDownloadSettings: async () => ({ enforceTokens: true, requireLogin: false, tokenTtlMinutes: 60, hosts: [] }), signOriginUrl: url => url, linkHref: async (id, userId) => state.guard ? `/api/media/link/${id}?t=${real.pageToken(`l${id}`, userId, 60)}` : `/api/media/link/${id}` }
    }
    if (name === '@/modules/downloads/server/mask') return { maskedHref: async () => '/dl/masked' }
    if (name === '@/modules/identity/server/access') return { requireUser: async () => (state.viewer.userId ? { id: state.viewer.userId } : null) }
    if (name === '@/modules/downloads/server/files') return { filesRoot: () => state.root, fetchRemoteBytes: async (url, max) => { state.fetched.push(url); const file = state.remote.get(url); if (file === undefined) throw new Error('unreachable (404)'); const bytes = Buffer.isBuffer(file) ? file : Buffer.from(file); if (bytes.length > max) throw new Error('too large'); return bytes } }
    // The guarded transport, as the scan uses it: the size limit is refused up front like a Content-Length would be.
    if (name === '@/modules/downloads/server/remote') return { streamPublicFile: async (url, sink, options) => {
      state.fetched.push(url); const file = state.remote.get(url)
      if (!Buffer.isBuffer(file)) { sink.destroy(); throw new Error('دریافت فایل انجام نشد (404)') }
      if (file.length > options.maxBytes) { sink.destroy(); throw new Error('فایل از سقف حجم انتقال بزرگ‌تر است') }
      // A slow host that serves byte ranges: each job gets `budget` bytes before its time is up, then continues from there.
      const host = state.ranged.get(url)
      if (host && (options.parallel > 1 || options.resume)) {
        const from = options.resume?.from || 0
        if (options.resume && (options.resume.validator !== host.etag || options.resume.total !== file.length)) { sink.destroy(); throw Object.assign(new Error('فایل هنگام دریافت تغییر کرد'), { changed: true }) }
        host.reads.push(from)
        await options.onStart?.({ total: file.length, validator: host.etag })
        const end = Math.min(file.length, from + host.budget)
        await new Promise((resolve, reject) => sink.write(file.subarray(from, end), error => error ? reject(error) : resolve()))
        if (end < file.length) { sink.destroy(); throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }) }
        await new Promise(resolve => sink.end(resolve))
        return { bytes: end - from, total: file.length, validator: host.etag }
      }
      // A connection that drops part-way: what arrived is passed on, then the transfer fails.
      const drop = state.drop.get(url)
      const end = drop ?? file.length
      await pipeline(Readable.from((function* () { for (let at = 0; at < end; at += 1024) yield file.subarray(at, Math.min(at + 1024, end)); if (drop !== undefined) throw new Error('socket hang up') })()), sink)
      return { bytes: file.length }
    } }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const links = load('src/modules/media/server/links.ts'), guard = load('src/modules/downloads/server/guard.ts')
const scan = load('src/modules/media/server/found-subtitles/scan.ts'), request = load('src/modules/media/server/found-subtitles/request.ts')
const job = { continued: [], checkpoint: async () => {}, continueWith: async (kind, payload, options) => { job.continued.push({ kind, payload, options }) } }
const token = (id, userId = state.viewer.userId) => guard.pageToken(`l${id}`, userId, 60)
const ffmpeg = (args) => { const run = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' }); assert.equal(run.status, 0, run.stderr) }
const SRT_FA = '1\n00:00:00,200 --> 00:00:01,500\nسلام از داخل فایل\n'
const ASS_EN = '[Script Info]\nScriptType: v4.00+\nPlayResX: 160\nPlayResY: 90\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.30,0:00:01.40,Default,,0,0,0,,{\\b1}Hello inside\n'
const SIDECAR = '1\n00:00:00,100 --> 00:00:01,000\nزیرنویس کنار فایل\n'
const watch = async link => links.watchSource(String(link.id), token(link.id), new Headers())
const get = (id, t, extra = '') => links.openFoundSubtitle(new Request(`http://site.invalid/api/media/subtitle/found/${id}${t ? `?t=${encodeURIComponent(t)}${extra}` : extra ? `?${extra.slice(1)}` : ''}`), String(id))
const answer = async response => [response.status, response.status === 200 ? response.headers.get('content-type') : (await response.json()).error]
const scanned = async link => { const row = await prisma.mediaLink.findUniqueOrThrow({ where: { id: link.id } }); return { scan: JSON.parse(row.subtitleScan || 'null'), rows: await prisma.mediaLinkSubtitle.findMany({ where: { linkId: link.id }, orderBy: { id: 'asc' } }) } }
const run = link => scan.runSubtitleScan({ linkId: link.id, key: request.scanKey(link.url) }, job)
const startedAt = new Date()

async function main() {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mobocom-found-subs-'))
  state.root = path.join(temp, 'library')
  const folder = path.join(state.root, 'movies', seed), work = path.join(temp, 'work')
  await fsp.mkdir(folder, { recursive: true }); await fsp.mkdir(work)
  try {
    // ---- files as releases come: an MKV with a Persian SubRip and a styled English ASS inside, an MP4 with mov_text, one with none
    await fsp.writeFile(path.join(work, 'fa.srt'), SRT_FA); await fsp.writeFile(path.join(work, 'en.ass'), ASS_EN)
    const mkv = path.join(folder, 'Film.2020.1080p.mkv')
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10', '-i', path.join(work, 'fa.srt'), '-i', path.join(work, 'en.ass'), '-t', '2', '-map', '0', '-map', '1', '-map', '2', '-c:v', 'libx264', '-c:s:0', 'srt', '-c:s:1', 'ass', '-metadata:s:s:0', 'language=per', '-metadata:s:s:1', 'language=eng', '-metadata:s:s:1', 'title=SDH', '-disposition:s:1', 'forced', mkv])
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10', '-i', path.join(work, 'fa.srt'), '-t', '2', '-map', '0', '-map', '1', '-c:v', 'libx264', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', path.join(folder, 'Clip.2021.mp4')])
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10', '-t', '2', '-c:v', 'libx264', path.join(folder, 'Plain.2022.mkv')])
    await fsp.writeFile(path.join(folder, 'Film.2020.1080p.fa.srt'), SIDECAR)
    await fsp.writeFile(path.join(folder, 'Film.2020.Arabic.srt'), Buffer.concat([Buffer.from('1\n00:00:00,100 --> 00:00:01,000\n'), Buffer.from([0xD3, 0xE1, 0xC7, 0xE3]), Buffer.from('\n')]))
    await fsp.writeFile(path.join(folder, 'Barbie.2023.srt'), SIDECAR); await fsp.writeFile(path.join(folder, 'Film.2020.1080p.en.srt'), 'not a subtitle at all')
    await fsp.writeFile(path.join(folder, 'Film.2020.1080p.de.srt'), SIDECAR)

    const film = await prisma.cinemaTitle.create({ data: { slug: seed, title: `${seed} film`, kind: 'MOVIE' } })
    let order = 0
    const link = data => prisma.mediaLink.create({ data: { ownerType: 'title', ownerId: film.id, sortOrder: order++, ...data } })
    const local = await link({ kind: 'DOWNLOAD', url: `/files/movies/${seed}/Film.2020.1080p.mkv`, quality: '1080p' })
    const manual = await link({ kind: 'SUBTITLE', language: 'de', url: `/files/movies/${seed}/Film.2020.1080p.de.srt` })

    // ---- the first view queues one look at the file; more views do not queue more
    let page = await watch(local)
    assert.deepEqual([page.ok, page.subtitles.map(row => row.id)], [true, [manual.id]], 'nothing found yet; the hand-added subtitle as before')
    await watch(local)
    const queued = await prisma.backgroundJob.findMany({ where: { kind: 'media.subtitle-scan', dedupeKey: request.scanDedupe(local.id, request.scanKey(local.url)) } })
    assert.equal(queued.length, 1, 'one queued look per file address')

    // ---- the look: beside the file and inside it
    const result = await run(local)
    assert.deepEqual([result.sidecar, result.embedded], [2, 2], JSON.stringify(result))
    let { scan: state1, rows } = await scanned(local)
    assert.equal(state1.status, 'done')
    assert.deepEqual(rows.map(row => [row.origin, row.source.replace(/^.*\//, ''), row.language, row.format]).sort(), [
      ['EMBEDDED', 'stream:1', 'fa', 'vtt'], ['EMBEDDED', 'stream:2', 'en', 'ass'], ['SIDECAR', 'Film.2020.1080p.fa.srt', 'fa', 'srt'], ['SIDECAR', 'Film.2020.Arabic.srt', 'ar', 'srt'],
    ].sort(), 'same-named files with a language word, the tracks inside; not another film, not a file that is no subtitle, not the hand-added one again')
    assert.match(rows.find(row => row.source === 'stream:1').content, /سلام از داخل فایل/)
    assert.match(rows.find(row => row.source === 'stream:2').content, /\[Events\][\s\S]*Hello inside/, 'ASS keeps its styles')
    assert.equal(rows.find(row => row.language === 'ar').content.trim().split('\n').pop(), 'سلام', 'a Windows-1256 file is read as what it is')
    assert.equal(rows.find(row => row.source === 'stream:2').label, 'انگلیسی · SDH', 'marked forced, yet as long as the other track: a full subtitle, not only the foreign parts')

    // ---- the player is offered them for this file, Persian first, through the site with this file's token
    page = await watch(local)
    assert.equal(page.subtitles[0].id, manual.id, 'the editor\'s own subtitle stays first')
    const offered = page.subtitles.slice(1)
    assert.deepEqual(offered.map(row => row.language), ['fa', 'fa', 'en', 'ar'])
    assert.ok(offered.every(row => /^f\d+$/.test(row.id) && row.src.startsWith(`/api/media/subtitle/found/${row.id.slice(1)}?t=`) && !JSON.stringify(row).includes('/files/')), 'served by the site; no file address in the page')
    assert.ok(offered.find(row => row.format === 'ass').styledSrc.endsWith('&format=ass'))
    assert.equal((await prisma.backgroundJob.count({ where: { kind: 'media.subtitle-scan', dedupeKey: { startsWith: `media-subtitles:${local.id}:` }, createdAt: { gte: startedAt } } })), 1, 'a looked-at file is not queued again')

    const fa = rows.find(row => row.source === 'stream:1'), ass = rows.find(row => row.source === 'stream:2')
    let served = await get(fa.id, token(local.id))
    assert.deepEqual([served.status, served.headers.get('content-type'), served.headers.get('x-content-type-options'), /private/.test(served.headers.get('cache-control'))], [200, 'text/vtt; charset=utf-8', 'nosniff', true])
    assert.match(await served.text(), /^WEBVTT\n\n00:00:00\.200 --> 00:00:01\.500\nسلام از داخل فایل/)
    served = await get(rows.find(row => row.language === 'ar').id, token(local.id))
    assert.match(await served.text(), /^WEBVTT\n\n00:00:00\.100 --> 00:00:01\.000\nسلام/, 'SubRip beside the file becomes WebVTT')
    assert.match(await (await get(ass.id, token(local.id), '&format=ass')).text(), /Hello inside/)
    assert.doesNotMatch(await (await get(ass.id, token(local.id))).text(), /\{\\b1\}/, 'plain fallback of the styled one')

    // ---- the video's own rules
    assert.deepEqual(await answer(await get(fa.id, null)), [403, 'EXPIRED'], 'no page token')
    assert.deepEqual(await answer(await get(fa.id, token(manual.id))), [403, 'EXPIRED'], 'another link\'s token')
    await prisma.mediaLink.update({ where: { id: local.id }, data: { access: 'MEMBERS' } })
    assert.deepEqual(await answer(await get(fa.id, token(local.id))), [401, 'LOGIN_REQUIRED'], 'a members-only video keeps its subtitles to members')
    const member = await prisma.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
    state.viewer = { userId: member.id, member: true }
    assert.deepEqual(await answer(await get(fa.id, token(local.id))), [200, 'text/vtt; charset=utf-8'])
    state.viewer = { userId: null, member: false }
    await prisma.mediaLink.update({ where: { id: local.id }, data: { access: 'PUBLIC' } })
    await prisma.cinemaTitle.update({ where: { id: film.id }, data: { status: 'DRAFT' } })
    assert.deepEqual(await answer(await get(fa.id, token(local.id))), [404, 'NOT_FOUND'], 'the film is not published')
    await prisma.cinemaTitle.update({ where: { id: film.id }, data: { status: 'PUBLISHED' } })
    await prisma.mediaLink.update({ where: { id: local.id }, data: { disabled: true } })
    assert.deepEqual(await answer(await get(fa.id, token(local.id))), [404, 'NOT_FOUND'], 'the video was taken down')
    await prisma.mediaLink.update({ where: { id: local.id }, data: { disabled: false } })
    for (const bad of ['0', '-1', 'x', '2000000000']) assert.deepEqual(await answer(await links.openFoundSubtitle(new Request('http://site.invalid/x'), bad)), [404, 'NOT_FOUND'], bad)

    // ---- Admin switches
    state.cinema.enableAssSubtitles = false
    assert.ok(!(await watch(local)).subtitles.some(row => row.format === 'ass'))
    assert.deepEqual(await answer(await get(ass.id, token(local.id), '&format=ass')), [404, 'NOT_FOUND'], 'ASS policy also controls the found ones')
    state.cinema.enableAssSubtitles = true
    state.cinema.findSubtitles = false
    assert.deepEqual((await watch(local)).subtitles.map(row => row.id), [manual.id], 'switched off: only hand-added subtitles')
    assert.deepEqual(await answer(await get(fa.id, token(local.id))), [404, 'NOT_FOUND'])
    assert.deepEqual(await run(local), { linkId: local.id, skipped: 'off' })
    state.cinema.findSubtitles = true

    // ---- MP4 with a mov_text track; a file with none; a file the server has no ffmpeg for
    const mp4 = await link({ kind: 'STREAM', url: `/files/movies/${seed}/Clip.2021.mp4` })
    await run(mp4)
    ;({ rows } = await scanned(mp4))
    assert.deepEqual(rows.map(row => [row.origin, row.language, row.format]), [['EMBEDDED', 'en', 'vtt']])
    assert.match(rows[0].content, /سلام از داخل فایل/)
    const plain = await link({ kind: 'DOWNLOAD', url: `/files/movies/${seed}/Plain.2022.mkv` })
    await run(plain)
    assert.deepEqual([(await scanned(plain)).scan.status, (await scanned(plain)).rows.length], ['done', 0])
    const path0 = process.env.PATH
    process.env.PATH = temp
    const noTools = await link({ kind: 'DOWNLOAD', url: `/files/movies/${seed}/Clip.2021.mp4?again=1` })
    await run(noTools)
    process.env.PATH = path0
    assert.match((await scanned(noTools)).scan.notes.join(' '), /ffmpeg\/ffprobe روی سرور نصب نیست/, 'said plainly; the scan still finishes')

    // ---- a remote download server: its directory index, the file fed to ffmpeg through the guarded transport
    const base = `https://dl.example.invalid/${seed}/series/`
    const remoteMkv = await fsp.readFile(mkv)
    state.remote.set(`${base}Show.S01E02.720p.mkv`, remoteMkv)
    state.remote.set(base, `<html><a href="Show.S01E02.720p.mkv">v</a><a href="Show.S01E02.fa.srt">s</a><a href="Show.S01E03.fa.srt">s</a><a href="../">up</a></html>`)
    state.remote.set(`${base}Show.S01E02.fa.srt`, SIDECAR); state.remote.set(`${base}Show.S01E03.fa.srt`, SIDECAR)
    const series = await prisma.cinemaTitle.create({ data: { slug: `${seed}-show`, title: `${seed} show`, kind: 'SERIES' } })
    const season = await prisma.cinemaSeason.create({ data: { titleId: series.id, number: 1 } })
    const episode = await prisma.cinemaEpisode.create({ data: { seasonId: season.id, number: 2 } })
    const remote = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: `${base}Show.S01E02.720p.mkv` } })
    state.fetched.length = 0
    await run(remote)
    ;({ rows } = await scanned(remote))
    assert.deepEqual(rows.map(row => [row.origin, row.source.replace(base, ''), row.language]).sort(), [['EMBEDDED', 'stream:1', 'fa'], ['EMBEDDED', 'stream:2', 'en'], ['SIDECAR', 'Show.S01E02.fa.srt', 'fa']].sort(), 'this episode\'s file only')
    assert.ok(!state.fetched.includes(`${base}Show.S01E03.fa.srt`), 'another episode\'s subtitle is not even fetched')
    assert.deepEqual((await watch(remote)).subtitles.map(row => row.language), ['fa', 'fa', 'en'])

    // A server without a directory index: the usual names are asked for.
    const plainBase = `https://dl2.example.invalid/${seed}/`
    state.remote.set(`${plainBase}Movie.2019.mkv`, await fsp.readFile(path.join(folder, 'Plain.2022.mkv'))); state.remote.set(`${plainBase}Movie.2019.fa.srt`, SIDECAR)
    const guessed = await link({ kind: 'DOWNLOAD', url: `${plainBase}Movie.2019.mkv` })
    await run(guessed)
    ;({ rows, scan: state1 } = await scanned(guessed))
    assert.deepEqual(rows.map(row => [row.origin, row.language]), [['SIDECAR', 'fa']])
    assert.match(state1.notes.join(' '), /فهرست پوشه/)

    // Larger than the Admin limit: the whole file is not read, nothing half-read is kept, files beside it still count.
    state.cinema.subtitleScanMaxGB = 1000 / 1024 ** 3
    const big = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: `${base}Show.S01E02.720p.mkv?copy=2` } })
    state.remote.set(`${base}Show.S01E02.720p.mkv?copy=2`, remoteMkv)
    await run(big)
    ;({ rows, scan: state1 } = await scanned(big))
    assert.deepEqual(rows.map(row => row.origin), ['SIDECAR'])
    assert.match(state1.notes.join(' '), /سقف حجم/)
    state.cinema.subtitleScanMaxGB = 10

    // A connection that drops part-way through the file: subtitles that stop half-way are not kept.
    // Long enough that the cut falls between its first and last line, so what arrived is a subtitle that stops half-way.
    await fsp.writeFile(path.join(work, 'long.srt'), '1\n00:00:00,200 --> 00:00:01,000\nاول\n\n2\n00:00:19,000 --> 00:00:19,800\nآخر\n')
    const long = path.join(work, 'long.mkv')
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc=s=160x90:r=10', '-i', path.join(work, 'long.srt'), '-t', '20', '-map', '0', '-map', '1', '-c:v', 'libx264', '-c:s', 'srt', '-metadata:s:s:0', 'language=per', long])
    const longMkv = await fsp.readFile(long)
    const cut = `${base}Show.S01E02.720p.mkv?copy=3`
    state.remote.set(cut, longMkv); state.drop.set(cut, Math.floor(longMkv.length * 0.5))
    {
      // The same bytes, read whole by ffmpeg, do hold the first line: so it is the rule below that keeps them out.
      const half = path.join(work, 'half.mkv'); await fsp.writeFile(half, longMkv.subarray(0, Math.floor(longMkv.length * 0.5)))
      const out = cp.spawnSync('ffmpeg', ['-v', 'quiet', '-i', half, '-map', '0:s:0', '-f', 'webvtt', '-'], { encoding: 'utf8' })
      assert.match(out.stdout, /اول/); assert.doesNotMatch(out.stdout, /آخر/)
    }
    const dropped = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: cut } })
    await run(dropped)
    ;({ rows, scan: state1 } = await scanned(dropped))
    assert.deepEqual(rows.map(row => row.origin), ['SIDECAR'], 'nothing from inside a file that did not arrive whole')
    assert.match(state1.notes.join(' '), /فایل کامل از سرور دانلود دریافت نشد/)

    // ---- a host too slow for one job: the file is copied in parts over several jobs, then its tracks are taken out
    const copies = path.join(process.cwd(), 'storage', 'tmp', 'subtitle-scan')
    const leftovers = async id => (await fsp.readdir(copies).catch(() => [])).filter(name => name.startsWith(`${id}-`))
    const slowUrl = `${base}Show.S01E02.720p.mkv?copy=4`
    state.remote.set(slowUrl, remoteMkv); state.ranged.set(slowUrl, { etag: '"e1"', budget: Math.ceil(remoteMkv.length / 3), reads: [] })
    const slow = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: slowUrl } })
    const slowKey = request.scanKey(slowUrl)
    job.continued.length = 0
    let step = await run(slow)
    assert.ok(step.reading > 0 && step.total === remoteMkv.length, JSON.stringify(step))
    ;({ rows, scan: state1 } = await scanned(slow))
    assert.deepEqual([state1.status, state1.read.total, rows.length], ['reading', remoteMkv.length, 0], 'progress kept on the link; nothing offered yet')
    assert.match(state1.notes[0], /در حال خواندن کامل فایل/)
    assert.deepEqual(job.continued.map(row => [row.kind, row.payload.part, row.options.dedupeKey]), [['media.subtitle-scan', 1, `${request.scanDedupe(slow.id, slowKey)}:part:1`]], 'the next part is queued by this job')
    assert.equal((await leftovers(slow.id)).length, 2, 'a private copy and its facts')
    // While it is copied: a page view queues nothing more, and a second look started anew leaves the copy to its jobs.
    await watch(slow)
    assert.equal(await prisma.backgroundJob.count({ where: { dedupeKey: request.scanDedupe(slow.id, slowKey) } }), 0)
    assert.deepEqual(await run(slow), { linkId: slow.id, skipped: 'reading' })
    assert.equal((await scan.foundSubtitleStatus()).reading, 1)
    step = await scan.runSubtitleScan({ linkId: slow.id, key: slowKey, part: 1 }, job)
    assert.ok(step.reading > 0)
    step = await scan.runSubtitleScan({ linkId: slow.id, key: slowKey, part: 2 }, job)
    assert.deepEqual([step.embedded, step.sidecar], [2, 1], JSON.stringify(step))
    assert.deepEqual(state.ranged.get(slowUrl).reads, [0, Math.ceil(remoteMkv.length / 3), 2 * Math.ceil(remoteMkv.length / 3)], 'each job continues where the last one stopped; the track list was read once')
    ;({ rows, scan: state1 } = await scanned(slow))
    assert.equal(state1.status, 'done')
    assert.deepEqual(rows.map(row => [row.origin, row.language]).sort(), [['EMBEDDED', 'en'], ['EMBEDDED', 'fa'], ['SIDECAR', 'fa']].sort())
    assert.match(rows.find(row => row.source === 'stream:1').content, /سلام از داخل فایل/)
    assert.deepEqual(await leftovers(slow.id), [], 'the copy is removed')
    // The file is replaced on the server part-way: refused, not stitched; the copy goes and the look says so.
    const swapUrl = `${base}Show.S01E02.720p.mkv?copy=5`
    state.remote.set(swapUrl, remoteMkv); state.ranged.set(swapUrl, { etag: '"e1"', budget: Math.ceil(remoteMkv.length / 3), reads: [] })
    const swap = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: swapUrl } })
    await run(swap)
    state.ranged.get(swapUrl).etag = '"e2"'
    await scan.runSubtitleScan({ linkId: swap.id, key: request.scanKey(swapUrl), part: 1 }, job)
    ;({ rows, scan: state1 } = await scanned(swap))
    assert.deepEqual([state1.status, rows.map(row => row.origin)], ['done', ['SIDECAR']])
    assert.match(state1.notes.join(' '), /عوض شد/)
    assert.deepEqual(await leftovers(swap.id), [])
    // A copy that stopped moving (a lost job) is looked at again on the next view, continuing from its copy.
    const lostUrl = `${base}Show.S01E02.720p.mkv?copy=6`
    state.remote.set(lostUrl, remoteMkv); state.ranged.set(lostUrl, { etag: '"e1"', budget: Math.ceil(remoteMkv.length / 2), reads: [] })
    const lost = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: lostUrl } })
    await run(lost)
    const lostScan = (await scanned(lost)).scan
    await prisma.mediaLink.update({ where: { id: lost.id }, data: { subtitleScan: JSON.stringify({ ...lostScan, at: new Date(Date.now() - 31 * 60_000).toISOString() }) } })
    await watch(lost)
    assert.equal(await prisma.backgroundJob.count({ where: { dedupeKey: request.scanDedupe(lost.id, request.scanKey(lostUrl)) } }), 1, 'queued again once it stopped moving')
    step = await run(lost)
    assert.equal(step.embedded, 2, JSON.stringify(step))
    assert.deepEqual(state.ranged.get(lostUrl).reads, [0, Math.ceil(remoteMkv.length / 2)], 'it continued, it did not start over')
    assert.deepEqual(await leftovers(lost.id), [])

    // ---- reading inside files switched off: only the file beside the video; the video is not read at all, and a copy
    // under way is dropped
    state.cinema.readEmbeddedSubtitles = false
    const besideUrl = `${base}Show.S01E02.720p.mkv?copy=7`
    state.remote.set(besideUrl, remoteMkv); state.ranged.set(besideUrl, { etag: '"e1"', budget: Math.ceil(remoteMkv.length / 3), reads: [] })
    const beside = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: besideUrl } })
    state.fetched.length = 0
    await run(beside)
    ;({ rows, scan: state1 } = await scanned(beside))
    assert.deepEqual([state1.status, rows.map(row => [row.origin, row.language])], ['done', [['SIDECAR', 'fa']]])
    assert.ok(!state.fetched.includes(besideUrl), 'the video itself is not fetched, not even its start')
    assert.deepEqual([state.ranged.get(besideUrl).reads, await leftovers(beside.id)], [[], []])
    state.cinema.readEmbeddedSubtitles = true
    const midUrl = `${base}Show.S01E02.720p.mkv?copy=8`
    state.remote.set(midUrl, remoteMkv); state.ranged.set(midUrl, { etag: '"e1"', budget: Math.ceil(remoteMkv.length / 3), reads: [] })
    const mid = await prisma.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'DOWNLOAD', url: midUrl } })
    await run(mid)
    assert.equal((await leftovers(mid.id)).length, 2)
    state.cinema.readEmbeddedSubtitles = false
    await scan.runSubtitleScan({ linkId: mid.id, key: request.scanKey(midUrl), part: 1 }, job)
    ;({ rows, scan: state1 } = await scanned(mid))
    assert.deepEqual([state1.status, rows.map(row => row.origin), await leftovers(mid.id), state.ranged.get(midUrl).reads.length], ['done', ['SIDECAR'], [], 1], 'switched off mid-copy: the copy goes, nothing more is read')
    state.cinema.readEmbeddedSubtitles = true

    // ---- an address that changed while it was looked at; a link removed with its subtitles
    const moved = await link({ kind: 'DOWNLOAD', url: `/files/movies/${seed}/Film.2020.1080p.mkv?v=1` })
    const staleKey = request.scanKey(moved.url)
    await prisma.mediaLink.update({ where: { id: moved.id }, data: { url: `/files/movies/${seed}/Plain.2022.mkv?v=2` } })
    assert.deepEqual(await scan.runSubtitleScan({ linkId: moved.id, key: staleKey }, job), { linkId: moved.id, skipped: 'changed' })
    await assert.rejects(scan.runSubtitleScan({ linkId: moved.id, key: 'not-a-key' }, job), /Invalid/)
    await prisma.mediaLink.delete({ where: { id: remote.id } })
    assert.equal(await prisma.mediaLinkSubtitle.count({ where: { linkId: remote.id } }), 0, 'the subtitles go with their file')

    // ---- Admin: one pass over the existing links, a page at a time, and its status
    job.continued.length = 0
    const back = await scan.runSubtitleBackfill({ cursor: local.id - 1, again: false, run: 'test' }, job)
    assert.ok(back.queued >= 1, 'the moved, never-looked-at file is queued')
    assert.ok(await prisma.backgroundJob.count({ where: { kind: 'media.subtitle-scan', dedupeKey: request.scanDedupe(moved.id, request.scanKey(`/files/movies/${seed}/Plain.2022.mkv?v=2`)) } }), 'its new address')
    assert.equal(await prisma.backgroundJob.count({ where: { kind: 'media.subtitle-scan', createdAt: { gte: startedAt }, dedupeKey: { startsWith: `media-subtitles:${mp4.id}:` } } }), 0, 'a looked-at file is not queued again')
    await assert.rejects(scan.runSubtitleBackfill({ cursor: 0, run: 'bad run!' }, job), /Invalid/)
    const status = await scan.foundSubtitleStatus()
    assert.ok(status.scanned >= 5 && status.withSubtitles >= 4 && status.embedded >= 3 && status.sidecar >= 3, JSON.stringify(status))
    console.log('PostgreSQL found subtitles: Library and remote files beside the video (index and guesses), MKV/MP4 text tracks through real ffprobe/ffmpeg, ASS styles, Windows-1256, size limit, missing tools, address changes, the video\'s own gate/token/publication/takedown, Admin switches, one queued look per address, the backfill, and a slow host copied over several jobs (continued, replaced part-way, stopped and resumed, copy removed) passed')
  } finally {
    await fsp.rm(temp, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await prisma.cinemaTitle.findMany({ where: { slug: { startsWith: seed } }, select: { id: true, kind: true } })).map(row => row.id)
    const episodes = (await prisma.cinemaEpisode.findMany({ where: { season: { titleId: { in: ids } } }, select: { id: true } })).map(row => row.id)
    const linkIds = (await prisma.mediaLink.findMany({ where: { OR: [{ ownerType: 'title', ownerId: { in: ids } }, { ownerType: 'episode', ownerId: { in: episodes } }] }, select: { id: true } })).map(row => row.id)
    await prisma.backgroundJob.deleteMany({ where: { kind: { in: ['media.subtitle-scan', 'media.subtitle-backfill'] }, createdAt: { gte: startedAt } } })
    await prisma.mediaLink.deleteMany({ where: { id: { in: linkIds } } })
    await prisma.cinemaEpisode.deleteMany({ where: { id: { in: episodes } } }); await prisma.cinemaSeason.deleteMany({ where: { titleId: { in: ids } } })
    await prisma.cinemaTitle.deleteMany({ where: { id: { in: ids } } }); await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
