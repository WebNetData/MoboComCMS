import { db } from '@/platform/database/prisma'
import { richTextToPlain } from '@/shared/content/sanitize'
import { minorToDecimal } from '@/shared/money'
import type { PageTarget } from '../../domain/page-assistant'
import { AiError } from '../error'

/** Closed projection: no credentials, arbitrary JSON settings, customer contacts or private delivery payloads. */
export async function pageAssistantRecord(target: PageTarget | null, authorId: number | null) {
  if (!target) return null
  const where = { id: target.id, ...(authorId === null ? {} : { createdById: authorId }) }
  const text = (value: string) => richTextToPlain(value, 4000)
  let row: unknown = null
  switch (target.kind) {
    case 'posts': { const r = await db.post.findFirst({ where: { id: target.id, ...(authorId === null ? {} : { authorId }) }, select: { id: true, title: true, excerpt: true, content: true, status: true, slug: true } }); if (r) row = { ...r, excerpt: text(r.excerpt), content: text(r.content) }; break }
    case 'pages': { const r = await db.page.findUnique({ where: { id: target.id }, select: { id: true, title: true, content: true, status: true, slug: true } }); if (r) row = { ...r, content: text(r.content) }; break }
    case 'products': { const r = await db.product.findUnique({ where: { id: target.id }, select: { id: true, name: true, description: true, slug: true, active: true, currency: true, priceMinor: true, stock: true } }); if (r) row = { ...r, description: text(r.description), priceMinor: r.priceMinor.toString(), priceDecimal: minorToDecimal(r.priceMinor, r.currency) }; break }
    case 'software': { const r = await db.softwareTitle.findFirst({ where, select: { id: true, title: true, summary: true, content: true, status: true, slug: true } }); if (r) row = { ...r, summary: text(r.summary), content: text(r.content) }; break }
    case 'games': { const r = await db.gameTitle.findFirst({ where, select: { id: true, title: true, summary: true, content: true, status: true, slug: true } }); if (r) row = { ...r, summary: text(r.summary), content: text(r.content) }; break }
    case 'cinema-titles': { const r = await db.cinemaTitle.findFirst({ where, select: { id: true, title: true, summary: true, status: true, slug: true, kind: true, year: true } }); if (r) row = { ...r, summary: text(r.summary) }; break }
    case 'music-tracks': { const r = await db.musicTrack.findFirst({ where, select: { id: true, title: true, genre: true, status: true, slug: true } }); if (r) row = r; break }
    case 'music-albums': { const r = await db.musicAlbum.findFirst({ where, select: { id: true, title: true, description: true, genre: true, status: true, slug: true } }); if (r) row = { ...r, description: text(r.description) }; break }
    case 'orders': { const r = await db.order.findFirst({ where: { id: target.id, productId: { not: null } }, select: { id: true, status: true, currency: true, totalMinor: true, productDelivery: { select: { status: true } } } }); if (r) row = { ...r, totalMinor: r.totalMinor.toString(), totalDecimal: minorToDecimal(r.totalMinor, r.currency) }; break }
  }
  if (!row) throw new AiError('مورد انتخابی در دسترس شما نیست؛ صفحه را تازه کنید', 404)
  return row
}
