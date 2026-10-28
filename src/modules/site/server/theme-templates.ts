import { db } from '@/platform/database/prisma'
import { categoryDescendants } from '@/modules/site/domain/categories'
import {
  newTemplateId, parseTemplateIndex, pickTemplate, placementConflict, validateTemplateMeta,
  type RenderContext, type ThemeTemplateMeta, type ThemeTemplateType,
} from '@/modules/site/domain/theme-templates'
import { emptyDoc, parseBuilderDoc, type BuilderDoc } from '@/modules/site/domain/builder'
import {
  builderKey, clearBuilderDraft, getBuilderDoc, getEntityTemplateId, listUserTemplates, resolvePostTemplateDoc, saveBuilderDoc,
} from '@/modules/site/server/builder'
import { POST_TEMPLATES, PRODUCT_TEMPLATES } from '@/modules/site/domain/builder-templates'
import { isModuleEnabled } from '@/extensions/server/modules'
import { getJournalSettings } from '@/modules/journal/server/admin'
import { POST_STYLE_BASES, POST_STYLE_BASE_KEYS, builtinStyleId } from '@/modules/journal/domain/post-styles'

export const THEME_INDEX_KEY = 'theme.templates.v1'
const MAX_TEMPLATES = 200

export async function listThemeTemplates(): Promise<ThemeTemplateMeta[]> {
  const row = await db.setting.findUnique({ where: { key: THEME_INDEX_KEY } }).catch(() => null)
  return parseTemplateIndex(row?.value)
}

async function writeIndex(list: ThemeTemplateMeta[]) {
  const value = JSON.stringify(list)
  await db.setting.upsert({ where: { key: THEME_INDEX_KEY }, create: { key: THEME_INDEX_KEY, value }, update: { value } })
}

export async function getThemeTemplate(id: string): Promise<ThemeTemplateMeta | null> {
  return (await listThemeTemplates()).find((entry) => entry.id === id) || null
}

/** `actor`: the staff member creating it, named on the design's first version. */
export async function createThemeTemplate(input: { type: ThemeTemplateType; name: string; nameEn?: string; doc?: BuilderDoc | null; conditions?: unknown; placement?: unknown }, actor: { id: number; email: string } | null = null): Promise<ThemeTemplateMeta> {
  const list = await listThemeTemplates()
  if (list.length >= MAX_TEMPLATES) throw new Error('Template limit reached')
  const meta = validateTemplateMeta({
    id: newTemplateId(input.type),
    name: input.name,
    nameEn: input.nameEn || '',
    status: 'draft',
    conditions: input.conditions ?? defaultConditions(input.type),
    placement: input.placement,
  })
  const doc = input.doc ? parseBuilderDoc(input.doc) : emptyDoc()
  await saveBuilderDoc(meta.id, doc, actor)
  await writeIndex([...list, meta])
  return meta
}

export function defaultConditions(type: ThemeTemplateType) {
  if (type === 'single-post') return [{ mode: 'include', target: 'posts' }]
  if (type === 'single-product') return [{ mode: 'include', target: 'products' }]
  if (type === 'header' || type === 'footer') return [{ mode: 'include', target: 'all' }]
  return []
}

export async function updateThemeTemplate(id: string, patch: Record<string, unknown>): Promise<ThemeTemplateMeta> {
  const list = await listThemeTemplates()
  const existing = list.find((entry) => entry.id === id)
  if (!existing) throw new Error('Template not found')
  const meta = validateTemplateMeta({ ...patch, id: existing.id }, existing)
  const conflict = placementConflict(list, meta)
  if (conflict) throw new Error(`این جایگاه در اختیار قالب «${conflict.name}» است؛ ابتدا آن را غیرفعال کنید / Placement already used by “${conflict.nameEn || conflict.name}”`)
  await writeIndex(list.map((entry) => (entry.id === id ? meta : entry)))
  return meta
}

export async function duplicateThemeTemplate(id: string, actor: { id: number; email: string } | null = null): Promise<ThemeTemplateMeta> {
  const source = await getThemeTemplate(id)
  if (!source) throw new Error('Template not found')
  const doc = await getBuilderDoc(id)
  return createThemeTemplate({
    type: source.type,
    name: `${source.name} (کپی)`.slice(0, 80),
    nameEn: source.nameEn ? `${source.nameEn} (copy)`.slice(0, 80) : '',
    doc,
    conditions: source.conditions,
    placement: source.type === 'page' ? { ...source.placement, kind: 'none' } : undefined,
  }, actor)
}

