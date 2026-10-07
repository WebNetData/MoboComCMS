// What an archive may contain before the panel unpacks it. Pure: the server part reads the bytes,
// this part decides. An archive is somebody else's file; its entry names, link targets and sizes
// are input like any other.

export type ArchiveEntryType = 'file' | 'dir' | 'symlink' | 'hardlink' | 'special'
export interface ArchiveEntry { path: string; type: ArchiveEntryType; size: number; link?: string }
export interface ArchiveLimits { maxEntries: number; maxTotalBytes: number }

export const ARCHIVE_LIMITS: ArchiveLimits = { maxEntries: 200_000, maxTotalBytes: 50 * 1024 ** 3 }

export class ArchiveError extends Error {}

export type ArchiveRefusal = { reason: 'outside' | 'link' | 'below-link' | 'special' | 'entries' | 'bytes' | 'size'; entry: string }

/** The entry's path as segments below the folder it is unpacked into; null when it would leave that folder. */
export function entrySegments(raw: string): string[] | null {
  if (!raw || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null
  const parts: string[] = []
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') return null
    parts.push(segment)
  }
  return parts
}

/** Whether a link placed at `at` (segments, the link's own name last) with this target stays inside the folder. */
export function linkStaysInside(at: string[], target: string): boolean {
  if (!target || target.includes('\0') || target.includes('\\') || target.startsWith('/') || /^[A-Za-z]:/.test(target)) return false
  const parts = at.slice(0, -1)
  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') { if (!parts.length) return false; parts.pop(); continue }
    parts.push(segment)
  }
  return true
}

/**
 * The reason an archive is refused, or null when every entry may be unpacked. Refused: a path that
 * is absolute or climbs out; a link (symbolic or hard) whose target is absolute or climbs out; a
 * file placed below a link of the same archive; devices, pipes and sockets; too many entries; more
 * bytes than the limit once unpacked.
 */
export function archiveRefusal(entries: Iterable<ArchiveEntry>, limits: ArchiveLimits = ARCHIVE_LIMITS): ArchiveRefusal | null {
  let count = 0, total = 0
  const links = new Set<string>(), placed: string[][] = []
  for (const entry of entries) {
    count += 1
    if (count > limits.maxEntries) return { reason: 'entries', entry: String(limits.maxEntries) }
    const segments = entrySegments(entry.path)
    if (!segments) return { reason: 'outside', entry: shown(entry.path) }
    if (!segments.length) continue
    if (entry.type === 'special') return { reason: 'special', entry: shown(entry.path) }
    if (entry.type === 'symlink' || entry.type === 'hardlink') {
      // A hard link names another entry by its path from the top of the archive; a symbolic link by a path from where it sits.
      const inside = entry.type === 'hardlink' ? entrySegments(entry.link || '') !== null && (entry.link || '') !== '' : linkStaysInside(segments, entry.link || '')
      if (!inside) return { reason: 'link', entry: `${shown(entry.path)} -> ${shown(entry.link || '')}` }
      if (entry.type === 'symlink') links.add(segments.join('/'))
    } else {
      if (!Number.isFinite(entry.size) || entry.size < 0) return { reason: 'size', entry: shown(entry.path) }
      total += entry.size
      if (total > limits.maxTotalBytes) return { reason: 'bytes', entry: String(limits.maxTotalBytes) }
    }
    placed.push(segments)
  }
  // Nothing is written through a link the archive itself brings: the link may stay inside, what is put "below" it need not.
  if (links.size) for (const segments of placed) for (let depth = 1; depth < segments.length; depth += 1) if (links.has(segments.slice(0, depth).join('/'))) return { reason: 'below-link', entry: shown(segments.join('/')) }
  return null
}

const shown = (value: string) => value.replace(/[^\x20-\x7e]/g, '?').slice(0, 120)

// ------------------------------------------------------------------ tar

