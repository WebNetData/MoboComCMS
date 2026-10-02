import { db } from '@/platform/database/prisma'
import { cleanLinks } from '@/modules/media/domain/media'
import { cleanRichText } from '@/shared/content/sanitize'
import { scheduleSoftwareRelease } from '@/modules/software/server/release-notifications'

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

export class SoftwareReleaseError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function softwareReleases(softwareId: number, page = 1, size: string | number = 20) {
  const software = await db.softwareTitle.findUnique({ where: { id: softwareId }, select: { id: true, title: true, slug: true, status: true } })
  if (!software) throw new SoftwareReleaseError('نرم‌افزار پیدا نشد', 404)
  const pageSize = size === 'all' ? null : [20, 50, 100, 500].includes(Number(size)) ? Number(size) : 20
  const total = await db.softwareRelease.count({ where: { softwareId } })
  const pages = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const currentPage = Math.min(pages, Math.max(1, Number.isSafeInteger(page) ? page : 1))
  const rows = await db.softwareRelease.findMany({ where: { softwareId }, orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }], ...(pageSize ? { skip: (currentPage - 1) * pageSize, take: pageSize } : {}) })
  const links = await db.mediaLink.findMany({ where: { ownerType: 'softwarerelease', ownerId: { in: rows.map((row) => row.id) } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  return { software, total, page: currentPage, pages, size: pageSize ?? 'all', releases: rows.map((row) => ({ ...row, releasedAt: row.releasedAt.toISOString().slice(0, 10), links: links.filter((link) => link.ownerId === row.id) })) }
}

async function reconcileLinks(tx: Tx, releaseId: number, input: unknown) {
  const links = cleanLinks(input, 20)
  const existing = await tx.mediaLink.findMany({ where: { ownerType: 'softwarerelease', ownerId: releaseId } })
  const unused = [...existing]
  for (const link of links) {
    const index = unused.findIndex((row) => row.url === link.url)
    if (index >= 0) await tx.mediaLink.update({ where: { id: unused.splice(index, 1)[0].id }, data: link })
    else await tx.mediaLink.create({ data: { ...link, ownerType: 'softwarerelease', ownerId: releaseId } })
  }
  if (unused.length) await tx.mediaLink.deleteMany({ where: { id: { in: unused.map((row) => row.id) } } })
}

export async function saveSoftwareRelease(softwareId: number, input: Record<string, unknown>) {
  const software = await db.softwareTitle.findUnique({ where: { id: softwareId }, select: { id: true } })
  if (!software) throw new SoftwareReleaseError('نرم‌افزار پیدا نشد', 404)
  const id = idOf(input.id)
  const version = text(input.version, 60)
  if (!version) throw new SoftwareReleaseError('شمارهٔ نسخه را وارد کنید')
  const channel = ['STABLE', 'BETA', 'NIGHTLY'].includes(String(input.channel)) ? String(input.channel) : 'STABLE'
  const status = input.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
  const day = text(input.releasedAt, 10)
  const releasedAt = new Date(`${day}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(releasedAt.getTime()) || releasedAt.toISOString().slice(0, 10) !== day) throw new SoftwareReleaseError('تاریخ نامعتبر است')
  const checksum = text(input.checksum, 128).toLowerCase()
  if (checksum && !/^[a-f0-9]{64}$/.test(checksum)) throw new SoftwareReleaseError('SHA-256 باید ۶۴ نویسهٔ هگزادسیمال باشد')
  const data = { version, channel, status, releasedAt, size: text(input.size, 40), checksum, changelog: cleanRichText(text(input.changelog, 20000)) }
  try { cleanLinks(input.links, 20) } catch (error) { throw new SoftwareReleaseError(error instanceof Error ? error.message : 'لینک نامعتبر است') }
  try {
    const row = await db.$transaction(async (tx) => {
      const before = id ? await tx.softwareRelease.findFirst({ where: { id, softwareId }, select: { id: true, status: true, releasedAt: true } }) : null
      if (id && !before) throw new SoftwareReleaseError('نسخه پیدا نشد', 404)
      const saved = id ? await tx.softwareRelease.update({ where: { id }, data }) : await tx.softwareRelease.create({ data: { ...data, softwareId } })
      if (input.links !== undefined) await reconcileLinks(tx, saved.id, input.links)
      await scheduleSoftwareRelease(tx, saved, before)
      return saved
    })
    return { id: row.id, created: !id }
  } catch (error) {
    if (/Unique constraint/i.test(String(error))) throw new SoftwareReleaseError('این نسخه در این کانال قبلاً ثبت شده است', 409)
    throw error
  }
}

export async function deleteSoftwareRelease(softwareId: number, releaseId: number) {
  const row = await db.softwareRelease.findFirst({ where: { id: releaseId, softwareId } })
  if (!row) throw new SoftwareReleaseError('نسخه پیدا نشد', 404)
  await db.$transaction([db.mediaLink.deleteMany({ where: { ownerType: 'softwarerelease', ownerId: releaseId } }), db.softwareRelease.delete({ where: { id: releaseId } })])
  return row
}
