/**
 * Download center: storages (this server's download folder, SFTP servers and
 * FTP download hosts), a remote URL downloader and archive tools. Pure
 * functions only; paths inside a storage are POSIX paths relative to its root
 * ("/" = the root), never containing "..".
 */

export class DownloadError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export type StorageKind = 'local' | 'sftp' | 'ftp'
export type Storage = {
  id: string
  kind: StorageKind
  name: string
  /** Public address of the storage root (e.g. https://dl.mobocom.net); '' = no public links. */
  baseUrl: string
  host: string
  port: number
  username: string
  /** Encrypted at rest; never sent to the browser. */
  secret: string
  /** sftp: 'password' | 'key' */
  auth: 'password' | 'key'
  /** ftp: explicit TLS (FTPS). */
  secure: boolean
  /** Folder on the remote server that is the storage root. */
  root: string
}

export const KIND_LABEL: Record<StorageKind, string> = { local: 'همین سرور', sftp: 'سرور دانلود (SFTP)', ftp: 'هاست دانلود (FTP)' }
export const LOCAL_ID = 'local'

const HOST = /^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}|(\d{1,3}\.){3}\d{1,3})$/i

export function normalizeBaseUrl(input: unknown): string {
  const raw = String(input ?? '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (url.username || url.password || url.search || url.hash) return ''
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  } catch { return '' }
}

/** Validates a storage from the admin form. The secret is handled by the caller (kept when empty). */
export function validateStorage(input: Record<string, unknown>, existingIds: string[] = []): Omit<Storage, 'secret'> {
  const kind: StorageKind = input.kind === 'ftp' ? 'ftp' : input.kind === 'sftp' ? 'sftp' : 'local'
  if (kind === 'local') throw new DownloadError('پوشهٔ دانلود همین سرور از قبل وجود دارد')
  const name = String(input.name ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 60)
  if (!name) throw new DownloadError('نامی برای این فضا بنویسید')
  const host = String(input.host ?? '').trim().toLowerCase()
  if (!HOST.test(host)) throw new DownloadError('نشانی سرور (Host) معتبر نیست')
  const port = Math.round(Number(input.port)) || (kind === 'sftp' ? 22 : 21)
  if (port < 1 || port > 65535) throw new DownloadError('پورت معتبر نیست')
  const username = String(input.username ?? '').trim()
  if (!username || username.length > 100 || /[\s\u0000]/.test(username)) throw new DownloadError('نام کاربری معتبر نیست')
  const root = normalizeRelPath(input.root || '/')
  if (root === null) throw new DownloadError('پوشهٔ ریشه معتبر نیست')
  const rawBase = String(input.baseUrl ?? '').trim()
  const baseUrl = normalizeBaseUrl(rawBase)
  if (rawBase && !baseUrl) throw new DownloadError('نشانی عمومی فایل‌ها معتبر نیست (مثل https://dl.example.com)')
  let id = String(input.id ?? '').trim()
  if (!id || !existingIds.includes(id)) id = `${kind}-${host.replace(/[^a-z0-9]/g, '').slice(0, 20)}-${Math.random().toString(36).slice(2, 7)}`
  return { id, kind, name, baseUrl, host, port, username, auth: kind === 'sftp' && input.auth === 'key' ? 'key' : 'password', secure: kind === 'ftp' && input.secure === true, root }
}

/** Storage-relative path: leading "/", no "..", ".", empty or control segments. null when invalid. */
export function normalizeRelPath(input: unknown): string | null {
  const raw = String(input ?? '').replace(/\\/g, '/').trim()
  if (raw.length > 1024 || /[\u0000-\u001f]/.test(raw)) return null
  const parts = raw.split('/').filter((part) => part && part !== '.')
  if (parts.some((part) => part === '..' || part.length > 255)) return null
  return `/${parts.join('/')}`
}

export const joinRel = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)
export const parentRel = (target: string) => (target === '/' ? '/' : target.slice(0, target.lastIndexOf('/')) || '/')
export const baseName = (target: string) => target.slice(target.lastIndexOf('/') + 1)

/** A file or folder name (no slashes, no leading dot-dot, printable). null when invalid. */
export function cleanName(input: unknown): string | null {
  const name = String(input ?? '').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 200)
  if (!name || name === '.' || name === '..') return null
  return name
}

/** Public link of a stored file. */
export function publicUrl(baseUrl: string, relPath: string): string {
  if (!baseUrl) return ''
  return `${baseUrl}${relPath.split('/').map((part) => encodeURIComponent(part)).join('/')}`
}

/** "movie.mkv" → "movie (2).mkv" for the n-th duplicate. */
export function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  const multi = /\.(tar\.(gz|xz|bz2))$/i.exec(name)
  const cut = multi ? name.length - multi[0].length : dot > 0 ? dot : name.length
  return `${name.slice(0, cut)} (${n})${name.slice(cut)}`
}

// ------------------------------------------------------------------ remote URL downloader

export type FetchRequest = { url: string; name: string }

