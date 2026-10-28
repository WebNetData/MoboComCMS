import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import {
  BUILDER_PAGE_ID, SCRIPT_PERMISSION, clearBuilderDraft, docUsesScripts, introducesScripts, getBuilderDoc, getBuilderDraft, permFor, sanitizeBuilderDoc, saveBuilderDoc,
} from '@/modules/site/server/builder'
import { emptyDoc, parseBuilderDoc } from '@/modules/site/domain/builder'
import { THEME_TYPE_LABELS, templateTypeOf } from '@/modules/site/domain/theme-templates'
import { getThemeTemplate } from '@/modules/site/server/theme-templates'
import { moduleGuard } from '@/extensions/server/modules'

const MAX_BODY = 600_000

function readPageId(value: unknown): string | null {
  const id = String(value || '').trim()
  return BUILDER_PAGE_ID.test(id) ? id : null
}

async function locate(pageId: string): Promise<{ title: string; titleEn: string; path: string; status?: string }> {
  if (templateTypeOf(pageId)) {
    const meta = await getThemeTemplate(pageId)
    if (!meta) return { title: pageId, titleEn: pageId, path: '' }
    const p = meta.placement
    const path = meta.type !== 'page' ? '' : p.kind === 'home' ? '/' : p.kind === 'blog' ? '/blog' : p.kind === 'shop' ? '/products' : p.kind === 'section' ? `/${p.slug}` : ''
    return { title: `${THEME_TYPE_LABELS[meta.type].fa}: ${meta.name}`, titleEn: `${THEME_TYPE_LABELS[meta.type].en}: ${meta.nameEn || meta.name}`, path: meta.status === 'published' ? path : '' }
  }
  if (pageId === 'home') return { title: 'صفحه اصلی', titleEn: 'Home', path: '/' }
  if (pageId === 'blog') return { title: 'مجله', titleEn: 'Journal', path: '/blog' }
  const post = /^post-(\d+)$/.exec(pageId)
  if (post) {
    const row = await db.post.findUnique({ where: { id: Number(post[1]) }, select: { title: true, titleEn: true, slug: true } })
    return row ? { title: row.title, titleEn: row.titleEn || row.title, path: `/blog/${row.slug}` } : { title: pageId, titleEn: pageId, path: '/blog' }
  }
  const product = /^product-(\d+)$/.exec(pageId)
  if (product) {
    const row = await db.product.findUnique({ where: { id: Number(product[1]) }, select: { name: true, nameEn: true, slug: true } })
    return row ? { title: row.name, titleEn: row.nameEn || row.name, path: `/products/${row.slug}` } : { title: pageId, titleEn: pageId, path: '/products' }
  }
  if (!/^\d+$/.test(pageId)) return { title: pageId, titleEn: pageId, path: '/' }
  const page = await db.page.findUnique({ where: { id: Number(pageId) }, select: { title: true, titleEn: true, slug: true, status: true } })
  return page ? { title: page.title, titleEn: page.titleEn || page.title, path: `/p/${page.slug}`, status: page.status } : { title: pageId, titleEn: pageId, path: '/' }
}

export async function GET(req: NextRequest) {
  const off = await moduleGuard('page-builder')
  if (off) return off
  const pageId = readPageId(req.nextUrl.searchParams.get('pageId'))
  if (!pageId) return err('Invalid page ID')
  if (!await requirePerm(req, permFor(pageId))) return err('forbidden', 403)
  const [doc, draft] = await Promise.all([getBuilderDoc(pageId), getBuilderDraft(pageId)])
  return ok({ pageId, templateType: templateTypeOf(pageId), meta: await locate(pageId), doc: doc || emptyDoc(), draft: draft.present ? { doc: draft.doc } : null })
}

export async function PUT(req: NextRequest) {
  const off = await moduleGuard('page-builder')
  if (off) return off
  const body = await req.json().catch(() => null)
  const pageId = readPageId(body?.pageId)
  if (!pageId) return err('Invalid page ID')
  const admin = await requirePerm(req, permFor(pageId))
  if (!admin) return err('forbidden', 403)
  if (JSON.stringify(body?.doc ?? null).length > MAX_BODY) return err('Builder document too large', 413)
  let doc
  try { doc = sanitizeBuilderDoc(parseBuilderDoc(body?.doc)) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid document') }
  const scripts = docUsesScripts(doc)
  if (await introducesScripts(pageId, doc) && !await requirePerm(req, SCRIPT_PERMISSION)) {
    return err('Advanced code (JavaScript) requires the site settings permission', 403)
  }
  await saveBuilderDoc(pageId, doc, { id: admin.id, email: admin.email })
  await clearBuilderDraft(pageId)
  await auditAdmin({
    req,
    actor: admin,
    action: 'page.builder.update',
    targetType: 'Setting',
    targetId: pageId,
    metadata: { mode: doc.mode, sections: doc.sections.length, pageId, advancedCode: scripts },
  })
  return ok({ saved: true, pageId })
}
