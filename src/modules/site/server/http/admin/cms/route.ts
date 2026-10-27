import { NextRequest } from 'next/server'
import { contentChanged } from '@/modules/content/server/events'
import { normalizeAccess } from '@/modules/membership/domain/membership'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireContentScope, requirePerm } from '@/modules/identity/server/access'
import { TRASHED, isTrashed, restoreData, trashData } from '@/modules/content/domain/trash'
import { tellTrashDecision } from '@/modules/content/server/trash-notice'
import { completeTrashCase, reopenTrashCase } from '@/modules/moderation/server/cases'
import type { Permission } from '@/modules/identity/rbac'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { getPageLayout, validatePageLayout } from '@/modules/site/server/page-layout'
import { legacyNumber, minorToDecimal } from '@/shared/money'
import { validateCover } from '@/shared/content/cover'
import { validateCategoryParent, validateCategorySelection } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import { parseJson, validateFields } from '@/modules/catalog/server/product-config'
import { assertKindFits, cascadeCategoryKind, kindForCategory } from '@/modules/catalog/server/category-kind'
import { CategoryKindError } from '@/modules/catalog/domain/category-kind'
import { productInput, saveVariants } from '@/modules/catalog/server/product-input'
import { capturePublicProductPrices, prepareProductPriceCapture } from '@/modules/catalog/server/price-history'
import { fxFormFields } from '@/modules/fx/server/fx'
import { readOrderFields } from '@/modules/store/domain/order-inputs'
import { bulkSameOrigin, readBulkInput } from '@/modules/content/server/bulk'
import { auditAdmin, auditAdminStrict } from '@/platform/audit/server'
import { buildCategoryTemplate } from '@/modules/catalog/server/category-template'
import { ProductCategoryError, replaceExtraCategories, validateExtraCategories } from '@/modules/catalog/server/product-categories'
import { recordRevision } from '@/modules/content/server/revisions'
import { postRevisionState } from '@/modules/site/server/revision-state'
import { productRevisionState } from '@/modules/catalog/server/revision-state'
import { publicPathFor, queueIndexNow } from '@/modules/seo/server/indexnow'
import { adminPageParams, adminPageSlice } from '@/modules/content/domain/admin-pagination'
import { PENDING_REVIEW, PostReviewError, approvalPublishedAt, authorReviewRefusal, livePostWhere, parseAdminPostFilters, postFormStatus, publicationDateInput, type PostFormStatus } from '@/modules/journal/domain/journal'
import { decidePostProposal, decidePostReview, proposalView, proposePostEdit, reviewingAuthorPosts } from '@/modules/journal/server/review'
import { claimPostWrite, type PostWriteState } from '@/modules/journal/server/review-state'
import { changePostStates } from '@/modules/journal/server/review-bulk'
import { queueReviewDecision } from '@/modules/journal/server/review-notifications'
import { adminPostFilterWhere, adminPostStateCounts } from '@/modules/journal/server/admin'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { parsePostItemLinks, replacePostItemLinks, validatePostItemLinks } from '@/modules/journal/server/item-links'
import { postFormatInput } from '@/modules/journal/server/formats'
import { PostFormatError, formatFormValues } from '@/modules/journal/domain/formats'
import { parseProductRelationships } from '@/modules/catalog/domain/product-relationships'
import { parseProductBundles } from '@/modules/catalog/domain/product-bundles'
import { replaceProductBundles } from '@/modules/catalog/server/product-bundles'
import { replaceProductRelationships } from '@/modules/catalog/server/product-relationships'

const PERM_MAP: Record<string, Permission> = {
  pages: 'cms.pages',
  posts: 'cms.posts',
  postcats: 'cms.posts',
  products: 'cms.products',
  productcats: 'cms.products',
  productgroups: 'cms.products',
  locations: 'settings.manage',
}

/**
 * Who is asking. Articles may also be written by a magazine author (`journal.author`), who is then held to the
 * articles they wrote: `authorId` is their id, and null for a manager. An author reads the categories to file
 * an article under and changes nothing else here.
 */
async function callerOf(req: NextRequest, type: string, reading = false) {
  const perm = PERM_MAP[type]
  if (type === 'posts' || (type === 'postcats' && reading)) return requireContentScope(req, perm, 'journal.author')
  const admin = await requirePerm(req, perm)
  return admin ? { admin, authorId: null as number | null } : null
}

