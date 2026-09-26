import { dictionaries, LOCALES, type Locale } from './dictionaries'

export function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (LOCALES as readonly string[]).includes(x)
}

const RTL_LANGS = new Set(['fa', 'ar', 'he', 'ur', 'ps', 'sd'])
export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LANGS.has(locale.split('-')[0]) ? 'rtl' : 'ltr'
}

export function dict(locale: Locale) {
  return dictionaries[locale] ?? dictionaries.en
}

export function normalizeLocale(value: string | undefined | null, fallback: Locale = 'en'): Locale {
  return isLocale(value) ? value : fallback
}
