// A magazine post's format (article, news, review, video, interview, and the owner's own) is a code of the
// POST_FORMAT list; the format's family decides which extra facts the post has. The facts are kept together as one
// validated JSON object (`Post.formatData`); the form edits them as flat `fmt*` fields. A fact of another family is
// kept (switching back finds it) but only the current family's facts are shown. Pure: no database or UI.

export const FORMAT_FAMILIES: [string, string][] = [['ARTICLE', 'مقاله'], ['NEWS', 'خبر'], ['REVIEW', 'نقد و بررسی'], ['VIDEO', 'ویدیو'], ['INTERVIEW', 'مصاحبه']]

export class PostFormatError extends Error {
  constructor(message: string, readonly status = 422) { super(message) }
}

export type FormatData = {
  score?: number
  pros?: string[]
  cons?: string[]
  verdict?: string
  videoUrl?: string
  sourceName?: string
  sourceUrl?: string
  guestName?: string
  guestRole?: string
}

/** The form's flat fields and the fact each one fills. */
export const FORMAT_FORM_KEYS = {
  fmtScore: 'score', fmtPros: 'pros', fmtCons: 'cons', fmtVerdict: 'verdict', fmtVideoUrl: 'videoUrl',
  fmtSourceName: 'sourceName', fmtSourceUrl: 'sourceUrl', fmtGuestName: 'guestName', fmtGuestRole: 'guestRole',
} as const satisfies Record<string, keyof FormatData>
export type FormatFormKey = keyof typeof FORMAT_FORM_KEYS

const line = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const lines = (value: unknown) => (Array.isArray(value) ? value.map(String) : String(value ?? '').split(/\r?\n/)).map((item) => line(item, 200)).filter(Boolean).slice(0, 12)
function address(value: unknown, label: string): string {
  const url = String(value ?? '').trim()
  if (!url) return ''
  if (/^\/(?!\/)[^\s<>\\]*$/.test(url)) return url.slice(0, 2000)
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new PostFormatError(`${label} معتبر نیست`) }
  if (!['http:', 'https:'].includes(parsed.protocol) || url.length > 2000 || /[\s<>\\]/.test(url)) throw new PostFormatError(`${label} معتبر نیست`)
  return url
}
function score(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined
  const number = Number(String(value).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace('٫', '.'))
  if (!Number.isFinite(number) || number < 0 || number > 10) throw new PostFormatError('امتیاز باید عددی از ۰ تا ۱۰ باشد')
  return Math.round(number * 10) / 10
}

/** One fact, cleaned; an empty value removes it. */
export function cleanFact(key: keyof FormatData, value: unknown): FormatData[keyof FormatData] {
  switch (key) {
    case 'score': return score(value)
    case 'pros': case 'cons': { const items = lines(value); return items.length ? items : undefined }
    case 'verdict': return line(value, 300) || undefined
    case 'videoUrl': return address(value, 'نشانی ویدیو') || undefined
    case 'sourceUrl': return address(value, 'نشانی منبع') || undefined
    case 'sourceName': case 'guestName': return line(value, 120) || undefined
    case 'guestRole': return line(value, 160) || undefined
  }
}

