import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isImageName } from '@/modules/server-panel/domain/policy'

// Gallery: every image the site stored under storage/, grouped by collection.
// Public collections carry their site URL; private ones (payment receipts,
// ticket attachments) are only viewable through the panel.

export const COLLECTIONS = [
  { id: 'covers', label: 'تصاویر محتوا و کاورها', url: '/api/media/covers/', public: true },
  { id: 'forum', label: 'تصاویر تالار گفتمان', url: '/api/forum/media/', public: true },
  { id: 'profile', label: 'تصاویر پروفایل کاربران', url: '/api/profile/media/', public: true },
  { id: 'receipts', label: 'رسیدهای پرداخت (خصوصی)', url: '', public: false },
  { id: 'tickets', label: 'پیوست تیکت‌ها (خصوصی)', url: '', public: false },
] as const

export class GalleryError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const storageRoot = () => path.join(process.cwd(), 'storage')
const collection = (id: unknown) => COLLECTIONS.find((item) => item.id === id)

export async function galleryList(input: { collection?: unknown; q?: unknown; page?: unknown; sort?: unknown }) {
  const selected = collection(input.collection)
  const q = typeof input.q === 'string' ? input.q.trim().toLowerCase().slice(0, 80) : ''
  const counts: Record<string, { count: number; bytes: number }> = {}
  const items: { collection: string; name: string; path: string; size: number; mtime: string; url: string; public: boolean }[] = []
  for (const item of COLLECTIONS) {
    const dir = path.join(storageRoot(), item.id)
    const names = await fs.readdir(dir).catch(() => [] as string[])
    let count = 0, bytes = 0
    for (const name of names) {
      if (!isImageName(name)) continue
      const stat = await fs.stat(path.join(dir, name)).catch(() => null)
      if (!stat?.isFile()) continue
      count++; bytes += stat.size
      if ((selected && selected.id !== item.id) || (q && !name.toLowerCase().includes(q))) continue
      items.push({ collection: item.id, name, path: path.join(dir, name), size: stat.size, mtime: stat.mtime.toISOString(), url: item.url ? `${item.url}${name}` : '', public: item.public })
    }
    counts[item.id] = { count, bytes }
  }
  const sort = String(input.sort || 'new')
  items.sort((a, b) => sort === 'big' ? b.size - a.size : sort === 'name' ? a.name.localeCompare(b.name) : b.mtime.localeCompare(a.mtime))
  const size = 60
  const page = Math.max(1, Math.floor(Number(input.page) || 1))
  return {
    collections: COLLECTIONS.map((item) => ({ ...item, ...(counts[item.id] || { count: 0, bytes: 0 }) })),
    items: items.slice((page - 1) * size, page * size),
    total: items.length, page, pages: Math.max(1, Math.ceil(items.length / size)),
  }
}

function sniff(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a') return 'gif'
  if (bytes.toString('ascii', 4, 12) === 'ftypavif') return 'avif'
  return null
}

/** New images go to the public covers collection with a random name (like the editor uploads). */
export async function galleryUpload(files: { name: string; data: Buffer }[]) {
  const dir = path.join(storageRoot(), 'covers')
  await fs.mkdir(dir, { recursive: true })
  const saved: { name: string; url: string }[] = []
  for (const file of files) {
    if (file.data.byteLength > 15 * 1024 * 1024) throw new GalleryError(`«${file.name}» بیش از ۱۵ مگابایت است`, 413)
    const ext = sniff(file.data)
    if (!ext) throw new GalleryError(`«${file.name}» تصویر معتبر (PNG، JPEG، WebP، GIF، AVIF) نیست`)
    const name = `${randomUUID()}.${ext}`
    await fs.writeFile(path.join(dir, name), file.data, { flag: 'wx' })
    saved.push({ name, url: `/api/media/covers/${name}` })
  }
  return saved
}

export async function galleryDelete(entries: unknown) {
  const list = Array.isArray(entries) ? entries.slice(0, 200) : []
  let removed = 0
  for (const raw of list) {
    const entry = (raw || {}) as { collection?: unknown; name?: unknown }
    const item = collection(entry.collection)
    const name = String(entry.name || '')
    if (!item || !isImageName(name) || name !== path.basename(name) || name.startsWith('.')) throw new GalleryError('تصویر نامعتبر است')
    await fs.rm(path.join(storageRoot(), item.id, name), { force: true })
    removed++
  }
  return { removed }
}