/** The fields of an article a form may set. Featuring an article is an editorial choice, not its author's. */
const postFields = (authorId: number | null) => ['slug', 'title', 'titleEn', 'excerpt', 'excerptEn', 'content', 'contentEn', 'cover', 'status', ...(authorId ? [] : ['featured'])]

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
  const caller = await callerOf(req, type, true)
  if (!caller) return err('forbidden', 403)
  // An author's list, counts and single reads are their own articles; someone else's is not there for them.
  const own = type === 'posts' && caller.authorId ? { authorId: caller.authorId } : null

  if (type === 'productcats' && req.nextUrl.searchParams.get('options') === '1') {
    return ok(await db.productCategory.findMany({ select: { id: true, name: true, parentId: true, kind: true }, orderBy: { id: 'asc' } }))
  }
  // The category manager's tree: every category in its order, with how many products it holds directly.
  if (type === 'productcats' && req.nextUrl.searchParams.get('tree') === '1') {
    return ok(await db.productCategory.findMany({
      select: { id: true, slug: true, name: true, nameEn: true, parentId: true, kind: true, attributeGroupId: true, image: true, sortOrder: true, _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }))
  }

  const model = MODELS[type]()
  const include = type === 'posts' ? { editProposal: true, category: true, categories: { include: { category: true } }, author: { select: { email: true, name: true } }, itemLinks: { orderBy: { position: 'asc' as const } } } : type === 'products' ? { category: { include: { attributeGroup: true } }, extraCategories: { select: { categoryId: true } }, variants: { where: { active: true }, orderBy: { id: 'asc' as const } }, bundles: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }], include: { components: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] } } }, outgoingRelationships: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }], select: { kind: true, targetId: true } } } : type === 'productcats' ? { attributeGroup: true } : undefined
  const orderBy = type === 'pages' ? [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] : { id: 'desc' as const }
  // ?id= narrows the listing to one row (the store product editor loads a single product).
  const onlyId = Number(req.nextUrl.searchParams.get('id')) || 0
  const paged = req.nextUrl.searchParams.get('paged') === '1' && !onlyId
  let pageInfo: ReturnType<typeof adminPageParams> | null = null
  if (paged) {
    try { pageInfo = adminPageParams(req.nextUrl.searchParams) } catch (error) { return err(error instanceof Error ? error.message : 'invalid page', 400) }
  }
  const searchFields: Record<string, string[]> = {
    pages: ['title', 'titleEn', 'slug'], posts: ['title', 'titleEn', 'slug'],
    postcats: ['name', 'nameEn', 'slug'], products: ['name', 'nameEn', 'slug'],
    productcats: ['name', 'nameEn', 'slug'], productgroups: ['name', 'nameEn'],
    locations: ['country', 'countryFa', 'city'],
  }
  const asked = onlyId ? { id: onlyId } : pageInfo?.query ? { OR: searchFields[type].map((field) => ({ [field]: { contains: pageInfo.query, mode: 'insensitive' } })) } : undefined
  // The posts list may also be narrowed by state, category, featured and access (?state=draft from the dashboard).
  let narrowed: any[] = []
  if (type === 'posts' && !onlyId) {
    try { narrowed = await adminPostFilterWhere(parseAdminPostFilters(req.nextUrl.searchParams)) } catch (error) { return err(error instanceof Error ? error.message : 'invalid filter', 400) }
  }
  const scoped = own ? { ...(asked || {}), ...own } : asked
  const where = narrowed.length ? { AND: [...(scoped ? [scoped] : []), ...narrowed] } : scoped
  const total = pageInfo ? await model.count({ where }) : 0
  const slice = pageInfo ? adminPageSlice(total, pageInfo.page, pageInfo.size) : null
  const rows = await model.findMany({ orderBy, include, ...(where ? { where } : {}), ...(slice ? { skip: slice.skip, ...(slice.take ? { take: slice.take } : {}) } : {}) })
  let result: any[] = rows
  if (type === 'posts') result = rows.map((row: any) => ({ ...row, ...formatFormValues(row.formatData), editProposal: undefined, proposal: proposalView(row), categoryIds: postCategories(row).map(category => String(category.id)), itemLinks: row.itemLinks.map((link: any) => ({ type: link.itemType, id: link.itemId })) }))
  if (type === 'pages') result = await Promise.all(rows.map(async (row: any) => ({ ...row, ...await getPageLayout(row.id) })))
  if (type === 'products') result = rows.map((row: any) => ({ ...row, outgoingRelationships: undefined, relationships: row.outgoingRelationships, bundles: row.bundles.map((bundle: any) => ({ id: bundle.id, name: bundle.name, nameEn: bundle.nameEn, active: bundle.active, components: bundle.components.map((component: any) => ({ productId: component.productId, variantId: component.variantKey || null, quantity: component.quantity })) })), ...fxFormFields(row), orderFields: readOrderFields(row.orderFields), openMin: row.openMinMinor > 0n ? (Number(row.openMinMinor) / 100).toString() : '', openMax: row.openMaxMinor > 0n ? (Number(row.openMaxMinor) / 100).toString() : '', openMinMinor: undefined, openMaxMinor: undefined, fxAmountMinor: undefined, fxCompareAtMinor: undefined, fxMemberMinor: undefined, markupFixedMinor: undefined, memberPrice: row.memberPriceMinor ? legacyNumber(row.memberPriceMinor, row.currency) : '', memberPriceMinor: undefined, compareAtPrice: row.compareAtMinor ? legacyNumber(row.compareAtMinor, row.currency) : '', compareAtMinor: undefined, variants: row.variants.map((v: any) => ({ ...v, priceMinor: undefined, fxAmount: v.fxAmountMinor > 0n ? minorToDecimal(v.fxAmountMinor, row.fxCurrency || 'USD') : '', fxAmountMinor: undefined, memberPrice: v.memberPriceMinor ? legacyNumber(v.memberPriceMinor, row.currency) : '', memberPriceMinor: undefined, compareAtPrice: v.compareAtMinor ? legacyNumber(v.compareAtMinor, row.currency) : '', compareAtMinor: undefined, attributes: parseJson(v.attributes, {}) })) }))
  if (!pageInfo || !slice) return ok(result)
  const published = type === 'posts' ? await model.count({ where: { ...livePostWhere(), ...(own || {}) } }) : type === 'pages' ? await model.count({ where: { status: 'PUBLISHED' } }) : type === 'products' ? await model.count({ where: publicProductWhere }) : null
  return ok({ rows: result, total, overall: await model.count(own ? { where: own } : undefined), published, page: slice.page, pages: slice.pages, ...(type === 'posts' ? { trashed: await model.count({ where: { status: TRASHED, ...(own || {}) } }), mine: !!own, reviewing: await reviewingAuthorPosts(), counts: { state: await adminPostStateCounts(own) } } : {}) })
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
  const caller = await callerOf(req, type)
  if (!caller) return err('forbidden', 403)
  const admin = caller.admin
  const b = await req.json().catch(() => null)

  const model = MODELS[type]()
  try {
    // "Build the ready category tree" (Admin › product categories): adds what is missing, moves and renames nothing.
    if (type === 'productcats' && b?.template === 'store-v1') {
      const result = await buildCategoryTemplate()
      await auditAdmin({ req, actor: admin, action: 'cms.productcats.template', targetType: 'productcats', metadata: result })
      return ok(result)
    }
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
      const status = postFormStatus(b?.status)
      // While review is on, an author's new article is a draft or waits for the manager; it never goes live here.
      if (caller.authorId) { const refusal = authorReviewRefusal({ reviewing: await reviewingAuthorPosts(), asked: status, creating: true }); if (refusal) return err(refusal, 403) }
      const itemLinks = b?.itemLinks === undefined ? null : parsePostItemLinks(b.itemLinks)
      let formatInput: Awaited<ReturnType<typeof postFormatInput>>
      try { formatInput = await postFormatInput(db, b || {}, null) } catch (error) { if (error instanceof PostFormatError) return err(error.message, error.status); throw error }
      const row = await db.$transaction(async tx => {
        const ids = await validateCategorySelection(tx, b || {})
        if (itemLinks) await validatePostItemLinks(tx, itemLinks)
        const created = await tx.post.create({
        data: sanitizeContent({
          ...pick({ ...b, status }, postFields(caller.authorId)),
          ...formatInput,
          ...(b?.publishedAt !== undefined ? { publishedAt: publicationDateInput(b.publishedAt) } : {}),
          access: normalizeAccess(b?.access),
          authorId: admin.id,
          categoryId: ids[0] || null,
          categories: { create: ids.map(categoryId => ({ categoryId })) },
        }) as any,
        })
        if (itemLinks) await replacePostItemLinks(tx, created.id, itemLinks)
        await recordRevision({ entityType: 'posts', entityId: created.id, before: null, after: (await postRevisionState(created.id, tx))!, actor: admin, client: tx, strict: true })
        return created
      })
      contentChanged({ type: 'post', id: row.id }, null, row)
      return ok(row)
    }
    if (type === 'postcats' || type === 'productcats') {
      if (type === 'postcats') return ok(await db.$transaction(async tx => tx.postCategory.create({ data: {
        ...pick(b, ['slug', 'name', 'nameEn']), parentId: await validateCategoryParent(tx, b?.parentId),
      } as any }), { isolationLevel: 'Serializable' }))
      const parentId = await productCategoryParent(b?.parentId), attributeGroupId = await productCategoryGroup(b?.attributeGroupId)
      // A category is born in a half of the shop: its parent's, or the one chosen for a root.
      const row = await db.$transaction(async tx => {
        const kind = await kindForCategory(tx, { parentId, asked: b?.kind })
        await assertKindFits(tx, { kind, attributeGroupId })
        return tx.productCategory.create({ data: { ...pick(b, ['slug', 'name', 'nameEn']), ...productCategoryExtras(b), parentId, attributeGroupId, kind } as any })
      }, { isolationLevel: 'Serializable' })
      return ok(row)
    }
    if (type === 'productgroups') return ok(await db.productAttributeGroup.create({ data: productGroupInput(b) }))
    if (type === 'products') {
      const input = await productInput(b)
      const relationships = b?.relationships === undefined ? null : parseProductRelationships(b.relationships)
      if (b?.bundles !== undefined && (!Array.isArray(b.bundles) || b.bundles.length)) throw Error("Save the product before composing bundles")
      const row = await db.$transaction(async tx => {
        const created = await tx.product.create({ data: input.data as any })
        if (b?.categoryIds !== undefined) await replaceExtraCategories(tx, created.id, await validateExtraCategories(tx, b.categoryIds, created.categoryId, created.kind))
        if (input.variants) await saveVariants(tx, created.id, input.variants)
        if (relationships) await replaceProductRelationships(tx, created.id, relationships)
        await capturePublicProductPrices(tx, created.id, new Map())
        await recordRevision({ entityType: 'products', entityId: created.id, before: null, after: (await productRevisionState(created.id, tx))!, actor: admin, client: tx, strict: true })
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
    if (e instanceof CategoryKindError || e instanceof PostReviewError || e instanceof ProductCategoryError) return err(e.message, e.status)
    return err(e?.code === 'P2002' ? 'slug تکراری است' : e?.message || 'create failed', 400)
  }
}

export async function PATCH(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  const perm = PERM_MAP[type]
  if (!perm) return err('unknown type', 404)
  const caller = await callerOf(req, type)
  if (!caller) return err('forbidden', 403)
  const admin = caller.admin
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const model = MODELS[type]()
  // A manager's save that moves a waiting article to published or back to draft is a review decision too.
  let reviewed: { decision: 'approve' | 'return'; authorId: number | null; title: string; publishedAt: Date } | null = null
  let postWriteState: PostWriteState | null = null

  if (type === 'posts') {
    const held = await db.post.findUnique({ where: { id }, select: { id: true, title: true, authorId: true, status: true, updatedAt: true, publishedAt: true, trashedStatus: true, trashedAt: true, trashedById: true, format: true, formatData: true } })
    if (!held || (caller.authorId && held.authorId !== caller.authorId)) return err('not found', 404)
    postWriteState = held
    if (isTrashed(held)) {
      // In the trash nothing is edited. Its author waits for the decision; a manager puts it back (or deletes it).
      if (caller.authorId || b?.restore !== true) return err('این نوشته در سطل زباله است و تا تصمیم مدیر قابل ویرایش نیست', 409)
      const claimed = await db.$transaction(async tx => {
        const changed = await tx.post.updateMany({ where: { id, status: TRASHED }, data: restoreData(held) })
        if (changed.count) await completeTrashCase(tx, 'post', id, admin.id, 'restored')
        return changed
      })
      if (!claimed.count) return err('این نوشته دیگر در سطل زباله نیست', 409)
      const restored = await db.post.findUniqueOrThrow({ where: { id } })
      contentChanged({ type: 'post', id }, { ...restored, status: TRASHED }, restored)
      await auditAdmin({ req, actor: admin, action: 'cms.posts.restore', targetType: 'posts', targetId: id, metadata: { status: restored.status } })
      await tellTrashDecision({ askedById: held.trashedById, askedAt: held.trashedAt, decidedById: admin.id, decision: 'restored', kind: 'post', id, title: held.title, href: '/admin/posts' })
      return ok(restored)
    }
    if (b?.restore === true) return err('این نوشته در سطل زباله نیست', 409)
    // The manager's decision on an article waiting for review (docs/specs/journal-review).
    if (b?.review !== undefined) {
      if (caller.authorId) return err('تصمیم بازبینی با سردبیر است', 403)
      try { return ok(await decidePostReview({ req, actor: admin, id, decision: b.review, note: b.note })) } catch (error) { if (error instanceof PostReviewError) return err(error.message, error.status); throw error }
    }
    // The post's format and its facts, normalised once: the direct save and an author's proposal both take them.
    if (b && typeof b === 'object') {
      try { Object.assign(b, await postFormatInput(db, b, { format: held.format, formatData: held.formatData })) } catch (error) { if (error instanceof PostFormatError) return err(error.message, error.status); throw error }
    }
    let asked: PostFormStatus | undefined
    try { asked = postFormStatus(b?.status) } catch (error) { return err(error instanceof Error ? error.message : 'invalid status', 400) }
    // The manager's decision on an author's proposed edit of a published article.
    if (b?.proposalDecision !== undefined) {
      if (caller.authorId) return err('تصمیم دربارهٔ پیشنهاد با سردبیر است', 403)
      try { return ok(await decidePostProposal({ req, actor: admin, id, decision: b.proposalDecision, expected: b.proposalAt, note: b.note })) } catch (error) { return err(error instanceof Error ? error.message : 'invalid proposal', error instanceof PostReviewError ? error.status : 400) }
    }
    if (caller.authorId) {
      const reviewing = await reviewingAuthorPosts()
      // While review is on a published article changes only through the editor: the author's save is a proposal.
      if (reviewing && held.status === 'PUBLISHED') {
        try { return ok(await proposePostEdit({ req, actor: admin, id, body: b || {}, sanitize: sanitizeContent })) } catch (error) { return err(error instanceof Error ? error.message : 'invalid proposal', error instanceof PostReviewError ? error.status : 400) }
      }
      const refusal = authorReviewRefusal({ reviewing, current: held, asked, creating: false }); if (refusal) return err(refusal, 403)
    }
    else if (held.status === PENDING_REVIEW && (asked === 'PUBLISHED' || asked === 'DRAFT')) reviewed = { decision: asked === 'PUBLISHED' ? 'approve' : 'return', authorId: held.authorId, title: held.title, publishedAt: held.publishedAt }
  }

  if (type === 'posts' && b?.cover !== undefined) {
    try { validateCover(b.cover) } catch { return err('نشانی تصویر معتبر نیست', 400) }
  }

  const data: Record<string, unknown> = {}
  if (type === 'pages') {
    // The HTML of a page written in blocks is a copy generated from its document: the page form may change its title, address and state, not its body.
    if (b?.content !== undefined && (await db.page.findUnique({ where: { id }, select: { editorFormat: true } }))?.editorFormat === 'blocks-v1') return err('this page is written in blocks; its body is edited in the block editor', 409)
    Object.assign(data, sanitizeContent(pick(b, ['slug', 'title', 'titleEn', 'content', 'contentEn', 'status', 'showInNav', 'sortOrder'])))
  }
  if (type === 'posts') {
    if (b?.content !== undefined && (await db.post.findUnique({ where: { id }, select: { editorFormat: true } }))?.editorFormat === 'blocks-v1') return err('this article is written in blocks; its body is edited in the block editor', 409)
    Object.assign(data, sanitizeContent(pick(b, postFields(caller.authorId))))
    if (typeof b?.format === 'string') data.format = b.format
    if (typeof b?.formatData === 'string') data.formatData = b.formatData
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
      // Moving a category, or changing the half of a root, takes everything under it along — and is refused
      // while products or attribute groups of the other half are still in it.
      return ok(await db.$transaction(async tx => {
        const current = await tx.productCategory.findUnique({ where: { id }, select: { parentId: true, kind: true } })
        if (!current) throw new CategoryKindError('not found', 404)
        const parentId = data.parentId !== undefined ? data.parentId as number | null : current.parentId
        const kind = await kindForCategory(tx, { parentId, asked: b?.kind, current: current.kind })
        await assertKindFits(tx, { id, kind, attributeGroupId: data.attributeGroupId as number | null | undefined })
        const row = await tx.productCategory.update({ where: { id }, data: { ...data, kind } })
        if (kind !== current.kind) await cascadeCategoryKind(tx, id, kind)
        return row
      }, { isolationLevel: 'Serializable' }))
    }
    if (type === 'products') {
      const current = await db.product.findUnique({ where: { id }, select: { price: true, currency: true, categoryId: true, specifications: true, faqs: true, gallery: true, kind: true, stock: true, active: true, approval: true, priceMinor: true, name: true, pricingMode: true, fxCurrency: true, fxAmountMinor: true, fxCompareAtMinor: true, fxMemberMinor: true, markupBps: true, markupFixedMinor: true, openAmount: true, openCurrencies: true, openMinMinor: true, openMaxMinor: true } })
      const revisionBefore = await productRevisionState(id)
      if (!current) return err('not found', 404)
      const input = await productInput(b, current)
      const relationships = b?.relationships === undefined ? null : parseProductRelationships(b.relationships, id)
      const bundles = b?.bundles === undefined ? null : parseProductBundles(b.bundles, id)
      const saved = await db.$transaction(async tx => {
        const pricesBefore = await prepareProductPriceCapture(tx, id)
        const row = await tx.product.update({ where: { id }, data: input.data as any })
        // The ticks beside the main category; a main category that was also ticked is not kept twice.
        if (b?.categoryIds !== undefined) await replaceExtraCategories(tx, id, await validateExtraCategories(tx, b.categoryIds, row.categoryId, row.kind))
        else if (row.categoryId) await tx.productCategoryAssignment.deleteMany({ where: { productId: id, categoryId: row.categoryId } })
        if (input.variants) await saveVariants(tx, id, input.variants)
        if (relationships) await replaceProductRelationships(tx, id, relationships)
        if (bundles) await replaceProductBundles(tx, id, bundles)
        await capturePublicProductPrices(tx, id, pricesBefore)
        await recordRevision({ entityType: 'products', entityId: id, before: revisionBefore, after: (await productRevisionState(id, tx))!, actor: admin, client: tx, strict: true })
        return row
      })
      contentChanged({ type: 'product', id }, current, saved)
      return ok(saved)
    }
    if (type === 'posts') {
      const itemLinks = b?.itemLinks === undefined ? null : parsePostItemLinks(b.itemLinks)
      if (b?.publishedAt !== undefined) data.publishedAt = publicationDateInput(b.publishedAt)
      // Approved now: a past publication time (when it was written) becomes now; a future one stays its schedule.
      if (reviewed?.decision === 'approve') data.publishedAt = approvalPublishedAt((data.publishedAt as Date | undefined) ?? reviewed.publishedAt)
      const result = await db.$transaction(async tx => {
        if (!postWriteState || !await claimPostWrite(tx, postWriteState)) throw new PostReviewError('نوشته هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
        const before = await postRevisionState(id, tx)
        if (b?.categoryIds !== undefined || b?.categoryId !== undefined) {
          const ids = await validateCategorySelection(tx, b)
          data.categoryId = ids[0] || null
          data.categories = { deleteMany: {}, create: ids.map(categoryId => ({ categoryId })) }
        }
        if (itemLinks) await validatePostItemLinks(tx, itemLinks, id)
        const row = await tx.post.update({ where: { id }, data })
        if (itemLinks) await replacePostItemLinks(tx, id, itemLinks)
        await recordRevision({ entityType: 'posts', entityId: id, before, after: (await postRevisionState(id, tx))!, actor: admin, client: tx, strict: true })
        if (reviewed) {
          await queueReviewDecision(tx, { authorId: reviewed.authorId, decidedById: admin.id, postId: id, title: row.title, decision: reviewed.decision })
          await auditAdminStrict({ req, actor: admin, action: `cms.posts.review.${reviewed.decision}`, targetType: 'posts', targetId: id }, tx)
        }
        return { before, saved: row }
      })
      contentChanged({ type: 'post', id }, result.before, result.saved)
      return ok(result.saved)
    }
    if (type === 'postcats') return ok(await db.$transaction(async tx => {
      if (b?.parentId !== undefined) data.parentId = await validateCategoryParent(tx, b.parentId, id)
      return tx.postCategory.update({ where: { id }, data })
    }, { isolationLevel: 'Serializable' }))
    if (type === 'pages') {
      const layout = validatePageLayout({ ...await getPageLayout(id), ...b })
      const pageBefore = await db.page.findUnique({ where: { id } })
      const row = await db.$transaction(async tx => {
        const page = await tx.page.update({ where: { id }, data })
        await tx.setting.upsert({ where: { key: `page.layout.${id}` }, create: { key: `page.layout.${id}`, value: JSON.stringify(layout) }, update: { value: JSON.stringify(layout) } })
        return page
      })
      await recordRevision({ entityType: 'pages', entityId: id, before: pageBefore, after: row, actor: admin })
      return ok(row)
    }
    const row = await model.update({ where: { id }, data })
    return ok(row)
  } catch (e: any) {
    if (e instanceof CategoryKindError || e instanceof ProductCategoryError) return err(e.message, e.status)
    if (e instanceof PostReviewError) return err(e.message, e.status)
    return err(e?.code === 'P2002' ? 'slug تکراری است' : e?.message || 'update failed', 400)
  }
}

export async function DELETE(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  const perm = PERM_MAP[type]
  if (!perm) return err('unknown type', 404)
  const caller = await callerOf(req, type)
  if (!caller) return err('forbidden', 403)
  const admin = caller.admin
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const model = MODELS[type]()
  if (type === 'posts' && caller.authorId) {
    // An author does not delete: the article goes to the trash and a manager decides.
    const outcome = await trashOwnPost(id, caller.authorId)
    if (outcome !== 'trashed') return outcome === 'missing' ? err('not found', 404) : err('این نوشته پیش‌تر به سطل زباله رفته است', 409)
    await auditAdmin({ req, actor: admin, action: 'cms.posts.trash', targetType: 'posts', targetId: id })
    return ok({ trashed: true })
  }
  try {
    if (type === 'postcats') {
      await db.$transaction(async tx => {
        await tx.post.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
        await tx.postCategory.delete({ where: { id } })
      })
      return ok({ deleted: true })
    }
    if (type === 'productgroups' && await db.productCategory.count({ where: { attributeGroupId: id } })) return err('Group is assigned to a category', 409)
    const gone = type === 'posts' ? await db.$transaction(async tx => {
      const deleted = await tx.post.delete({ where: { id } })
      if (deleted.status === TRASHED) await completeTrashCase(tx, 'post', id, admin.id, 'deleted')
      return deleted
    }) : await model.delete({ where: { id } })
    // A manager deleting an article that waited in the trash is the answer to its author's request.
    if (type === 'posts' && gone.status === TRASHED) await tellTrashDecision({ askedById: gone.trashedById, askedAt: gone.trashedAt, decidedById: admin.id, decision: 'deleted', kind: 'post', id, title: gone.title, href: '/admin/posts' })
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

/** Sends one of an author's own articles to the trash: claimed on the state it was read in, so two requests cannot both win. */
async function trashOwnPost(id: number, authorId: number): Promise<'trashed' | 'missing' | 'already'> {
  const row = await db.post.findFirst({ where: { id, authorId } })
  if (!row) return 'missing'
  if (isTrashed(row)) return 'already'
  const claimed = await db.$transaction(async tx => {
    const changed = await tx.post.updateMany({ where: { id, authorId, status: row.status }, data: trashData(row, authorId) })
    if (changed.count) await reopenTrashCase(tx, 'post', id)
    return changed
  })
  if (!claimed.count) return 'already'
  contentChanged({ type: 'post', id }, row, { ...row, status: TRASHED })
  return 'trashed'
}

/** Status and deletion batches for editorial content. The browser sends at most 100 IDs at a time. */
export async function BULK(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || ''
  if (type !== 'posts' && type !== 'pages') return err('unknown type', 404)
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const caller = await callerOf(req, type)
  if (!caller) return err('forbidden', 403)
  const admin = caller.admin
  const own = type === 'posts' && caller.authorId ? { authorId: caller.authorId } : {}
  let input: Awaited<ReturnType<typeof readBulkInput>>
  try { input = await readBulkInput(req) } catch (error) { return err(error instanceof Error ? error.message : 'invalid batch', 400) }
  const { ids, action } = input
  const failed: { id: number; reason: string }[] = []
  const succeeded: number[] = []
  const paths: string[] = []

  if (action !== 'delete') {
    const status = action === 'publish' ? 'PUBLISHED' : 'DRAFT'
    if (type === 'posts') {
      // Someone else's article is not there for an author; an article in the trash changes only by a manager's decision.
      const found = await db.post.findMany({ where: { id: { in: ids }, ...own }, select: { id: true, slug: true, title: true, status: true, updatedAt: true, publishedAt: true, authorId: true } })
      // While review is on, an author's batch neither publishes nor takes a published article off the site.
      const reviewing = caller.authorId ? await reviewingAuthorPosts() : false
      const held = (row: (typeof found)[number]) => (reviewing ? authorReviewRefusal({ reviewing, current: row, asked: status, creating: false }) : null)
      const rows = found.filter((row) => !isTrashed(row) && !held(row))
      const known = new Set(found.map((row) => row.id))
      for (const id of ids) if (!known.has(id)) failed.push({ id, reason: 'not found' })
      for (const row of found) if (isTrashed(row)) failed.push({ id: row.id, reason: 'in the trash' }); else if (held(row)) failed.push({ id: row.id, reason: held(row)! })
      if (rows.length) {
        const result = await changePostStates({ rows, status, actor: admin, req })
        failed.push(...result.failed)
        for (const { before: row, after } of result.changed) {
          succeeded.push(row.id)
          contentChanged({ type: 'post', id: row.id }, row, after)
          if (action === 'publish') { const path = publicPathFor(type, after); if (path) paths.push(path) }
        }
      }
    } else {
      const rows = await db.page.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } })
      const known = new Set(rows.map((row) => row.id))
      for (const id of ids) if (!known.has(id)) failed.push({ id, reason: 'not found' })
      if (rows.length) {
        await db.page.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status } })
        for (const row of rows) {
          succeeded.push(row.id)
          if (action === 'publish') { const path = publicPathFor(type, { ...row, status }); if (path) paths.push(path) }
        }
      }
    }
  } else {
    for (const id of ids) {
      try {
        if (type === 'posts' && caller.authorId) {
          const outcome = await trashOwnPost(id, caller.authorId)
          if (outcome !== 'trashed') { failed.push({ id, reason: outcome === 'missing' ? 'not found' : 'already in the trash' }); continue }
        } else if (type === 'posts') {
          const row = await db.$transaction(async tx => {
            const deleted = await tx.post.delete({ where: { id } })
            if (deleted.status === TRASHED) await completeTrashCase(tx, 'post', id, admin.id, 'deleted')
            return deleted
          })
          contentChanged({ type: 'post', id }, row, null)
          if (row.status === TRASHED) await tellTrashDecision({ askedById: row.trashedById, askedAt: row.trashedAt, decidedById: admin.id, decision: 'deleted', kind: 'post', id, title: row.title, href: '/admin/posts' })
        } else {
          await db.$transaction(async (tx) => {
            await tx.page.delete({ where: { id } })
            await tx.setting.deleteMany({ where: { key: { in: [`page.layout.${id}`, `page.builder.${id}`] } } })
          })
        }
        succeeded.push(id)
      } catch {
        failed.push({ id, reason: 'cannot delete (in use or missing)' })
      }
    }
  }
  if (paths.length) queueIndexNow(paths)
  await auditAdmin({ req, actor: admin, action: `cms.${type}.bulk.${action === 'delete' && caller.authorId ? 'trash' : action}`, targetType: type, metadata: { succeeded, failed } })
  return ok({ changed: succeeded.length, failed })
}
