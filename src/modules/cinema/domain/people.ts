// The people of films and series (directors, producers, cast) as entities of their own, so a name on a film page
// leads to everything else that person made here. They are read out of what each title already stores (its director
// and producer lines and its cast list); nothing is typed twice.

export type CreditRole = 'DIRECTOR' | 'PRODUCER' | 'CAST'
export const CREDIT_ROLES: readonly CreditRole[] = ['DIRECTOR', 'PRODUCER', 'CAST']
/** One line of names (director, producer): several are separated by a comma, "و" or "&". */
export const splitPeopleLine = (value: unknown) => String(value || '').split(/[,،;&]|\sو\s|\sand\s/i).map((part) => part.trim()).filter(Boolean)
export interface Credit { name: string; role: CreditRole; character: string; image: string; order: number; nameEn?: string; imdbId?: string }

/** A person as an import names them: the Persian display name, the Latin name and the IMDb person, when known. */
export type PersonIdentity = { role: CreditRole; name: string; nameEn: string; imdbId: string }
const PERSIAN = /[؀-ۿ]/
/** Written in Persian (Arabic-script) letters. */
export const hasPersianLetters = (value: unknown) => PERSIAN.test(String(value ?? ''))
/** Written in Latin letters only, as IMDb gives names: a name to show in Persian too. */
export const isLatinName = (value: unknown) => /[A-Za-z]/.test(String(value ?? '')) && !PERSIAN.test(String(value ?? ''))
export const validImdbPerson = (value: unknown) => typeof value === 'string' && /^nm\d{7,12}$/.test(value) ? value : ''

/** How two spellings of a name are told to be the same person: case, spacing and Persian letter variants aside. */
export function normalizePersonName(value: string): string {
  return String(value || '').normalize('NFKC').replace(/[‌‍‎‏]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en')
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
const MAX_CREDITS = 60

/** The people an import (or the title form) names with their two names; anything malformed is left out. */
export function cleanIdentities(input: unknown): PersonIdentity[] {
  const out: PersonIdentity[] = []
  for (const raw of Array.isArray(input) ? input.slice(0, 120) : []) {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const role = CREDIT_ROLES.find(item => item === row.role)
    const name = clean(row.name, 120), nameEn = clean(row.nameEn, 120)
    if (!role || normalizePersonName(name).length < 2) continue
    out.push({ role, name, nameEn: isLatinName(nameEn) ? nameEn : '', imdbId: validImdbPerson(row.imdbId) })
  }
  return out
}

/**
 * The credits a title's own fields name: every director of the director line (several are separated by a
 * comma, "و" or "&"), every producer of the producer line, then the cast in the order given. One person is
 * credited once per role.
 */
export function creditsOf(title: { director: string; producer?: string; cast: unknown }): Credit[] {
  const out: Credit[] = []
  const seen = new Set<string>()
  const add = (name: string, role: CreditRole, character: string, image: string) => {
    const display = clean(name, 120), key = `${role}:${normalizePersonName(display)}`
    if (normalizePersonName(display).length < 2 || seen.has(key) || out.length >= MAX_CREDITS) return
    seen.add(key)
    out.push({ name: display, role, character, image, order: out.length })
  }
  for (const part of splitPeopleLine(title.director)) add(part, 'DIRECTOR', '', '')
  for (const part of splitPeopleLine(title.producer)) add(part, 'PRODUCER', '', '')
  let cast: unknown = title.cast
  if (typeof cast === 'string') { try { cast = JSON.parse(cast || '[]') } catch { cast = [] } }
  for (const row of Array.isArray(cast) ? cast : []) {
    const person = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const image = clean(person.image, 1000)
    const before = out.length
    add(String(person.name ?? ''), 'CAST', clean(person.role, 120), /^(https:\/\/|\/(?!\/))/.test(image) ? image : '')
    // A cast row may also carry the person's Latin name and IMDb person (from an import), kept with the credit.
    if (out.length > before) {
      const added = out[out.length - 1], nameEn = clean(person.nameEn, 120), imdbId = validImdbPerson(person.imdbId)
      if (isLatinName(nameEn)) added.nameEn = nameEn
      if (imdbId) added.imdbId = imdbId
    }
  }
  return out
}

export const PEOPLE_PAGE = 48
export const ROLE_LABEL: Record<CreditRole, { fa: string; en: string }> = { DIRECTOR: { fa: 'کارگردان', en: 'Director' }, PRODUCER: { fa: 'تهیه‌کننده', en: 'Producer' }, CAST: { fa: 'بازیگر', en: 'Cast' } }
