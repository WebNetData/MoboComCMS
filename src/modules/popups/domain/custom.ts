/** Bounded presentation choices, never administrator-supplied CSS or executable markup. */
export const CUSTOM_LAYOUTS = [
  { id: 'split', label: 'تصویر کنار متن' }, { id: 'top', label: 'تصویر بالای متن' },
  { id: 'background', label: 'تصویر پس‌زمینه' }, { id: 'text', label: 'فقط متن و نشان' },
] as const
export const CUSTOM_PALETTES = [{ id: 'auto', label: 'هماهنگ با سایت' }, { id: 'dark', label: 'تیره' }, { id: 'light', label: 'روشن' }] as const
export const CUSTOM_ACCENTS = [{ id: 'blue', label: 'آبی' }, { id: 'red', label: 'قرمز' }, { id: 'amber', label: 'کهربایی' }, { id: 'green', label: 'سبز' }] as const
export const CUSTOM_ICONS = [{ id: 'arrow', label: 'پیکان' }, { id: 'link', label: 'پیوند' }, { id: 'bell', label: 'اطلاعیه' }, { id: 'megaphone', label: 'خبر' }, { id: 'flag', label: 'هشدار' }, { id: 'gift', label: 'هدیه' }, { id: 'store', label: 'فروشگاه' }, { id: 'check', label: 'تأیید' }, { id: 'none', label: 'بدون آیکن' }] as const
export type CustomPopupStyle = {
  layout: typeof CUSTOM_LAYOUTS[number]['id']; palette: typeof CUSTOM_PALETTES[number]['id']; accent: typeof CUSTOM_ACCENTS[number]['id']
  align: 'start' | 'center'; width: 'compact' | 'wide'; imageFit: 'cover' | 'contain'; buttonStyle: 'solid' | 'outline'; buttonIcon: typeof CUSTOM_ICONS[number]['id']
}
export const DEFAULT_CUSTOM_STYLE: CustomPopupStyle = { layout: 'split', palette: 'auto', accent: 'blue', align: 'start', width: 'wide', imageFit: 'cover', buttonStyle: 'solid', buttonIcon: 'arrow' }
const choice = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback
export function customPopupStyle(value: unknown): CustomPopupStyle {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    layout: choice(row.layout, CUSTOM_LAYOUTS.map(x => x.id), 'split'), palette: choice(row.palette, CUSTOM_PALETTES.map(x => x.id), 'auto'), accent: choice(row.accent, CUSTOM_ACCENTS.map(x => x.id), 'blue'),
    align: choice(row.align, ['start', 'center'], 'start'), width: choice(row.width, ['compact', 'wide'], 'wide'), imageFit: choice(row.imageFit, ['cover', 'contain'], 'cover'),
    buttonStyle: choice(row.buttonStyle, ['solid', 'outline'], 'solid'), buttonIcon: choice(row.buttonIcon, CUSTOM_ICONS.map(x => x.id), 'arrow'),
  }
}
