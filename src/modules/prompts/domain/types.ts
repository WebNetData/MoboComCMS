import { serializeShowcase, ShowcaseError } from './showcase'
export const PROMPT_KINDS = ['TEXT', 'IMAGE', 'VIDEO', 'CODE', 'WEB'] as const
export type PromptKind = typeof PROMPT_KINDS[number]
export const KIND_LABEL: Record<PromptKind, string> = { TEXT: 'متن و محتوا', IMAGE: 'تصویر و طراحی', VIDEO: 'ویدئو و سینما', CODE: 'کدنویسی و وب', WEB: 'طراحی وب و رابط' }
export const KIND_ICON: Record<PromptKind, string> = { TEXT: 'file', IMAGE: 'image', VIDEO: 'film', CODE: 'code', WEB: 'globe' }
export const TARGETS = { TEXT: ['عمومی', 'ChatGPT', 'Claude', 'Gemini'], IMAGE: ['عمومی', 'Midjourney', 'GPT Image', 'Stable Diffusion', 'FLUX'], VIDEO: ['عمومی', 'Veo', 'Runway', 'Kling', 'Sora'], CODE: ['عمومی', 'Claude', 'Codex', 'Cursor', 'Gemini'], WEB: ['عمومی', 'Claude', 'Codex', 'v0', 'Lovable', 'Bolt'] } as const
export const TONES = ['حرفه‌ای', 'صمیمی', 'آموزشی', 'خلاقانه', 'رسمی', 'متقاعدکننده'] as const
export const FORMATS = ['متن ساختاریافته', 'فهرست مرحله‌ای', 'جدول', 'Markdown', 'JSON', 'کد همراه توضیح'] as const
export const INPUT_KEYS = ['idea', 'context', 'role', 'audience', 'tone', 'format', 'language', 'target', 'negative', 'style', 'ratio', 'duration'] as const
export type PromptInput = Record<typeof INPUT_KEYS[number], string> & { kind: PromptKind; templateSlug: string }
export type TemplateView = { id: number; slug: string; title: string; summary: string; kind: string; category: string; tags: string; content: string; example: string; defaults: string; featured: boolean; version: number; showcase?: string }
export class PromptError extends Error { constructor(message: string, readonly status = 422) { super(message) } }

export const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD') : '')
export const isKind = (value: unknown): value is PromptKind => (PROMPT_KINDS as readonly unknown[]).includes(value)
export const DEFAULT_INPUT: PromptInput = { kind: 'TEXT', templateSlug: '', idea: '', context: '', role: '', audience: '', tone: 'حرفه‌ای', format: 'متن ساختاریافته', language: 'fa', target: 'عمومی', negative: '', style: '', ratio: '1:1', duration: '10' }

export function normalizeInput(raw: Record<string, unknown>): PromptInput {
  if (!isKind(raw.kind)) throw new PromptError('نوع پرامپت معتبر نیست')
  const value = { ...DEFAULT_INPUT, kind: raw.kind }
  for (const key of INPUT_KEYS) value[key] = cleanText(raw[key], key === 'idea' ? 4000 : key === 'context' || key === 'negative' ? 2000 : 300)
  value.idea = cleanText(raw.idea, 4000)
  if (value.idea.length < 5) throw new PromptError('ایده را با حداقل ۵ نویسه توضیح دهید')
  value.tone = (TONES as readonly string[]).includes(value.tone) ? value.tone : DEFAULT_INPUT.tone
  value.format = (FORMATS as readonly string[]).includes(value.format) ? value.format : DEFAULT_INPUT.format
  value.language = value.language === 'en' ? 'en' : 'fa'
  value.target = (TARGETS[value.kind] as readonly string[]).includes(value.target) ? value.target : 'عمومی'
  value.ratio = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'].includes(value.ratio) ? value.ratio : '1:1'
  value.duration = ['5', '10', '15', '30', '60'].includes(value.duration) ? value.duration : '10'
  value.templateSlug = cleanText(raw.templateSlug, 100)
  if (value.templateSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.templateSlug)) throw new PromptError('نشانی الگو معتبر نیست')
  return value
}