const text = (block: Uint8Array, from: number, length: number) => {
  let end = from
  while (end < from + length && block[end] !== 0) end += 1
  return Buffer.from(block.subarray(from, end)).toString('utf8')
}

/** A tar number field: octal text, or base-256 when the first bit is set. */
function tarNumber(block: Uint8Array, from: number, length: number): number {
  if (block[from] & 0x80) {
    let value = 0
    for (let index = from + 1; index < from + length; index += 1) value = value * 256 + block[index]
    return value
  }
  const digits = text(block, from, length).trim()
  if (!digits) return 0
  if (!/^[0-7]+$/.test(digits)) throw new ArchiveError('the tar archive has a damaged header')
  return parseInt(digits, 8)
}

function paxRecords(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {}
  let at = 0
  while (at < data.length) {
    let space = at
    while (space < data.length && data[space] !== 0x20) space += 1
    const length = Number(Buffer.from(data.subarray(at, space)).toString('latin1'))
    if (!Number.isInteger(length) || length <= space - at + 1 || at + length > data.length) break
    const record = Buffer.from(data.subarray(space + 1, at + length - 1)).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) out[record.slice(0, equals)] = record.slice(equals + 1)
    at += length
  }
  return out
}

/**
 * Reads the entries of an uncompressed tar stream, one header at a time, without keeping file
 * contents. Understands ustar prefixes, GNU long names and pax headers, because a name hidden in
 * one of those is the name tar will write.
 */
export class TarReader {
  private pending = Buffer.alloc(0)
  private skip = 0
  private collect: { kind: 'L' | 'K' | 'x' | 'g'; left: number; parts: Buffer[] } | null = null
  private longName = ''
  private longLink = ''
  private pax: Record<string, string> = {}
  private ended = false
  readonly entries: ArchiveEntry[] = []

  constructor(private limits: ArchiveLimits = ARCHIVE_LIMITS) {}

  push(chunk: Uint8Array) {
    if (this.ended) return
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : Buffer.from(chunk)
    for (;;) {
      if (this.skip) {
        const take = Math.min(this.skip, this.pending.length)
        if (this.collect) { this.collect.parts.push(this.pending.subarray(0, Math.min(take, this.collect.left))); this.collect.left -= Math.min(take, this.collect.left) }
        this.pending = this.pending.subarray(take)
        this.skip -= take
        if (this.skip) return
        if (this.collect) this.finishCollected()
      }
      if (this.pending.length < 512) return
      const block = this.pending.subarray(0, 512)
      this.pending = this.pending.subarray(512)
      if (block.every((byte) => byte === 0)) { this.ended = true; return }
      this.header(block)
    }
  }

  private finishCollected() {
    const collected = this.collect!
    this.collect = null
    const data = Buffer.concat(collected.parts)
    if (collected.kind === 'L') this.longName = text(data, 0, data.length)
    else if (collected.kind === 'K') this.longLink = text(data, 0, data.length)
    else if (collected.kind === 'x') this.pax = paxRecords(data)
  }

  private header(block: Uint8Array) {
    const size = tarNumber(block, 124, 12)
    const flag = String.fromCharCode(block[156] || 0x30)
    const padded = Math.ceil(size / 512) * 512
    if (flag === 'L' || flag === 'K' || flag === 'x' || flag === 'g') {
      if (size > 1024 * 1024) throw new ArchiveError('the tar archive has an oversized name header')
      this.collect = { kind: flag, left: size, parts: [] }
      this.skip = padded
      if (!padded) this.finishCollected()
      return
    }
    // Only the POSIX format keeps a path prefix there; old GNU archives use those bytes for times.
    const prefix = text(block, 257, 5) === 'ustar' && block[262] === 0 ? text(block, 345, 155) : ''
    const name = this.pax.path || this.longName || (prefix ? `${prefix}/${text(block, 0, 100)}` : text(block, 0, 100))
    const link = this.pax.linkpath || this.longLink || text(block, 157, 100)
    const realSize = this.pax.size !== undefined ? Number(this.pax.size) : size
    this.longName = ''; this.longLink = ''; this.pax = {}
    const type: ArchiveEntryType = flag === '0' || flag === '\0' || flag === '7' ? 'file' : flag === '5' ? 'dir' : flag === '2' ? 'symlink' : flag === '1' ? 'hardlink' : 'special'
    this.entries.push({ path: name, type: name.endsWith('/') && type === 'file' ? 'dir' : type, size: type === 'file' ? realSize : 0, link: type === 'symlink' || type === 'hardlink' ? link : undefined })
    if (this.entries.length > this.limits.maxEntries) throw new ArchiveError(`the archive holds more than ${this.limits.maxEntries} entries`)
    // Links and directories carry no data, whatever their size field says.
    this.skip = type === 'file' ? Math.ceil(realSize / 512) * 512 : flag === '1' || flag === '2' || flag === '5' ? 0 : padded
  }
}

