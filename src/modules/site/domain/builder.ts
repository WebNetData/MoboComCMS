import { validatePageBlocks, type PageBlock } from './page-blocks'

export const BUILDER_VERSION = 2

export const WIDGET_TYPES = [
  'heading', 'text', 'image', 'button', 'divider', 'spacer', 'video', 'stats', 'list', 'faq',
  'html', 'template', 'hero', 'cta', 'plans', 'posts', 'products', 'network', 'form', 'nav',
  'post-header', 'post-cover', 'content', 'post-footer',
  'product-hero', 'product-gallery', 'product-info', 'product-purchase', 'product-usp', 'product-tabs',
  'site-header', 'site-footer',
  'media', 'vip-cta',
] as const
export type WidgetType = typeof WIDGET_TYPES[number]

/** Live feeds the `media` widget can show (each belongs to the module named by its prefix). */
export const MEDIA_SOURCES = ['music-new', 'music-top', 'music-albums', 'cinema-movies', 'cinema-series', 'cinema-top', 'cinema-dubbed', 'cinema-vip', 'games-new', 'games-top'] as const
export type MediaSource = typeof MEDIA_SOURCES[number]

/** Widgets that only render on single-post pages (template slots). */
export const POST_SLOT_TYPES = ['post-header', 'post-cover', 'content', 'post-footer'] as const
/** Widgets that only render on single-product pages (template slots). */
export const PRODUCT_SLOT_TYPES = ['product-hero', 'product-gallery', 'product-info', 'product-purchase', 'product-usp', 'product-tabs'] as const
export const SLOT_WIDGET_TYPES = [...POST_SLOT_TYPES, ...PRODUCT_SLOT_TYPES] as const
export type SlotWidgetType = typeof SLOT_WIDGET_TYPES[number]

export type WidgetStyle = {
  align: 'start' | 'center' | 'end'
  color: string
  width: number
  paddingY: number
  tone: 'none' | 'dark' | 'light' | 'accent'
  radius: number
  /** Responsive visibility: hide the block on phones or on desktop. */
  hideOn: VisibilityRule
}
export type VisibilityRule = 'none' | 'mobile' | 'desktop'
export const VISIBILITY_RULES = ['none', 'mobile', 'desktop'] as const
export const SECTION_WIDTHS = ['boxed', 'narrow', 'full'] as const
export const COLUMN_ALIGNS = ['start', 'center', 'end', 'stretch'] as const
export type BuilderWidget = { id: string; type: WidgetType; props: Record<string, string>; style: WidgetStyle }
export type BuilderColumn = { id: string; width: number; widgets: BuilderWidget[] }
export type BuilderSectionStyle = {
  bg: string
  bgImage: string
  paddingY: number
  tone: 'none' | 'dark' | 'light' | 'accent'
  /** Content width: boxed (site container), narrow (reading width) or full-bleed. */
  width: typeof SECTION_WIDTHS[number]
  /** Vertical alignment of the columns inside the row. */
  valign: typeof COLUMN_ALIGNS[number]
  hideOn: VisibilityRule
}
export type BuilderSection = { id: string; anchor: string; style: BuilderSectionStyle; columns: BuilderColumn[] }
export type BuilderCode = { html: string; css: string; js: string; advanced: boolean }
/** Per-page chrome: hide the shared site header/footer for a full-bleed page. */
export type BuilderPageLayout = { header: ChromeChoice; footer: ChromeChoice }
/** 'default' = theme rules decide, 'none' = hidden, or a specific header/footer template id. */
export type ChromeChoice = 'default' | 'none' | `tpl-${string}`
export type BuilderDoc = { v: 2; mode: 'builder' | 'code'; code: BuilderCode; sections: BuilderSection[]; layout?: BuilderPageLayout }

