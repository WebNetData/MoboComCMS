import { latinDigits } from '@/shared/text/digits'

export const DEMAND_SECTIONS = [
  { id: 'store', module: 'store', label: 'کالا', permission: 'cms.products', path: '/products' },
  { id: 'cinema', module: 'cinema', label: 'فیلم یا سریال', permission: 'cinema.manage', path: '/cinema' },
  { id: 'games', module: 'games', label: 'بازی', permission: 'games.manage', path: '/games' },
  { id: 'software', module: 'software', label: 'نرم‌افزار', permission: 'software.manage', path: '/software' },
  { id: 'music', module: 'music', label: 'آهنگ یا آلبوم', permission: 'music.manage', path: '/music' },
  { id: 'magazine', module: 'journal', label: 'مطلب', permission: 'cms.posts', path: '/blog' },
  { id: 'forum', module: 'forum', label: 'موضوع گفت‌وگو', permission: 'forum.moderate', path: '/forum' },
] as const
export type DemandSection = typeof DEMAND_SECTIONS[number]['id']
export const demandSection = (value: unknown) => DEMAND_SECTIONS.find(section => section.id === value) || null
export const DEMAND_STATUS: Record<string, string> = { OPEN: 'ثبت شده', REVIEWING: 'در حال بررسی', FULFILLED: 'آماده شده', DECLINED: 'فعلاً قابل انجام نیست' }
export class DemandError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export function demandText(input: unknown, max: number) {
  return typeof input === 'string' ? input.normalize('NFKC').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''
}
/** Conservative equality, not a fuzzy identity decision. User explicitly chooses joining. */
export const demandTitleKey = (title: string) => latinDigits(title).toLowerCase().replace(/[ك]/g, 'ک').replace(/[يى]/g, 'ی').replace(/[\s\u200c]+/g, ' ').trim()
export function demandDraft(raw: Record<string, unknown>) {
  const section = demandSection(raw.section), title = demandText(raw.title, 160), note = demandText(raw.note, 1500)
  if (!section || title.length < 2) throw new DemandError('بخش و نام موردنیاز را مشخص کنید')
  return { section: section.id, title, normalizedTitle: demandTitleKey(title), note }
}
export const demandId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
