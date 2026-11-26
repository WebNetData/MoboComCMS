import { lstat, realpath, unlink } from 'node:fs/promises'
import { join, parse, resolve, sep } from 'node:path'
import { db } from '@/platform/database/prisma'
import { privateImageName, privateImageDirectory } from '@/shared/files/private-images'
import { IMAGE_WIDTHS } from '@/shared/media/image'
import { ticketFileDirectory } from '@/modules/support/server/ticket-attachments'
import { receiptDirectory } from '@/modules/billing/server/card-transfer'
import { formsDirectory } from '@/modules/forms/server/service'

type Manifest = { profile: string[]; tickets: string[]; receipts: string[]; forms?: string[]; proofs?: string[]; deliveries?: string[]; returns?: string[] }
const uuidImage = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/
const formFile = /^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/

function parseManifest(value: string): Manifest {
  const data: unknown = JSON.parse(value)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid erasure file manifest')
  const row = data as Record<string, unknown>
  if (Object.keys(row).some(key => !['profile', 'receipts', 'tickets', 'forms','proofs','deliveries','returns'].includes(key))) throw new Error('Invalid erasure file manifest')
  for (const key of ['profile', 'tickets', 'receipts', 'forms','proofs','deliveries','returns'] as const) {
    const files = row[key]
    if (['forms','proofs','deliveries','returns'].includes(key) && files === undefined) continue
    if (!Array.isArray(files) || files.length > 10000 || !files.every(file => typeof file === 'string' && (key === 'profile' ? uuidImage.test(file) : key === 'forms' ? formFile.test(file) : key === 'deliveries' ? /^[a-f0-9]{48}$/.test(file) : privateImageName(file)))) throw new Error('Invalid erasure file manifest')
  }
  return row as Manifest
}

const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b

// Reject symlinks in every existing path component, including the leaf.
async function removeFile(directory: string, name: string) {
  const dir = resolve(directory), target = resolve(dir, name)
  if (target !== join(dir, name) || !target.startsWith(dir + sep)) throw new Error('Invalid erasure file path')
  const root = parse(target).root
  let current = root
  try {
    for (const part of target.slice(root.length).split(sep)) {
      current = join(current, part)
      const stat = await lstat(current)
      if (stat.isSymbolicLink()) throw new Error('Symlink in erasure file path')
      if (current !== target && !stat.isDirectory()) throw new Error('Invalid erasure directory')
      if (current === target && !stat.isFile()) throw new Error('Invalid erasure file')
    }
    if (!samePath(await realpath(dir), dir) || !samePath(await realpath(target), target)) throw new Error('Erasure path resolved outside its directory')
    await unlink(target)
  } catch (error) { if (!missing(error)) throw error }
}

export async function runAccountErasureFiles(payload: { userId?: unknown }) {
  const id = payload.userId
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid erasure user id')
  const user = await db.user.findUnique({ where: { id }, select: { erasedAt: true } })
  if (!user?.erasedAt) throw new Error('Account erasure is not committed')
  const key = `identity.erasure.files.${id}`
  const setting = await db.setting.findUnique({ where: { key } })
  if (!setting) return { done: true }
  const manifest = parseManifest(setting.value)
  for (const name of new Set(manifest.profile)) {
    const url = `/api/profile/media/${name}`
    const values = [name, url]
    const [profile, forum, userReference] = await Promise.all([
      db.userProfile.findFirst({ where: { userId: { not: id }, user: { erasedAt: null }, OR: [{ avatar: { in: values } }, { cover: { in: values } }] }, select: { userId: true } }),
      db.forumProfile.findFirst({ where: { userId: { not: id }, user: { erasedAt: null }, OR: [{ avatar: { in: values } }, { cover: { in: values } }] }, select: { userId: true } }),
      db.user.findFirst({ where: { id: { not: id }, erasedAt: null, telegramPhoto: { in: values } }, select: { id: true } }),
    ])
    if (profile || forum || userReference) continue
    const dir = join(process.cwd(), 'storage', 'profile')
    await removeFile(dir, name)
    for (const width of IMAGE_WIDTHS) await removeFile(join(dir, '.cache'), `${name.replace(/\.[^.]+$/, '')}-${width}.webp`)
  }
  for (const name of new Set(manifest.tickets)) {
    if (await db.ticketAttachment.findFirst({ where: { filename: name }, select: { id: true } })) continue
    await removeFile(ticketFileDirectory(), name)
  }
  for (const name of new Set(manifest.receipts)) {
    if (await db.paymentReceipt.findFirst({ where: { image: name }, select: { id: true } })) continue
    await removeFile(receiptDirectory(), name)
  }
  for (const name of new Set(manifest.forms || [])) {
    if (await db.formUpload.findUnique({ where: { id: name }, select: { id: true } })) continue
    await removeFile(formsDirectory(), name)
  }
  for (const name of new Set(manifest.proofs || [])) {
    if (await db.businessPurchaseProof.findUnique({where:{filename:name},select:{id:true}})) continue
    await removeFile(privateImageDirectory('business-proofs'),name)
  }
  for (const name of new Set(manifest.deliveries || [])) {
    if (await db.orderDeliveryFile.findUnique({where:{storageKey:name},select:{id:true}}) || await db.productFile.findFirst({where:{storageKey:name},select:{id:true}})) continue
    await removeFile(join(process.cwd(),'storage','private-media'),name)
  }
  for (const name of new Set(manifest.returns || [])) {
    // JSON may include a shared historical attachment. Keep it if referenced.
    if (await db.returnRequest.findFirst({where:{photos:{contains:name}},select:{id:true}})) continue
    await removeFile(join(process.cwd(),'storage','returns'),name)
  }
  const removed = await db.setting.deleteMany({ where: { key, value: setting.value } })
  if (!removed.count) throw new Error('Erasure file manifest changed during cleanup')
  return { done: true }
}
