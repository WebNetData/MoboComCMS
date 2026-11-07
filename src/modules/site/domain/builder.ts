import { DASHBOARD_PARTS, DYNAMIC_FIELDS } from './builder-surfaces'
import { validatePageBlocks, type PageBlock } from './page-blocks'
import { validateAdvancedStyle, type AdvancedStyle } from './builder-style'

export const BUILDER_VERSION = 2

export const WIDGET_TYPES = [
  'surface-content', 'dashboard-part', 'dynamic-value',
  'heading', 'text', 'image', 'button', 'divider', 'spacer', 'video', 'stats', 'list', 'faq',
  'html', 'template', 'hero', 'cta', 'plans', 'posts', 'products', 'network', 'form', 'nav',
  'post-header', 'post-cover', 'content', 'post-footer',
  'product-hero', 'product-gallery', 'product-info', 'product-purchase', 'product-usp', 'product-tabs',
  'site-header', 'site-footer',
  'media', 'hosting', 'vip-cta',
  'icon-box', 'tabs', 'testimonials', 'counters', 'gallery', 'carousel', 'pricing', 'countdown', 'social', 'progress',
  'slides',
  'accordion',
  'flip-box', 'animated-headline', 'before-after', 'timeline', 'team', 'logos', 'marquee', 'steps', 'comparison', 'video-box', 'alert', 'rating',
] as const
export type WidgetType = typeof WIDGET_TYPES[number]

/** Live feeds the `media` widget can show (each belongs to the module named by its prefix). */
export const MEDIA_SOURCES = ['music-new', 'music-top', 'music-albums', 'cinema-movies', 'cinema-series', 'cinema-top', 'cinema-dubbed', 'cinema-vip', 'games-new', 'games-top', 'software-new', 'software-top'] as const
export type MediaSource = typeof MEDIA_SOURCES[number]

/** Widgets that only render on single-post pages (template slots). */
export const POST_SLOT_TYPES = ['post-header', 'post-cover', 'content', 'post-footer'] as const
/** Widgets that only render on single-product pages (template slots). */
export const PRODUCT_SLOT_TYPES = ['product-hero', 'product-gallery', 'product-info', 'product-purchase', 'product-usp', 'product-tabs'] as const
export const SLOT_WIDGET_TYPES = [...POST_SLOT_TYPES, ...PRODUCT_SLOT_TYPES, 'surface-content'] as const
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
/** `adv`: the advanced style (spacing, typography, background, border, shadow, hover, motion…); absent when nothing is set. */
export type BuilderWidget = { id: string; type: WidgetType; props: Record<string, string>; style: WidgetStyle; adv?: AdvancedStyle }
export const COLUMN_DIRS = ['column', 'row'] as const
export const COLUMN_JUSTIFY = ['start', 'center', 'end', 'between'] as const
export const COLUMN_GAPS = ['md', 'none', 'sm', 'lg', 'xl'] as const
/** How a column lays out its blocks: one under another (the default) or side by side, with gap and alignment. */
export type ColumnLayout = { dir: typeof COLUMN_DIRS[number]; gap: typeof COLUMN_GAPS[number]; justify: typeof COLUMN_JUSTIFY[number]; align: typeof COLUMN_ALIGNS[number]; wrap: boolean }
/** `layout` and `adv` are absent while nothing is set, so older documents are unchanged. */
export type BuilderColumn = { id: string; width: number; widgets: BuilderWidget[]; layout?: ColumnLayout; adv?: AdvancedStyle }
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
  /** Space between columns; side by side on phones too; the stacked order reversed on phones. All optional. */
  gap?: typeof COLUMN_GAPS[number]
  /** Content width in percent of the page (30–100); absent means the chosen width above. */
  widthPct?: number
  stackM?: 'stack' | 'keep'
  reverseM?: boolean
}
export type BuilderSection = { id: string; anchor: string; style: BuilderSectionStyle; columns: BuilderColumn[]; adv?: AdvancedStyle }
export type BuilderCode = { html: string; css: string; js: string; advanced: boolean }
/** Per-page chrome: hide the shared site header/footer for a full-bleed page. */
/** `postStyle`: on an article template, the magazine page style its header and reading column wear (`ps-…`, `psc-…`). */
export type BuilderPageLayout = { header: ChromeChoice; footer: ChromeChoice; postStyle?: string; designVersion?: 1 }
/** 'default' = theme rules decide, 'none' = hidden, or a specific header/footer template id. */
export type ChromeChoice = 'default' | 'none' | `tpl-${string}`
export type BuilderDoc = { v: 2; mode: 'builder' | 'code'; code: BuilderCode; sections: BuilderSection[]; layout?: BuilderPageLayout }

