/**
 * Managed lists: the values a section offers that the owner manages instead of the code (platforms, stores, play
 * modes and localisations of games, software licences, …). A section declares each of its lists once; an entry's
 * `code` is what an item stores and never changes, while its name, icon, order and whether it is offered are the
 * owner's. Pure: no database or UI dependencies.
 */
export type ListDefinition = {
  section: string
  list: string
  title: string
  /** One entry ("پلتفرم"), for buttons and headings. */
  one: string
  icon: string
  /** Where the list shows up, for the admin page. */
  hint: string
  codeHint: string
  example: string
  /** `name`: the code is a display name stored as it is (PS5, Steam); `code`: an upper-case code (FA_DUB). */
  codeRule: 'name' | 'code'
  /** The values the code had fixed before the list was the owner's, in order: [code, name, English name, family]. */
  seeds: ([string, string, string] | [string, string, string, string])[]
  /** The kinds an entry may be, when they decide something (a software platform's family sets which fields apply). */
  families?: [string, string][]
}

export type VocabularyEntry = { id: number; section: string; list: string; code: string; name: string; nameEn: string; icon: string; family: string; sortOrder: number; active: boolean }

export class VocabularyError extends Error {
  constructor(message: string, readonly status = 422) { super(message) }
}

/** The seeds as entries: what a site without the table (or an unreachable database) shows. */
export const seedEntries = (definition: ListDefinition): VocabularyEntry[] => definition.seeds.map(([code, name, nameEn, family = ''], sortOrder) => ({ id: 0, section: definition.section, list: definition.list, code, name, nameEn, icon: '', family, sortOrder, active: true }))

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** A code as its list writes it: names as they are, codes upper case with underscores. */
export function normalizeCode(definition: Pick<ListDefinition, 'codeRule'>, value: unknown) {
  return definition.codeRule === 'code' ? clean(value, 40).toUpperCase().replace(/[\s-]+/g, '_') : clean(value, 40)
}

/** What the admin may write. The code is set once, when the entry is created, in the list it belongs to. */
export function parseVocabularyInput(definition: ListDefinition | null, input: Record<string, unknown>, creating: boolean) {
  const data: Partial<Omit<VocabularyEntry, 'id'>> = {}
  if (creating) {
    if (!definition) throw new VocabularyError('فهرست معتبر نیست')
    const code = normalizeCode(definition, input.code)
    if (!code || code.includes(',') || code.includes('،')) throw new VocabularyError('کد را بنویسید؛ ویرگول در کد مجاز نیست')
    if (definition.codeRule === 'code' && !/^[A-Z0-9_]+$/.test(code)) throw new VocabularyError('کد فقط حروف بزرگ انگلیسی، عدد و خط زیر (مثلاً FA_VOICE)')
    Object.assign(data, { section: definition.section, list: definition.list, code })
  } else if (input.code !== undefined || input.list !== undefined || input.section !== undefined) throw new VocabularyError('کد و فهرست یک مورد بعد از ساخت تغییر نمی‌کند')
  if (creating || input.name !== undefined) {
    const name = clean(input.name, 60) || (creating ? data.code! : '')
    if (!name) throw new VocabularyError('نام را بنویسید')
    data.name = name
  }
  if (input.nameEn !== undefined) data.nameEn = clean(input.nameEn, 60)
  if (input.icon !== undefined) data.icon = clean(input.icon, 8)
  if (input.family !== undefined) {
    const family = clean(input.family, 20)
    if (family && !definition?.families?.some(([code]) => code === family)) throw new VocabularyError('این نوع برای این فهرست تعریف نشده است')
    data.family = family
  }
  if (input.sortOrder !== undefined) {
    const order = Number(input.sortOrder)
    if (!Number.isSafeInteger(order) || order < -9999 || order > 9999) throw new VocabularyError('ترتیب باید عددی بین ۹۹۹۹- و ۹۹۹۹ باشد')
    data.sortOrder = order
  }
  if (input.active !== undefined) data.active = input.active === true
  return data
}

/** code → name, for showing the codes an item stores. */
export const labelsOf = (entries: Pick<VocabularyEntry, 'code' | 'name'>[]): Record<string, string> => Object.fromEntries(entries.map((entry) => [entry.code, entry.name]))