export const WIDGET_LABELS: Record<WidgetType, { fa: string; en: string }> = {
  heading: { fa: 'تیتر', en: 'Heading' },
  text: { fa: 'متن غنی', en: 'Rich text' },
  image: { fa: 'تصویر', en: 'Image' },
  button: { fa: 'دکمه', en: 'Button' },
  divider: { fa: 'خط جداکننده', en: 'Divider' },
  spacer: { fa: 'فاصله‌گذار', en: 'Spacer' },
  video: { fa: 'ویدیو', en: 'Video' },
  stats: { fa: 'آمار', en: 'Stats' },
  list: { fa: 'کارت‌ها / ویژگی‌ها', en: 'Cards / features' },
  faq: { fa: 'پرسش و پاسخ', en: 'FAQ' },
  html: { fa: 'کد دستی (HTML/CSS/JS)', en: 'Custom code (HTML/CSS/JS)' },
  template: { fa: 'قالب ذخیره‌شده', en: 'Saved template' },
  hero: { fa: 'سرصفحه (Hero)', en: 'Hero' },
  cta: { fa: 'دعوت به اقدام', en: 'Call to action' },
  plans: { fa: 'پلن‌ها (زنده)', en: 'Plans (live)' },
  posts: { fa: 'مجله (زنده)', en: 'Journal (live)' },
  products: { fa: 'محصولات (زنده)', en: 'Products (live)' },
  network: { fa: 'نقشه شبکه (زنده)', en: 'Network map (live)' },
  form: { fa: 'فرم (زنده)', en: 'Form (live)' },
  nav: { fa: 'منوی سایت (هدر/فوتر)', en: 'Site menu (header/footer)' },
  'post-header': { fa: 'هدر پست (تیتر و توضیح)', en: 'Post header (title & lead)' },
  'post-cover': { fa: 'کاور پست', en: 'Post cover' },
  content: { fa: 'متن مقاله (جای‌ویژه)', en: 'Article body (slot)' },
  'post-footer': { fa: 'انتهای پست (نویسنده و مرتبط‌ها)', en: 'Post footer (author & related)' },
  'product-hero': { fa: 'بالای محصول (کامل)', en: 'Product hero (complete)' },
  'product-gallery': { fa: 'گالری محصول', en: 'Product gallery' },
  'product-info': { fa: 'مشخصات و توضیح محصول', en: 'Product details' },
  'product-purchase': { fa: 'باکس خرید', en: 'Buy box' },
  'product-usp': { fa: 'نوار مزایای خرید', en: 'Purchase benefits' },
  'product-tabs': { fa: 'تب‌ها (توضیح، دیدگاه، پرسش)', en: 'Tabs (description, reviews, Q&A)' },
  'site-header': { fa: 'هدر پیش‌فرض سایت', en: 'Default site header' },
  'site-footer': { fa: 'فوتر پیش‌فرض سایت', en: 'Default site footer' },
  media: { fa: 'موزیک / فیلم / بازی (زنده)', en: 'Music / films / games (live)' },
  'vip-cta': { fa: 'دعوت به عضویت VIP', en: 'VIP call to action' },
}

const string = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const HEX = /^#[0-9a-fA-F]{6}$/

const safeUrl = (value: unknown, max = 2048) => {
  const url = string(value, max)
  if (!url) return ''
  if (/^\/(?!\/)[^\s<>\\]*$/.test(url)) return url
  if (/^#[\w-]*$/.test(url)) return url
  try {
    const parsed = new URL(url)
    if (['https:', 'http:'].includes(parsed.protocol) && !/[\s<>\\]/.test(url)) return url
  } catch { /* invalid */ }
  throw new Error('Invalid URL')
}
const enumOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(value as T) ? (value as T) : fallback)
const numberIn = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

type PropRule = { max?: number; json?: number; enum?: readonly string[]; url?: 'image' | 'link' | 'any' }
const TEXT = (max: number): PropRule => ({ max })

