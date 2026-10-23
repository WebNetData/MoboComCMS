import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { enqueue } from '@/modules/operations/server/enqueue'
import { filesRoot } from '@/modules/downloads/server/files'
import { LibraryError } from '@/modules/media/domain/library'
import { currentLibraryUser, libraryTransaction, type LibraryActor } from './authority'
import { assetUrl, publicAssetFile, registerLocalAsset } from './catalog'
import { mediaSettings } from './settings'

const formats = 'mov,matroska,webm,avi,mpegts'
const decoder = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', formats, '-max_alloc', '67108864']
type Track = { index: number; codec: string; language: string; channels: number }
type Probe = { duration: number; tracks: Track[] }

/** No shell, network protocols, inherited stdin or unbounded tool output. */
async function tool(binary: string, args: string[], timeout = 15000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { NODE_ENV: process.env.NODE_ENV || 'production', PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '', TEMP: os.tmpdir(), TMP: os.tmpdir(), LANG: 'C.UTF-8', AV_LOG_FORCE_NOCOLOR: '1' } })
    let stdout = '', overflow = false, timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeout)
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 128000) { overflow = true; child.kill('SIGKILL') } })
    child.stderr.resume()
    child.once('error', () => { clearTimeout(timer); reject(new LibraryError('ابزار ffmpeg/ffprobe روی سرور در دسترس نیست', 503)) })
    child.once('close', code => { clearTimeout(timer); if (code === 0 && !overflow && !timedOut) resolve(stdout); else reject(new LibraryError(timedOut ? 'مهلت پردازش صدا تمام شد' : 'فایل یا ترک صوتی قابل پردازش نیست', 422)) })
  })
}
async function probe(file: string): Promise<Probe> {
  const raw = JSON.parse(await tool('ffprobe', ['-v', 'error', ...decoder, '-show_entries', 'format=duration:stream=index,codec_type,codec_name,channels:stream_tags=language', '-of', 'json', file]))
  const duration = Number(raw.format?.duration)
  if (!Number.isFinite(duration) || duration <= 0 || duration > 21600 || !Array.isArray(raw.streams)) throw new LibraryError('فایل باید مدت معتبر تا شش ساعت داشته باشد', 422)
  const tracks = raw.streams.filter((s: Record<string, unknown>) => s.codec_type === 'audio').slice(0, 32).map((s: { index: number; codec_name?: string; channels?: number; tags?: { language?: string } }) => ({ index: s.index, codec: String(s.codec_name || '').slice(0, 30), channels: Number(s.channels || 0), language: String(s.tags?.language || 'und').replace(/[^a-zA-Z-]/g, '').slice(0, 20) }))
  if (!tracks.length) throw new LibraryError('این فایل ترک صوتی ندارد', 422)
  return { duration, tracks }
}
async function authorize(actor: LibraryActor) {
  const user = await currentLibraryUser(actor)
  if (!user.manageLibrary) throw new LibraryError('ساخت نسخهٔ صوتی به مدیر کتابخانه اختصاص دارد', 403)
  const settings = (await mediaSettings()).value
  if (!settings.compatibleAudio) throw new LibraryError('ساخت صدای سازگار در تنظیمات کتابخانه غیرفعال است', 409)
  return { user, settings }
}
async function source(id: string, revision?: number) {
  const row = await db.mediaAsset.findUnique({ where: { id } })
  if (!row || row.archivedAt || row.kind !== 'video' || row.storage !== 'downloads') throw new LibraryError('یک ویدئوی محلی و فعال از کتابخانه انتخاب کنید', 404)
  if (revision !== undefined && row.revision !== revision) throw new LibraryError('فایل تغییر کرده؛ دوباره انتخاب کنید', 409)
  const local = await publicAssetFile(id)
  const stat = await fs.stat(local.file)
  return { row, file: local.file, fingerprint: `${stat.size}:${stat.mtimeMs}:${stat.ino}` }
}
export async function inspectCompatibleAudio(actor: LibraryActor, id: string) {
  await authorize(actor)
  const item = await source(id)
  return { ...await probe(item.file), revision: item.row.revision }
}
export async function requestCompatibleAudio(actor: LibraryActor, input: Record<string, unknown>, req: NextRequest) {
  const { user, settings } = await authorize(actor)
  const item = await source(String(input.assetId), Number(input.revision))
  const stream = Number(input.stream)
  const info = await probe(item.file)
  if (!Number.isSafeInteger(stream) || !info.tracks.some(track => track.index === stream)) throw new LibraryError('ترک صوتی معتبر انتخاب کنید')
  if (BigInt(item.row.bytes) > BigInt(Math.floor(settings.maxFileMB * 1024 * 1024))) throw new LibraryError('حجم ویدئو از سقف کتابخانه بیشتر است', 422)
  return libraryTransaction(async tx => {
    if (!(await currentLibraryUser(actor, tx)).manageLibrary) throw new LibraryError('اختیار حساب تغییر کرده است', 403)
    const current = await tx.mediaAsset.findUnique({ where: { id: item.row.id } })
    if (!current || current.archivedAt || current.revision !== item.row.revision) throw new LibraryError('فایل هم‌زمان تغییر کرده است', 409)
    const job = await enqueue('media.compatible-audio', { actorId: user.id, authAt: actor.authAt?.toISOString() || null, assetId: current.id, revision: current.revision, fingerprint: item.fingerprint, stream, month: new Date().toISOString().slice(0, 7) }, { dedupeKey: `media-audio:${user.id}:${current.id}:${current.revision}:${stream}` }, tx)
    await auditAdminStrict({ req, actor: user, action: 'media.audio.queued', targetType: 'MediaAsset', targetId: current.id, metadata: { jobId: job.id, stream } }, tx)
    return { id: job.id, status: job.status }
  })
}
export async function compatibleAudioJobs(actor: LibraryActor) {
  const user = await currentLibraryUser(actor)
  if (!user.manageLibrary) throw new LibraryError('دسترسی مجاز نیست', 403)
  const rows = await db.backgroundJob.findMany({ where: { kind: 'media.compatible-audio', dedupeKey: { startsWith: `media-audio:${user.id}:` } }, orderBy: { id: 'desc' }, take: 20 })
  return rows.map(row => ({ id: row.id, status: row.status, attempts: row.attempts, error: row.lastError ? 'پردازش کامل نشد؛ وضعیت را در پایش کارها بررسی کنید' : '', result: row.result ? JSON.parse(row.result) : null }))
}
export async function runCompatibleAudio(payload: Record<string, unknown>, jobId: number, attempt: number) {
  if (!Number.isSafeInteger(jobId) || jobId <= 0 || !Number.isSafeInteger(attempt) || attempt <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(payload.month))) throw new LibraryError('درخواست پردازش معتبر نیست')
  const lease = await db.backgroundJob.findUnique({ where: { id: jobId } })
  if (!lease || lease.kind !== 'media.compatible-audio' || lease.status !== 'RUNNING' || lease.attempts !== attempt) throw new LibraryError('اختیار اجرای پردازش تغییر کرده است', 409)
  const actor: LibraryActor = { id: Number(payload.actorId), authAt: payload.authAt ? new Date(String(payload.authAt)) : null }
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 || actor.authAt && !Number.isFinite(actor.authAt.getTime())) throw new LibraryError('اختیار ثبت‌شدهٔ پردازش معتبر نیست', 403)
  const { settings } = await authorize(actor)
  const item = await source(String(payload.assetId), Number(payload.revision))
  if (item.fingerprint !== payload.fingerprint) throw new LibraryError('محتوای فایل مبدا تغییر کرده است', 409)
  const stat = await fs.stat(item.file)
  if (stat.size > settings.maxFileMB * 1024 * 1024) throw new LibraryError('ویدئو از سقف پردازش بیشتر است', 422)
  const month = String(payload.month)
  const dir = path.join(filesRoot(), 'uploads', 'cinema', month)
  const name = `compatible-audio-${jobId}.m4a`, output = path.join(dir, name)
  const previous = await db.mediaAsset.findUnique({ where: { storage_key: { storage: 'downloads', key: `uploads/cinema/${month}/${name}` } } })
  if (previous) {
    if (previous.archivedAt || previous.createdById !== actor.id) throw new LibraryError('نسخهٔ قبلی تغییر کرده و نیازمند بررسی است', 409)
    const local = await publicAssetFile(previous.id), info = await probe(local.file)
    if (info.tracks[0]?.codec !== 'aac' || BigInt(local.size) !== previous.bytes) throw new LibraryError('نسخهٔ قبلی معتبر نیست', 409)
    return { assetId: previous.id, url: assetUrl(previous), codec: 'aac', sourceId: item.row.id }
  }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mobocom-audio-'))
  let published = false, adopted = false
  try {
    await fs.chmod(work, 0o700)
    const input = path.join(work, 'input')
    const fd = await fs.open(item.file, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const opened = await fd.stat()
      if (`${opened.size}:${opened.mtimeMs}:${opened.ino}` !== item.fingerprint) throw new LibraryError('مبدا پیش از خواندن تغییر کرد', 409)
      await pipeline(fd.createReadStream({ autoClose: false, end: stat.size - 1 }), createWriteStream(input, { flags: 'wx', mode: 0o600 }))
    } finally { await fd.close() }
    if ((await fs.stat(input)).size !== stat.size) throw new LibraryError('مبدا کامل خوانده نشد', 409)
    if ((await source(item.row.id, item.row.revision)).fingerprint !== payload.fingerprint) throw new LibraryError('مبدا هنگام خواندن تغییر کرد', 409)
    const info = await probe(input), stream = Number(payload.stream)
    if (!info.tracks.some(track => track.index === stream)) throw new LibraryError('ترک صوتی پیدا نشد')
    const encoded = path.join(work, 'audio.m4a')
    await tool('ffmpeg', ['-v', 'error', '-nostdin', ...decoder, '-threads', '1', '-i', input, '-map', `0:${stream}`, '-vn', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-t', String(info.duration), '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-threads', '1', '-movflags', '+faststart', '-n', encoded], settings.audioTimeoutSeconds * 1000)
    const checked = await probe(encoded)
    if (checked.tracks[0]?.codec !== 'aac' || Math.abs(checked.duration - info.duration) > 2 || (await fs.stat(encoded)).size > 400 * 1024 * 1024) throw new LibraryError('نسخهٔ صوتی کامل و سازگار تولید نشد', 422)
    await authorize(actor)
    if ((await source(item.row.id, item.row.revision)).fingerprint !== payload.fingerprint) throw new LibraryError('مبدا هنگام پردازش تغییر کرد', 409)
    await fs.mkdir(dir, { recursive: true })
    if (!(await fs.realpath(dir)).startsWith(await fs.realpath(filesRoot()) + path.sep)) throw new LibraryError('مسیر خروجی معتبر نیست', 403)
    // Exclusive publication: never overwrite an existing file, even after a worker crash.
    try { await fs.copyFile(encoded, output, constants.COPYFILE_EXCL); published = true } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; throw new LibraryError('خروجی قبلی نیاز به بررسی مدیر دارد؛ فایل بازنویسی نشد', 409) }
    const url = `/files/uploads/cinema/${month}/${name}`
    const asset = await libraryTransaction(async tx => {
      const user = await currentLibraryUser(actor, tx)
      if (!user.manageLibrary) throw new LibraryError('اختیار حساب تغییر کرده است', 403)
      // Claim without changing Operations' lease fields; its completion CAS owns lockedAt.
      const lease = await tx.backgroundJob.updateMany({ where: { id: jobId, kind: 'media.compatible-audio', status: 'RUNNING', attempts: attempt }, data: { attempts: attempt } })
      if (!lease.count) throw new LibraryError('اختیار اجرای این پردازش تغییر کرده است', 409)
      const policy = await tx.setting.findUnique({ where: { key: 'media.library.v1' } })
      if (!policy || JSON.parse(policy.value).compatibleAudio !== true) throw new LibraryError('پردازش صدا غیرفعال شده است', 409)
      const fresh = await tx.mediaAsset.findUnique({ where: { id: item.row.id } })
      if (!fresh || fresh.archivedAt || fresh.revision !== item.row.revision) throw new LibraryError('فایل هم‌زمان تغییر کرده است', 409)
      const result = await registerLocalAsset(url, user.id, fresh.folderId, `${fresh.name.slice(0, 100)} · AAC`, tx)
      const req = new NextRequest('http://localhost/internal/operations/media-audio', { headers: { 'user-agent': 'MoboCom Operations', 'x-request-id': `media-audio-${jobId}` } })
      await auditAdminStrict({ req, actor: user, action: 'media.audio.completed', targetType: 'MediaAsset', targetId: result.id, metadata: { sourceId: fresh.id, jobId, stream } }, tx)
      return result
    })
    adopted = true
    return { assetId: asset.id, url: assetUrl(asset), codec: 'aac', sourceId: item.row.id }
  } finally {
    if (published && !adopted) await fs.unlink(output).catch(() => {})
    await fs.rm(work, { recursive: true, force: true })
  }
}
