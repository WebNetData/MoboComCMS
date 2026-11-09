import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { toInternalPath } from '@/platform/routing/aliases'
import { ProductionError, type ProductionKind } from '../../domain/production'
import { linksIn, qualityProfileOf, searchWords, similarity, summarize, textChecks, type QualityFinding, type QualityMatch, type QualityReport } from '../../domain/production-quality'
import { owned, configOf, outputOf, imagesOf, seedOf, type Batch } from './store'

type Item = Batch['items'][number]

async function similar(kind: ProductionKind, batch: Batch, item: Item): Promise<QualityMatch[]> {
  const output = outputOf(item), words = searchWords(output.title)
  const contains = (field: 'title' | 'name') => words.map(word => ({ [field]: { contains: word, mode: 'insensitive' as const } }))
  const rows: { title: string; slug: string; href: string; kind: QualityMatch['kind'] }[] = []
  if (words.length) {
    if (kind === 'product') rows.push(...(await db.product.findMany({ where: { OR: [...contains('name'), { slug: output.slug }] }, select: { id: true, name: true, slug: true }, take: 40 })).map(r => ({ title: r.name, slug: r.slug, href: `/admin/products?edit=${r.id}`, kind: 'product' as const })))
    else if (kind === 'page') rows.push(...(await db.page.findMany({ where: { OR: [...contains('title'), { slug: output.slug }] }, select: { id: true, title: true, slug: true }, take: 40 })).map(r => ({ title: r.title, slug: r.slug, href: `/admin/pages?edit=${r.id}`, kind: 'page' as const })))
    else rows.push(...(await db.post.findMany({ where: { OR: [...contains('title'), { slug: output.slug }] }, select: { id: true, title: true, slug: true }, take: 40 })).map(r => ({ title: r.title, slug: r.slug, href: `/admin/posts?edit=${r.id}`, kind: 'post' as const })))
  }
  for (const other of batch.items) if (other.id !== item.id && other.output) {
    const title = outputOf(other).title
    rows.push({ title, slug: outputOf(other).slug, href: `#item-${other.id}`, kind: 'batch' })
  }
  return rows
    .map(row => ({ title: row.title, href: row.href, kind: row.kind, score: row.slug === output.slug && row.kind !== 'batch' ? 1 : Math.round(similarity(output.title, row.title) * 100) / 100 }))
    .filter(match => match.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

async function links(item: Item): Promise<QualityFinding[]> {
  const site = URL.canParse(process.env.NEXTAUTH_URL || '') ? new URL(process.env.NEXTAUTH_URL!).host : ''
  const findings: QualityFinding[] = []
  for (const link of linksIn(outputOf(item))) {
    const url = URL.canParse(link) ? new URL(link) : URL.canParse('https://' + link) && link.startsWith('www.') ? new URL('https://' + link) : null
    if (url && url.host !== site) { findings.push({ area: 'links', level: 'warn', title: 'لینک بیرونی', detail: 'لینک بیرونی از سرور باز نمی‌شود؛ درستی و اعتبار منبع را خودتان بررسی کنید.', evidence: link }); continue }
    const [, section, slug] = toInternalPath(decodeURIComponent(url ? url.pathname : link)).match(/^\/([^/]+)\/([^/?#]+)/) || []
    const target = section === 'blog' ? await db.post.findUnique({ where: { slug }, select: { status: true } })
      : section === 'products' ? await db.product.findUnique({ where: { slug }, select: { active: true } }).then(r => r && { status: r.active ? 'PUBLISHED' : 'DRAFT' })
      : section === 'p' ? await db.page.findUnique({ where: { slug }, select: { status: true } })
      : undefined
    if (target === undefined) findings.push({ area: 'links', level: 'warn', title: 'لینک داخلی بررسی‌نشده', detail: 'این نوع نشانی خودکار بررسی نمی‌شود؛ یک بار باز کنید.', evidence: link })
    else if (!target) findings.push({ area: 'links', level: 'block', title: 'لینک داخلی خراب', detail: 'صفحه‌ای با این نشانی در سایت نیست.', evidence: link })
    else if (target.status !== 'PUBLISHED') findings.push({ area: 'links', level: 'warn', title: 'لینک به محتوای منتشرنشده', detail: 'مقصد هنوز پیش‌نویس یا غیرفعال است.', evidence: link })
  }
  return findings
}

export async function itemQuality(batch: Batch, item: Item): Promise<QualityReport> {
  if (!item.output) throw new ProductionError('هنوز متنی برای بررسی تولید نشده است', 409)
  const kind = batch.kind as ProductionKind, config = configOf(batch)
  const findings = textChecks({ kind, config, seed: seedOf(item), output: outputOf(item), images: imagesOf(item) })
  const matches = await similar(kind, batch, item)
  for (const match of matches) {
    const inBatch = match.kind === 'batch'
    findings.push({ area: 'similar', level: match.score >= 0.75 && !inBatch ? 'block' : 'warn', title: inBatch ? 'ردیف مشابه در همین دسته' : match.score >= 0.75 ? 'مطلب بسیار مشابه در سایت' : 'مطلب مشابه در سایت', detail: `${Math.round(match.score * 100)}٪ هم‌پوشانی عنوان؛ تکراری بودن یا رقابت با محتوای موجود را بررسی کنید.`, evidence: match.title })
  }
  findings.push(...await links(item))
  return summarize(qualityProfileOf(kind, config), findings, matches)
}

export async function productionQuality(req: NextRequest, id: unknown, itemId: unknown) {
  const { batch } = await owned(req, id), item = batch.items.find(x => x.id === itemId)
  if (!item) throw new ProductionError('ردیف پیدا نشد', 404)
  return itemQuality(batch, item)
}
