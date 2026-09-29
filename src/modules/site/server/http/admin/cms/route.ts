import { NextRequest } from 'next/server'
import { contentChanged } from '@/modules/content/server/events'
import { normalizeAccess } from '@/modules/membership/domain/membership'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { getPageLayout, validatePageLayout } from '@/modules/site/server/page-layout'
import { legacyNumber } from '@/shared/money'
import { validateCover } from '@/shared/content/cover'
import { validateCategoryParent, validateCategorySelection } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import { parseJson, validateFields } from '@/modules/catalog/server/product-config'
import { productInput, saveVariants } from '@/modules/catalog/server/product-input'

const PERM_MAP: Record<string, Permission> = {
  pages: 'cms.pages',
  posts: 'cms.posts',
  postcats: 'cms.posts',
  products: 'cms.products',
  productcats: 'cms.products',
  productgroups: 'cms.products',
  locations: 'settings.manage',
}

function pick(b: any, keys: string[]) {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (b?.[k] !== undefined) out[k] = b[k]
  return out
}

/** Editor output is HTML: sanitize rich fields and flatten plain-text ones. */
const RICH_KEYS = ['content', 'contentEn', 'description', 'descriptionEn']
const PLAIN_KEYS = ['excerpt', 'excerptEn']
function sanitizeContent(data: Record<string, unknown>) {
  if (data.cover !== undefined) data.cover = validateCover(data.cover)
  if (data.sortOrder !== undefined) {
    const sortOrder = Number(data.sortOrder)
    if (!Number.isSafeInteger(sortOrder)) throw new Error('ترتیب نمایش معتبر نیست')
    data.sortOrder = sortOrder
  }
  for (const k of RICH_KEYS) if (typeof data[k] === 'string') data[k] = cleanRichText(data[k] as string)
  for (const k of PLAIN_KEYS) if (typeof data[k] === 'string') data[k] = richTextToPlain(data[k] as string, 500)
  return data
}

const MODELS: Record<string, any> = {
  pages: () => db.page,
  posts: () => db.post,
  postcats: () => db.postCategory,
  products: () => db.product,
  productcats: () => db.productCategory,
  productgroups: () => db.productAttributeGroup,
  locations: () => db.mapLocation,
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  const perm = PERM_MAP[type]
  if (!perm) return err('unknown type', 404)
  const admin = await requirePerm(req, perm)
  if (!admin) return err('forbidden', 403)

  const model = MODELS[type]()
  const include = type === 'posts' ? { category: true, categories: { include: { category: true } }, author: { select: { email: true, name: true } } } : type === 'products' ? { category: { include: { attributeGroup: true } }, variants: { where: { active: true }, orderBy: { id: 'asc' as const } } } : type === 'productcats' ? { attributeGroup: true } : undefined
  const orderBy = type === 'pages' ? { sortOrder: 'asc' as const } : { id: 'desc' as const }
  // ?id= narrows the listing to one row (the store product editor loads a single product).
  const onlyId = Number(req.nextUrl.searchParams.get('id')) || 0
  const rows = await model.findMany({ orderBy, include, ...(onlyId ? { where: { id: onlyId } } : {}) })
  if (type === 'posts') return ok(rows.map((row: any) => ({ ...row, categoryIds: postCategories(row).map(category => String(category.id)) })))
  if (type === 'pages') return ok(await Promise.all(rows.map(async (row: any) => ({ ...row, ...await getPageLayout(row.id) }))))
  if (type === 'products') return ok(rows.map((row: any) => ({ ...row, memberPrice: row.memberPriceMinor ? legacyNumber(row.memberPriceMinor, row.currency) : '', memberPriceMinor: undefined, compareAtPrice: row.compareAtMinor ? legacyNumber(row.compareAtMinor, row.currency) : '', compareAtMinor: undefined, variants: row.variants.map((v: any) => ({ ...v, priceMinor: undefined, memberPrice: v.memberPriceMinor ? legacyNumber(v.memberPriceMinor, row.currency) : '', memberPriceMinor: undefined, compareAtPrice: v.compareAtMinor ? legacyNumber(v.compareAtMinor, row.currency) : '', compareAtMinor: undefined, attributes: parseJson(v.attributes, {}) })) })))
  return ok(rows)
}

async function productCategoryParent(parentId: unknown, currentId?: number) {
  if (parentId === '' || parentId == null) return null
  const id = Number(parentId)
  if (!Number.isSafeInteger(id) || id <= 0 || id === currentId) throw Error('Invalid parent category')
  const categories = await db.productCategory.findMany({ select: { id: true, parentId: true } })
  const parents = new Map(categories.map(c => [c.id, c.parentId]))
  if (!parents.has(id)) throw Error('Parent category not found')
  const visited = new Set<number>()
  for (let cursor: number | null = id; cursor != null; cursor = parents.get(cursor) ?? null) {
    if (visited.has(cursor)) throw Error('Category cycle detected')
    visited.add(cursor)
    if (cursor === currentId) throw Error('A category cannot be its own descendant')
  }
  return id
}

