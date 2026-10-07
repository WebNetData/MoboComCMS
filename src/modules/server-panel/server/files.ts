import fs from 'node:fs/promises'
import { constants, createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { command } from '@/modules/server-panel/server/system'
import { ARCHIVE_LIMITS, ArchiveError, TarReader, archiveRefusal, entrySegments, zipEntries, type ArchiveEntry } from '@/modules/server-panel/domain/archive'
import { canRemove, isImageName, isVirtualPath, joinPath, looksText, modeString, normalizePath, parentOf, pathAccess, safeName } from '@/modules/server-panel/domain/policy'

// Whole-server file manager. The panel policy (domain/policy.ts) decides what
// may be touched at all; the operating system permissions of the app user
// decide the rest. Nothing here uses a shell.

export class FileError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const EDIT_LIMIT = 2 * 1024 * 1024

/** The app itself: its folder and data stay deletable only file-by-file, never as a whole. */
export function protectedRoots() {
  const cwd = process.cwd()
  return [cwd, path.join(cwd, 'storage'), path.join(cwd, 'prisma'), path.join(cwd, 'src'), path.join(cwd, 'node_modules'), path.join(cwd, '.next')]
}

export function resolveTarget(input: unknown, root = '/'): string {
  const target = normalizePath(input)
  if (!target) throw new FileError('مسیر نامعتبر است')
  const base = normalizePath(root) || '/'
  if (base !== '/' && target !== base && !target.startsWith(`${base}/`)) throw new FileError('این مسیر بیرون از محدودهٔ مجاز پنل است', 403)
  if (isVirtualPath(target)) throw new FileError('مسیرهای سیستمی مجازی (proc، sys، dev) در دسترس نیستند', 403)
  return target
}

function requireWrite(target: string) {
  if (pathAccess(target) !== 'write') throw new FileError('این مسیر سیستمی فقط‌خواندنی است', 403)
}

/**
 * Where a path really leads once every symbolic link on the way is followed: the real path of
 * the deepest part that exists, plus what does not exist yet. `self: 'keep'` leaves the last
 * name as it is, for the operations that act on a link itself (rename, remove, lstat).
 */
export async function realTarget(target: string, self: 'follow' | 'keep' = 'follow'): Promise<string> {
  if (target === '/') return '/'
  if (self === 'keep') return joinPath(await realTarget(parentOf(target)), path.basename(target))
  let existing = target
  const missing: string[] = []
  for (;;) {
    const real = await fs.realpath(existing).catch((error: NodeJS.ErrnoException) => {
      // A link that leads nowhere (or in a circle) is not a place to read or write through.
      if (error.code === 'ELOOP') throw new FileError('این مسیر از یک پیوند نمادین حلقه‌ای می‌گذرد', 403)
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
      return osError(error)
    })
    if (real !== null) return missing.length ? joinPath(real === '/' ? '/' : real, missing.reverse().join('/')) : real
    if (await fs.lstat(existing).then((info) => info.isSymbolicLink(), () => false)) throw new FileError('این مسیر یک پیوند نمادین شکسته است', 403)
    if (existing === '/') return target
    missing.push(path.basename(existing))
    existing = parentOf(existing)
  }
}

/**
 * The policy, applied to where the path really leads. The check on the text of the path (resolveTarget)
 * says what the admin asked for; this says what the operating system will do. A link inside the allowed
 * area that points at a read-only, virtual, protected or outside place gets the answer of that place.
 */
export async function guard(target: string, root: string, need: 'read' | 'write' | 'remove', self: 'follow' | 'keep' = 'follow'): Promise<string> {
  const real = normalizePath(await realTarget(target, self)) || '/'
  if (real === target) return real
  const base = normalizePath(root) || '/'
  const realBase = base === '/' ? '/' : normalizePath(await realTarget(base)) || '/'
  if (realBase !== '/' && real !== realBase && !real.startsWith(`${realBase}/`)) throw new FileError('این مسیر از راه یک پیوند نمادین به بیرون از محدودهٔ مجاز پنل می‌رسد', 403)
  if (isVirtualPath(real)) throw new FileError('این مسیر از راه یک پیوند نمادین به مسیرهای سیستمی مجازی می‌رسد', 403)
  if (need !== 'read' && pathAccess(real) !== 'write') throw new FileError('این مسیر از راه یک پیوند نمادین به بخش فقط‌خواندنی سیستم می‌رسد', 403)
  if (need === 'remove' && !canRemove(real, protectedRoots())) throw new FileError('این مسیر از راه یک پیوند نمادین به مسیر محافظت‌شده می‌رسد', 403)
  return real
}

function osError(error: unknown): never {
  const code = (error as NodeJS.ErrnoException)?.code
  const messages: Record<string, [string, number]> = {
    ENOENT: ['فایل یا پوشه پیدا نشد', 404],
    EACCES: ['کاربر سرویس سایت اجازهٔ دسترسی به این مسیر را ندارد', 403],
    EPERM: ['سیستم‌عامل اجازهٔ این کار را نمی‌دهد', 403],
    EROFS: ['این بخش از دیسک برای سرویس سایت فقط‌خواندنی است (systemd ProtectSystem)', 403],
    EEXIST: ['فایل یا پوشه‌ای با این نام وجود دارد', 409],
    ENOTEMPTY: ['پوشه خالی نیست', 409],
    ENOTDIR: ['مسیر پوشه نیست', 400],
    EISDIR: ['مسیر یک پوشه است', 400],
    ENOSPC: ['فضای دیسک پر است', 507],
    EXDEV: ['انتقال بین دو دیسک انجام نشد', 409],
  }
  const [message, status] = messages[code || ''] || ['عملیات انجام نشد', 500]
  throw new FileError(message, status)
}

let names: { users: Map<number, string>; groups: Map<number, string>; at: number } | null = null
async function ownerNames() {
  if (names && Date.now() - names.at < 60_000) return names
  const parse = async (file: string) => {
    const map = new Map<number, string>()
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    for (const line of text.split('\n')) { const [name, , id] = line.split(':'); if (name && id) map.set(Number(id), name) }
    return map
  }
  names = { users: await parse('/etc/passwd'), groups: await parse('/etc/group'), at: Date.now() }
  return names
}

export type Entry = { name: string; path: string; type: 'dir' | 'file' | 'link' | 'other'; size: number; mtime: string; mode: string; octal: string; owner: string; group: string; target?: string; image: boolean }

const MAX_ENTRIES = 3000

export async function listDir(input: unknown, root: string) {
  const dir = resolveTarget(input, root)
  await guard(dir, root, 'read')
  const stat = await fs.stat(dir).catch(osError)
  if (!stat.isDirectory()) throw new FileError('مسیر پوشه نیست')
  const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(osError)
  const { users, groups } = await ownerNames()
  const entries: Entry[] = []
  for (const dirent of dirents.slice(0, MAX_ENTRIES)) {
    const full = joinPath(dir, dirent.name)
    if (isVirtualPath(full)) continue
    const info = await fs.lstat(full).catch(() => null)
    if (!info) continue
    let type: Entry['type'] = info.isDirectory() ? 'dir' : info.isFile() ? 'file' : info.isSymbolicLink() ? 'link' : 'other'
    let target: string | undefined
    if (type === 'link') {
      target = await fs.readlink(full).catch(() => undefined)
      const resolved = await fs.stat(full).catch(() => null)
      if (resolved?.isDirectory()) type = 'dir'
    }
    entries.push({ name: dirent.name, path: full, type, size: info.size, mtime: info.mtime.toISOString(), mode: modeString(info.mode), octal: (info.mode & 0o7777).toString(8).padStart(3, '0'), owner: users.get(info.uid) ?? String(info.uid), group: groups.get(info.gid) ?? String(info.gid), target, image: type === 'file' && isImageName(dirent.name) })
  }
  entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, 'en', { numeric: true }))
  const writable = pathAccess(dir) === 'write' && pathAccess(normalizePath(await realTarget(dir)) || '/') === 'write' && await fs.access(dir, constants.W_OK).then(() => true, () => false)
  return { path: dir, parent: dir === '/' ? null : parentOf(dir), writable, truncated: dirents.length > MAX_ENTRIES, total: dirents.length, entries }
}

