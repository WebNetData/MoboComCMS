/**
 * Theme builder (Elementor Pro "Theme Builder" style).
 *
 * A theme template is a builder document with a type and display rules:
 *  - header / footer   → replace the site header or footer where the rules match
 *  - page              → a free page; can be placed as the home page, the journal
 *                        landing, the shop landing or a section at a short URL (/gaming)
 *  - single-post       → layout for article pages (article parts are "slot" blocks)
 *  - single-product    → layout for product pages (gallery, buy box … are slot blocks)
 *
 * The builder document itself is stored like any other builder page under the
 * page id `tpl-<type>-<suffix>`, so the visual editor edits templates unchanged.
 */

import { isBuilderSurface, surfaceCondition, currentSurfaceScore, type BuilderSurface } from './builder-surfaces'

export const THEME_TEMPLATE_TYPES = ['header', 'footer', 'page', 'single-post', 'single-product', 'surface'] as const
export type ThemeTemplateType = typeof THEME_TEMPLATE_TYPES[number]

/** Short id fragment used in page ids: tpl-<code>-<suffix>. */
export const TYPE_CODE: Record<ThemeTemplateType, string> = {
  surface: 'surface',
  header: 'header',
  footer: 'footer',
  page: 'page',
  'single-post': 'post',
  'single-product': 'product',
}
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([type, code]) => [code, type])) as Record<string, ThemeTemplateType>

export const THEME_TYPE_LABELS: Record<ThemeTemplateType, { fa: string; en: string; descFa: string; descEn: string }> = {
  surface: { fa: 'قالب بخش و داشبورد', en: 'Content & dashboard', descFa: 'طراحی جزئیات فیلم، موزیک، بازی و نرم‌افزار یا پیشخوان کاربر؛ بدون تغییر داده و دسترسی.', descEn: 'Design section entries or member home using owner-rendered content.' },
  header: { fa: 'هدر', en: 'Header', descFa: 'سربرگ اختصاصی سایت؛ با شرط نمایش روی همه یا بخشی از صفحات.', descEn: 'Custom site header, shown where its rules match.' },
  footer: { fa: 'فوتر', en: 'Footer', descFa: 'پابرگ اختصاصی سایت؛ با شرط نمایش.', descEn: 'Custom site footer, shown where its rules match.' },
  page: { fa: 'صفحه', en: 'Page', descFa: 'صفحهٔ آزاد: صفحه اصلی، صفحه اصلی مجله، فروشگاه یا یک بخش با آدرس کوتاه (مثل ‎/gaming).', descEn: 'Free page: home, journal landing, shop landing or a section at a short URL (e.g. /gaming).' },
  'single-post': { fa: 'قالب پست', en: 'Single post', descFa: 'چیدمان صفحهٔ مقاله؛ مثلاً برای مجله، فیلم، موزیک یا گیمینگ.', descEn: 'Article page layout — e.g. for news, film, music or gaming.' },
  'single-product': { fa: 'قالب محصول', en: 'Single product', descFa: 'چیدمان صفحهٔ محصول؛ مجزا برای محصولات مجازی، فیزیکی یا هر دسته.', descEn: 'Product page layout — per digital/physical kind or category.' },
}

export const TEMPLATE_PAGE_ID = /^tpl-(header|footer|page|post|product|surface)-[a-z0-9]{4,24}$/

export function templateTypeOf(pageId: string): ThemeTemplateType | null {
  const match = TEMPLATE_PAGE_ID.exec(pageId)
  return match ? CODE_TYPE[match[1]] || null : null
}

export function newTemplateId(type: ThemeTemplateType): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toLowerCase()
  return `tpl-${TYPE_CODE[type]}-${suffix}`
}

// ---------------------------------------------------------------- conditions

/**
 * Rule targets:
 *  all · home · blog · shop · pages · sections · section:<slug>
 *  posts · post-category:<id>
 *  products · product-kind:VIRTUAL|PHYSICAL · product-category:<id>
 */
export type ConditionRule = { mode: 'include' | 'exclude'; target: string }

const TARGET = /^(all|home|blog|shop|pages|sections|posts|products|section:[a-z0-9-]{1,40}|post-category:\d{1,9}|product-category:\d{1,9}|product-kind:(VIRTUAL|PHYSICAL)|post-id:[1-9]\d{0,8}|product-id:[1-9]\d{0,8})$/