export function templateInput(raw: Record<string, unknown>) {
  const title = cleanText(raw.title, 120), slug = cleanText(raw.slug, 100), content = cleanText(raw.content, 12000)
  if (title.length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !isKind(raw.kind)) throw new PromptError('عنوان، نشانی انگلیسی و نوع الگو را درست وارد کنید')
  if (content.length < 20 || !content.includes('{{idea}}')) throw new PromptError('متن الگو حداقل ۲۰ نویسه و متغیر {{idea}} داشته باشد')
  for (const [, key] of content.matchAll(/\{\{([^{}]+)\}\}/g)) if (!(INPUT_KEYS as readonly string[]).includes(key.trim())) throw new PromptError(`متغیر «${key}» پشتیبانی نمی‌شود`)
  if (!['DRAFT', 'PENDING', 'PUBLISHED'].includes(String(raw.status ?? 'DRAFT'))) throw new PromptError('وضعیت انتشار معتبر نیست')
  const status = raw.status === 'PUBLISHED' ? 'PUBLISHED' : raw.status === 'PENDING' ? 'PENDING' : 'DRAFT'
  const sortOrder = Number(raw.sortOrder || 0)
  if (!Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 10000) throw new PromptError('ترتیب الگو معتبر نیست')
  let defaults: Record<string, string> = {}
  if (typeof raw.defaults === 'string' && raw.defaults.trim()) {
    let parsed: unknown
    try { parsed = JSON.parse(raw.defaults) } catch { throw new PromptError('مقادیر اولیه باید JSON معتبر باشند') }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new PromptError('مقادیر اولیه باید یک شیء باشند')
    defaults = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (INPUT_KEYS as readonly string[]).includes(key) && key !== 'idea' && typeof value === 'string').map(([key, value]) => [key, cleanText(value, 1000)]))
  }
  let showcase: string | undefined
  try { if (raw.showcase !== undefined) showcase = serializeShowcase(raw.showcase) } catch (error) { if (error instanceof ShowcaseError) throw new PromptError(error.message); throw error }
  return { title, slug, content, example: cleanText(raw.example, 4000), kind: raw.kind, summary: cleanText(raw.summary, 500), category: cleanText(raw.category, 40), tags: cleanText(raw.tags, 300), status, featured: raw.featured === true, sortOrder, defaults: JSON.stringify(defaults), showcase }
}

export function promptPolicy(raw: Record<string, unknown>) {
  const number = (key: string, fallback: number, min: number, max: number) => { const n = Number(raw[key]); return Number.isFinite(n) && raw[key] !== undefined ? Math.max(min, Math.min(max, Math.floor(n))) : fallback }
  return { libraryTitle: cleanText(raw['library.title'],120) || 'نتیجه را ببین؛ پرامپتش را بردار.', libraryDescription: cleanText(raw['library.description'],500) || 'از یک قاب تصویری تا یک تجربهٔ وب. نمونه‌ها را کشف کن، متن دقیق پرامپت را بردار و با ایدهٔ خودت ادامه بده.', title: cleanText(raw.title, 100) || 'ایده‌ات را به یک پرامپت دقیق تبدیل کن', description: cleanText(raw.description, 400) || 'از یک فکر کوتاه تا دستور کامل؛ برای نوشتن، طراحی، ویدئو و کدنویسی.', reviewAuthors: raw['review-authors'] !== false, allowGuests: raw['allow-guests'] !== false, aiEnabled: raw['ai-enabled'] === true, minuteLimit: number('minute-limit', 20, 1, 60), aiDailyLimit: number('ai-daily-limit', 10, 1, 100), historyLimit: number('history-limit', 50, 5, 200), pinLimit: number('pin-limit', 50, 1, 200) }
}