// ------------------------------------------------------------------ zip

/**
 * The entries of a zip, from its central directory (the last part of the file; `tail` is the end of
 * the file and `tailOffset` where that piece starts). Zip64 archives are refused: they are not read
 * here, and what is not read is not unpacked.
 */
export function zipEntries(tail: Uint8Array, tailOffset: number, limits: ArchiveLimits = ARCHIVE_LIMITS): ArchiveEntry[] | { needFrom: number } {
  const view = Buffer.from(tail.buffer, tail.byteOffset, tail.byteLength)
  let eocd = -1
  for (let at = view.length - 22; at >= Math.max(0, view.length - 22 - 0xffff); at -= 1) if (view.readUInt32LE(at) === 0x06054b50 && at + 22 + view.readUInt16LE(at + 20) === view.length) { eocd = at; break }
  if (eocd < 0) throw new ArchiveError('the zip archive has no directory (it is damaged or cut short)')
  const count = view.readUInt16LE(eocd + 10), size = view.readUInt32LE(eocd + 12), offset = view.readUInt32LE(eocd + 16)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new ArchiveError('zip64 archives are not unpacked here; unpack it on the server')
  if (view.readUInt16LE(eocd + 4) !== 0 || view.readUInt16LE(eocd + 6) !== 0) throw new ArchiveError('multi-part zip archives are not unpacked')
  if (count > limits.maxEntries) throw new ArchiveError(`the archive holds more than ${limits.maxEntries} entries`)
  if (offset < tailOffset) return { needFrom: offset }
  const entries: ArchiveEntry[] = []
  let at = offset - tailOffset
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > eocd || view.readUInt32LE(at) !== 0x02014b50) throw new ArchiveError('the zip directory is damaged')
    const madeBy = view.readUInt16LE(at + 4) >> 8, uncompressed = view.readUInt32LE(at + 24)
    const nameLength = view.readUInt16LE(at + 28), extraLength = view.readUInt16LE(at + 30), commentLength = view.readUInt16LE(at + 32)
    const mode = view.readUInt32LE(at + 38) >>> 16
    if (at + 46 + nameLength > eocd) throw new ArchiveError('the zip directory is damaged')
    const path = view.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    if (uncompressed === 0xffffffff) throw new ArchiveError('zip64 archives are not unpacked here; unpack it on the server')
    // Unix file types travel in the high bits of the external attributes when the archive was made on Unix (host 3).
    const kind = madeBy === 3 ? mode & 0o170000 : 0
    const type: ArchiveEntryType = kind === 0o120000 ? 'symlink' : kind && kind !== 0o100000 && kind !== 0o040000 ? 'special' : path.endsWith('/') || kind === 0o040000 ? 'dir' : 'file'
    // A zip keeps a link's target in the entry's data, which is not read here: a link in a zip is refused as pointing nowhere known.
    entries.push({ path, type, size: type === 'file' ? uncompressed : 0, link: type === 'symlink' ? '' : undefined })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