const WIDGET_PROPS: Record<WidgetType, Record<string, PropRule>> = {
  heading: { text: TEXT(300), textEn: TEXT(300), level: { enum: ['h1', 'h2', 'h3', 'h4', 'p'] } },
  text: { html: TEXT(20000), htmlEn: TEXT(20000) },
  image: { src: { url: 'image' }, alt: TEXT(160), href: { url: 'link' }, label: TEXT(80), labelEn: TEXT(80) },
  button: { label: TEXT(100), labelEn: TEXT(100), href: { url: 'link' }, variant: { enum: ['primary', 'ghost', 'link'] }, secondaryLabel: TEXT(100), secondaryLabelEn: TEXT(100), secondaryHref: { url: 'link' } },
  divider: {},
  spacer: {},
  video: { url: { url: 'any', max: 600 }, title: TEXT(200) },
  stats: { items: { json: 10 } },
  list: { items: { json: 12 }, title: TEXT(300), titleEn: TEXT(300) },
  faq: { items: { json: 24 }, title: TEXT(300), titleEn: TEXT(300) },
  html: { html: TEXT(60000), css: TEXT(40000), js: TEXT(30000), advanced: { enum: ['', '1'] } },
  template: { templateId: { max: 80 } },
  hero: {
    eyebrow: TEXT(140), eyebrowEn: TEXT(140), title: TEXT(400), titleEn: TEXT(400), text: TEXT(2000), textEn: TEXT(2000),
    src: { url: 'image' }, alt: TEXT(160), label: TEXT(100), labelEn: TEXT(100), href: { url: 'link' }, secondaryLabel: TEXT(100), secondaryLabelEn: TEXT(100), secondaryHref: { url: 'link' },
  },
  cta: { title: TEXT(400), titleEn: TEXT(400), text: TEXT(1600), textEn: TEXT(1600), label: TEXT(100), labelEn: TEXT(100), href: { url: 'link' } },
  plans: { title: TEXT(300), titleEn: TEXT(300), limit: { enum: ['2', '3', '4', '6'] } },
  posts: { title: TEXT(300), titleEn: TEXT(300), limit: { enum: ['3', '2', '4', '6', '8', '9', '12'] }, category: { max: 80 } },
  products: { title: TEXT(300), titleEn: TEXT(300), limit: { enum: ['3', '2', '4', '6', '8', '9', '12'] }, category: { max: 80 }, kind: { enum: ['', 'VIRTUAL', 'PHYSICAL'] } },
  network: { title: TEXT(300), titleEn: TEXT(300), text: TEXT(1200), textEn: TEXT(1200) },
  form: { title: TEXT(300), titleEn: TEXT(300), slug: { max: 80 } },
  nav: {},
  'post-header': {},
  'post-cover': {},
  content: {},
  'post-footer': {},
  'product-hero': {},
  'product-gallery': {},
  'product-info': {},
  'product-purchase': {},
  'product-usp': {},
  'product-tabs': {},
  'site-header': {},
  'site-footer': {},
  media: { source: { enum: MEDIA_SOURCES }, title: TEXT(300), titleEn: TEXT(300), limit: { enum: ['6', '4', '8', '10', '12', '16'] } },
  'vip-cta': { title: TEXT(300), titleEn: TEXT(300), text: TEXT(1200), textEn: TEXT(1200), label: TEXT(100), labelEn: TEXT(100) },
}

export type JsonItem = Record<string, string>

function validateItems(rule: number, raw: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(raw || '[]') } catch { throw new Error('Invalid items list') }
  if (!Array.isArray(parsed) || parsed.length > rule) throw new Error('Invalid items list')
  return JSON.stringify(parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid items list')
    const out: JsonItem = {}
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,20}$/.test(key)) continue
      if (typeof value === 'string') out[key] = value.slice(0, 600)
    }
    return out
  }))
}

function validateProps(type: WidgetType, input: unknown): Record<string, string> {
  const spec = WIDGET_PROPS[type]
  const source = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const props: Record<string, string> = {}
  for (const [key, rule] of Object.entries(spec)) {
    const raw = source[key]
    if (rule.enum) { props[key] = enumOf(raw, rule.enum, rule.enum[0]) }
    else if (rule.json !== undefined) { props[key] = validateItems(rule.json, string(raw, 40000)) }
    else if (rule.url) { props[key] = safeUrl(raw, rule.max || 2048) }
    else { props[key] = string(raw, rule.max || 600) }
  }
  return props
}

