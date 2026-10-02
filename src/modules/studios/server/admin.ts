import { db } from '@/platform/database/prisma'
import { validateCover } from '@/shared/content/cover'

export async function adminStudios(input: { q?: string; page?: number }) {
  const q = String(input.q || '').trim().slice(0, 80)
  const requested = Math.max(1, Math.min(100_000, Number(input.page) || 1))
  const where = q ? { name: { contains: q } } : {}
  const total = await db.studio.count({ where })
  const pages = Math.max(1, Math.ceil(total / 20))
  const page = Math.min(requested, pages)
  const studios = await db.studio.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20, select: { id: true, name: true, summary: true, logo: true, website: true } })
  return { studios, total, page, pages }
}

export async function updateStudio(id: number, input: Record<string, unknown>) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('شناسه نامعتبر است')
  const logo = validateCover(input.logo || '')
  const website = String(input.website || '').trim().slice(0, 2000)
  if (website) {
    let url: URL
    try { url = new URL(website) } catch { throw new Error('نشانی وب‌سایت معتبر نیست') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('وب‌سایت باید نشانی http یا https باشد')
  }
  return db.studio.update({ where: { id }, data: { logo, website, summary: String(input.summary || '').trim().slice(0, 3000) }, select: { id: true, name: true, summary: true, logo: true, website: true } })
}
