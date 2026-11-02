import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { live as liveMusic } from '@/modules/media/server/queries/core'
import { saveMediaItem } from '@/modules/media/server/admin'
import { savePerson } from '@/modules/cinema/server/person-admin'
import { CelebrityError } from '../errors'
import { celebritySlug, suggestedCelebritySlug, validCelebritySlug } from '@/modules/celebrities/domain/celebrities'
import { normalizeFacts, parseFacts } from '@/modules/celebrities/domain/fields'
import { contentChanged } from '@/modules/content/server/events'
import { unlinkedMusicProfile } from './import-state'
const liveTitle = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' })
// ------------------------------------------------------------------ one profile for every section

type Actor = { id: number; email: string }
type AuditPerson = (tx: Prisma.TransactionClient, id: number, created: boolean) => Promise<unknown>

/** What the central editor shows of one person: the profile and what they have published in each section. */
export async function celebrityProfile(id: number) {
  const row = await db.celebrity.findUnique({ where: { id }, select: { id: true, slug: true, name: true, featured: true, facts: true, cinemaPersonId: true, musicArtistId: true, cinemaPerson: { select: { name: true, image: true, bio: true } }, musicArtist: { select: { name: true, nameEn: true, image: true, bio: true, slug: true } } } })
  if (!row) throw new CelebrityError('چهره پیدا نشد')
  const music = liveMusic()
  const [titles, tracks, albums] = await Promise.all([
    row.cinemaPersonId ? db.cinemaTitle.count({ where: { ...liveTitle(new Date()), credits: { some: { personId: row.cinemaPersonId } } } }) : 0,
    row.musicArtistId ? db.musicTrack.count({ where: { ...music, OR: [{ artistId: row.musicArtistId }, { credits: { some: { artistId: row.musicArtistId } } }] } }) : 0,
    row.musicArtistId ? db.musicAlbum.count({ where: { ...music, artistId: row.musicArtistId } }) : 0,
  ])
  return {
    id: row.id, slug: row.slug, featured: row.featured, works: { titles, tracks, albums }, facts: parseFacts(row.facts),
    name: row.musicArtist?.name || row.cinemaPerson?.name || row.name, nameEn: row.musicArtist?.nameEn || '',
    image: row.musicArtist?.image || row.cinemaPerson?.image || '', bio: row.musicArtist?.bio || row.cinemaPerson?.bio || '',
  }
}

/** A free music address: from the English name when it has Latin letters, else from the person; "-2", "-3"… if taken. */
async function freeMusicSlug(nameEn: string, fallback: string, reader: Prisma.TransactionClient | typeof db = db) {
  let base = fallback
  try { base = suggestedCelebritySlug(nameEn) || fallback } catch { base = fallback }
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`
    if (!await reader.musicArtist.findUnique({ where: { slug }, select: { id: true } })) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

async function checkSlug(db: Prisma.TransactionClient, slug: string, id?: number) {
  const [current, alias] = await Promise.all([
    db.celebrity.findUnique({ where: { slug }, select: { id: true } }),
    db.celebritySlugAlias.findUnique({ where: { slug }, select: { celebrityId: true } }),
  ])
  if (current && current.id !== id || alias && alias.celebrityId !== id) throw new CelebrityError('این نشانی قبلاً برای هنرمند دیگری استفاده شده؛ نشانی دیگری انتخاب کنید', 409)
}

async function freeProfileSlug(tx: Prisma.TransactionClient, base: string, id?: number) {
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 76).replace(/-+$/, '')}-${n}`
    try { await checkSlug(tx, candidate, id); return candidate } catch (error) { if (!(error instanceof CelebrityError && error.status === 409)) throw error }
  }
  throw new CelebrityError('نشانی آزاد پیدا نشد؛ یک نشانی دیگر وارد کنید', 409)
}

/**
 * Saves one person once for the whole site (owner, 2026-10-27: an artist is one, not one per section). The music
 * artist and the cinema person are written through each section's own save (its checks, history and concurrency) with
 * the same name, picture and biography, and a side the person lacks is made, so they can be picked in the forms of
 * both sections. The cinema side is not taken when its name belongs to another entry (people split apart stay apart).
 * The cinema picture is kept from then on (a title's import does not replace it).
 */
export async function saveCelebrityProfile(raw: Record<string, unknown>, actor: Actor, auditPerson: AuditPerson, options: { beforeWrite?: (tx: Prisma.TransactionClient) => Promise<void>; afterWrite?: (tx: Prisma.TransactionClient, id: number) => Promise<void> } = {}) {
  const saved = await db.$transaction(async tx => {
    await options.beforeWrite?.(tx)
    const row = await saveProfileIn(tx, raw, actor, auditPerson)
    await options.afterWrite?.(tx, row.id)
    return row
  }, { isolationLevel: 'Serializable', timeout: 30000, maxWait: 10000 })
  if (saved.musicArtistId) contentChanged({ type: 'artist', id: saved.musicArtistId }, null, saved)
  return saved
}