async function productCategoryGroup(groupId: unknown) {
  if (groupId === '' || groupId == null) return null
  const id = Number(groupId)
  if (!Number.isSafeInteger(id) || id <= 0 || !await db.productAttributeGroup.findUnique({ where: { id } })) throw Error('Attribute group not found')
  return id
}

/** Storefront presentation of a product category (menu icon, tile image, intro text, order). */
function productCategoryExtras(b: any) {
  const out: Record<string, unknown> = {}
  if (b?.image !== undefined) out.image = validateCover(b.image)
  if (b?.icon !== undefined) out.icon = String(b.icon || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40)
  if (b?.description !== undefined) out.description = richTextToPlain(String(b.description || ''), 1000)
  if (b?.sortOrder !== undefined) {
    const sortOrder = Number(b.sortOrder) || 0
    if (!Number.isSafeInteger(sortOrder)) throw Error('Invalid sort order')
    out.sortOrder = sortOrder
  }
  return out
}

function productGroupInput(b: any) {
  const name = String(b?.name || '').trim()
  const nameEn = String(b?.nameEn || '').trim()
  if (!name || name.length > 120 || nameEn.length > 120) throw Error('Invalid attribute group name')
  const appliesTo = String(b?.appliesTo || 'ANY')
  if (!['ANY', 'VIRTUAL', 'PHYSICAL'].includes(appliesTo)) throw Error('Invalid product type for attribute group')
  return { name, nameEn, appliesTo, fields: JSON.stringify(validateFields(b?.fields ?? [])) }
}

export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  const perm = PERM_MAP[type]
  if (!perm) return err('unknown type', 404)
  const admin = await requirePerm(req, perm)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)

  const model = MODELS[type]()
  try {
    if (type === 'pages') {
      const layout = validatePageLayout(b || {})
      const row = await db.$transaction(async tx => {
        const page = await tx.page.create({ data: sanitizeContent(pick(b, ['slug', 'title', 'titleEn', 'content', 'contentEn', 'status', 'showInNav', 'sortOrder'])) as any })
        await tx.setting.create({ data: { key: `page.layout.${page.id}`, value: JSON.stringify(layout) } })
        return page
      })
      return ok(row)
    }
    if (type === 'posts') {
      const row = await db.$transaction(async tx => {
        const ids = await validateCategorySelection(tx, b || {})
        return tx.post.create({
        data: sanitizeContent({
          ...pick(b, ['slug', 'title', 'titleEn', 'excerpt', 'excerptEn', 'content', 'contentEn', 'cover', 'status', 'featured']),
          access: normalizeAccess(b?.access),
          authorId: admin.id,
          categoryId: ids[0] || null,
          categories: { create: ids.map(categoryId => ({ categoryId })) },
        }) as any,
        })
      })
      contentChanged({ type: 'post', id: row.id }, null, row)
      return ok(row)
    }
    if (type === 'postcats' || type === 'productcats') {
      if (type === 'postcats') return ok(await db.$transaction(async tx => tx.postCategory.create({ data: {
        ...pick(b, ['slug', 'name', 'nameEn']), parentId: await validateCategoryParent(tx, b?.parentId),
      } as any }), { isolationLevel: 'Serializable' }))
      const row = await model.create({ data: { ...pick(b, ['slug', 'name', 'nameEn']), ...productCategoryExtras(b), parentId: await productCategoryParent(b?.parentId), attributeGroupId: await productCategoryGroup(b?.attributeGroupId) } })
      return ok(row)
    }
    if (type === 'productgroups') return ok(await db.productAttributeGroup.create({ data: productGroupInput(b) }))
    if (type === 'products') {
      const input = await productInput(b)
      const row = await db.$transaction(async tx => {
        const created = await tx.product.create({ data: input.data as any })
        if (input.variants) await saveVariants(tx, created.id, input.variants)
        return created
      })
      contentChanged({ type: 'product', id: row.id }, null, row)
      return ok(row)
    }
    if (type === 'locations') {
      const row = await model.create({
        data: {
          ...pick(b, ['country', 'countryFa', 'flag', 'city', 'active']),
          lat: Number(b?.lat) || 0,
          lng: Number(b?.lng) || 0,
        },
      })
      return ok(row)
    }
    return err('unknown type', 404)
  } catch (e: any) {
    return err(e?.code === 'P2002' ? 'slug تکراری است' : e?.message || 'create failed', 400)
  }
}