export function validateWidgetStyle(input: unknown): WidgetStyle {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    align: enumOf(s.align, ['start', 'center', 'end'] as const, 'start'),
    color: typeof s.color === 'string' && HEX.test(s.color) ? s.color : '',
    width: numberIn(s.width, 0, 100, 0),
    paddingY: numberIn(s.paddingY, 0, 160, 0),
    tone: enumOf(s.tone, ['none', 'dark', 'light', 'accent'] as const, 'none'),
    radius: numberIn(s.radius, 0, 48, 0),
    hideOn: enumOf(s.hideOn, VISIBILITY_RULES, 'none'),
  }
}

export function defaultSectionStyle(): BuilderSectionStyle {
  return { bg: '', bgImage: '', paddingY: 72, tone: 'none', width: 'boxed', valign: 'start', hideOn: 'none' }
}

/**
 * Normalises common video page links (YouTube, Aparat, Vimeo) to their embeddable
 * player URL. Anything else is returned unchanged (and still has to be https).
 */
export function toEmbedUrl(raw: string): string {
  const value = String(raw || '').trim()
  let url: URL
  try { url = new URL(value) } catch { return value }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : value
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = url.pathname === '/watch' ? url.searchParams.get('v') || '' : /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(url.pathname)?.[1] || ''
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : value
  }
  if (host === 'aparat.com') {
    const hash = /^\/v\/([\w-]+)/.exec(url.pathname)?.[1]
    if (hash) return `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame`
  }
  if (host === 'vimeo.com') {
    const id = /^\/(\d+)/.exec(url.pathname)?.[1]
    if (id) return `https://player.vimeo.com/video/${id}`
  }
  return value
}

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

export function createWidget(type: WidgetType): BuilderWidget {
  const props: Record<string, string> = {}
  for (const [key, rule] of Object.entries(WIDGET_PROPS[type])) {
    if (rule.enum) props[key] = rule.enum[0]
    else if (rule.json !== undefined) props[key] = '[]'
    else props[key] = ''
  }
  if (type === 'list' && props.items === '[]') props.items = JSON.stringify([{ title: 'ویژگی اول', titleEn: 'First feature', text: 'توضیح کوتاه', textEn: 'Short description' }])
  if (type === 'stats' && props.items === '[]') props.items = JSON.stringify([{ value: '۹۹٪', label: 'رضایت مشتری', labelEn: 'Happy customers' }])
  if (type === 'faq' && props.items === '[]') props.items = JSON.stringify([{ q: 'پرسش نمونه', qEn: 'Sample question', a: 'پاسخ نمونه', aEn: 'Sample answer' }])
  return { id: newId('w'), type, props, style: validateWidgetStyle({}) }
}

export function createSection(columns = 1): BuilderSection {
  const count = Math.min(4, Math.max(1, columns))
  return {
    id: newId('s'),
    anchor: '',
    style: defaultSectionStyle(),
    columns: Array.from({ length: count }, () => ({
      id: newId('c'),
      width: Math.round(100 / count),
      widgets: [],
    })),
  }
}

export function emptyDoc(): BuilderDoc {
  return { v: BUILDER_VERSION, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections: [], layout: { header: 'default', footer: 'default' } }
}

export function isSlotWidget(type: WidgetType): type is SlotWidgetType {
  return (SLOT_WIDGET_TYPES as readonly string[]).includes(type)
}

export function docHasSlotWidget(doc: BuilderDoc, type: WidgetType): boolean {
  return doc.sections.some((section) => section.columns.some((column) => column.widgets.some((widget) => widget.type === type)))
}

export function docHasContentSlot(doc: BuilderDoc): boolean {
  return docHasSlotWidget(doc, 'content')
}

