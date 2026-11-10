import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { filesRoot } from '@/modules/downloads/server/files'
import { organizedDirectory } from '@/modules/downloads/server/organization'
import { organizationPath, organizedImageName, validOrganizationPath, type AssetOrganization, type ImageRole } from '@/modules/downloads/domain/organization'
import { encodeCoverImage } from '@/modules/site/server/cover-store'
import { ensureOrganizationFolders } from './organization'
import { registerLocalAsset } from './catalog'

/** Where a picture for this item belongs, or '' when the item is not known well enough (then the flat store is used). */
export const organizedImageDestination = (context: AssetOrganization | undefined) => {
  const destination = organizationPath(context, 'image')
  return validOrganizationPath(destination) ? destination : ''
}

/**
 * One picture saved under its item's folder with a readable name (shop/product/Virtual/telegram-premium/cover.webp),
 * listed in the matching Library folder. Names never overwrite: a second cover becomes cover-2.webp, so addresses
 * already used in content keep their bytes.
 */
export async function storeOrganizedImage(bytes: Buffer, destination: string, role: ImageRole, creator: number, options: { strict?: boolean; displayName?: string } = {}) {
  if (!validOrganizationPath(destination)) throw new Error('مسیر خودکار تصویر معتبر نیست')
  const { output, extension } = await encodeCoverImage(bytes, options)
  const dir = await organizedDirectory(filesRoot(), destination)
  let name = ''
  for (let n = 1; n <= 500 && !name; n++) {
    const candidate = organizedImageName(role, n, extension)
    try { await writeFile(path.join(dir, candidate), output, { flag: 'wx' }); name = candidate } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  if (!name) throw new Error('پوشهٔ این مورد بیش از حد تصویر دارد')
  const url = `/files/${[...destination.split('/'), name].map(encodeURIComponent).join('/')}`
  const asset = await db.$transaction(async (tx) => {
    const folderId = await ensureOrganizationFolders(tx, destination, creator)
    return registerLocalAsset(url, creator, folderId, options.displayName || name, tx)
  })
  return { url, asset }
}
