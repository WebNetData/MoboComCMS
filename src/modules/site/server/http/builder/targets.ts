import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { err, ok } from '@/platform/http/response'

/** Minimal names/ids only for the section the current manager may design. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('page-builder'); if (off) return off
  const kind = req.nextUrl.searchParams.get('kind'), q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80)
  if (kind !== 'page' && kind !== 'post' && kind !== 'product') return err('نوع محتوا معتبر نیست')
  if (!await requirePerm(req, kind === 'post' ? 'cms.posts' : kind === 'product' ? 'cms.products' : 'cms.pages')) return err('forbidden', 403)
  const rows = kind === 'product'
    ? (await db.product.findMany({ where: q ? { name: { contains: q } } : {}, select: { id: true, name: true }, take: 24, orderBy: { id: 'desc' } })).map(row => ({ id: row.id, title: row.name }))
    : kind === 'post' ? await db.post.findMany({ where: q ? { title: { contains: q } } : {}, select: { id: true, title: true }, take: 24, orderBy: { id: 'desc' } })
      : await db.page.findMany({ where: q ? { title: { contains: q } } : {}, select: { id: true, title: true }, take: 24, orderBy: { id: 'desc' } })
  const response = ok({ items: rows.map(row => ({ ...row, pageId: kind === 'page' ? String(row.id) : `${kind}-${row.id}` })) })
  response.headers.set('Cache-Control', 'private, no-store'); return response
}
