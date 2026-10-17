import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DownloadError } from '@/modules/server-panel/domain/downloads'
import { archivePath, EDIT_LIMITS, inspectTechnicalListing, type ArchiveEdit } from '@/modules/server-panel/domain/archive-edits'
import { publicAssetFile } from '@/modules/media/server/library'

export type ArchiveRun = (file: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }) => Promise<{ ok: boolean; out: string; truncated?: boolean }>
const inside = (root: string, name: string) => { const target = path.resolve(root, archivePath(name)); if (!target.startsWith(path.resolve(root) + path.sep)) throw new DownloadError('مسیر خارج از پوشهٔ کار است'); return target }
export const archiveStamp = async (file: string) => { const s = await fs.stat(file); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}` }

export async function inspectArchive(file: string, password: string, sevenZip: string, run: ArchiveRun) {
  const result = await run(sevenZip, ['l', '-slt', '-sccUTF-8', `-p${password}`, '--', file], { timeout: 120000 })
  if (!result.ok || result.truncated) throw new DownloadError('فهرست کامل آرشیو خوانده نشد؛ رمز، سلامت یا اندازهٔ فهرست را بررسی کنید')
  return inspectTechnicalListing(result.out.replace(/\r\n/g, '\n'))
}

export async function readArchivedText(file: string, name: string, password: string, sevenZip: string, run: ArchiveRun) {
  const entries = await inspectArchive(file, password, sevenZip, run), entry = entries.find(e => e.path === archivePath(name) && e.type === 'file')
  if (!entry || entry.size > 2 * 1024 ** 2) throw new DownloadError('فایل متنی باید در آرشیو باشد و کمتر از ۲ مگابایت حجم داشته باشد')
  const child = spawn(sevenZip, ['x', '-so', '-y', '-spd', `-p${password}`, '--', file, entry.path], { stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(30000) })
  child.stderr.resume()
  const closed = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new DownloadError('خواندن متن آرشیو انجام نشد'))) })
  const chunks: Buffer[] = []; let size = 0
  const sink = new Writable({ write(chunk: Buffer, _encoding, done) { size += chunk.length; if (size > entry.size) { done(new DownloadError('حجم فایل با فهرست تطبیق ندارد')); return } chunks.push(chunk); done() } })
  try { await Promise.all([closed, pipeline(child.stdout, sink)]); if (size !== entry.size) throw new Error(); const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) throw new Error(); return text }
  catch { child.kill('SIGKILL'); throw new DownloadError('فایل متنی UTF-8 سالم نیست یا دریافت آن کامل نشد') }
}

/** Extract bytes through stdout into files we create ourselves. The archiver never writes paths. */
export async function materializeArchive(file: string, dest: string, password: string, sevenZip: string, run: ArchiveRun, signal: AbortSignal, checkpoint: () => Promise<void>) {
  const entries = await inspectArchive(file, password, sevenZip, run)
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(10 * 60000)])
  await fs.mkdir(dest, { recursive: true, mode: 0o700 })
  for (const entry of entries) {
    bounded.throwIfAborted(); await checkpoint()
    const target = inside(dest, entry.path)
    if (entry.type === 'dir') { await fs.mkdir(target, { recursive: true }); continue }
    await fs.mkdir(path.dirname(target), { recursive: true })
    const child = spawn(sevenZip, ['x', '-so', '-y', '-spd', `-p${password}`, '--', file, entry.path], { stdio: ['ignore', 'pipe', 'pipe'], signal: bounded, env: { ...process.env, LC_ALL: 'C.UTF-8' } })
    child.stderr.resume()
    const closed = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new DownloadError('باز کردن فایل آرشیو انجام نشد؛ رمز یا سلامت فایل را بررسی کنید'))) })
    let bytes = 0
    const cap = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; done(bytes > entry.size ? new DownloadError('حجم واقعی فایل آرشیو با فهرست تطبیق ندارد') : null, chunk) } })
    try { await Promise.all([closed, pipeline(child.stdout, cap, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal: bounded })]); if (bytes !== entry.size) throw new DownloadError('فایل آرشیو ناقص است') }
    catch (error) { child.kill('SIGKILL'); throw error }
  }
  return entries
}

export async function applyArchiveEdits(root: string, edits: ArchiveEdit[], checkpoint: () => Promise<void>) {
  for (const edit of edits) {
    await checkpoint()
    const file = inside(root, edit.path)
    if (edit.op === 'delete') { if (!await fs.stat(file).catch(() => null)) throw new DownloadError('فایل انتخاب‌شده در آرشیو نیست'); await fs.rm(file, { recursive: true }); continue }
    if (edit.op === 'rename') { const to = inside(root, edit.to); if (await fs.lstat(to).catch(() => null)) throw new DownloadError('نام مقصد در آرشیو وجود دارد', 409); await fs.mkdir(path.dirname(to), { recursive: true }); await fs.rename(file, to); continue }
    await fs.mkdir(path.dirname(file), { recursive: true })
    const previous = await fs.lstat(file).catch(() => null)
    if (previous && !previous.isFile()) throw new DownloadError('مقصد تغییر باید یک فایل عادی باشد')
    if (edit.op === 'text') await fs.writeFile(file, edit.text, { mode: 0o600 })
    else { const source = await publicAssetFile(edit.assetId); if (source.size > EDIT_LIMITS.maxTotalBytes) throw new DownloadError('فایل جایگزین بیش از سقف آرشیو است'); await fs.copyFile(source.file, file) }
  }
  await validateWorkTree(root)
}

export async function validateWorkTree(root: string) {
  let count = 0, bytes = 0
  async function walk(dir: string, depth: number) {
    if (depth > 20) throw new DownloadError('عمق آرشیو بیش از حد است')
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (++count > EDIT_LIMITS.maxEntries) throw new DownloadError('تعداد فایل‌های آرشیو بیش از حد است')
      const file = path.join(dir, entry.name), info = await fs.lstat(file)
      if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) throw new DownloadError('لینک یا فایل ویژه در پوشهٔ آرشیو مجاز نیست')
      if (info.isDirectory()) await walk(file, depth + 1)
      else { bytes += info.size; if (bytes > EDIT_LIMITS.maxTotalBytes) throw new DownloadError('حجم خروجی آرشیو بیش از حد است') }
    }
  }
  await walk(root, 0)
}
