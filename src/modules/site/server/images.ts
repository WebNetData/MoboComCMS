import fs from 'node:fs/promises'
import path from 'node:path'

// Bulk optimisation of the site's stored images (storage/covers): large or
// oversized pictures are resized to 2400px and recompressed in their own
// format (so every stored address keeps working); a file is only replaced
// when the result is smaller.

const dir = () => path.join(process.cwd(), 'storage', 'covers')
const NAME = /^[0-9a-f-]{36}\.(webp|png|jpg)$/

export async function imageStats() {
  const names = (await fs.readdir(dir()).catch(() => [] as string[])).filter((name) => NAME.test(name))
  let bytes = 0, large = 0
  for (const name of names) {
    const info = await fs.stat(path.join(dir(), name)).catch(() => null)
    if (!info) continue
    bytes += info.size
    if (info.size > 300 * 1024) large++
  }
  const cache = await fs.readdir(path.join(dir(), '.cache')).catch(() => [] as string[])
  return { count: names.length, bytes, large, cached: cache.length }
}

export async function optimizeImages(input: { cursor?: unknown; limit?: unknown }) {
  const sharp = (await import('sharp')).default
  const names = (await fs.readdir(dir()).catch(() => [] as string[])).filter((name) => NAME.test(name)).sort()
  const start = Math.max(0, Number(input.cursor) || 0)
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 40))
  let saved = 0, changed = 0, checked = 0
  for (const name of names.slice(start, start + limit)) {
    checked++
    const file = path.join(dir(), name)
    const original = await fs.readFile(file).catch(() => null)
    if (!original || original.length < 120 * 1024) continue
    try {
      const image = sharp(original, { animated: name.endsWith('.webp') }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      const out = name.endsWith('.png') ? await image.png({ compressionLevel: 9, palette: true, quality: 85 }).toBuffer()
        : name.endsWith('.jpg') ? await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
          : await image.webp({ quality: 80 }).toBuffer()
      if (out.length < original.length * 0.95) {
        await fs.writeFile(file, out)
        saved += original.length - out.length
        changed++
      }
    } catch { /* unreadable image: leave it */ }
  }
  const next = start + checked
  return { checked, changed, saved, next: next < names.length ? next : null, total: names.length }
}

export async function clearImageCache() {
  await fs.rm(path.join(dir(), '.cache'), { recursive: true, force: true })
}
