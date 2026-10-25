import { GAME_MODES, LOCALIZATIONS, STORES } from './games'
import { GAME_PLATFORMS } from '@/modules/media/domain/media'

/**
 * The owner's lists for games. A game stores each entry's `code` (a platform or store name, a play-mode or
 * localisation code); the code never changes, while the name shown, icon, order and whether it is offered do.
 */
export type VocabularyList = 'PLATFORM' | 'STORE' | 'MODE' | 'LOCALIZATION'
export const VOCABULARY_LISTS: VocabularyList[] = ['PLATFORM', 'STORE', 'MODE', 'LOCALIZATION']
export const LIST_META: Record<VocabularyList, { title: string; one: string; icon: string; hint: string; codeHint: string; example: string }> = {
  PLATFORM: { title: 'پلتفرم‌ها', one: 'پلتفرم', icon: '🖥️', hint: 'روی هر بازی، در فیلتر پلتفرم، تقویم انتشار و تاریخ انتشار هر پلتفرم.', codeHint: 'نامی که روی بازی ذخیره و در سایت دیده می‌شود (مثلاً PS5).', example: 'Steam Deck' },
  STORE: { title: 'فروشگاه‌های رسمی', one: 'فروشگاه', icon: '🛒', hint: 'در «خرید از فروشگاه‌های رسمی» صفحهٔ هر بازی.', codeHint: 'نام فروشگاه که روی بازی ذخیره و نمایش داده می‌شود.', example: 'Ubisoft Store' },
  MODE: { title: 'حالت‌های بازی', one: 'حالت بازی', icon: '🎮', hint: 'نشان‌های صفحهٔ بازی و فیلتر «حالت بازی».', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً BATTLE_ROYALE).', example: 'BATTLE_ROYALE' },
  LOCALIZATION: { title: 'فارسی‌سازی', one: 'نوع فارسی‌سازی', icon: '🗣️', hint: 'نشان‌های فارسی‌سازی و فیلتر «فارسی‌سازی».', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً FA_VOICE).', example: 'FA_VOICE' },
}

export type VocabularyEntry = { id: number; list: VocabularyList; code: string; name: string; nameEn: string; icon: string; sortOrder: number; active: boolean }
export type Vocabulary = Record<VocabularyList, VocabularyEntry[]>

export class VocabularyError extends Error {
  constructor(message: string, readonly status = 422) { super(message) }
}

/** The values the code had fixed before the lists were the owner's: what a site without the table still shows. */
export function defaultVocabulary(): Vocabulary {
  const entry = (list: VocabularyList, code: string, name: string, sortOrder: number): VocabularyEntry => ({ id: 0, list, code, name, nameEn: '', icon: '', sortOrder, active: true })
  return {
    PLATFORM: GAME_PLATFORMS.map((code, i) => entry('PLATFORM', code, code, i)),
    STORE: STORES.map((code, i) => entry('STORE', code, code, i)),
    MODE: Object.entries(GAME_MODES).map(([code, name], i) => entry('MODE', code, name, i)),
    LOCALIZATION: Object.entries(LOCALIZATIONS).map(([code, name], i) => entry('LOCALIZATION', code, name, i)),
  }
}

export const isVocabularyList = (value: unknown): value is VocabularyList => VOCABULARY_LISTS.includes(value as VocabularyList)
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** What the admin may write. The code is set once, when the entry is created. */
export function parseVocabularyInput(input: Record<string, unknown>, creating: boolean) {
  const data: Partial<Omit<VocabularyEntry, 'id'>> = {}
  if (creating) {
    if (!isVocabularyList(input.list)) throw new VocabularyError('فهرست معتبر نیست')
    data.list = input.list
    const code = data.list === 'MODE' || data.list === 'LOCALIZATION' ? clean(input.code, 40).toUpperCase().replace(/[\s-]+/g, '_') : clean(input.code, 40)
    if (!code || code.includes(',') || code.includes('،')) throw new VocabularyError('کد را بنویسید؛ ویرگول در کد مجاز نیست')
    if ((data.list === 'MODE' || data.list === 'LOCALIZATION') && !/^[A-Z0-9_]+$/.test(code)) throw new VocabularyError('کد فقط حروف بزرگ انگلیسی، عدد و خط زیر (مثلاً FA_VOICE)')
    data.code = code
  } else if (input.code !== undefined || input.list !== undefined) throw new VocabularyError('کد و فهرست یک مورد بعد از ساخت تغییر نمی‌کند')
  if (creating || input.name !== undefined) {
    const name = clean(input.name, 60) || (creating ? data.code! : '')
    if (!name) throw new VocabularyError('نام را بنویسید')
    data.name = name
  }
  if (input.nameEn !== undefined) data.nameEn = clean(input.nameEn, 60)
  if (input.icon !== undefined) data.icon = clean(input.icon, 8)
  if (input.sortOrder !== undefined) {
    const order = Number(input.sortOrder)
    if (!Number.isSafeInteger(order) || order < -9999 || order > 9999) throw new VocabularyError('ترتیب باید عددی بین ۹۹۹۹- و ۹۹۹۹ باشد')
    data.sortOrder = order
  }
  if (input.active !== undefined) data.active = input.active === true
  return data
}

/** code → name, for showing a game's stored codes. */
export const labelsOf = (entries: VocabularyEntry[]): Record<string, string> => Object.fromEntries(entries.map((entry) => [entry.code, entry.name]))