const etagOf = (stat: { mtimeMs: number; size: number }) => `${Math.round(stat.mtimeMs)}-${stat.size}`

export async function readText(input: unknown, root: string) {
  const file = resolveTarget(input, root)
  const real = await guard(file, root, 'read')
  const stat = await fs.stat(file).catch(osError)
  if (!stat.isFile()) throw new FileError('فقط فایل‌ها قابل ویرایش‌اند')
  if (stat.size > EDIT_LIMIT) throw new FileError('این فایل برای ویرایشگر بزرگ است (بیش از ۲ مگابایت)؛ آن را دانلود کنید', 413)
  const buffer = await fs.readFile(file).catch(osError)
  if (!looksText(path.basename(file), new Uint8Array(buffer.subarray(0, 8192)))) throw new FileError('فایل متنی نیست؛ آن را دانلود کنید', 415)
  const writable = pathAccess(file) === 'write' && pathAccess(real) === 'write' && await fs.access(file, constants.W_OK).then(() => true, () => false)
  return { path: file, content: buffer.toString('utf8'), etag: etagOf(stat), size: stat.size, writable, crlf: buffer.includes('\r\n') }
}

export async function writeText(input: unknown, content: unknown, etag: unknown, root: string) {
  const file = resolveTarget(input, root)
  requireWrite(file)
  await guard(file, root, 'write')
  if (typeof content !== 'string') throw new FileError('محتوا نامعتبر است')
  if (Buffer.byteLength(content) > EDIT_LIMIT) throw new FileError('محتوا بیش از ۲ مگابایت است', 413)
  const stat = await fs.stat(file).catch(osError)
  if (!stat.isFile()) throw new FileError('مسیر فایل نیست')
  if (etag && etag !== etagOf(stat)) throw new FileError('این فایل در این فاصله روی سرور تغییر کرده است؛ دوباره باز کنید', 409)
  // In place, so the owner, group, mode and hard links of config files survive.
  await fs.writeFile(file, content, 'utf8').catch(osError)
  const next = await fs.stat(file)
  return { path: file, etag: etagOf(next), size: next.size }
}

