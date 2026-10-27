/**
 * «چهره‌ها»: one directory and one page per person across the site's sections. Roles a visitor filters by: the
 * cinema ones come from film and series credits, «خواننده» from songs and albums the person sings, the rest from the
 * music credit roles of the owner's list (composer, lyricist…).
 */

export const CELEBRITY_ROLES = {
  actor: { label: 'بازیگر', plural: 'بازیگران', source: 'cinema', code: 'CAST' },
  director: { label: 'کارگردان', plural: 'کارگردانان', source: 'cinema', code: 'DIRECTOR' },
  producer: { label: 'تهیه‌کننده', plural: 'تهیه‌کنندگان', source: 'cinema', code: 'PRODUCER' },
  singer: { label: 'خواننده', plural: 'خوانندگان', source: 'music', code: '' },
} as const

export type CelebrityRole = keyof typeof CELEBRITY_ROLES

/** A role in the address: one of the fixed ones, or `credit-<CODE>` for a music credit role of the owner's list. */
export function parseCelebrityRole(value: unknown): { role: CelebrityRole | null; creditRole: string } {
  const text = String(value ?? '').trim()
  if (Object.hasOwn(CELEBRITY_ROLES, text)) return { role: text as CelebrityRole, creditRole: '' }
  const credit = /^credit-([A-Z][A-Z0-9_]{0,39})$/.exec(text)
  return { role: null, creditRole: credit ? credit[1] : '' }
}

/** The stable address of a person's page: a singer's music address, else the cinema person's number. */
export const celebritySlug = (source: { musicSlug?: string; cinemaId?: number }) =>
  source.musicSlug ? String(source.musicSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80) || '' : source.cinemaId ? `person-${source.cinemaId}` : ''

/** Preview and server fallback use the same English-name slug; Persian names stay names. */
export const suggestedCelebritySlug = (nameEn: string) => nameEn.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-+|-+$/g, '')

export function validCelebritySlug(value: unknown) {
  return typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}
