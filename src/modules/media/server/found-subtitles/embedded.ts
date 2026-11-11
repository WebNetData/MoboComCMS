import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { streamPublicFile } from '@/modules/downloads/server/remote'
import { MAX_SUBTITLE_BYTES } from '@/modules/media/domain/media'
import { MAX_FOUND_PER_ORIGIN, embeddedFormat, foundLabel, subtitleLanguage, type FoundFormat } from '@/modules/media/domain/found-subtitles'
import { INPUT_LIMITS, MediaToolError, runMediaTool } from './tools'
import { subtitleText, type Found } from './sidecar'
import type { VideoSource } from './source'

/** The start of a file holds its track list (MKV, and MP4 prepared for the web); reading more is not needed to see it. */
const PROBE_BYTES = 64 * 1024 * 1024
type Stream = { index: number; format: FoundFormat; language: string; title: string; forced: boolean; hearing: boolean }

/** The file for the tool: a local path, or the remote file fed through stdin (only its first `stopAfter` bytes when given). */
function input(source: VideoSource, maxBytes: number, timeoutMs: number, stopAfter = 0) {
  if (source.kind === 'local') return { path: source.file, feed: undefined }
  return { path: 'pipe:0', feed: (stdin: Writable) => {
    if (!stopAfter) return streamPublicFile(source.sign(source.url), stdin, { maxBytes, timeoutMs })
    let sent = 0
    const head = new Writable({
      write(chunk: Buffer, _encoding, done) {
        const room = stopAfter - sent
        sent += chunk.length
        if (room <= chunk.length) { stdin.end(chunk.subarray(0, Math.max(0, room))); done(new Error('probe-limit')); return }
        // ffprobe stops reading once it has the track list: stop feeding instead of waiting for room that never comes.
        if (stdin.destroyed || stdin.writableEnded) { done(new Error('probe-closed')); return }
        if (stdin.write(chunk)) { done(); return }
        const go = () => { stdin.off('drain', go); stdin.off('close', go); done() }
        stdin.once('drain', go); stdin.once('close', go)
      },
      final(done) { stdin.end(); done() },
    })
    return streamPublicFile(source.sign(source.url), head, { maxBytes, timeoutMs })
  } }
}
const tooLarge = (error: unknown) => /حجم/.test(String((error as Error | null)?.message || ''))

const SIZE = 'فایل از سقف حجم بررسی زیرنویس (تنظیمات فیلم و سریال) بزرگ‌تر است'
const NOTE: Record<MediaToolError['reason'], string> = {
  missing: 'ffmpeg/ffprobe روی سرور نصب نیست؛ زیرنویس داخل فایل خوانده نشد',
  timeout: 'خواندن زیرنویس داخل فایل در زمان مجاز تمام نشد',
  failed: 'فهرست ترک‌های فایل خوانده نشد (فرمت ناشناخته، یا MP4 که فهرستش در انتهای فایل است)',
}

async function probe(source: VideoSource, maxBytes: number, notes: string[]): Promise<Stream[]> {
  const from = input(source, maxBytes, 45_000, PROBE_BYTES)
  let stdout = ''
  try {
    stdout = (await runMediaTool('ffprobe', ['-v', 'error', ...INPUT_LIMITS, '-probesize', '20000000', '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title:stream_disposition=forced,hearing_impaired', '-of', 'json', from.path], { timeoutMs: 50_000, feed: from.feed })).stdout
  } catch (error) { notes.push(error instanceof MediaToolError && tooLarge(error.feedError) ? SIZE : NOTE[error instanceof MediaToolError ? error.reason : 'failed']); return [] }
  let streams: { index?: number; codec_type?: string; codec_name?: string; tags?: { language?: string; title?: string }; disposition?: { forced?: number; hearing_impaired?: number } }[] = []
  try { streams = JSON.parse(stdout).streams || [] } catch { notes.push(NOTE.failed); return [] }
  const subtitles = streams.filter(stream => stream.codec_type === 'subtitle' && Number.isSafeInteger(stream.index))
  const text: Stream[] = []
  let pictures = 0
  for (const stream of subtitles) {
    const format = embeddedFormat(String(stream.codec_name || ''))
    if (format === 'image') { pictures++; continue }
    if (!format || text.length >= MAX_FOUND_PER_ORIGIN) continue
    text.push({ index: Number(stream.index), format, language: subtitleLanguage(String(stream.tags?.language || '')), title: String(stream.tags?.title || ''), forced: stream.disposition?.forced === 1, hearing: stream.disposition?.hearing_impaired === 1 })
  }
  if (pictures) notes.push(`${pictures.toLocaleString('fa-IR')} زیرنویس تصویری (PGS/VobSub) داخل فایل است که مرورگر نمی‌تواند نشان دهد`)
  return text
}

/**
 * Text subtitle tracks inside an MKV/MP4/WebM, taken out with ffmpeg as WebVTT (ASS keeps its styles).
 * The track list is read first; the whole file is read only when it has a text track, because in these
 * containers subtitle lines are spread through the file beside the picture and sound.
 */
export async function embeddedSubtitles(source: VideoSource, options: { maxBytes: number; deadline: number }, notes: string[]): Promise<Found[]> {
  const streams = await probe(source, options.maxBytes, notes)
  if (!streams.length) return []
  const timeoutMs = Math.min(7 * 60_000, options.deadline - Date.now())
  if (timeoutMs < 30_000) { notes.push(NOTE.timeout); return [] }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mobocom-subs-'))
  try {
    await fs.chmod(work, 0o700)
    const outputs = streams.map(stream => ({ stream, file: path.join(work, `s${stream.index}.${stream.format === 'ass' ? 'ass' : 'vtt'}`) }))
    const from = input(source, options.maxBytes, timeoutMs)
    const args = ['-v', 'error', '-nostdin', ...INPUT_LIMITS, '-i', from.path, '-vn', '-an', '-dn']
    for (const output of outputs) args.push('-map', `0:${output.stream.index}`, '-c:s', output.stream.format === 'ass' ? 'copy' : 'webvtt', '-f', output.stream.format === 'ass' ? 'ass' : 'webvtt', '-n', output.file)
    let feedError: unknown = null
    try { feedError = (await runMediaTool('ffmpeg', args, { timeoutMs: timeoutMs + 5000, feed: from.feed })).feedError }
    catch (error) { notes.push(error instanceof MediaToolError && tooLarge(error.feedError) ? SIZE : NOTE[error instanceof MediaToolError ? error.reason : 'failed']); return [] }
    // A file cut short (size limit, dropped connection) would give subtitles that stop half-way: keep none.
    if (feedError) { notes.push(tooLarge(feedError) ? SIZE : 'فایل کامل از سرور دانلود دریافت نشد'); return [] }
    const found: Found[] = []
    for (const { stream, file } of outputs) {
      const stat = await fs.stat(file).catch(() => null)
      if (!stat || stat.size === 0 || stat.size > MAX_SUBTITLE_BYTES) continue
      const content = subtitleText(await fs.readFile(file), stream.format)
      if (content) found.push({ origin: 'EMBEDDED', source: `stream:${stream.index}`, language: stream.language, label: foundLabel(stream), format: stream.format, content })
    }
    return found
  } finally { await fs.rm(work, { recursive: true, force: true }) }
}
