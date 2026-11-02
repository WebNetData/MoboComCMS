import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { savePerson } from '@/modules/cinema/server/person-admin'
import { saveMediaItem } from '@/modules/media/server/admin'
import { CelebrityError } from '../errors'

type Reader = Prisma.TransactionClient | typeof db
type Part = Record<string, unknown> | null
export type CelebrityImportState = { celebrity: Part; cinemaPerson: Part; musicArtist: Part }
const json = (value: unknown) => JSON.parse(JSON.stringify(value))
const same = (a: unknown, b: unknown) => JSON.stringify(json(a)) === JSON.stringify(json(b))

/** Only adopt an unlinked, unmerged, unambiguous music profile; never infer a join of two people. */
export async function unlinkedMusicProfile(reader: Reader, name: string, nameEn: string) {
  const rows = await reader.musicArtist.findMany({ where: { mergedIntoId: null, celebrity: null, OR: [...(nameEn ? [{ nameEn }] : []), { name, ...(nameEn ? { nameEn: '' } : {}) }] }, take: 2 })
  if (rows.length > 1) throw new CelebrityError('چند پروفایل موسیقی همنام وجود دارد؛ ابتدا پروفایل مرکزی را مشخص کنید', 409)
  return rows[0] || null
}

/** Exact owner snapshots include linked profiles; human account data is never part of them. */
export async function celebrityImportState(id: number | null, input: Record<string, unknown>, reader: Reader = db): Promise<CelebrityImportState> {
  if (id) {
    const row = await reader.celebrity.findUnique({ where: { id }, include: { cinemaPerson: true, musicArtist: true } })
    if (!row) throw new CelebrityError('پروفایل مرکزی پیدا نشد', 404)
    const { cinemaPerson, musicArtist, ...celebrity } = row
    return json({ celebrity, cinemaPerson, musicArtist })
  }
  const known = await reader.cinemaPerson.findUnique({ where: { normalizedName: normalizePersonName(String(input.name || '')) }, include: { celebrity: { select: { id: true } } } })
  const cinemaPerson = known && !known.mergedIntoId && !known.celebrity ? (({ celebrity: _held, ...part }) => part)(known) : null
  const musicArtist = await unlinkedMusicProfile(reader, String(input.name || ''), String(input.nameEn || ''))
  return json({ celebrity: null, cinemaPerson, musicArtist })
}

/** Snapshot restore is an owner operation, called only after import authority has been rechecked in this transaction. */
export async function restoreCelebrityImportState(tx: Prisma.TransactionClient, before: CelebrityImportState, after: CelebrityImportState, actor: { id: number; email: string }, audit: (tx: Prisma.TransactionClient, id: number, created: boolean) => Promise<unknown>) {
  const centralId = Number(after.celebrity?.id)
  if (!Number.isSafeInteger(centralId) || centralId < 1) throw new CelebrityError('سابقهٔ هنرمند معتبر نیست')
  const now = await celebrityImportState(centralId, {}, tx)
  if (!same(now, after)) throw new CelebrityError('هنرمند یا یکی از پروفایل‌های مرتبط پس از ورود تغییر کرده؛ بازگردانی انجام نشد', 409)
  const musicId = Number(after.musicArtist?.id) || null, personId = Number(after.cinemaPerson?.id) || null
  if (!before.celebrity) {
    const used = await Promise.all([
      musicId ? tx.musicTrack.count({ where: { OR: [{ artistId: musicId }, { credits: { some: { artistId: musicId } } }] } }) : 0,
      musicId ? tx.musicAlbum.count({ where: { artistId: musicId } }) : 0,
      personId ? tx.cinemaCredit.count({ where: { personId } }) : 0,
      musicId ? tx.itemFavorite.count({ where: { itemType: 'artist', itemId: musicId } }) : 0,
      personId ? tx.itemFavorite.count({ where: { itemType: 'person', itemId: personId } }) : 0,
      tx.userCollectionItem.count({ where: { OR: [...(musicId ? [{ itemType: 'artist', itemId: musicId }] : []), ...(personId ? [{ itemType: 'person', itemId: personId }] : [])] } }),
    ])
    if (used.some(Boolean)) throw new CelebrityError('هنرمند در آثار یا فهرست کاربران استفاده شده؛ حذف نشد', 409)
  }
  // Restored versions stay monotonic; timestamps/version counters are never rewound.
  if (before.cinemaPerson) {
    if (Number(before.cinemaPerson.id) !== personId) throw new CelebrityError('رابطهٔ سینمایی سابقه معتبر نیست')
    await savePerson({ ...before.cinemaPerson, profileVersion: Number(after.cinemaPerson?.profileVersion) }, audit, tx)
  }
  if (before.musicArtist) {
    if (Number(before.musicArtist.id) !== musicId) throw new CelebrityError('رابطهٔ موسیقی سابقه معتبر نیست')
    await saveMediaItem('music-artists', { name: before.musicArtist.name, nameEn: before.musicArtist.nameEn, image: before.musicArtist.image, bio: before.musicArtist.bio, featured: before.musicArtist.featured, expectedUpdatedAt: after.musicArtist?.updatedAt }, musicId, actor, { client: tx })
  }
  if (before.celebrity) {
    const prior = before.celebrity
    if (Number(prior.id) !== centralId || prior.slug !== after.celebrity?.slug) throw new CelebrityError('هویت ثابت هنرمند در سابقه معتبر نیست')
    await tx.celebrity.update({ where: { id: centralId }, data: { name: String(prior.name), normalizedName: String(prior.normalizedName), featured: prior.featured === true, facts: String(prior.facts), cinemaPersonId: prior.cinemaPersonId ? Number(prior.cinemaPersonId) : null, musicArtistId: prior.musicArtistId ? Number(prior.musicArtistId) : null } })
  } else {
    await tx.celebritySlugAlias.deleteMany({ where: { celebrityId: centralId } })
    await tx.celebrity.delete({ where: { id: centralId } })
  }
  if (musicId && !before.musicArtist) {
    if (await tx.musicTrack.count({ where: { OR: [{ artistId: musicId }, { credits: { some: { artistId: musicId } } }] } }) || await tx.musicAlbum.count({ where: { artistId: musicId } })) throw new CelebrityError('پروفایل تازهٔ موسیقی اکنون اثر مرتبط دارد', 409)
    await tx.musicArtist.delete({ where: { id: musicId } })
  }
  if (personId && !before.cinemaPerson) {
    if (await tx.cinemaCredit.count({ where: { personId } })) throw new CelebrityError('پروفایل تازهٔ سینما اکنون اثر مرتبط دارد', 409)
    await tx.cinemaPerson.delete({ where: { id: personId } })
  }
}
