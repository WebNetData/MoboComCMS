import { LOCALES, type Locale } from '@/i18n/dictionaries'

/**
 * Languages this deployment offers, from SITE_LOCALES (comma separated, first
 * is the default). MoboComCMS ships Persian-only ("fa"); set "fa,en" to bring
 * back the bilingual switch. Foreign visitors use the Google Translate plugin.
 */
export function siteLocales(): Locale[] {
  const wanted = String(process.env.SITE_LOCALES || 'fa').split(',').map(value => value.trim())
  const list = wanted.filter((value): value is Locale => (LOCALES as readonly string[]).includes(value))
  return list.length ? [...new Set(list)] : ['fa']
}

/** The only language when the site is single-language, otherwise null. */
export function fixedLocale(): Locale | null {
  const list = siteLocales()
  return list.length === 1 ? list[0] : null
}

/** Cookie/stored preference → an offered language. */
export function offeredLocale(value: string | null | undefined): Locale {
  const list = siteLocales()
  return list.includes(value as Locale) ? value as Locale : list[0]
}