/** Download addresses: http(s) only; credentials in the URL are allowed (sent as Basic auth). */
export function validateFetchUrl(input: unknown): URL {
  const raw = String(input ?? '').trim()
  let url: URL
  try { url = new URL(raw) } catch { throw new DownloadError(`نشانی «${raw.slice(0, 80)}» معتبر نیست`) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new DownloadError('فقط نشانی‌های http و https دانلود می‌شوند')
  if (raw.length > 4000) throw new DownloadError('نشانی بیش از حد طولانی است')
  return url
}

/** Loopback, private, link-local (cloud metadata), CGNAT and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, '')
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v6 = ip.toLowerCase()
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

/** File name from Content-Disposition (RFC 6266, incl. filename*=UTF-8''…). */
export function nameFromDisposition(header: string | null): string {
  if (!header) return ''
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (star) { try { return decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')) } catch { /* fall through */ } }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
  return plain ? (plain[2] ?? plain[1]).trim() : ''
}

export function nameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop() || ''
  try { return decodeURIComponent(last) } catch { return last }
}

/** The name a download is saved under: the admin's choice, the server's, the URL's, or "download". */
export function downloadName(chosen: unknown, disposition: string | null, url: URL): string {
  return cleanName(chosen) || cleanName(nameFromDisposition(disposition)) || cleanName(nameFromUrl(url)) || 'download'
}

/** Splits the downloader textarea: one URL per line, optionally "URL | name". */
export function parseFetchList(input: unknown): FetchRequest[] {
  return String(input ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 50).map((line) => {
    const [url, name = ''] = line.split(/\s+\|\s+/)
    validateFetchUrl(url)
    return { url: url.trim(), name: name.trim() }
  })
}

// ------------------------------------------------------------------ archives

export type ArchiveFormat = 'zip' | '7z' | 'rar' | 'tar'
export type ArchiveEntry = { path: string; size: number; packed: number | null; dir: boolean; encrypted: boolean; modified: string }

export function archiveFormat(name: string): ArchiveFormat | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.7z')) return '7z'
  if (/\.(rar|r\d\d)$/.test(lower) || /\.part\d+\.rar$/.test(lower)) return 'rar'
  if (/\.(tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2)$/.test(lower)) return 'tar'
  return null
}

export const FORMAT_EXT: Record<Exclude<ArchiveFormat, 'tar'>, string> = { zip: '.zip', '7z': '.7z', rar: '.rar' }

/** Replaces the archive extension: "a.rar" → "a.zip". */
export function withFormat(name: string, format: Exclude<ArchiveFormat, 'tar'>): string {
  const base = name.replace(/\.part\d+\.rar$/i, '').replace(/\.(zip|7z|rar|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2)$/i, '')
  return `${base}${FORMAT_EXT[format]}`
}

/** Archive passwords go to 7z/rar as arguments: printable, no quotes or control characters. */
export function validArchivePassword(input: unknown, required: boolean): string {
  const value = String(input ?? '')
  if (!value) { if (required) throw new DownloadError('رمز جدید را وارد کنید'); return '' }
  if (value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) throw new DownloadError('رمز شامل نویسه‌های نامعتبر است')
  return value
}

/** Parses `7z l -slt` (technical listing). */
export function parse7zList(output: string): ArchiveEntry[] {
  const body = output.split(/\n----------\n/)[1] || ''
  return body.split(/\n\s*\n/).map((block) => {
    const field = (key: string) => new RegExp(`^${key} = (.*)$`, 'm').exec(block)?.[1]?.trim() ?? ''
    const path = field('Path')
    if (!path) return null
    const packed = field('Packed Size')
    return {
      path, size: Number(field('Size')) || 0, packed: packed === '' ? null : Number(packed) || 0,
      dir: field('Folder') === '+' || /^D/.test(field('Attributes')),
      encrypted: field('Encrypted') === '+', modified: field('Modified').slice(0, 19),
    }
  }).filter((entry): entry is ArchiveEntry => !!entry)
}

/** Parses `unrar lt` (technical listing). */
export function parseUnrarList(output: string): ArchiveEntry[] {
  return output.split(/\n\s*\n/).map((block) => {
    const field = (key: string) => new RegExp(`^\\s*${key}: (.*)$`, 'm').exec(block)?.[1]?.trim() ?? ''
    const path = field('Name')
    if (!path) return null
    const packed = field('Packed size')
    return {
      path, size: Number(field('Size')) || 0, packed: packed === '' ? null : Number(packed) || 0,
      dir: field('Type') === 'Directory', encrypted: /encrypted/.test(field('Flags')), modified: field('mtime').slice(0, 19).replace(',', '.'),
    }
  }).filter((entry): entry is ArchiveEntry => !!entry)
}

/** Wrong or missing password in 7z / unrar output. */
export const wrongPassword = (output: string) => /Wrong password|Incorrect password|Cannot open encrypted archive|Enter password|password is incorrect|Data Error in encrypted file/i.test(output)

// ------------------------------------------------------------------ jobs

export type JobKind = 'fetch' | 'transfer' | 'extract' | 'repack' | 'pack'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export const JOB_LABEL: Record<JobKind, string> = { fetch: 'دانلود از نشانی', transfer: 'انتقال بین فضاها', extract: 'باز کردن آرشیو', repack: 'تغییر رمز آرشیو', pack: 'ساخت آرشیو' }

/** Bytes per second → remaining seconds (null when unknown). */
export function eta(total: number | null, received: number, speed: number): number | null {
  if (!total || !speed || received >= total) return null
  return Math.ceil((total - received) / speed)
}