async function saveProfileIn(tx: Prisma.TransactionClient, raw: Record<string, unknown>, actor: Actor, auditPerson: AuditPerson) {
  const id = Number(raw.id) || 0
  const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
  const name = text(raw.name), nameEn = text(raw.nameEn), image = String(raw.image ?? '').trim(), bio = String(raw.bio ?? '')
  if (normalizePersonName(name).length < 2) throw new CelebrityError('نام را وارد کنید')
  // The profile fields (country, born, died, the owner's own), kept as their kinds keep them; absent = unchanged.
  const facts = raw.facts === undefined ? undefined : JSON.stringify(normalizeFacts(raw.facts, await tx.vocabulary.findMany({ where: { section: 'celebrities', list: 'PROFILE_FIELD' }, select: { code: true, family: true } })))
  const row = id ? await tx.celebrity.findUnique({ where: { id }, select: { id: true, slug: true, cinemaPersonId: true, musicArtistId: true, cinemaPerson: { select: { profileVersion: true } } } }) : null
  if (id && !row) throw new CelebrityError('چهره پیدا نشد')
  const requested = raw.slug === undefined || raw.slug === '' ? '' : typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : null
  if (requested === null || requested && !validCelebritySlug(requested)) throw new CelebrityError('نشانی باید حداکثر ۸۰ نویسه و فقط شامل حروف انگلیسی، عدد و خط تیره باشد', 422)
  if (row && raw.expectedSlug !== undefined && raw.expectedSlug !== row.slug) throw new CelebrityError('نشانی هنرمند هم‌زمان تغییر کرده؛ فرم را دوباره باز کنید', 409)
  // Refuse known collisions before writing either section's profile.
  if (requested) await checkSlug(tx, requested, row?.id)

  let cinemaPersonId = row?.cinemaPersonId ?? null
  if (cinemaPersonId) await savePerson({ id: cinemaPersonId, profileVersion: row!.cinemaPerson!.profileVersion, name, bio, image, imageLocked: true }, auditPerson, tx)
  else {
    // Credits already name this person (a film saved before): that record is theirs, unless another entry holds it.
    const known = await tx.cinemaPerson.findUnique({ where: { normalizedName: normalizePersonName(name) }, select: { id: true, profileVersion: true, mergedIntoId: true, celebrity: { select: { id: true } } } })
    if (known && !known.mergedIntoId && (!known.celebrity || known.celebrity.id === row?.id)) {
      await savePerson({ id: known.id, profileVersion: known.profileVersion, name, bio, image, imageLocked: true }, auditPerson, tx)
      cinemaPersonId = known.id
    } else if (!known) cinemaPersonId = (await savePerson({ name, bio, image, imageLocked: true }, auditPerson, tx)).id
  }

  let musicArtistId = row?.musicArtistId ?? null
  const profile = { name, nameEn, image, bio }
  if (musicArtistId) await saveMediaItem('music-artists', profile, musicArtistId, actor, { client: tx })
  else {
    const known = await unlinkedMusicProfile(tx, name, nameEn)
    if (known) {
      await saveMediaItem('music-artists', { ...profile, expectedUpdatedAt: known.updatedAt.toISOString() }, known.id, actor, { client: tx })
      musicArtistId = known.id
    } else {
      const slug = await freeMusicSlug(nameEn, cinemaPersonId ? `artist-${cinemaPersonId}` : `artist-${Date.now().toString(36)}`, tx)
      musicArtistId = Number((await saveMediaItem('music-artists', { ...profile, slug }, null, actor, { client: tx })).row.id)
    }
  }

  return (async () => {
    // A record of this person may already hold an entry of its own (a sync ran between the saves): one entry stays.
    const held = await tx.celebrity.findMany({ where: { OR: [...(musicArtistId ? [{ musicArtistId }] : []), ...(cinemaPersonId ? [{ cinemaPersonId }] : [])], ...(row ? { id: { not: row.id } } : {}) }, select: { id: true, slug: true } })
    const keep = row ? row : held[0]
    for (const other of held) if (other.id !== keep?.id) {
      await tx.celebritySlugAlias.updateMany({ where: { celebrityId: other.id }, data: { celebrityId: keep!.id } })
      await tx.celebrity.delete({ where: { id: other.id } })
      await tx.celebritySlugAlias.create({ data: { slug: other.slug, celebrityId: keep!.id } })
    }
    const data = { name, normalizedName: normalizePersonName(name), cinemaPersonId, musicArtistId, ...(raw.featured === undefined ? {} : { featured: raw.featured === true }), ...(facts === undefined ? {} : { facts }) }
    const current = keep ? await tx.celebrity.findUniqueOrThrow({ where: { id: keep.id }, select: { slug: true } }) : null
    if (row && current?.slug !== row.slug) throw new CelebrityError('نشانی هنرمند هم‌زمان تغییر کرده؛ فرم را دوباره باز کنید', 409)
    const fallback = suggestedCelebritySlug(nameEn) || (cinemaPersonId ? celebritySlug({ cinemaId: cinemaPersonId }) : `artist-${musicArtistId}`)
    const slug = requested || row?.slug || await freeProfileSlug(tx, fallback, keep?.id)
    await checkSlug(tx, slug, keep?.id)
    if (!keep) return tx.celebrity.create({ data: { ...data, slug } })
    if (current!.slug !== slug) {
      // One transaction changes the canonical URL and reserves its old address.
      await tx.celebritySlugAlias.deleteMany({ where: { slug, celebrityId: keep.id } })
      await tx.celebritySlugAlias.create({ data: { slug: current!.slug, celebrityId: keep.id } })
    }
    return tx.celebrity.update({ where: { id: keep.id }, data: { ...data, slug } })
  })()
}