export async function createEntry(dirInput: unknown, nameInput: unknown, kind: 'file' | 'dir', root: string) {
  const dir = resolveTarget(dirInput, root)
  const name = safeName(nameInput)
  if (!name) throw new FileError('نام نامعتبر است')
  const target = joinPath(dir, name)
  requireWrite(target)
  await guard(target, root, 'write', 'keep')
  if (kind === 'dir') await fs.mkdir(target).catch(osError)
  else await fs.writeFile(target, '', { flag: 'wx' }).catch(osError)
  return { path: target }
}

export async function renameEntry(fromInput: unknown, nameInput: unknown, root: string) {
  const from = resolveTarget(fromInput, root)
  const name = safeName(nameInput)
  if (!name) throw new FileError('نام نامعتبر است')
  if (!canRemove(from, protectedRoots())) throw new FileError('این مسیر محافظت‌شده است و تغییر نام داده نمی‌شود', 403)
  const to = joinPath(parentOf(from), name)
  requireWrite(to)
  // The entry itself is renamed (a link stays a link); the folder it sits in is what must be allowed.
  await guard(from, root, 'remove', 'keep')
  await guard(to, root, 'write', 'keep')
  if (await fs.lstat(to).then(() => true, () => false)) throw new FileError('فایل یا پوشه‌ای با این نام وجود دارد', 409)
  await fs.rename(from, to).catch(osError)
  return { path: to }
}

async function exists(target: string) {
  return fs.lstat(target).then(() => true, () => false)
}