/** Which targets make sense for which template type. */
export function targetAllowed(type: ThemeTemplateType, target: string): boolean {
  if (type === 'surface') return surfaceCondition(target)
  if (!TARGET.test(target)) return false
  if (type === 'single-post') return target === 'all' || target === 'posts' || target.startsWith('post-category:') || target.startsWith('post-id:')
  if (type === 'single-product') return target === 'all' || target === 'products' || target.startsWith('product-category:') || target.startsWith('product-kind:') || target.startsWith('product-id:')
  if (type === 'page') return false
  return true
}

/** What is being rendered — used to pick header/footer/single templates. */
export type RenderContext = {
  route: 'home' | 'blog' | 'shop' | 'page' | 'section' | 'post' | 'product' | 'surface' | 'other'
  surface?: BuilderSurface
  entryId?: number
  postId?: number
  productId?: number
  sectionSlug?: string
  /** Post categories of the current post, including ancestors. */
  postCategoryIds?: number[]
  productKind?: string
  /** Product category of the current product, including ancestors. */
  productCategoryIds?: number[]
}

/** 0 = no match; higher = more specific. */
export function targetScore(target: string, ctx: RenderContext): number {
  if (ctx.route === 'surface') return currentSurfaceScore(target, ctx.entryId)
  if (target.startsWith('post-id:')) return ctx.route === 'post' && ctx.postId === Number(target.slice(8)) ? 7 : 0
  if (target.startsWith('product-id:')) return ctx.route === 'product' && ctx.productId === Number(target.slice(11)) ? 7 : 0
  if (target === 'all') return 1
  if (target === 'home') return ctx.route === 'home' ? 5 : 0
  if (target === 'blog') return ctx.route === 'blog' ? 5 : 0
  if (target === 'shop') return ctx.route === 'shop' ? 5 : 0
  if (target === 'pages') return ctx.route === 'page' ? 3 : 0
  if (target === 'sections') return ctx.route === 'section' ? 3 : 0
  if (target === 'posts') return ctx.route === 'post' ? 2 : 0
  if (target === 'products') return ctx.route === 'product' ? 2 : 0
  const [kind, value] = target.split(':')
  if (kind === 'section') return ctx.route === 'section' && ctx.sectionSlug === value ? 6 : 0
  if (kind === 'post-category') return ctx.route === 'post' && (ctx.postCategoryIds || []).includes(Number(value)) ? 4 : 0
  if (kind === 'product-category') return ctx.route === 'product' && (ctx.productCategoryIds || []).includes(Number(value)) ? 4 : 0
  if (kind === 'product-kind') return ctx.route === 'product' && ctx.productKind === value ? 3 : 0
  return 0
}

/** Score of a whole rule set: best include score, or 0 when any exclude matches. */
export function conditionsScore(rules: ConditionRule[], ctx: RenderContext): number {
  let best = 0
  for (const rule of rules) {
    const score = targetScore(rule.target, ctx)
    if (!score) continue
    if (rule.mode === 'exclude') return 0
    best = Math.max(best, score)
  }
  return best
}

// ---------------------------------------------------------------- placement

export const PLACEMENTS = ['none', 'home', 'blog', 'shop', 'section'] as const
export type PlacementKind = typeof PLACEMENTS[number]
export type Placement = { kind: PlacementKind; slug: string; postCategoryId: number | null; productCategoryId: number | null }

/** Short URLs that already belong to the application. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'blog', 'p', 'products', 'plans', 'login', 'register', 'dashboard', 'miniapp', 'checkout', 'invoice',
  'payment', 'reseller', 's', 'telegram', 'trial', 'forms', 'builder-preview', 'sitemap', 'robots', 'favicon', '_next',
  'images', 'fonts', 'uploads', 'static', 'public', 'media', 'sub', 'auth', 'shop', 'home', 'index', 'search',
  'vip', 'music', 'cinema', 'games', 'movies', 'series', 'software', 'forum', 'compare', 'favorites', 'copyright', 'offline',
  'dl', 'files', 'forwarder', 'watch', 'track',
])

/**
 * Built-in module sections whose landing page a published page template may
 * replace (placement “section” with this slug). Their sub-pages stay as they are.
 */