export async function deleteThemeTemplate(id: string): Promise<boolean> {
  const list = await listThemeTemplates()
  if (!list.some((entry) => entry.id === id)) return false
  await writeIndex(list.filter((entry) => entry.id !== id))
  await db.setting.delete({ where: { key: builderKey(id) } }).catch(() => undefined)
  await clearBuilderDraft(id)
  return true
}

// ------------------------------------------------------------ resolution

async function postCategoryAncestors(ids: number[]): Promise<number[]> {
  if (!ids.length) return []
  const nodes = await db.postCategory.findMany({ select: { id: true, parentId: true, name: true } }).catch(() => [])
  const out = new Set<number>()
  for (const node of nodes) {
    // node is an ancestor (or self) of a post category when that category is among its descendants
    if (categoryDescendants(nodes, node.id).some((descendant) => ids.includes(descendant))) out.add(node.id)
  }
  return [...out]
}

async function productCategoryAncestors(id: number | null | undefined): Promise<number[]> {
  if (!id) return []
  const nodes = await db.productCategory.findMany({ select: { id: true, parentId: true, name: true } }).catch(() => [])
  return nodes.filter((node) => categoryDescendants(nodes, node.id).includes(id)).map((node) => node.id)
}

export async function postContext(categoryIds: number[]): Promise<RenderContext> {
  return { route: 'post', postCategoryIds: await postCategoryAncestors(categoryIds) }
}

export async function productContext(kind: string, categoryId: number | null | undefined): Promise<RenderContext> {
  return { route: 'product', productKind: kind, productCategoryIds: await productCategoryAncestors(categoryId) }
}

export type ResolvedTemplate = { meta: ThemeTemplateMeta; doc: BuilderDoc }

async function withDoc(meta: ThemeTemplateMeta | null): Promise<ResolvedTemplate | null> {
  if (!meta) return null
  const doc = await getBuilderDoc(meta.id)
  // An empty single template still applies (its slots are filled in automatically);
  // empty headers/footers/pages are ignored so the site never loses its chrome.
  if (!doc) return meta.type === 'single-post' || meta.type === 'single-product' ? { meta, doc: emptyDoc() } : null
  return { meta, doc }
}

/** Header/footer/single template for a context. `choice` is a page-level override. */
export async function resolveThemeTemplate(type: ThemeTemplateType, ctx: RenderContext, choice?: string): Promise<ResolvedTemplate | null> {
  if (!await isModuleEnabled('page-builder')) return null
  const list = await listThemeTemplates()
  if (choice && choice !== 'default' && choice !== 'none') {
    const chosen = list.find((entry) => entry.id === choice && entry.type === type)
    if (chosen) return withDoc(chosen)
  }
  return withDoc(pickTemplate(list, type, ctx))
}

/** Published page template placed at home / blog / shop / section:<slug>. */
export async function resolvePlacedPage(kind: 'home' | 'blog' | 'shop' | 'section', slug = ''): Promise<ResolvedTemplate | null> {
  if (!await isModuleEnabled('page-builder')) return null
  const list = await listThemeTemplates()
  const meta = list.find((entry) => entry.type === 'page' && entry.status === 'published' && entry.placement.kind === kind && (kind !== 'section' || entry.placement.slug === slug)) || null
  return withDoc(meta)
}

/** Published sections for sitemap / menus. */
export async function listPublishedSections(): Promise<ThemeTemplateMeta[]> {
  if (!await isModuleEnabled('page-builder')) return []
  return (await listThemeTemplates()).filter((entry) => entry.type === 'page' && entry.status === 'published' && entry.placement.kind === 'section')
}

export async function getPostCategoryOptions() {
  return db.postCategory.findMany({ select: { id: true, name: true, nameEn: true, parentId: true, slug: true }, orderBy: { name: 'asc' } }).catch(() => [])
}

export async function getProductCategoryOptions() {
  return db.productCategory.findMany({ select: { id: true, name: true, nameEn: true, parentId: true, slug: true }, orderBy: { name: 'asc' } }).catch(() => [])
}

// ------------------------------------------------------------ per-entry layouts

