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

/**
 * Studios whose name holds the typed text, for the developer and publisher fields of a game or software form: the
 * name as its profile writes it, the logo, and how many titles it already made or published (to tell twins apart).
 */
export async function suggestStudios(q: unknown) {
  const query = String(q ?? '').trim().replace(/\s+/g, ' ').slice(0, 80).toLowerCase()
  if (query.length < 2) return { studios: [] }
  const rows = await db.studio.findMany({
    where: { normalizedName: { contains: query } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 30,
    select: { id: true, name: true, normalizedName: true, logo: true, _count: { select: { gamesDeveloped: true, gamesPublished: true, softwareDeveloped: true, softwarePublished: true } } },
  })
  // The exact name first, then names that start with it, then the rest.
  const rank = (name: string) => (name === query ? 0 : name.startsWith(query) ? 1 : 2)
  return {
    studios: rows.sort((a, b) => rank(a.normalizedName) - rank(b.normalizedName)).slice(0, 8).map((row) => ({
      id: row.id, name: row.name, logo: row.logo,
      games: row._count.gamesDeveloped + row._count.gamesPublished, software: row._count.softwareDeveloped + row._count.softwarePublished,
    })),
  }
}