/** Post templates must always show the article — append a content slot when missing. */
export function ensureContentSlot(doc: BuilderDoc): BuilderDoc {
  if (doc.mode !== 'builder' || docHasContentSlot(doc)) return doc
  const section = createSection(1)
  section.style.paddingY = 0
  section.columns[0].widgets.push(createWidget('content'))
  return { ...doc, sections: [...doc.sections, section] }
}

/** Product templates must show the product — append the complete hero + tabs when no product part is placed. */
export function ensureProductSlots(doc: BuilderDoc): BuilderDoc {
  if (doc.mode !== 'builder' || PRODUCT_SLOT_TYPES.some((type) => docHasSlotWidget(doc, type))) return doc
  const section = createSection(1)
  section.style.paddingY = 24
  section.columns[0].widgets.push(createWidget('product-hero'), createWidget('product-tabs'))
  return { ...doc, sections: [section, ...doc.sections] }
}

/** Fresh ids for a copy (templates can be inserted more than once). */
export function cloneSections(sections: BuilderSection[]): BuilderSection[] {
  return sections.map((section) => ({
    ...section,
    id: newId('s'),
    columns: section.columns.map((column) => ({
      ...column,
      id: newId('c'),
      widgets: column.widgets.map((widget) => ({ ...widget, id: newId('w') })),
    })),
  }))
}

function validateCode(input: unknown): BuilderCode {
  const c = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return { html: string(c.html, 60000), css: string(c.css, 40000), js: string(c.js, 30000), advanced: c.advanced === true }
}

function validatePageChrome(input: unknown): BuilderPageLayout {
  const l = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const choice = (value: unknown, code: 'header' | 'footer'): ChromeChoice => {
    if (value === 'none') return 'none'
    if (typeof value === 'string' && new RegExp(`^tpl-${code}-[a-z0-9]{4,24}$`).test(value)) return value as ChromeChoice
    return 'default'
  }
  return { header: choice(l.header, 'header'), footer: choice(l.footer, 'footer') }
}

export function validateBuilderDoc(input: unknown): BuilderDoc {
  const doc = (input && typeof input === 'object' && !Array.isArray(input) ? input : null) as Record<string, unknown> | null
  if (!doc || doc.v !== BUILDER_VERSION) throw new Error('Invalid builder document')
  const mode = enumOf(doc.mode, ['builder', 'code'] as const, 'builder')
  const sectionsRaw = Array.isArray(doc.sections) ? doc.sections : []
  if (sectionsRaw.length > 40) throw new Error('Too many sections')
  const seen = new Set<string>()
  const takeId = (value: unknown) => {
    const id = string(value, 64)
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || seen.has(id)) throw new Error('Invalid element ID')
    seen.add(id)
    return id
  }
  let widgetCount = 0
  const sections: BuilderSection[] = sectionsRaw.map((raw, sectionIndex) => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const st = (s.style && typeof s.style === 'object' ? s.style : {}) as Record<string, unknown>
    const columnsRaw = Array.isArray(s.columns) ? s.columns : []
    if (columnsRaw.length > 4) throw new Error(`Section ${sectionIndex + 1}: too many columns`)
    const columns: BuilderColumn[] = columnsRaw.map((colRaw) => {
      const col = (colRaw && typeof colRaw === 'object' ? colRaw : {}) as Record<string, unknown>
      const widgetsRaw = Array.isArray(col.widgets) ? col.widgets : []
      if (widgetsRaw.length > 12) throw new Error('Too many widgets in a column')
      widgetCount += widgetsRaw.length
      if (widgetCount > 200) throw new Error('Too many widgets')
      return {
        id: takeId(col.id),
        width: numberIn(col.width, 5, 100, 100),
        widgets: widgetsRaw.map((wRaw) => {
          const w = (wRaw && typeof wRaw === 'object' ? wRaw : {}) as Record<string, unknown>
          const type = enumOf(w.type, WIDGET_TYPES, 'heading')
          return { id: takeId(w.id), type, props: validateProps(type, w.props), style: validateWidgetStyle(w.style) }
        }),
      }
    })
    if (!columns.length) columns.push({ id: takeId(newId('c')), width: 100, widgets: [] })
    return {
      id: takeId(s.id),
      anchor: string(s.anchor, 64).replace(/[^a-zA-Z0-9-_]/g, ''),
      style: {
        bg: typeof st.bg === 'string' && HEX.test(st.bg) ? st.bg : '',
        bgImage: st.bgImage ? safeUrl(st.bgImage, 2048) : '',
        paddingY: numberIn(st.paddingY, 0, 200, 72),
        tone: enumOf(st.tone, ['none', 'dark', 'light', 'accent'] as const, 'none'),
        width: enumOf(st.width, SECTION_WIDTHS, 'boxed'),
        valign: enumOf(st.valign, COLUMN_ALIGNS, 'start'),
        hideOn: enumOf(st.hideOn, VISIBILITY_RULES, 'none'),
      },
      columns,
    }
  })
  return { v: BUILDER_VERSION, mode, code: validateCode(doc.code), sections, layout: validatePageChrome(doc.layout) }
}