export const BUILTIN_SECTIONS = new Set(['music', 'cinema', 'games', 'software', 'forum', 'vip'])

export const SECTION_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

// ---------------------------------------------------------------- index entry

export type ThemeTemplateMeta = {
  generation?: 1
  surface?: BuilderSurface
  solution?: string
  id: string
  type: ThemeTemplateType
  name: string
  nameEn: string
  status: 'draft' | 'published'
  conditions: ConditionRule[]
  /** Only for type `page`. */
  placement: Placement
  /** Higher wins when two templates are equally specific. */
  priority: number
  /** Header only: keep the header pinned while scrolling. */
  sticky: boolean
  createdAt: string
  updatedAt: string
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const intOrNull = (value: unknown) => {
  const n = Number(value)
  return value === null || value === '' || value === undefined || !Number.isSafeInteger(n) || n <= 0 ? null : n
}

export function emptyPlacement(): Placement {
  return { kind: 'none', slug: '', postCategoryId: null, productCategoryId: null }
}

export function validatePlacement(input: unknown): Placement {
  const p = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const kind = (PLACEMENTS as readonly string[]).includes(String(p.kind)) ? (p.kind as PlacementKind) : 'none'
  if (kind !== 'section') return { ...emptyPlacement(), kind }
  const slug = text(p.slug, 40).toLowerCase()
  if (!SECTION_SLUG.test(slug)) throw new Error('آدرس بخش فقط حروف انگلیسی کوچک، عدد و خط تیره (مثل gaming) / Section URL: lowercase letters, digits and dashes')
  if (RESERVED_SLUGS.has(slug) && !BUILTIN_SECTIONS.has(slug)) throw new Error(`آدرس «${slug}» رزرو شده است / “${slug}” is reserved`)
  return { kind, slug, postCategoryId: intOrNull(p.postCategoryId), productCategoryId: intOrNull(p.productCategoryId) }
}

export function validateConditions(type: ThemeTemplateType, input: unknown): ConditionRule[] {
  if (type === 'page') return []
  if (!Array.isArray(input)) return []
  if (input.length > 40) throw new Error('Too many display rules')
  const seen = new Set<string>()
  const rules: ConditionRule[] = []
  for (const raw of input) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const target = text(r.target, 60)
    if (!targetAllowed(type, target)) throw new Error(`Invalid display rule: ${target || '—'}`)
    const mode = r.mode === 'exclude' ? 'exclude' : 'include'
    const key = `${mode}:${target}`
    if (seen.has(key)) continue
    seen.add(key)
    rules.push({ mode, target })
  }
  return rules
}

export function validateTemplateMeta(input: unknown, existing?: ThemeTemplateMeta): ThemeTemplateMeta {
  const m = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const id = existing?.id || text(m.id, 64)
  const type = existing?.type || templateTypeOf(id)
  if (!type || !TEMPLATE_PAGE_ID.test(id)) throw new Error('Invalid template id')
  const surface = existing?.surface ?? m.surface
  if (type === 'surface' && !isBuilderSurface(surface)) throw new Error('نوع بخش طراحی معتبر نیست')
  if (type === 'surface' && (surface === 'dashboard' || surface === 'account') && validateConditions(type, m.conditions ?? existing?.conditions ?? []).some(rule => rule.target !== 'all')) throw new Error('قالب حساب کاربری فقط شرط عمومی دارد')
  const now = new Date().toISOString()
  const name = text(m.name ?? existing?.name, 80)
  if (!name) throw new Error('نام قالب لازم است / Template name is required')
  return {
    id,
    type,
    ...(type === 'surface' ? { surface: surface as BuilderSurface } : {}),
    ...((existing ? existing.generation : m.generation) === 1 ? { generation: 1 as const } : {}),
    name,
    nameEn: text(m.nameEn ?? existing?.nameEn, 80),
    ...(['hosting', 'journal', 'store', 'music', 'cinema', 'software', 'games'].includes(String(m.solution ?? existing?.solution)) ? { solution: String(m.solution ?? existing?.solution) } : {}),
    status: (m.status ?? existing?.status) === 'published' ? 'published' : 'draft',
    conditions: validateConditions(type, m.conditions ?? existing?.conditions ?? []),
    placement: type === 'page' ? validatePlacement(m.placement ?? existing?.placement) : emptyPlacement(),
    priority: Math.max(-100, Math.min(100, Math.round(Number(m.priority ?? existing?.priority ?? 0)) || 0)),
    sticky: type === 'header' ? Boolean(m.sticky ?? existing?.sticky ?? false) : false,
    createdAt: existing?.createdAt || text(m.createdAt, 40) || now,
    updatedAt: now,
  }
}

