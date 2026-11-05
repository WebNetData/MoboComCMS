import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { filesRoot, fetchRemoteBytes } from '@/modules/downloads/server/files'
import { localDescriptor, assetUrl } from './catalog'

/** Only a content owner's public image address. Never reads private uploads or fetches the site's APIs. */
export async function publicImageBytes(raw: string, base: string): Promise<Uint8Array> {
  let url = raw.trim()
  if (/^(https?:)?\/\//i.test(url)) {
    const absolute = new URL(url, base)
    if (absolute.origin === new URL(base).origin) url = absolute.pathname
    else return fetchRemoteBytes(absolute.toString(), 15 * 1024 ** 2)
  }
  const transfer = /^\/api\/media\/transfers\/([a-f0-9-]{36})(?:\?.*)?$/i.exec(url)
  if (transfer) {
    const row = await db.mediaTransfer.findUnique({ where: { id: transfer[1] }, include: { asset: true } })
    if (row?.status !== 'READY' || !row.asset || row.asset.archivedAt) throw new Error('انتقال تصویر هنوز کامل نشده است')
    url = assetUrl(row.asset)
  }
  const desc = localDescriptor(url.split('?')[0])
  const root = await fs.realpath(desc.storage === 'covers' ? path.join(process.cwd(), 'storage', 'covers') : filesRoot())
  const file = await fs.realpath(path.join(root, desc.key))
  if (!file.startsWith(root + path.sep)) throw new Error('نشانی تصویر عمومی معتبر نیست')
  const handle = await fs.open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 15 * 1024 ** 2) throw new Error('حجم تصویر بیش از حد است')
    // Read a fixed bound even if another process grows the file after stat().
    const bytes = Buffer.alloc(stat.size)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    return bytes.subarray(0, bytesRead)
  } finally { await handle.close() }
}
