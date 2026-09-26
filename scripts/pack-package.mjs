// Zip a package folder for upload: npm run package:zip -- docs/packages/examples/promo-banner
import fs from 'node:fs'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'

const dir = path.resolve(process.argv[2] || '')
if (!process.argv[2] || !fs.existsSync(path.join(dir, 'manifest.json'))) {
  console.error('Usage: npm run package:zip -- <folder containing manifest.json> [out.zip]')
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
const out = path.resolve(process.argv[3] || `${manifest.id}-${manifest.version}.zip`)

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (data) => { let crc = 0xffffffff; for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.name.startsWith('.') ? [] : entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)])

const locals = [], centrals = []
let offset = 0
const files = walk(dir).sort()
for (const file of files) {
  const name = Buffer.from(path.relative(dir, file).split(path.sep).join('/'))
  const data = fs.readFileSync(file)
  const packed = deflateRawSync(data)
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
  locals.push(local, name, packed); centrals.push(central, name)
  offset += 30 + name.length + packed.length
}
const directory = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
fs.writeFileSync(out, Buffer.concat([...locals, directory, end]))
console.log(`Packed ${files.length} file(s) → ${path.relative(process.cwd(), out)}`)
