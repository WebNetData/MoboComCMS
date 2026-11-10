import { isModuleEnabled } from '@/extensions/server/modules'
import { exactSurfaceExample, surfaceExamples } from '@/modules/site/server/builder-surfaces'
import { db } from '@/platform/database/prisma'
import { parsePermissions, hasPermission } from '@/modules/identity/rbac'
import { BUILDER_PAGE_ID, getBuilderDoc, getBuilderDraft, permFor } from '@/modules/site/server/builder'
import type { BuilderDoc } from '@/modules/site/domain/builder'
import { templateTypeOf, type ThemeTemplateMeta } from '@/modules/site/domain/theme-templates'
import { getThemeTemplate } from '@/modules/site/server/theme-templates'
import { categoryDescendants } from '@/modules/site/domain/categories'
import { categoryMembership } from '@/modules/site/server/categories'

export type PreviewTarget =
  | { kind: 'home' }
  | { kind: 'blog' }
  | { kind: 'post'; slug: string }
  | { kind: 'product'; slug: string }
  | { kind: 'page'; slug: string }
  | { kind: 'template'; meta: ThemeTemplateMeta; sample: string | null }
  | { kind: 'missing'; pageId: string }

export function validPreviewPageId(pageId: string): boolean {
  return BUILDER_PAGE_ID.test(pageId)
}

/** Same rules as `requirePerm`, resolved from a session user id for server components. */
export async function canPreviewBuilder(pageId: string, userId: number): Promise<boolean> {
  if (!BUILDER_PAGE_ID.test(pageId) || !Number.isSafeInteger(userId) || userId <= 0) return false
  try {
    if (!await isModuleEnabled('page-builder')) return false
    const user = await db.user.findUnique({ where: { id: userId }, include: { roleRef: true } })
    if (!user || user.status !== 'ACTIVE' || user.role !== 'ADMIN') return false
    const permissions = user.roleId != null ? parsePermissions(user.roleRef?.permissions || '') : null
    if (permissions === null || permissions.length === 0) return user.roleId == null
    return hasPermission(permissions, permFor(pageId))
  } catch {
    return false
  }
}

/** Draft wins over the stored document so the iframe mirrors unsaved edits. */
export async function resolvePreviewDoc(pageId: string): Promise<BuilderDoc | null> {
  const draft = await getBuilderDraft(pageId)
  if (draft.present) return draft.doc
  return getBuilderDoc(pageId)
}

/** A real post / product to show a single template with — preferring one its rules match. */
async function sampleEntry(meta: ThemeTemplateMeta): Promise<string | null> {
  if (meta.type === 'single-post') {
    const specific = meta.conditions.find(rule => rule.mode === 'include' && rule.target.startsWith('post-id:'))
    if (specific) return (await db.post.findFirst({where:{id:Number(specific.target.slice(8))},select:{slug:true}}))?.slug || null
    const category = meta.conditions.find((rule) => rule.mode === 'include' && rule.target.startsWith('post-category:'))
    let where: Record<string, unknown> = { status: 'PUBLISHED' }
    if (category) {
      const nodes = await db.postCategory.findMany({ select: { id: true, parentId: true, name: true } })
      where = { ...where, ...categoryMembership(categoryDescendants(nodes, Number(category.target.split(':')[1]))) }
    }
    const post = await db.post.findFirst({ where, orderBy: { publishedAt: 'desc' }, select: { slug: true } })
      || await db.post.findFirst({ orderBy: { publishedAt: 'desc' }, select: { slug: true } })
    return post?.slug || null
  }
  if (meta.type === 'single-product') {
    const specific = meta.conditions.find(rule => rule.mode === 'include' && rule.target.startsWith('product-id:'))
    if (specific) return (await db.product.findFirst({where:{id:Number(specific.target.slice(11))},select:{slug:true}}))?.slug || null
    const kind = meta.conditions.find((rule) => rule.mode === 'include' && rule.target.startsWith('product-kind:'))
    const category = meta.conditions.find((rule) => rule.mode === 'include' && rule.target.startsWith('product-category:'))
    const where: Record<string, unknown> = {}
    if (kind) where.kind = kind.target.split(':')[1]
    if (category) {
      const nodes = await db.productCategory.findMany({ select: { id: true, parentId: true, name: true } })
      where.categoryId = { in: categoryDescendants(nodes, Number(category.target.split(':')[1])) }
    }
    const product = await db.product.findFirst({ where, orderBy: [{ active: 'desc' }, { id: 'desc' }], select: { slug: true } })
      || await db.product.findFirst({ orderBy: { id: 'desc' }, select: { slug: true } })
    return product?.slug || null
  }
  if (meta.type === 'surface' && meta.surface && meta.surface !== 'dashboard') {
    const specific = meta.conditions.find(rule => rule.mode === 'include' && rule.target.startsWith('entry:'))
    if (specific) return (await exactSurfaceExample(meta.surface, Number(specific.target.slice(6))))?.slug || null
    return (await surfaceExamples(meta.surface))[0]?.slug || null
  }
  return null
}

export async function resolvePreviewTarget(pageId: string): Promise<PreviewTarget> {
  if (templateTypeOf(pageId)) {
    const meta = await getThemeTemplate(pageId)
    return meta ? { kind: 'template', meta, sample: await sampleEntry(meta) } : { kind: 'missing', pageId }
  }
  if (pageId === 'home') return { kind: 'home' }
  if (pageId === 'blog') return { kind: 'blog' }
  const post = /^post-(\d+)$/.exec(pageId)
  if (post) {
    const row = await db.post.findUnique({ where: { id: Number(post[1]) }, select: { slug: true } })
    return row ? { kind: 'post', slug: row.slug } : { kind: 'missing', pageId }
  }
  const product = /^product-(\d+)$/.exec(pageId)
  if (product) {
    const row = await db.product.findUnique({ where: { id: Number(product[1]) }, select: { slug: true } })
    return row ? { kind: 'product', slug: row.slug } : { kind: 'missing', pageId }
  }
  if (/^\d+$/.test(pageId)) {
    const row = await db.page.findUnique({ where: { id: Number(pageId) }, select: { slug: true } })
    return row ? { kind: 'page', slug: row.slug } : { kind: 'missing', pageId }
  }
  return { kind: 'missing', pageId }
}
