import { deflateRawSync, inflateRawSync } from 'node:zlib'

// Minimal ZIP reader/writer for extension packages. It supports the two
// methods every archiver produces (stored and deflate), refuses encrypted,
// multi-disk and ZIP64 archives, and bounds the inflated size so a small
// upload cannot expand into a memory bomb.

export class ZipError extends Error {}

export interface ZipLimits { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

function findEndOfCentralDirectory(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= min; offset--) if (buffer.readUInt32LE(offset) === EOCD) return offset
  throw new ZipError('not a zip archive')
}

export function readZip(buffer: Buffer, limits: ZipLimits): Map<string, Buffer> {
  if (buffer.length < 22) throw new ZipError('not a zip archive')
  const end = findEndOfCentralDirectory(buffer)
  const count = buffer.readUInt16LE(end + 10)
  const size = buffer.readUInt32LE(end + 12)
  let offset = buffer.readUInt32LE(end + 16)
  if (buffer.readUInt16LE(end + 4) !== 0 || count === 0xffff || offset === 0xffffffff) throw new ZipError('multi-disk and ZIP64 archives are not supported')
  if (count > limits.maxEntries) throw new ZipError(`too many files (max ${limits.maxEntries})`)
  if (offset + size > buffer.length) throw new ZipError('corrupt central directory')
  const files = new Map<string, Buffer>()
  let total = 0
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL) throw new ZipError('corrupt central directory')
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressed = buffer.readUInt32LE(offset + 20)
    const uncompressed = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (flags & 0x1) throw new ZipError('encrypted archives are not supported')
    if (uncompressed > limits.maxEntryBytes) throw new ZipError(`${name} is too large`)
    total += uncompressed
    if (total > limits.maxTotalBytes) throw new ZipError('package is too large once extracted')
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) throw new ZipError('corrupt local header')
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
    const raw = buffer.subarray(dataStart, dataStart + compressed)
    if (raw.length !== compressed) throw new ZipError('truncated archive')
    let data: Buffer
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: Math.max(1, uncompressed) }) } catch { throw new ZipError(`${name} could not be decompressed`) }
    } else throw new ZipError(`${name} uses an unsupported compression method`)
    if (data.length !== uncompressed) throw new ZipError(`${name} has an invalid size`)
    if (files.has(name)) throw new ZipError(`duplicate file ${name}`)
    files.set(name, data)
  }
  return files
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Deflate every file into a standard archive (used for "export package"). */
export function writeZip(files: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, compressed)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(EOCD, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
