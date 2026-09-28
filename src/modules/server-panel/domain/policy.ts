// Server panel policy: pure rules shared by the gate, the file manager and the
// database console. No I/O here so every rule is unit-testable.

/** Kernel/virtual filesystems: never listed, read or written. */
const VIRTUAL_ROOTS = ['/proc', '/sys', '/dev', '/run/udev']

/** System locations that stay browsable/readable but are never modified from the panel. */
const READ_ONLY_ROOTS = ['/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32', '/usr/bin', '/usr/sbin', '/usr/lib', '/boot', '/snap']

/** Roots that must never be deleted or renamed themselves (their contents may be edited when writable). */
const ANCHORS = ['/', '/etc', '/home', '/opt', '/root', '/srv', '/tmp', '/usr', '/var', '/var/lib', '/var/log', '/var/mail', '/var/www', '/mnt', '/media']

const under = (target: string, root: string) => target === root || target.startsWith(root === '/' ? '/' : `${root}/`)

/**
 * Normalises a user-supplied absolute path: POSIX only, no NUL, no relative
 * segments left after resolution. Returns null when the input is unusable.
 */
export function normalizePath(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > 4096 || raw.includes('\0') || !raw.startsWith('/')) return null
  const parts: string[] = []
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') { parts.pop(); continue }
    parts.push(segment)
  }
  return `/${parts.join('/')}`
}

/** A single file/folder name for mkdir, rename and uploads. */
export function safeName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const name = input.trim()
  if (!name || name.length > 255 || name === '.' || name === '..' || /[/\0]/.test(name)) return null
  return name
}

export const joinPath = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)
export const parentOf = (target: string) => (target === '/' ? '/' : target.slice(0, target.lastIndexOf('/')) || '/')

export function isVirtualPath(target: string): boolean {
  return VIRTUAL_ROOTS.some((root) => under(target, root))
}

export type PathAccess = 'none' | 'read' | 'write'

/** What the panel allows on a path (the OS permissions of the app user still apply on top). */
export function pathAccess(target: string): PathAccess {
  if (isVirtualPath(target)) return 'none'
  if (READ_ONLY_ROOTS.some((root) => under(target, root))) return 'read'
  return 'write'
}

/** Whether the path itself may be deleted, renamed or overwritten by a move. */
export function canRemove(target: string, protectedExtra: readonly string[] = []): boolean {
  if (pathAccess(target) !== 'write') return false
  return ![...ANCHORS, ...protectedExtra].includes(target)
}

// ---------------------------------------------------------------- IP allowlist

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

/** Strips IPv4-mapped IPv6 and zone ids so "::ffff:1.2.3.4" matches "1.2.3.4". */
export function canonicalIp(ip: string): string {
  const value = ip.trim().toLowerCase().replace(/%.*$/, '')
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? mapped[1] : value
}

/** Entries: exact IPv4/IPv6 addresses or IPv4 CIDR blocks. Invalid entries are ignored. */
export function parseAllowlist(raw: string | undefined): string[] {
  return String(raw || '').split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean).filter((entry) => {
    const [base, bits] = entry.split('/')
    if (bits !== undefined) return ipv4ToInt(base) !== null && /^\d{1,2}$/.test(bits) && Number(bits) <= 32
    return ipv4ToInt(base) !== null || /^[0-9a-f:]+$/i.test(base)
  })
}

/** An empty list means "no IP restriction" (the panel shows a warning for that). */
export function ipAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (!allowlist.length) return true
  const address = canonicalIp(ip)
  const asInt = ipv4ToInt(address)
  return allowlist.some((entry) => {
    const [base, bits] = entry.split('/')
    if (bits === undefined) return canonicalIp(base) === address
    const network = ipv4ToInt(base)
    if (asInt === null || network === null) return false
    const size = Number(bits)
    if (size === 0) return true
    const mask = size === 32 ? 0xffffffff : (0xffffffff << (32 - size)) >>> 0
    return ((asInt & mask) >>> 0) === ((network & mask) >>> 0)
  })
}

// ---------------------------------------------------------------- read-only SQL