export const WIDGET_LABELS: Record<WidgetType, { fa: string; en: string }> = {
  'surface-content': { fa: 'محتوای اصلی همین بخش', en: 'Current owner content' },
  'dashboard-part': { fa: 'بخش زندهٔ پیشخوان کاربر', en: 'Member dashboard part' },
  'dynamic-value': { fa: 'دادهٔ پویای همین محتوا', en: 'Dynamic entry value' },
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
  media: { fa: 'موزیک / فیلم / بازی / نرم‌افزار (زنده)', en: 'Music / films / games / software (live)' },
  hosting: { fa: 'پلن‌های میزبانی و سرور (زنده)', en: 'Hosting and server plans (live)' },
  'vip-cta': { fa: 'دعوت به عضویت VIP', en: 'VIP call to action' },
  'icon-box': { fa: 'جعبهٔ آیکن', en: 'Icon box' },
  tabs: { fa: 'تب‌ها', en: 'Tabs' },
  testimonials: { fa: 'نظر مشتریان', en: 'Testimonials' },
  counters: { fa: 'شمارنده‌ها', en: 'Counters' },
  gallery: { fa: 'گالری تصویر', en: 'Image gallery' },
  carousel: { fa: 'اسلایدر تصویر', en: 'Image carousel' },
  pricing: { fa: 'جدول قیمت', en: 'Pricing table' },
  countdown: { fa: 'شمارش معکوس', en: 'Countdown' },
  social: { fa: 'شبکه‌های اجتماعی', en: 'Social links' },
  progress: { fa: 'نوار پیشرفت', en: 'Progress bars' },
  slides: { fa: 'اسلایدر حرفه‌ای', en: 'Slider' },
  accordion: { fa: 'آکاردئون', en: 'Accordion' },
  'flip-box': { fa: 'جعبهٔ چرخان', en: 'Flip box' },
  'animated-headline': { fa: 'تیتر متحرک', en: 'Animated headline' },
  'before-after': { fa: 'مقایسهٔ قبل و بعد', en: 'Before and after' },
  timeline: { fa: 'خط زمان', en: 'Timeline' },
  team: { fa: 'اعضای تیم', en: 'Team' },
  logos: { fa: 'نوار لوگوها', en: 'Logo strip' },
  marquee: { fa: 'نوار متن متحرک', en: 'Scrolling text' },
  steps: { fa: 'مراحل کار', en: 'Steps' },
  comparison: { fa: 'جدول مقایسه', en: 'Comparison table' },
  'video-box': { fa: 'ویدیو با پنجرهٔ بازشو', en: 'Video lightbox' },
  alert: { fa: 'جعبهٔ اعلان', en: 'Notice' },
  rating: { fa: 'امتیاز ستاره‌ای', en: 'Star rating' },
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

/** Icons the icon box may show (names of the site's own icon set). */
export const BOX_ICONS = ['sparkles', 'shield', 'bolt', 'heart', 'star', 'check', 'globe', 'devices', 'wallet', 'chat', 'bell', 'gift', 'crown', 'lock', 'key', 'users', 'user', 'cart', 'bag', 'tag', 'box', 'music', 'film', 'gamepad', 'book', 'pen', 'image', 'mail', 'phone', 'pin', 'clock', 'chart', 'layers', 'code', 'lifebuoy', 'megaphone'] as const
/** Networks the social block knows a mark for. */
export const SOCIAL_NETWORKS = ['telegram', 'instagram', 'x', 'youtube', 'aparat', 'linkedin', 'whatsapp', 'github', 'email', 'website'] as const

type PropRule = { max?: number; json?: number; enum?: readonly string[]; url?: 'image' | 'link' | 'any' }
const TEXT = (max: number): PropRule => ({ max })

const WIDGET_PROPS: Record<WidgetType, Record<string, PropRule>> = {
  'surface-content': {},
  'dashboard-part': { part: { enum: DASHBOARD_PARTS } },
  'dynamic-value': { field: { enum: DYNAMIC_FIELDS }, as: { enum: ['h1', 'h2', 'h3', 'p'] }, fallback: TEXT(500), label: TEXT(120) },
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
  hosting: { title: TEXT(300), group: { enum: ['all', 'hosting', 'servers'] } },
  media: { source: { enum: MEDIA_SOURCES }, title: TEXT(300), titleEn: TEXT(300), limit: { enum: ['6', '4', '8', '10', '12', '16'] } },
  'vip-cta': { title: TEXT(300), titleEn: TEXT(300), text: TEXT(1200), textEn: TEXT(1200), label: TEXT(100), labelEn: TEXT(100) },
  'icon-box': { icon: { enum: BOX_ICONS }, title: TEXT(200), titleEn: TEXT(200), text: TEXT(1200), textEn: TEXT(1200), href: { url: 'link' }, layout: { enum: ['top', 'side'] } },
  tabs: { items: { json: 10 } },
  testimonials: { title: TEXT(300), titleEn: TEXT(300), items: { json: 12 } },
  counters: { items: { json: 8 } },
  gallery: { items: { json: 24 }, columns: { enum: ['3', '2', '4', '5'] } },
  carousel: { items: { json: 16 } },
  pricing: { title: TEXT(300), titleEn: TEXT(300), items: { json: 6 } },
  countdown: { until: TEXT(40), title: TEXT(300), titleEn: TEXT(300), done: TEXT(300), doneEn: TEXT(300) },
  social: { items: { json: 12 } },
  progress: { items: { json: 12 } },
  accordion: { items: { json: 20 }, look: { enum: ['cards', 'lines', 'boxed'] }, single: { enum: ['1', '0'] }, first: { enum: ['1', '0'] }, icon: { enum: ['chevron', 'plus'] } },
  'flip-box': { icon: { enum: BOX_ICONS }, title: TEXT(160), text: TEXT(600), backTitle: TEXT(160), backText: TEXT(800), label: TEXT(80), href: { url: 'link' }, direction: { enum: ['horizontal', 'vertical'] }, height: { enum: ['md', 'sm', 'lg'] } },
  'animated-headline': { before: TEXT(160), words: TEXT(400), after: TEXT(160), effect: { enum: ['type', 'slide', 'fade'] }, level: { enum: ['h2', 'h1', 'h3'] } },
  'before-after': { before: { url: 'image' }, after: { url: 'image' }, beforeLabel: TEXT(40), afterLabel: TEXT(40), alt: TEXT(160), start: { enum: ['50', '30', '70'] } },
  timeline: { items: { json: 16 } },
  team: { items: { json: 12 }, columns: { enum: ['3', '2', '4'] } },
  logos: { title: TEXT(160), items: { json: 24 }, speed: { enum: ['normal', 'slow', 'fast'] } },
  marquee: { text: TEXT(600), speed: { enum: ['normal', 'slow', 'fast'] }, size: { enum: ['md', 'sm', 'lg'] }, separator: { enum: ['dot', 'star', 'slash'] } },
  steps: { items: { json: 8 }, layout: { enum: ['row', 'column'] } },
  comparison: { names: TEXT(300), items: { json: 30 }, highlight: { enum: ['', '1', '2', '3', '4'] } },
  'video-box': { url: { url: 'any', max: 600 }, cover: { url: 'image' }, title: TEXT(200), text: TEXT(400) },
  alert: { tone: { enum: ['info', 'success', 'warning', 'danger'] }, title: TEXT(200), text: TEXT(800), label: TEXT(80), href: { url: 'link' } },
  rating: { value: { enum: ['5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1'] }, count: TEXT(60), label: TEXT(160) },
  slides: { items: { json: 10 }, height: { enum: ['md', 'sm', 'lg', 'full'] }, effect: { enum: ['slide', 'fade', 'zoom'] }, autoplay: { enum: ['6', '0', '4', '8', '10'] }, overlay: { enum: ['soft', 'none', 'strong', 'brand'] }, align: { enum: ['start', 'center', 'end'] } },
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
  if (type === 'icon-box') { props.title = 'عنوان ویژگی'; props.titleEn = 'Feature title'; props.text = 'یک توضیح کوتاه دربارهٔ این ویژگی.'; props.textEn = 'A short line about this feature.' }
  if (type === 'tabs') props.items = JSON.stringify([{ title: 'تب اول', titleEn: 'First tab', text: 'متن تب اول', textEn: 'First tab text' }, { title: 'تب دوم', titleEn: 'Second tab', text: 'متن تب دوم', textEn: 'Second tab text' }])
  if (type === 'testimonials') props.items = JSON.stringify([{ quote: 'تجربهٔ خرید عالی بود و پشتیبانی سریع پاسخ داد.', quoteEn: 'A great experience and quick support.', name: 'سارا', role: 'مشتری', roleEn: 'Customer', avatar: '' }])
  if (type === 'counters') props.items = JSON.stringify([{ value: '1200', suffix: '+', label: 'مشتری', labelEn: 'Customers' }, { value: '98', suffix: '٪', label: 'رضایت', labelEn: 'Satisfaction' }])
  if (type === 'pricing') props.items = JSON.stringify([{ title: 'پایه', titleEn: 'Basic', price: 'رایگان', priceEn: 'Free', period: '', periodEn: '', features: 'دسترسی به همهٔ بخش‌ها\nپشتیبانی تیکتی', featuresEn: 'Access to every section\nTicket support', label: 'شروع', labelEn: 'Start', href: '/register', featured: '' }])
  if (type === 'countdown') { props.title = 'تا شروع'; props.titleEn = 'Starts in'; props.done = 'شروع شد!'; props.doneEn = 'It has started!' }
  if (type === 'social') props.items = JSON.stringify([{ network: 'telegram', href: '' }, { network: 'instagram', href: '' }])
  if (type === 'progress') props.items = JSON.stringify([{ label: 'طراحی', labelEn: 'Design', value: '90' }, { label: 'پشتیبانی', labelEn: 'Support', value: '75' }])
  if (type === 'slides') props.items = JSON.stringify([
    { src: '', eyebrow: 'تازه', title: 'تیتر اسلاید اول', text: 'یک جملهٔ کوتاه دربارهٔ پیشنهاد.', label: 'شروع کنید', href: '/register', label2: 'بیشتر بدانید', href2: '#' },
    { src: '', eyebrow: '', title: 'تیتر اسلاید دوم', text: 'تصویر پس‌زمینه، متن و دکمه‌ها را در تنظیمات بلوک عوض کنید.', label: 'مشاهده', href: '/', label2: '', href2: '' },
  ])
  if (type === 'accordion') props.items = JSON.stringify([{ title: 'پرسش یا عنوان اول', text: 'پاسخ یا توضیح کوتاه. این متن با باز شدن نمایش داده می‌شود.' }, { title: 'عنوان دوم', text: 'متن دوم.' }, { title: 'عنوان سوم', text: 'متن سوم.' }])
  if (type === 'flip-box') Object.assign(props, { icon: 'sparkles', title: 'روی من بروید', text: 'روی کارت یک تیتر و توضیح کوتاه.', backTitle: 'پشت کارت', backText: 'توضیح بیشتر و یک دکمه برای قدم بعد.', label: 'بیشتر بدانید', href: '/' })
  if (type === 'animated-headline') Object.assign(props, { before: 'ساختن سایت', words: 'سریع\nزیبا\nحرفه‌ای', after: 'با موبوکام' })
  if (type === 'timeline') props.items = JSON.stringify([{ date: '۱۴۰۲', title: 'شروع', text: 'اولین قدم کار.' }, { date: '۱۴۰۳', title: 'رشد', text: 'تیم و مشتریان بیشتر.' }, { date: '۱۴۰۴', title: 'امروز', text: 'جایی که امروز هستیم.' }])
  if (type === 'team') props.items = JSON.stringify([{ photo: '', name: 'نام عضو', role: 'نقش در تیم', text: 'یک جملهٔ کوتاه دربارهٔ او.', href: '' }, { photo: '', name: 'نام عضو', role: 'نقش در تیم', text: 'یک جملهٔ کوتاه دربارهٔ او.', href: '' }, { photo: '', name: 'نام عضو', role: 'نقش در تیم', text: 'یک جملهٔ کوتاه دربارهٔ او.', href: '' }])
  if (type === 'logos') props.items = JSON.stringify([{ src: '', alt: 'نام برند', href: '' }, { src: '', alt: 'نام برند', href: '' }, { src: '', alt: 'نام برند', href: '' }, { src: '', alt: 'نام برند', href: '' }])
  if (type === 'marquee') props.text = 'طراحی\nتوسعه\nپشتیبانی\nرشد'
  if (type === 'steps') props.items = JSON.stringify([{ title: 'ثبت درخواست', text: 'نیازتان را بگویید.' }, { title: 'بررسی و طرح', text: 'راه‌حل را با هم می‌چینیم.' }, { title: 'اجرا', text: 'کار انجام و تحویل می‌شود.' }])
  if (type === 'comparison') { props.names = 'پایه\nحرفه‌ای\nسازمانی'; props.highlight = '2'; props.items = JSON.stringify([{ feature: 'پشتیبانی', v1: 'yes', v2: 'yes', v3: 'yes' }, { feature: 'گزارش پیشرفته', v1: 'no', v2: 'yes', v3: 'yes' }, { feature: 'کاربران', v1: '۳', v2: '۲۰', v3: 'نامحدود' }]) }
  if (type === 'alert') Object.assign(props, { title: 'یک نکتهٔ مهم', text: 'متن اعلان را این‌جا بنویسید.' })
  if (type === 'rating') Object.assign(props, { count: '۱۲۰ نظر', label: 'امتیاز مشتریان' })
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
  const postStyle = typeof l.postStyle === 'string' && /^(?:ps-[a-z]{3,16}|psc-[a-z0-9]{4,24})$/.test(l.postStyle) ? l.postStyle : ''
  return { header: choice(l.header, 'header'), footer: choice(l.footer, 'footer'), ...(postStyle ? { postStyle } : {}), ...(l.designVersion === 1 ? { designVersion: 1 as const } : {}) }
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
      const lay = (col.layout && typeof col.layout === 'object' ? col.layout : null) as Record<string, unknown> | null
      const layout: ColumnLayout | null = lay ? { dir: enumOf(lay.dir, COLUMN_DIRS, 'column'), gap: enumOf(lay.gap, COLUMN_GAPS, 'md'), justify: enumOf(lay.justify, COLUMN_JUSTIFY, 'start'), align: enumOf(lay.align, COLUMN_ALIGNS, 'stretch'), wrap: lay.wrap === true } : null
      const colAdv = validateAdvancedStyle(col.adv)
      return {
        ...(layout ? { layout } : {}),
        ...(colAdv ? { adv: colAdv } : {}),
        id: takeId(col.id),
        width: numberIn(col.width, 5, 100, 100),
        widgets: widgetsRaw.map((wRaw) => {
          const w = (wRaw && typeof wRaw === 'object' ? wRaw : {}) as Record<string, unknown>
          const type = enumOf(w.type, WIDGET_TYPES, 'heading')
          const adv = validateAdvancedStyle(w.adv)
          return { id: takeId(w.id), type, props: validateProps(type, w.props), style: validateWidgetStyle(w.style), ...(adv ? { adv } : {}) }
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
        ...(st.gap && st.gap !== 'md' ? { gap: enumOf(st.gap, COLUMN_GAPS, 'md') } : {}),
        ...(numberIn(st.widthPct, 0, 100, 0) >= 30 ? { widthPct: numberIn(st.widthPct, 30, 100, 100) } : {}),
        ...(st.stackM === 'keep' ? { stackM: 'keep' as const } : {}),
        ...(st.reverseM === true ? { reverseM: true } : {}),
      },
      columns,
      ...(validateAdvancedStyle(s.adv) ? { adv: validateAdvancedStyle(s.adv) } : {}),
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
