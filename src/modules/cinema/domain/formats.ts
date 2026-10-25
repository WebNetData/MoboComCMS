/**
 * Cinema formats: the kinds of title the owner manages (film, series, anime, documentary…). A format is one work
 * (MOVIE: download and stream links on the title) or has seasons and episodes (SERIES); a title's `kind` always
 * follows its format's structure, so every reader that knows only films and series keeps working.
 */
export type FormatStructure = 'MOVIE' | 'SERIES'
export const FORMAT_STRUCTURES: FormatStructure[] = ['MOVIE', 'SERIES']
export const STRUCTURE_LABEL: Record<FormatStructure, { fa: string; en: string; hint: string }> = {
  MOVIE: { fa: 'یک اثر (مثل فیلم)', en: 'One work (like a film)', hint: 'لینک‌های دانلود و پخش روی خود اثر؛ تاریخ اکران دارد.' },
  SERIES: { fa: 'فصل و قسمت (مثل سریال)', en: 'Seasons and episodes (like a series)', hint: 'فصل‌ها و قسمت‌ها، هر قسمت با لینک خودش؛ سال پایان و وضعیت پخش دارد.' },
}

export type CinemaFormat = {
  id: number
  slug: string
  name: string
  nameEn: string
  plural: string
  structure: FormatStructure
  icon: string
  sortOrder: number
  active: boolean
  /** Its own shelf on the cinema home. */
  homeShelf: boolean
}

export class CinemaFormatError extends Error {
  constructor(message: string, readonly status = 422) { super(message) }
}

/** The name a reader sees: the title's format, or film/series for a title saved before formats existed. */
export function formatLabel(title: { kind: string; format?: { name: string; nameEn: string } | null }, fa: boolean) {
  if (title.format) return fa ? title.format.name : title.format.nameEn || title.format.name
  return title.kind === 'SERIES' ? (fa ? 'سریال' : 'Series') : (fa ? 'فیلم' : 'Movie')
}

export const structureOf = (value: unknown): FormatStructure => (value === 'SERIES' ? 'SERIES' : 'MOVIE')

/** The format a title gets when it names none: the first active one of its structure (then any of it). */
export function defaultFormat<T extends Pick<CinemaFormat, 'structure' | 'sortOrder' | 'active' | 'id'>>(formats: T[], structure: FormatStructure): T | null {
  const ofStructure = formats.filter((format) => format.structure === structure).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return ofStructure.find((format) => format.active) || ofStructure[0] || null
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** What the admin form may write; the slug is the address (`/cinema/browse?format=`) and cannot change later. */
export function parseFormatInput(input: Record<string, unknown>, creating: boolean) {
  const data: Partial<Omit<CinemaFormat, 'id'>> = {}
  if (creating || input.name !== undefined) {
    const name = clean(input.name, 60)
    if (!name) throw new CinemaFormatError('نام نوع را بنویسید')
    data.name = name
  }
  if (input.nameEn !== undefined) data.nameEn = clean(input.nameEn, 60)
  if (input.plural !== undefined) data.plural = clean(input.plural, 60)
  if (input.icon !== undefined) data.icon = clean(input.icon, 8)
  if (input.sortOrder !== undefined) {
    const order = Number(input.sortOrder)
    if (!Number.isSafeInteger(order) || order < -9999 || order > 9999) throw new CinemaFormatError('ترتیب باید عددی بین ۹۹۹۹- و ۹۹۹۹ باشد')
    data.sortOrder = order
  }
  if (input.active !== undefined) data.active = input.active === true
  if (input.homeShelf !== undefined) data.homeShelf = input.homeShelf === true
  if (creating || input.structure !== undefined) {
    if (!FORMAT_STRUCTURES.includes(input.structure as FormatStructure)) throw new CinemaFormatError('ساختار را انتخاب کنید: یک اثر یا فصل و قسمت')
    data.structure = input.structure as FormatStructure
  }
  if (creating) {
    const slug = clean(input.slug, 40).toLowerCase()
    if (!SLUG.test(slug)) throw new CinemaFormatError('نشانی انگلیسی فقط حروف کوچک، عدد و خط تیره (مثلاً anime)')
    data.slug = slug
  } else if (input.slug !== undefined) throw new CinemaFormatError('نشانی نوع بعد از ساخت تغییر نمی‌کند')
  return data
}
