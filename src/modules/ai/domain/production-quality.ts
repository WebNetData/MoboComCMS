import type { ProductionConfig, ProductionImage, ProductionKind, ProductionOutput, ProductionSeed } from './production'

/** Editorial rules per kind of output. Music and film are Magazine posts about those subjects. */
export const QUALITY_PROFILES = [
  { id: 'magazine', kind: 'post', label: 'مطلب مجله' },
  { id: 'music', kind: 'post', label: 'مطلب موسیقی' },
  { id: 'film', kind: 'post', label: 'مطلب فیلم و سریال' },
  { id: 'product', kind: 'product', label: 'محصول فروشگاه' },
  { id: 'page', kind: 'page', label: 'صفحهٔ سایت' },
] as const
export type QualityProfile = typeof QUALITY_PROFILES[number]['id']
export const defaultQualityProfile = (kind: ProductionKind): QualityProfile => kind === 'post' ? 'magazine' : kind
export const qualityProfileFits = (kind: ProductionKind, profile: unknown): profile is QualityProfile => QUALITY_PROFILES.some(p => p.id === profile && p.kind === kind)
export const qualityProfileOf = (kind: ProductionKind, config: Pick<ProductionConfig, 'qualityProfile'>) => qualityProfileFits(kind, config.qualityProfile) ? config.qualityProfile : defaultQualityProfile(kind)

export type QualityLevel = 'pass' | 'warn' | 'block'
export type QualityArea = 'similar' | 'links' | 'claims' | 'images' | 'profile'
export interface QualityFinding { area: QualityArea; level: Exclude<QualityLevel, 'pass'>; title: string; detail: string; evidence?: string }
export interface QualityMatch { title: string; href: string; score: number; kind: 'post' | 'product' | 'page' | 'batch' }
export interface QualityReport { profile: QualityProfile; level: QualityLevel; findings: QualityFinding[]; matches: QualityMatch[]; checkedAt: string; areas: Record<QualityArea, QualityLevel> }

const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' }
export const normalize = (value: string) => value.normalize('NFKC').replace(/[۰-۹٠-٩]/g, d => DIGITS[d]).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ٰٟ]/g, '').replace(/‌/g, ' ').toLocaleLowerCase()
const STOP = new Set('و در به از که این آن با برای را تا یا هم نیز است هست بود شود شد می کند کرد های ها یک بر چه چرا چگونه چطور همه بین روی پس اگر اما ولی the a an and or of to in for on with is are how what why best'.split(' '))
export const tokens = (value: string) => new Set(normalize(value).split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1 && !STOP.has(t)))
export function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b)
  if (!x.size || !y.size) return 0
  let common = 0
  for (const t of x) if (y.has(t)) common++
  return common / (x.size + y.size - common)
}
/** The longest distinctive words of a title, used to find candidates before scoring them. */
export const searchWords = (title: string) => [...tokens(title)].sort((a, b) => b.length - a.length).slice(0, 4)

const sentences = (text: string) => text.split(/(?<=[.!?؟。\n])\s+/).map(s => s.trim()).filter(Boolean)
const clip = (value: string, max = 160) => value.length > max ? value.slice(0, max - 1) + '…' : value
const numbersIn = (value: string) => [...normalize(value).matchAll(/\d+(?:[.,/]\d+)*/g)].map(m => m[0].replace(/,/g, ''))
const has = (pattern: RegExp, value: string) => pattern.test(normalize(value))