const ITEMS_LINE = (text: string, split: string, keys: string[]) =>
  text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 24).map((line) => {
    const parts = line.split(split)
    return Object.fromEntries(keys.map((key, i) => [key, (parts[i] || '').trim().slice(0, 600)]))
  })

/** v1 block array (7 fixed kinds) → v2 document. */
export function migratePageBlocks(blocks: PageBlock[]): BuilderDoc {
  const doc = emptyDoc()
  for (const block of blocks) {
    const section = createSection(1)
    section.style.tone = block.tone === 'light' || block.tone === 'dark' || block.tone === 'accent' ? block.tone : 'none'
    const widget: BuilderWidget = { id: `w-${block.id}`.slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '-'), type: 'heading', props: {}, style: validateWidgetStyle({}) }
    const legacyItems = (text: string, keys: string[]) => JSON.stringify(ITEMS_LINE(text, '|', keys))
    switch (block.kind) {
      case 'hero':
        widget.type = 'hero'
        widget.props = { eyebrow: 'MoboComCMS', eyebrowEn: 'MoboComCMS', title: block.title, titleEn: block.titleEn, text: block.text, textEn: block.textEn, src: block.image, label: block.linkLabel, labelEn: block.linkLabelEn, href: block.link, secondaryLabel: '', secondaryLabelEn: '', secondaryHref: '' }
        break
      case 'text':
        widget.type = 'text'
        widget.props = { html: `<h2>${block.title}</h2><p>${block.text}</p>`, htmlEn: `<h2>${block.titleEn || block.title}</h2><p>${block.textEn || block.text}</p>` }
        break
      case 'image':
        widget.type = 'image'
        widget.props = { src: block.image, alt: block.title, href: block.link, label: block.linkLabel, labelEn: block.linkLabelEn }
        break
      case 'columns':
        widget.type = 'list'
        widget.props = { title: block.title, titleEn: block.titleEn, items: legacyItems(block.items, ['title', 'text']) }
        break
      case 'stats':
        widget.type = 'stats'
        widget.props = { items: legacyItems(block.items, ['value', 'label']) }
        break
      case 'cta':
        widget.type = 'cta'
        widget.props = { title: block.title, titleEn: block.titleEn, text: block.text, textEn: block.textEn, label: block.linkLabel, labelEn: block.linkLabelEn, href: block.link }
        break
      case 'faq':
        widget.type = 'faq'
        widget.props = { title: block.title, titleEn: block.titleEn, items: legacyItems(block.items, ['q', 'a']) }
        break
      default:
        continue
    }
    section.columns[0].widgets.push(widget)
    doc.sections.push(section)
  }
  return validateBuilderDoc(doc)
}

/** Accepts a v2 document or a legacy v1 block array and always returns a v2 doc. */
export function parseBuilderDoc(input: unknown): BuilderDoc {
  if (Array.isArray(input)) return migratePageBlocks(validatePageBlocks(input))
  return validateBuilderDoc(input)
}