export async function PATCH(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  const perm = PERM_MAP[type]
  if (!perm) return err('unknown type', 404)
  const admin = await requirePerm(req, perm)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const model = MODELS[type]()

  if (type === 'posts' && b?.cover !== undefined) {
    try { validateCover(b.cover) } catch { return err('نشانی تصویر معتبر نیست', 400) }
  }

  const data: Record<string, unknown> = {}
  if (type === 'pages') Object.assign(data, sanitizeContent(pick(b, ['slug', 'title', 'titleEn', 'content', 'contentEn', 'status', 'showInNav', 'sortOrder'])))
  if (type === 'posts') {
    Object.assign(data, sanitizeContent(pick(b, ['slug', 'title', 'titleEn', 'excerpt', 'excerptEn', 'content', 'contentEn', 'cover', 'status', 'featured'])))
    if (b?.access !== undefined) data.access = normalizeAccess(b.access)
  }
  if (type === 'postcats' || type === 'productcats') Object.assign(data, pick(b, ['slug', 'name', 'nameEn']))
  if (type === 'locations') {
    Object.assign(data, pick(b, ['country', 'countryFa', 'flag', 'city', 'active']))
    if (b?.lat !== undefined) data.lat = Number(b.lat)
    if (b?.lng !== undefined) data.lng = Number(b.lng)
  }

  try {
    if (type === 'productgroups') {
      const input = productGroupInput(b)
      const current = await db.productAttributeGroup.findUnique({ where: { id }, select: { appliesTo: true } })
      if (!current) return err('not found', 404)
      if (current.appliesTo !== input.appliesTo && await db.productCategory.count({ where: { attributeGroupId: id } })) return err('Move categories to another group before changing its product type', 409)
      return ok(await db.productAttributeGroup.update({ where: { id }, data: input }))
    }
    if (type === 'productcats') {
      Object.assign(data, productCategoryExtras(b))
      if (b?.parentId !== undefined) data.parentId = await productCategoryParent(b.parentId, id)
      if (b?.attributeGroupId !== undefined) data.attributeGroupId = await productCategoryGroup(b.attributeGroupId)
    }
    if (type === 'products') {
      const current = await db.product.findUnique({ where: { id }, select: { price: true, currency: true, categoryId: true, specifications: true, faqs: true, gallery: true, kind: true, stock: true, active: true, priceMinor: true, name: true } })
      if (!current) return err('not found', 404)
      const input = await productInput(b, current)
      const saved = await db.$transaction(async tx => {
        const row = await tx.product.update({ where: { id }, data: input.data as any })
        if (input.variants) await saveVariants(tx, id, input.variants)
        return row
      })
      contentChanged({ type: 'product', id }, current, saved)
      return ok(saved)
    }
    if (type === 'posts') {
      const before = await db.post.findUnique({ where: { id }, select: { status: true, publishedAt: true, title: true } })
      const saved = await db.$transaction(async tx => {
        if (b?.categoryIds !== undefined || b?.categoryId !== undefined) {
          const ids = await validateCategorySelection(tx, b)
          data.categoryId = ids[0] || null
          data.categories = { deleteMany: {}, create: ids.map(categoryId => ({ categoryId })) }
        }
        return tx.post.update({ where: { id }, data })
      })
      contentChanged({ type: 'post', id }, before, saved)
      return ok(saved)
    }
    if (type === 'postcats') return ok(await db.$transaction(async tx => {
      if (b?.parentId !== undefined) data.parentId = await validateCategoryParent(tx, b.parentId, id)
      return tx.postCategory.update({ where: { id }, data })
    }, { isolationLevel: 'Serializable' }))
    if (type === 'pages') {
      const layout = validatePageLayout({ ...await getPageLayout(id), ...b })
      const row = await db.$transaction(async tx => {
        const page = await tx.page.update({ where: { id }, data })
        await tx.setting.upsert({ where: { key: `page.layout.${id}` }, create: { key: `page.layout.${id}`, value: JSON.stringify(layout) }, update: { value: JSON.stringify(layout) } })
        return page
      })
      return ok(row)
    }
    const row = await model.update({ where: { id }, data })
    return ok(row)
  } catch (e: any) {
    return err(e?.code === 'P2002' ? 'slug تکراری است' : e?.message || 'update failed', 400)
  }
}

export async function DELETE(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  const perm = PERM_MAP[type]
  if (!perm) return err('unknown type', 404)
  const admin = await requirePerm(req, perm)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const model = MODELS[type]()
  try {
    if (type === 'postcats') {
      await db.$transaction(async tx => {
        await tx.post.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
        await tx.postCategory.delete({ where: { id } })
      })
      return ok({ deleted: true })
    }
    if (type === 'productgroups' && await db.productCategory.count({ where: { attributeGroupId: id } })) return err('Group is assigned to a category', 409)
    await model.delete({ where: { id } })
    if (type === 'posts' || type === 'products') contentChanged({ type: type === 'posts' ? 'post' : 'product', id }, null, null)
    if (type === 'pages') await db.setting.deleteMany({ where: { key: { in: [`page.layout.${id}`, `page.builder.${id}`] } } })
    return ok({ deleted: true })
  } catch {
    if (type === 'productcats') {
      await db.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
    } else {
      return err('cannot delete (in use)', 400)
    }
    await model.delete({ where: { id } })
    return ok({ deleted: true })
  }
}