const CLAIMS = /(تحقیقات|پژوهش|مطالعات|آمار|طبق گزارش|به گفته|کارشناسان|دانشمندان|ثابت شده|علمی|بهترین|اولین|تنها|بی‌نظیر|بی نظیر|پرفروش|شماره یک|۱۰۰|100 ?%|قطعا|تضمین|studies|research|according to|proven|guaranteed|best|first|only|number one)/
const EXPERIENCE = /(ما (آن را )?(تست|امتحان|آزمایش) کردیم|من (آن را )?(تست|امتحان|استفاده) کردم|تجربه(ٔ| ی)? شخصی (من|ما)|we tested|i tested|in my experience)/
const PRICE = /(تومان|ریال|دلار|یورو|درهم|قیمت (آن|این|محصول)? ?\d|\$|€|£|usd|irt|irr)/
const WARRANTY = /(گارانتی|ضمانت|وارانتی|warranty|guarantee)/
const HEALTH = /(درمان|شفا|معجزه|بدون عارضه|بدون هیچ عارضه|ضد سرطان|کاهش وزن تضمینی|cure|miracle)/
const MUSIC = /(آلبوم|تک ?آهنگ|قطعه|منتشر (شد|کرد)|انتشار|لیبل|چارت|بیلبورد|استریم|پخش|جایزه|گرمی|رکورد|album|single|chart|billboard|stream|grammy|label)/
const FILM = /(کارگردان|بازیگر|نقش ?آفرین|اکران|گیشه|فروش|اسکار|جایزه|امتیاز|imdb|راتن|فصل|قسمت|director|cast|box office|oscar|season|episode)/
const SPOILER = /(پایان (فیلم|سریال|داستان)|در پایان|سکانس پایانی|اسپویل|لو (رفتن|دادن) داستان|spoiler|the ending)/
const CONTACT = /(\+?\d[\d -]{7,}\d|[\w.-]+@[\w-]+\.[a-z]{2,}|خیابان|کوچه|پلاک|کد پستی)/
const YEAR = /^(19|20|13|14)\d\d$/
const QUOTE = /[«"“]([^»"”]{120,})[»"”]/

export interface QualityInput { kind: ProductionKind; config: ProductionConfig; seed: ProductionSeed; output: ProductionOutput; images: ProductionImage[] }

const sourceText = ({ seed, config }: QualityInput) => [seed.topic, seed.facts, seed.price, config.specifications, config.keywords, config.instruction].join('\n')

/** Checks that need no database: claims, profile rules and image/text agreement. */
export function textChecks(input: QualityInput): QualityFinding[] {
  const { output, config, kind } = input, profile = qualityProfileOf(kind, config), findings: QualityFinding[] = []
  const source = sourceText(input), sourceNumbers = new Set(numbersIn(source)), inSource = (pattern: RegExp) => has(pattern, source)
  const parts = [{ label: 'عنوان', text: output.title }, { label: 'خلاصه', text: output.excerpt }, ...output.sections.map((s, i) => ({ label: `بخش ${i + 1}${s.heading ? ` «${clip(s.heading, 40)}»` : ''}`, text: `${s.heading}\n${s.text}` }))]
  const strict = profile === 'product' || profile === 'page'
  const seen = new Set<string>()
  const add = (finding: QualityFinding) => { const key = finding.area + finding.title + finding.evidence; if (!seen.has(key)) { seen.add(key); findings.push(finding) } }

  for (const part of parts) for (const sentence of sentences(part.text)) {
    const percent = /[%٪]|درصد|percent/.test(normalize(sentence))
    const unsupported = numbersIn(sentence).filter(n => (n.length > 1 || percent) && !sourceNumbers.has(n) && !YEAR.test(n))
    if (unsupported.length) add({ area: 'claims', level: strict ? 'block' : 'warn', title: 'عدد یا آماری که در اطلاعات شما نیست', detail: `${part.label}: ${unsupported.slice(0, 3).join('، ')} — منبع بدهید یا حذفش کنید.`, evidence: clip(sentence) })
    else if (numbersIn(sentence).some(n => YEAR.test(n) && !sourceNumbers.has(n))) add({ area: 'claims', level: 'warn', title: 'سال یا تاریخ بدون منبع', detail: `${part.label}: تاریخ را با منبع تطبیق دهید.`, evidence: clip(sentence) })
    if (has(CLAIMS, sentence) && !has(CLAIMS, source)) add({ area: 'claims', level: 'warn', title: 'ادعایی که منبع می‌خواهد', detail: `${part.label}: ادعای کلی، رتبه یا نتیجهٔ پژوهش بدون منبع.`, evidence: clip(sentence) })
    if (has(EXPERIENCE, sentence) && !inSource(EXPERIENCE)) add({ area: 'profile', level: 'block', title: 'تجربهٔ شخصی ساختگی', detail: `${part.label}: متن از تست یا تجربه‌ای می‌گوید که در اطلاعات شما نیست.`, evidence: clip(sentence) })
    if (profile === 'product') {
      if (has(PRICE, sentence)) add({ area: 'profile', level: 'block', title: 'قیمت در متن محصول', detail: `${part.label}: قیمت فقط از فیلد قیمت فروشگاه خوانده می‌شود؛ در توضیح ننویسید.`, evidence: clip(sentence) })
      if (has(WARRANTY, sentence) && !inSource(WARRANTY)) add({ area: 'profile', level: 'block', title: 'گارانتی یا ضمانتی که اعلام نکرده‌اید', detail: `${part.label}: شرایط گارانتی باید در اطلاعات قطعی محصول باشد.`, evidence: clip(sentence) })
    }
    if (profile !== 'page' && has(HEALTH, sentence) && !inSource(HEALTH)) add({ area: 'profile', level: 'block', title: 'ادعای درمانی یا سلامت', detail: `${part.label}: ادعای درمان یا نتیجهٔ تضمینی بدون مجوز و منبع منتشر نمی‌شود.`, evidence: clip(sentence) })
    if (profile === 'music' && has(MUSIC, sentence) && !inSource(MUSIC)) add({ area: 'profile', level: 'warn', title: 'اطلاعات انتشار یا افتخار موسیقی', detail: `${part.label}: نام اثر، تاریخ انتشار، لیبل، چارت یا جایزه را با منبع تطبیق دهید.`, evidence: clip(sentence) })
    if (profile === 'film' && has(FILM, sentence) && !inSource(FILM)) add({ area: 'profile', level: 'warn', title: 'عوامل، اکران یا جوایز فیلم', detail: `${part.label}: کارگردان، بازیگران، تاریخ اکران، فروش یا امتیاز را با منبع تطبیق دهید.`, evidence: clip(sentence) })
    if (profile === 'film' && has(SPOILER, sentence)) add({ area: 'profile', level: 'warn', title: 'احتمال لو رفتن داستان', detail: `${part.label}: پیش از این بخش هشدار اسپویل بگذارید یا آن را کوتاه کنید.`, evidence: clip(sentence) })
    if (profile === 'page' && has(CONTACT, sentence) && !inSource(CONTACT)) add({ area: 'profile', level: 'block', title: 'اطلاعات تماس یا نشانی ساختگی', detail: `${part.label}: تلفن، ایمیل یا نشانی باید از اطلاعات خود سایت بیاید.`, evidence: clip(sentence) })
  }
  for (const part of parts) {
    const quote = QUOTE.exec(part.text)
    if (quote && profile === 'music') add({ area: 'profile', level: 'block', title: 'نقل طولانی از متن ترانه', detail: `${part.label}: نقل بیش از چند سطر از ترانه حق نشر دارد؛ کوتاه کنید یا مجوز بگیرید.`, evidence: clip(quote[1]) })
    else if (quote) add({ area: 'claims', level: 'warn', title: 'نقل‌قول طولانی بدون منبع', detail: `${part.label}: گوینده و منبع نقل‌قول را مشخص کنید.`, evidence: clip(quote[1]) })
  }

  if (profile === 'magazine' || profile === 'music' || profile === 'film') {
    if (output.excerpt.length < 40 || output.excerpt.length > 320) add({ area: 'profile', level: 'warn', title: 'خلاصهٔ مطلب', detail: 'خلاصه بهتر است بین ۴۰ تا ۳۲۰ نویسه باشد تا در فهرست و نتایج جست‌وجو کامل دیده شود.' })
    if (output.sections.filter(s => s.heading.trim()).length < 2) add({ area: 'profile', level: 'warn', title: 'ساختار تیترها', detail: 'مطلب مجله دست‌کم دو میان‌تیتر لازم دارد.' })
    const body = normalize([output.title, output.excerpt, ...output.sections.map(s => `${s.heading} ${s.text}`)].join(' '))
    const missing = config.keywords.split(/[,،\n]/).map(k => k.trim()).filter(Boolean).filter(k => !body.includes(normalize(k)))
    if (missing.length) add({ area: 'profile', level: 'warn', title: 'کلمهٔ کلیدی استفاده نشده', detail: missing.slice(0, 5).join('، ') })
  }

  const expected = [...(config.cover ? [0] : []), ...Array.from({ length: config.inline }, (_, i) => i + 1)]
  for (const index of expected) {
    const image = input.images.find(x => x.index === index), name = index === 0 ? 'تصویر شاخص' : `تصویر داخلی ${index}`
    if (!image) { add({ area: 'images', level: 'block', title: `${name} ساخته نشده`, detail: 'تصاویر انتخاب‌شده کامل نیست.' }); continue }
    if (normalize(image.alt).trim().length < 5) add({ area: 'images', level: 'warn', title: `توضیح جایگزین ${name}`, detail: 'برای دسترس‌پذیری و سئو توضیح کوتاهی از تصویر لازم است.' })
    const section = index === 0 ? `${output.title} ${output.excerpt} ${output.coverPrompt}` : (() => { const s = output.sections[(index - 1) % output.sections.length]; return `${s.heading} ${s.text} ${s.imagePrompt}` })()
    const described = `${image.alt} ${image.caption} ${index === 0 ? output.coverDescription || '' : output.sections[(index - 1) % output.sections.length]?.imageDescription || ''}`
    const words = tokens(described), around = tokens(section)
    if (words.size >= 3 && ![...words].some(w => around.has(w))) add({ area: 'images', level: 'warn', title: `${name} با متن هم‌خوان نیست`, detail: 'توضیح تصویر هیچ واژهٔ مشترکی با متن همان بخش ندارد؛ تصویر را نگاه کنید.', evidence: clip(image.alt || image.caption) })
  }
  return findings
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()«»"'،]+|\bwww\.[^\s<>()«»"'،]+|(?<![\w/])\/(?:blog|products|p|shop|music|cinema|games|software|forum)\/[^\s<>()«»"'،.]+/gi
export const linksIn = (output: ProductionOutput) => [...new Set([output.excerpt, ...output.sections.map(s => s.text)].join('\n').match(URL_PATTERN) || [])].map(link => link.replace(/[.,;:!?؟]+$/, '')).slice(0, 20)

export function summarize(profile: QualityProfile, findings: QualityFinding[], matches: QualityMatch[]): QualityReport {
  const areas = Object.fromEntries((['similar', 'links', 'claims', 'images', 'profile'] as QualityArea[]).map(area => {
    const own = findings.filter(f => f.area === area)
    return [area, own.some(f => f.level === 'block') ? 'block' : own.length ? 'warn' : 'pass']
  })) as Record<QualityArea, QualityLevel>
  const level: QualityLevel = findings.some(f => f.level === 'block') ? 'block' : findings.length ? 'warn' : 'pass'
  return { profile, level, findings: findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1)).slice(0, 60), matches, checkedAt: new Date().toISOString(), areas }
}