/** Parse a stored index row (never throws; broken rows are dropped). */
export function parseTemplateIndex(raw: string | null | undefined): ThemeTemplateMeta[] {
  let parsed: unknown
  try { parsed = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const out: ThemeTemplateMeta[] = []
  const ids = new Set<string>()
  for (const row of parsed) {
    try {
      const meta = validateTemplateMeta(row)
      if (ids.has(meta.id)) continue
      ids.add(meta.id)
      out.push({ ...meta, createdAt: text((row as Record<string, unknown>).createdAt, 40) || meta.createdAt, updatedAt: text((row as Record<string, unknown>).updatedAt, 40) || meta.updatedAt })
    } catch { /* skip */ }
  }
  return out
}

/** A placement must be unique among published page templates. */
export function placementConflict(list: ThemeTemplateMeta[], meta: ThemeTemplateMeta): ThemeTemplateMeta | null {
  if (meta.type !== 'page' || meta.status !== 'published' || meta.placement.kind === 'none') return null
  return list.find((other) => other.id !== meta.id && other.type === 'page' && other.status === 'published'
    && other.placement.kind === meta.placement.kind
    && (meta.placement.kind !== 'section' || other.placement.slug === meta.placement.slug)) || null
}

/** Best published template of a type for a render context (most specific, then priority, then newest). */
export function pickTemplate(list: ThemeTemplateMeta[], type: ThemeTemplateType, ctx: RenderContext): ThemeTemplateMeta | null {
  let best: { meta: ThemeTemplateMeta; score: number } | null = null
  for (const meta of list) {
    if (meta.type !== type || meta.status !== 'published') continue
    const score = conditionsScore(meta.conditions, ctx)
    if (!score) continue
    if (!best || score > best.score || (score === best.score && (meta.priority > best.meta.priority || (meta.priority === best.meta.priority && meta.updatedAt > best.meta.updatedAt)))) {
      best = { meta, score }
    }
  }
  return best?.meta || null
}

export function describeTarget(target: string, fa: boolean, names: { post: Map<number, string>; product: Map<number, string> }): string {
  const L = (en: string, persian: string) => (fa ? persian : en)
  switch (target) {
    case 'all': return L('Entire site', 'کل سایت')
    case 'home': return L('Home page', 'صفحه اصلی')
    case 'blog': return L('Journal landing', 'صفحه اصلی مجله')
    case 'shop': return L('Shop landing', 'صفحه فروشگاه')
    case 'pages': return L('All CMS pages', 'همه صفحه‌های محتوایی')
    case 'sections': return L('All sections', 'همه بخش‌ها')
    case 'posts': return L('All posts', 'همه پست‌ها')
    case 'products': return L('All products', 'همه محصولات')
  }
  const [kind, value] = target.split(':')
  if (kind === 'entry') return `${L('This section entry', 'مورد همین بخش')} #${value}`
  if (kind === 'post-id') return `${L('Post', 'نوشته')} #${value}`
  if (kind === 'product-id') return `${L('Product', 'محصول')} #${value}`
  if (kind === 'section') return `${L('Section', 'بخش')} /${value}`
  if (kind === 'post-category') return `${L('Post category', 'دستهٔ پست')}: ${names.post.get(Number(value)) || `#${value}`}`
  if (kind === 'product-category') return `${L('Product category', 'دستهٔ محصول')}: ${names.product.get(Number(value)) || `#${value}`}`
  if (kind === 'product-kind') return value === 'PHYSICAL' ? L('Physical products', 'محصولات فیزیکی') : L('Digital products', 'محصولات مجازی')
  return target
}