export type LayoutOption = { id: string; fa: string; en: string; group: 'style' | 'mystyle' | 'theme' | 'builtin' | 'mine'; status?: 'draft' | 'published'; base?: string; accent?: string; align?: string; sidebar?: boolean; desc?: string }

/** Layout choices offered in the post / product editor; an article also has the magazine's designed and own styles. */
export async function listLayoutOptions(entity: 'post' | 'product'): Promise<LayoutOption[]> {
  const [themes, mine, journal] = await Promise.all([listThemeTemplates(), entity === 'post' ? listUserTemplates() : Promise.resolve([]), entity === 'post' ? getJournalSettings().catch(() => null) : Promise.resolve(null)])
  const styles: LayoutOption[] = entity === 'post' ? [
    ...POST_STYLE_BASE_KEYS.map((base): LayoutOption => ({ id: builtinStyleId(base), fa: POST_STYLE_BASES[base].fa, en: POST_STYLE_BASES[base].en, group: 'style', base })),
    ...(journal?.postStyle.custom || []).map((style): LayoutOption => ({ id: style.id, fa: style.name, en: style.name, group: 'mystyle', base: style.base, accent: style.accent, align: style.align })),
  ] : []
  const type = entity === 'post' ? 'single-post' : 'single-product'
  const builtin = entity === 'post' ? POST_TEMPLATES : PRODUCT_TEMPLATES
  // The designed base of a style a template wears (an own style draws as its base).
  const baseOf = (id?: string) => (id?.startsWith('psc-') ? journal?.postStyle.custom.find((style) => style.id === id)?.base : id?.replace(/^ps-/, '')) || undefined
  // The owner's builder templates, with the style each wears (for the drawings beside them).
  const themeOptions = await Promise.all(themes.filter((entry) => entry.type === type).map(async (entry): Promise<LayoutOption> => {
    const doc = entity === 'post' ? await getBuilderDoc(entry.id).catch(() => null) : null
    const sidebar = !!doc?.sections.some((section) => section.columns.length > 1 && section.columns.some((column) => column.widgets.some((widget) => widget.type === 'content')))
    return { id: entry.id, fa: entry.name, en: entry.nameEn || entry.name, group: 'theme', status: entry.status, base: baseOf(doc?.layout?.postStyle), sidebar }
  }))
  return [
    ...styles,
    ...themeOptions,
    // A built-in article template carries the style its header wears and whether the article sits beside a column (drawings).
    ...builtin.map((entry): LayoutOption => ({ id: entry.id, fa: entry.fa, en: entry.en, group: 'builtin', desc: entry.descFa, base: baseOf(entry.doc.layout?.postStyle), sidebar: entry.doc.sections.some((section) => section.columns.length > 1 && section.columns.some((column) => column.widgets.some((widget) => widget.type === 'content'))) })),
    ...mine.filter((entry) => entry.kind === 'post').map((entry): LayoutOption => ({ id: entry.id, fa: entry.name, en: entry.nameEn || entry.name, group: 'mine' })),
  ]
}

/** Document for an explicitly chosen layout id (theme template, built-in or saved post template). */
export async function layoutDocById(entity: 'post' | 'product', id: string): Promise<BuilderDoc | null> {
  if (!id) return null
  if (id.startsWith('tpl-')) {
    const meta = await getThemeTemplate(id)
    if (!meta || meta.type !== (entity === 'post' ? 'single-post' : 'single-product')) return null
    return (await getBuilderDoc(id)) || emptyDoc()
  }
  if (entity === 'product') return PRODUCT_TEMPLATES.find((entry) => entry.id === id)?.doc || null
  return resolvePostTemplateDoc(id)
}

/**
 * Layout of a single post/product: manual choice first, then the most specific
 * published theme template whose display rules match, else none (default layout).
 * `previewDoc` replaces the chosen theme template while it is edited.
 */
export async function resolveEntryLayout(entity: 'post' | 'product', entryId: number, ctx: RenderContext, previewTemplate?: { id: string; doc: BuilderDoc | null }): Promise<BuilderDoc | null> {
  if (previewTemplate) return previewTemplate.doc
  if (!await isModuleEnabled('page-builder')) return null
  const manual = await getEntityTemplateId(entity, entryId)
  if (manual) {
    const doc = await layoutDocById(entity, manual)
    if (doc) return doc
  }
  const resolved = await resolveThemeTemplate(entity === 'post' ? 'single-post' : 'single-product', ctx)
  return resolved?.doc || null
}