/** Move or copy several entries into a folder. */
export async function transfer(sources: unknown, destInput: unknown, mode: 'move' | 'copy', root: string) {
  const dest = resolveTarget(destInput, root)
  requireWrite(dest)
  const realDest = await guard(dest, root, 'write')
  const list = Array.isArray(sources) ? sources.slice(0, 200) : []
  if (!list.length) throw new FileError('چیزی انتخاب نشده است')
  const done: string[] = []
  for (const raw of list) {
    const from = resolveTarget(raw, root)
    if (mode === 'move' && !canRemove(from, protectedRoots())) throw new FileError(`«${from}» محافظت‌شده است`, 403)
    // The source is taken as it is (verbatimSymlinks: a link is copied as a link); where it sits must be allowed.
    const realFrom = await guard(from, root, mode === 'move' ? 'remove' : 'read', 'keep')
    if (dest === from || dest.startsWith(`${from}/`) || realDest === realFrom || realDest.startsWith(`${realFrom}/`)) throw new FileError('نمی‌توان پوشه را به داخل خودش برد')
    const to = joinPath(dest, path.basename(from))
    if (await exists(to)) throw new FileError(`«${path.basename(from)}» در مقصد وجود دارد`, 409)
    if (mode === 'copy') await fs.cp(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true }).catch(osError)
    else await fs.rename(from, to).catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') osError(error)
      await fs.cp(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true }).catch(osError)
      await fs.rm(from, { recursive: true, force: true }).catch(osError)
    })
    done.push(to)
  }
  return { paths: done }
}

export async function removeEntries(sources: unknown, root: string) {
  const list = Array.isArray(sources) ? sources.slice(0, 200) : []
  if (!list.length) throw new FileError('چیزی انتخاب نشده است')
  const targets = list.map((raw) => resolveTarget(raw, root))
  for (const target of targets) if (!canRemove(target, protectedRoots())) throw new FileError(`«${target}» محافظت‌شده است و حذف نمی‌شود`, 403)
  // rm removes a link, not what it points at; the folder the entry really sits in is what must be allowed.
  for (const target of targets) await guard(target, root, 'remove', 'keep')
  for (const target of targets) await fs.rm(target, { recursive: true }).catch(osError)
  return { removed: targets.length }
}

export async function changeMode(input: unknown, octal: unknown, root: string) {
  const target = resolveTarget(input, root)
  requireWrite(target)
  // chmod follows a link and changes what it points at.
  await guard(target, root, 'remove')
  const text = String(octal || '')
  if (!/^[0-7]{3,4}$/.test(text)) throw new FileError('سطح دسترسی باید عددی مثل 644 یا 755 باشد')
  await fs.chmod(target, parseInt(text, 8)).catch(osError)
  return { path: target, octal: text }
}

export async function saveUpload(dirInput: unknown, name: string, data: Uint8Array, overwrite: boolean, root: string) {
  const dir = resolveTarget(dirInput, root)
  const clean = safeName(name)
  if (!clean) throw new FileError(`نام فایل «${name}» نامعتبر است`)
  const target = joinPath(dir, clean)
  requireWrite(target)
  if (overwrite && !canRemove(target, protectedRoots())) throw new FileError('این مسیر محافظت‌شده است', 403)
  // Writing follows a link that already has this name.
  await guard(target, root, overwrite ? 'remove' : 'write')
  await fs.writeFile(target, data, { flag: overwrite ? 'w' : 'wx' }).catch(osError)
  return target
}

/** Stream a file (or a folder as .tar.gz) to the browser. */
export async function openDownload(input: unknown, root: string, inline = false): Promise<{ stream: ReadableStream; name: string; size?: number; type: string; inline: boolean }> {
  const target = resolveTarget(input, root)
  await guard(target, root, 'read')
  const stat = await fs.stat(target).catch(osError)
  const base = path.basename(target) || 'root'
  if (stat.isDirectory()) {
    const child = spawn('tar', ['-czf', '-', '-C', parentOf(target), base], { stdio: ['ignore', 'pipe', 'ignore'] })
    return { stream: Readable.toWeb(child.stdout) as ReadableStream, name: `${base}.tar.gz`, type: 'application/gzip', inline: false }
  }
  if (!stat.isFile()) throw new FileError('فقط فایل و پوشه قابل دانلود است')
  await fs.access(target, constants.R_OK).catch(osError)
  const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp' }
  const ext = base.split('.').pop()?.toLowerCase() || ''
  // SVG and HTML are never served inline from here (they could run script on this origin).
  const type = inline && types[ext] ? types[ext] : 'application/octet-stream'
  return { stream: Readable.toWeb(createReadStream(target)) as ReadableStream, name: base, size: stat.size, type, inline: inline && !!types[ext] }
}