/**
 * The console runs one statement that only reads. Comments and string literals
 * are stripped before the keyword scan so "select 'drop'" is fine and
 * "select 1; drop table x" is not. The query also runs inside a read-only
 * transaction on PostgreSQL, so this is the first of two guards.
 */
export function readOnlySql(input: unknown): { ok: true; sql: string } | { ok: false; error: string } {
  if (typeof input !== 'string') return { ok: false, error: 'کوئری خالی است' }
  const sql = input.trim().replace(/;\s*$/, '')
  if (!sql) return { ok: false, error: 'کوئری خالی است' }
  if (sql.length > 10_000) return { ok: false, error: 'کوئری بیش از حد طولانی است' }
  const stripped = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
  if (stripped.includes(';')) return { ok: false, error: 'فقط یک دستور در هر اجرا مجاز است' }
  const lead = stripped.trim().split(/\s+/)[0]?.toLowerCase()
  if (!['select', 'with', 'explain', 'values', 'pragma', 'show'].includes(lead || '')) return { ok: false, error: 'فقط دستورهای خواندنی (SELECT، WITH، EXPLAIN) مجازند' }
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|merge|attach|detach|vacuum|reindex|copy|call|do|lock|set|reset|load|security|comment|cluster|refresh|listen|notify|execute|prepare)\b/i
  const functions = /\b(set_config|pg_sleep\w*|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|lo_import|lo_export|lo_unlink|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|dblink\w*|nextval|setval|load_extension|readfile|writefile|fts3_tokenizer)\s*\(/i
  if (forbidden.test(stripped) || /\binto\b/i.test(stripped) || functions.test(stripped)) return { ok: false, error: 'این کوئری دستور تغییردهنده یا تابع ناامن دارد و اجرا نمی‌شود' }
  if (lead === 'pragma' && /=/.test(stripped)) return { ok: false, error: 'PRAGMA فقط برای خواندن مجاز است' }
  return { ok: true, sql }
}

/** Safe SQL identifier (table names come from the catalog, but they are checked anyway). */
export const safeIdent = (name: string) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)

// ---------------------------------------------------------------- TOTP (RFC 6238)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  const out: number[] = []
  let bits = 0, value = 0
  for (const char of clean) {
    const index = B32.indexOf(char)
    if (index < 0) throw new Error('invalid base32')
    value = (value << 5) | index; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Uint8Array.from(out)
}

/** HOTP truncation given an HMAC-SHA1 digest (the caller computes the HMAC). */
export function hotpFromDigest(digest: Uint8Array, digits = 6): string {
  const offset = digest[digest.length - 1] & 0x0f
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(code % 10 ** digits).padStart(digits, '0')
}

/** 8-byte big-endian counter for a time step. */
export function totpCounter(now: number, step = 30): Uint8Array {
  let counter = Math.floor(now / 1000 / step)
  const buffer = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) { buffer[i] = counter & 0xff; counter = Math.floor(counter / 256) }
  return buffer
}

export const totpUri = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`

// ---------------------------------------------------------------- misc

const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|tgz|xz|bz2|zst|7z|rar|mp[34]|m4a|flac|ogg|wav|mkv|mov|avi|webm|woff2?|ttf|otf|eot|exe|dll|so|o|a|bin|iso|img|db|sqlite3?|pyc|class|jar)$/i

/** Heuristic for the editor: not a known binary type and a NUL-free, printable sample. */
export function looksText(name: string, sample: Uint8Array): boolean {
  if (BINARY_EXT.test(name) || sample.includes(0)) return false
  let control = 0
  for (const byte of sample) if (byte < 9 || (byte > 13 && byte < 32 && byte !== 27)) control++
  return control <= sample.length * 0.02
}

export const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(name)

/** "rwxr-xr-x" from a numeric mode. */
export function modeString(mode: number): string {
  const flags = ['r', 'w', 'x']
  let out = ''
  for (let shift = 6; shift >= 0; shift -= 3) for (let bit = 0; bit < 3; bit++) out += (mode >> (shift + 2 - bit)) & 1 ? flags[bit] : '-'
  return out
}

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