/** The stored facts, read leniently: anything malformed is left out. */
export function readFormatData(json: unknown): FormatData {
  let raw: unknown = json
  if (typeof json === 'string') { try { raw = JSON.parse(json || '{}') } catch { return {} } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: FormatData = {}
  for (const key of Object.values(FORMAT_FORM_KEYS)) {
    try { const value = cleanFact(key, (raw as Record<string, unknown>)[key]); if (value !== undefined) (out as Record<string, unknown>)[key] = value } catch { /* left out */ }
  }
  return out
}

/** Does the save carry any of the form's format fields? */
export const hasFormatFields = (body: Record<string, unknown> | null | undefined) => !!body && Object.keys(FORMAT_FORM_KEYS).some((key) => body[key] !== undefined)

/** The stored JSON after a save: the facts the form sent replace those it had; the rest are kept. */
export function mergeFormatData(stored: unknown, body: Record<string, unknown>): string {
  const data: Record<string, unknown> = { ...readFormatData(stored) }
  for (const [formKey, key] of Object.entries(FORMAT_FORM_KEYS)) {
    if (body[formKey] === undefined) continue
    const value = cleanFact(key, body[formKey])
    if (value === undefined) delete data[key]
    else data[key] = value
  }
  return JSON.stringify(Object.fromEntries(Object.values(FORMAT_FORM_KEYS).filter((key) => data[key] !== undefined).map((key) => [key, data[key]])))
}

/** The facts as the form's flat fields (lists one per line). */
export function formatFormValues(stored: unknown): Record<FormatFormKey, string> {
  const data = readFormatData(stored)
  return Object.fromEntries(Object.entries(FORMAT_FORM_KEYS).map(([formKey, key]) => {
    const value = data[key]
    return [formKey, Array.isArray(value) ? value.join('\n') : value === undefined ? '' : String(value)]
  })) as Record<FormatFormKey, string>
}

/** Each fact's name, for the proposal panel and the page. */
export const FACT_LABELS: Record<keyof FormatData, string> = {
  score: 'امتیاز', pros: 'نقاط قوت', cons: 'نقاط ضعف', verdict: 'جمع‌بندی', videoUrl: 'نشانی ویدیو', sourceName: 'منبع', sourceUrl: 'نشانی منبع', guestName: 'مهمان', guestRole: 'سمت مهمان',
}

/** The facts in words, one per line (lists joined), for a reviewer comparing a proposal. */
export function describeFormatData(stored: unknown): string {
  const data = readFormatData(stored)
  return Object.entries(data).map(([key, value]) => `${FACT_LABELS[key as keyof FormatData]}: ${Array.isArray(value) ? value.join('، ') : value}`).join(' · ') || '—'
}

/** The schema.org type of an item a review can be about; other kinds (a person, a thread…) are not reviewed items. */
const REVIEWED_TYPES: Record<string, string> = { product: 'Product', title: 'Movie', game: 'VideoGame', software: 'SoftwareApplication', album: 'MusicAlbum', track: 'MusicRecording', business: 'LocalBusiness' }

/**
 * A review article's structured data, for review stars in search results: only with a score and a linked item the
 * review is about (the first one of a reviewable kind), since a review must name what it reviews.
 */
export function reviewJsonLd(input: { facts: FormatData; items: { type: string; title: string; url: string; image: string }[]; url: string; author?: string; published?: string; base: string }) {
  const item = input.items.find((entry) => REVIEWED_TYPES[entry.type])
  if (input.facts.score === undefined || !item) return null
  const absolute = (value: string) => (/^https?:\/\//.test(value) ? value : `${input.base}${value.startsWith('/') ? '' : '/'}${value}`)
  return {
    '@context': 'https://schema.org', '@type': 'Review', url: input.url,
    itemReviewed: { '@type': REVIEWED_TYPES[item.type], name: item.title, url: absolute(item.url), ...(item.image ? { image: absolute(item.image) } : {}) },
    reviewRating: { '@type': 'Rating', ratingValue: input.facts.score, bestRating: 10, worstRating: 0 },
    ...(input.author ? { author: { '@type': 'Person', name: input.author } } : {}),
    ...(input.published ? { datePublished: input.published } : {}),
    ...(input.facts.verdict ? { reviewBody: input.facts.verdict } : {}),
  }
}

/** Which facts a family shows. */
export const FAMILY_FACTS: Record<string, (keyof FormatData)[]> = {
  ARTICLE: [], NEWS: ['sourceName', 'sourceUrl'], REVIEW: ['score', 'pros', 'cons', 'verdict'], VIDEO: ['videoUrl'], INTERVIEW: ['guestName', 'guestRole'],
}

/** The facts of the post's own family only, for its page. */
export function factsFor(family: string, stored: unknown): FormatData {
  const data = readFormatData(stored), keys = FAMILY_FACTS[family] ?? []
  return Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])) as FormatData
}
