import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { PEOPLE_PAGE, creditsOf, normalizePersonName, type CreditRole } from '@/modules/cinema/domain/people'
import { imdbPhoto } from '@/modules/cinema/domain/imdb-page'

type Tx = Prisma.TransactionClient
const CURSOR = 'cinema.people.backfill'
const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })

/** Reuse the canonical person's established pictures before contacting an outside source. */
export async function storedPersonPictures(names: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(names.slice(0,48).map(normalizePersonName).filter(Boolean))]
  if (!keys.length) return new Map()
  const rows = await db.cinemaPerson.findMany({ where: { normalizedName: { in: keys } }, select: { normalizedName: true, image: true }, take: 48 })
  return new Map(rows.filter(row => /^\/(?:files\/|api\/media\/)/.test(row.image) || imdbPhoto(row.image) || /^https:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9/._-]+$/.test(row.image)).map(row => [row.normalizedName,row.image]))
}

/**
 * Makes a title's credits say what its director line and cast list say now: people are found by their
 * normalized name or created, credits no longer named are removed. A person left without any credit stays
 * (their address keeps working and they return with their next film). Safe to repeat.
 */
export async function syncCredits(tx: Tx, titleId: number, directorImages?: unknown) {
  const title = await tx.cinemaTitle.findUnique({ where: { id: titleId }, select: { director: true, cast: true } })
  if (!title) return 0
  const credits = creditsOf(title)
  if (Array.isArray(directorImages)) for (const credit of credits) {
    if (credit.role !== 'DIRECTOR') continue
    const photo = directorImages.slice(0,8).find(row => row && normalizePersonName(String(row.name || '')) === normalizePersonName(credit.name))
    if (photo && (imdbPhoto(photo.image) || /^https:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9/._-]+$/.test(String(photo.image)) || /^\/api\/media\/transfers\/[a-f0-9-]{36}$/.test(String(photo.image)) || /^\/files\/download\/cinema\/images\/director\/[^?#]+\.webp$/.test(String(photo.image)))) credit.image=String(photo.image).slice(0,1000)
  }
  const keep: number[] = []
  for (const credit of credits) {
    const normalizedName = normalizePersonName(credit.name)
    const person = await tx.cinemaPerson.upsert({ where: { normalizedName }, create: { name: credit.name, normalizedName, image: credit.image }, update: {} })
    // Keep an established local picture. Promote an external picture to its local copy with a claim.
    const localCopy=/^\/api\/media\/transfers\/[a-f0-9-]{36}$/.test(credit.image) || /^\/files\/download\/cinema\/images\/(actors|director)\/[^?#]+\.webp$/.test(credit.image)
    if (credit.image && (!person.image || localCopy && /^https:\/\//.test(person.image))) await tx.cinemaPerson.updateMany({ where: { id: person.id, image: person.image }, data: { image: credit.image } })
    const row = await tx.cinemaCredit.upsert({
      where: { titleId_personId_role: { titleId, personId: person.id, role: credit.role } },
      create: { titleId, personId: person.id, role: credit.role, character: credit.character, sortOrder: credit.order },
      update: { character: credit.character, sortOrder: credit.order },
    })
    keep.push(row.id)
  }
  await tx.cinemaCredit.deleteMany({ where: { titleId, id: { notIn: keep } } })
  return credits.length
}

/**
 * Worker step: reads the credits out of titles that were saved before people existed, a batch a pass in id
 * order with a cursor. Once every title has been read it does nothing; a later save keeps its own title in step.
 */
export async function backfillCredits(limit = 100) {
  const saved = (await db.setting.findUnique({ where: { key: CURSOR } }))?.value || '0'
  if (saved === 'done') return { read: 0, done: true }
  const titles = await db.cinemaTitle.findMany({ where: { id: { gt: Number(saved) || 0 } }, orderBy: { id: 'asc' }, take: limit, select: { id: true } })
  for (const title of titles) await db.$transaction((tx) => syncCredits(tx, title.id))
  const value = titles.length < limit ? 'done' : String(titles[titles.length - 1].id)
  await db.setting.upsert({ where: { key: CURSOR }, create: { key: CURSOR, value }, update: { value } })
  return { read: titles.length, done: value === 'done' }
}

/** The people credited on a title, by normalized name: the film page links a name it shows to its person. */
export async function creditLinks(titleId: number): Promise<Map<string, number>> {
  const rows = await db.cinemaCredit.findMany({ where: { titleId }, select: { person: { select: { id: true, normalizedName: true } } } }).catch(() => [])
  return new Map(rows.map((row) => [row.person.normalizedName, row.person.id]))
}

/** A person with the published titles they are credited on, newest first, by role. Null when nothing of theirs is public. */
export async function personPage(id: number, now = new Date()) {
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const person = await db.cinemaPerson.findUnique({ where: { id }, select: { id: true, name: true, image: true, bio: true } })
  if (!person) return null
  const credits = await db.cinemaCredit.findMany({ where: { personId: id, title: live(now) }, orderBy: [{ title: { publishedAt: 'desc' } }, { titleId: 'desc' }], take: 300, select: { role: true, character: true, titleId: true } })
  if (!credits.length) return null
  const idsOf = (role: CreditRole) => credits.filter((credit) => credit.role === role).map((credit) => credit.titleId)
  return { ...person, directed: idsOf('DIRECTOR'), acted: idsOf('CAST'), characters: new Map(credits.filter((credit) => credit.role === 'CAST' && credit.character).map((credit) => [credit.titleId, credit.character])) }
}

/** People with at least one published title, the most credited first; `q` narrows by name. */
export async function peopleDirectory(input: { page?: unknown; q?: unknown }, now = new Date()) {
  const page = Math.max(1, Math.min(500, Math.trunc(Number(input.page)) || 1))
  const q = normalizePersonName(String(input.q ?? '')).slice(0, 60)
  const where = { credits: { some: { title: live(now) } }, ...(q ? { normalizedName: { contains: q } } : {}) }
  const [total, rows] = await Promise.all([
    db.cinemaPerson.count({ where }),
    db.cinemaPerson.findMany({ where, orderBy: [{ credits: { _count: 'desc' } }, { id: 'asc' }], skip: (page - 1) * PEOPLE_PAGE, take: PEOPLE_PAGE, select: { id: true, name: true, image: true, credits: { where: { title: live(now) }, select: { role: true } } } }),
  ])
  return {
    q, page, pages: Math.max(1, Math.ceil(total / PEOPLE_PAGE)), total,
    people: rows.map((row) => ({ id: row.id, name: row.name, image: row.image, titles: row.credits.length, director: row.credits.some((credit) => credit.role === 'DIRECTOR'), cast: row.credits.some((credit) => credit.role === 'CAST') })),
  }
}
