// The people of films and series (directors, producers, cast) as entities of their own, so a name on a film page
// leads to everything else that person made here. They are read out of what each title already stores (its director
// and producer lines and its cast list); nothing is typed twice.

export type CreditRole = 'DIRECTOR' | 'PRODUCER' | 'CAST'
export const CREDIT_ROLES: readonly CreditRole[] = ['DIRECTOR', 'PRODUCER', 'CAST']
/** One line of names (director, producer): several are separated by a comma, "و" or "&". */
export const splitPeopleLine = (value: unknown) => String(value || '').split(/[,،;&]|\sو\s|\sand\s/i).map((part) => part.trim()).filter(Boolean)
export interface Credit { name: string; role: CreditRole; character: string; image: string; order: number }

/** How two spellings of a name are told to be the same person: case, spacing and Persian letter variants aside. */
export function normalizePersonName(value: string): string {
  return String(value || '').normalize('NFKC').replace(/[‌‍‎‏]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en')
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
const MAX_CREDITS = 60

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
    add(String(person.name ?? ''), 'CAST', clean(person.role, 120), /^(https:\/\/|\/(?!\/))/.test(image) ? image : '')
  }
  return out
}

export const PEOPLE_PAGE = 48
export const ROLE_LABEL: Record<CreditRole, { fa: string; en: string }> = { DIRECTOR: { fa: 'کارگردان', en: 'Director' }, PRODUCER: { fa: 'تهیه‌کننده', en: 'Producer' }, CAST: { fa: 'بازیگر', en: 'Cast' } }