/** Pack selected entries of one folder into a .zip or .tar.gz next to them. */
export async function archive(dirInput: unknown, namesInput: unknown, format: 'zip' | 'tar.gz', outName: unknown, root: string) {
  const dir = resolveTarget(dirInput, root)
  const names = (Array.isArray(namesInput) ? namesInput : []).map(safeName).filter((name): name is string => !!name).slice(0, 200)
  if (!names.length) throw new FileError('چیزی انتخاب نشده است')
  const base = safeName(outName) || `archive-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  const file = joinPath(dir, base.endsWith(`.${format}`) ? base : `${base}.${format}`)
  requireWrite(file)
  await guard(dir, root, 'write')
  if (await exists(file)) throw new FileError('فایلی با این نام وجود دارد', 409)
  const result = format === 'zip'
    ? await command('zip', ['-r', '-q', '-y', file, '--', ...names], 10 * 60_000, dir)
    : await command('tar', ['-czf', file, '-C', dir, '--', ...names], 10 * 60_000)
  if (!result.ok) throw new FileError(format === 'zip' && /ENOENT|not found/i.test(result.out) ? 'ابزار zip روی سرور نصب نیست (sudo apt install zip)' : `ساخت آرشیو انجام نشد: ${result.out.slice(0, 200)}`, 500)
  return { path: file }
}

const TAR_NAME = /\.(tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2)$/

/** The entries of a tar archive, read from its headers (the contents are skipped, not kept). */
async function tarListing(file: string, name: string): Promise<ArchiveEntry[]> {
  const reader = new TarReader()
  const tool = /\.(tar\.xz|txz)$/.test(name) ? 'xz' : /\.(tar\.bz2|tbz2)$/.test(name) ? 'bzip2' : null
  const child = tool ? spawn(tool, ['-dc', '--', file], { stdio: ['ignore', 'pipe', 'ignore'] }) : null
  const source = child ? null : createReadStream(file)
  const stream: NodeJS.ReadableStream = child ? child.stdout! : /\.(tar\.gz|tgz)$/.test(name) ? source!.pipe(createGunzip()) : source!
  const failed = new Promise<never>((_, reject) => { child?.once('error', reject); source?.once('error', reject) })
  const timer = setTimeout(() => { child?.kill(); source?.destroy() }, 5 * 60_000)
  try {
    await Promise.race([(async () => { for await (const chunk of stream) reader.push(chunk as Uint8Array) })(), failed])
  } catch (error) {
    if (error instanceof ArchiveError) throw new FileError('این آرشیو خراب است یا ساختاری دارد که باز نمی‌شود', 422)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && tool) throw new FileError(`ابزار ${tool} روی سرور نصب نیست`, 501)
    throw new FileError('این آرشیو خوانده نشد (خراب است یا ناقص)', 422)
  } finally { clearTimeout(timer); child?.kill(); source?.destroy() }
  return reader.entries
}

/** The entries of a zip archive, from the directory at its end. */
async function zipListing(file: string): Promise<ArchiveEntry[]> {
  const handle = await fs.open(file, 'r').catch(osError)
  try {
    const { size } = await handle.stat()
    const read = async (start: number) => { const buffer = Buffer.alloc(size - start); await handle.read(buffer, 0, buffer.length, start); return buffer }
    let start = Math.max(0, size - 256 * 1024)
    let listed = zipEntries(await read(start), start)
    if (!Array.isArray(listed)) {
      // The directory starts earlier than the piece that was read; it is bounded, a file is not read whole for it.
      if (size - listed.needFrom > 256 * 1024 * 1024) throw new ArchiveError('directory too large')
      start = listed.needFrom
      listed = zipEntries(await read(start), start)
      if (!Array.isArray(listed)) throw new ArchiveError('directory not found')
    }
    return listed
  } catch (error) {
    if (error instanceof FileError) throw error
    throw new FileError(error instanceof ArchiveError && /zip64|multi-part/.test(error.message) ? 'آرشیوهای zip64 یا چندبخشی در پنل باز نمی‌شوند' : 'این فایل zip خراب است یا ناقص', 422)
  } finally { await handle.close() }
}

const REFUSAL: Record<string, string> = {
  outside: 'یک ورودی آرشیو بیرون از پوشهٔ مقصد نوشته می‌شود',
  link: 'یک پیوند داخل آرشیو به بیرون از پوشهٔ مقصد اشاره می‌کند',
  'below-link': 'یک ورودی آرشیو زیر پیوندی از همان آرشیو قرار گرفته است',
  special: 'آرشیو فایل دستگاه، pipe یا socket دارد',
  entries: 'تعداد ورودی‌های آرشیو بیش از حد مجاز است',
  bytes: 'حجم آرشیو پس از باز شدن بیش از حد مجاز است',
  size: 'اندازهٔ یک ورودی آرشیو نامعتبر است',
}

/**
 * Unpacks an archive into a folder. Before anything is written the archive's own list is read and
 * checked (domain/archive.ts), and no entry may pass through a symbolic link that already stands in
 * the destination: unzip and tar would follow it and write wherever it points.
 */
export async function extract(input: unknown, destInput: unknown, root: string) {
  const file = resolveTarget(input, root)
  const dest = resolveTarget(destInput || parentOf(file), root)
  requireWrite(dest)
  await guard(file, root, 'read')
  await guard(dest, root, 'write')
  const name = path.basename(file).toLowerCase()
  const zip = name.endsWith('.zip')
  if (!zip && !TAR_NAME.test(name)) throw new FileError('فقط zip و tar (gz/xz/bz2) باز می‌شوند')
  const entries = zip ? await zipListing(file) : await tarListing(file, name)
  const refusal = archiveRefusal(entries, ARCHIVE_LIMITS)
  if (refusal) throw new FileError(`این آرشیو باز نمی‌شود: ${REFUSAL[refusal.reason]}${['entries', 'bytes'].includes(refusal.reason) ? '' : ` (${refusal.entry})`}`, 422)
  // What already stands in the destination: a link on the way of an entry, or in its place, is not written through.
  const seen = new Map<string, 'link' | 'dir' | 'file' | 'none'>()
  const kindOf = async (target: string) => {
    const known = seen.get(target)
    if (known) return known
    const info = await fs.lstat(target).catch(() => null)
    const kind = !info ? 'none' : info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'dir' : 'file'
    seen.set(target, kind)
    return kind
  }
  for (const entry of entries) {
    let at = dest
    for (const segment of entrySegments(entry.path) || []) {
      at = joinPath(at, segment)
      const kind = await kindOf(at)
      if (kind === 'link') throw new FileError(`این آرشیو باز نمی‌شود: در مقصد یک پیوند نمادین سر راه است (${at})`, 409)
      if (kind === 'none') break
    }
  }
  const result = zip
    ? await command('unzip', ['-o', '-q', file, '-d', dest], 10 * 60_000)
    : await command('tar', ['-xf', file, '-C', dest, '--no-same-owner'], 10 * 60_000)
  if (!result.ok) throw new FileError(zip && /ENOENT/i.test(result.out) ? 'ابزار unzip روی سرور نصب نیست (sudo apt install unzip)' : `باز کردن آرشیو انجام نشد: ${result.out.slice(0, 300)}`, 500)
  return { path: dest, entries: entries.length }
}

/** Name search below a folder (bounded depth, count and time). */
export async function findByName(dirInput: unknown, query: unknown, root: string) {
  const dir = resolveTarget(dirInput, root)
  await guard(dir, root, 'read')
  const q = String(query || '').trim()
  if (q.length < 2 || q.length > 80 || /[\0/]/.test(q)) throw new FileError('عبارت جست‌وجو دست‌کم ۲ حرف باشد')
  const pattern = `*${q.replace(/[*?[\]\\]/g, (char) => `\\${char}`)}*`
  const result = await command('find', [dir, '-xdev', '-maxdepth', '8', '(', '-path', '/proc', '-o', '-path', '/sys', '-o', '-path', '/dev', ')', '-prune', '-o', '-iname', pattern, '-print'], 12_000)
  const paths = result.out.split('\n').filter((line) => line.startsWith('/')).slice(0, 300)
  return { paths, truncated: paths.length >= 300 }
}

