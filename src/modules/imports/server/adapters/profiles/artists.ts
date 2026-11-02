import { db } from '@/platform/database/prisma'
import { auditSystemStrict } from '@/platform/audit/server'
import { saveCelebrityProfile, celebrityImportState, restoreCelebrityImportState, type CelebrityImportState } from '@/modules/celebrities/server/celebrities'
import { suggestedCelebritySlug } from '@/modules/celebrities/domain/celebrities'
import { normalizeFacts, parseFacts } from '@/modules/celebrities/domain/fields'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { artistProfilePatch } from '@/modules/music/domain/artist-profile'
import { personProfileInput } from '@/modules/cinema/domain/person-profile'
import { destinationActor } from '@/modules/imports/server/authority'
import { contentChanged } from '@/modules/content/server/events'
import { importImages } from '../common'
import type { FieldDef } from '@/modules/imports/domain/types'
import { profileImporter, jsonObject, serial, type ProfileRow } from './shared'

const fields: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی هنرمند', type: 'text', maxLength: 190, updatable: false, group: 'meta', synonyms: ['external_id','id','artist_id'] },
  { key: 'name', label: 'نام هنرمند', type: 'text', maxLength: 120, requiredOnCreate: true, updateByDefault: false, group: 'main', synonyms: ['name','artist','artist_name','نام'] },
  { key: 'nameEn', label: 'نام انگلیسی برای نامک', type: 'text', maxLength: 160, group: 'main', synonyms: ['name_en','english_name','artist_en'] },
  { key: 'slug', label: 'نامک انگلیسی ثابت', type: 'slug', maxLength: 80, updatable: false, group: 'main', synonyms: ['slug','permalink'] },
  { key: 'image', label: 'تصویر مشترک هنرمند', type: 'image', maxLength: 2048, group: 'media', synonyms: ['image','photo','artist_image','تصویر'] },
  { key: 'bio', label: 'زندگی‌نامه', type: 'html', maxLength: 20000, group: 'content', synonyms: ['bio','biography','description','زندگی نامه'] },
  { key: 'facts', label: 'فیلدهای پروفایل (شیء JSON با کد فیلد)', type: 'json', group: 'relations', synonyms: ['facts','profile_fields'] },
  { key: 'featured', label: 'هنرمند منتخب', type: 'bool', group: 'meta', synonyms: ['featured'] },
]
type ArtistRow = ProfileRow & { musicArtist?: Record<string,unknown> | null; cinemaPerson?: Record<string,unknown> | null }
export const artistsImporter = profileImporter({
  id: 'artists', model: 'celebrity', label: 'هنرمندان (پروفایل مرکزی)', entity: 'هنرمند', module: 'music', requiredModules: ['cinema'], permissions: ['music.manage','cinema.manage'], fields, titleKey: 'name', identity: ['شناسهٔ خارجی در همین منبع', 'نامک مرکزی ثابت', 'نام یا نام انگلیسی بدون ابهام؛ همنام‌ها خودکار ادغام نمی‌شوند'],
  read: async (id, reader) => await reader.celebrity.findUnique({ where: { id }, include: { musicArtist: true, cinemaPerson: true } }) as ArtistRow | null,
  matches: async (values, reader) => await reader.celebrity.findMany({ where: { OR: [...(values.slug ? [{ slug: String(values.slug) }] : []), ...(values.name ? [{ normalizedName: normalizePersonName(String(values.name)) }] : []), ...(values.nameEn ? [{ musicArtist: { nameEn: String(values.nameEn) } }] : [])] }, include: { musicArtist: true, cinemaPerson: true }, take: 4 }) as ArtistRow[],
  input(raw) { const row = raw as ArtistRow | null; return row ? { name: row.musicArtist?.name || row.cinemaPerson?.name || row.name, nameEn: row.musicArtist?.nameEn || '', slug: row.slug, image: row.musicArtist?.image || row.cinemaPerson?.image || '', bio: row.musicArtist?.bio || row.cinemaPerson?.bio || '', facts: row.facts === '{}' ? '' : parseFacts(row.facts), featured: row.featured } : { image: '', bio: '', featured: false } },
  async validate(input, previous, reader, allowed) {
    const slug = previous?.slug || input.slug || suggestedCelebritySlug(String(input.nameEn || ''))
    if (!slug) throw new Error('برای هنرمند جدید نام انگلیسی یا نامک انگلیسی معتبر وارد کنید')
    const artist = artistProfilePatch({ name: input.name, nameEn: input.nameEn || '', image: input.image || '', bio: input.bio || '' }, !previous)
    personProfileInput({ name: input.name, image: input.image || '', bio: input.bio || '', imageLocked: true })
    if (previous && !Object.hasOwn(allowed || {}, 'facts')) return { ...input, ...artist, slug, facts: undefined }
    const definition = await reader.vocabulary.findMany({ where: { section: 'celebrities', list: 'PROFILE_FIELD' }, select: { code: true, family: true } })
    const rawFacts = input.facts === undefined || input.facts === '' ? {} : jsonObject(input.facts, 'فیلدهای پروفایل')
    const known = new Set(definition.map(field => field.code))
    if (Object.keys(rawFacts).some(key => !known.has(key))) throw new Error('کد فیلد پروفایل شناخته‌شده نیست؛ ابتدا آن را در فیلدهای هنرمندان تعریف کنید')
    const facts = normalizeFacts(rawFacts, definition)
    if (Object.entries(rawFacts).some(([key,value]) => value !== '' && value != null && !facts[key])) throw new Error('مقدار یکی از فیلدهای پروفایل معتبر نیست')
    const reserved = await reader.celebritySlugAlias.findUnique({ where: { slug: String(slug) }, select: { celebrityId: true } })
    if (reserved && reserved.celebrityId !== previous?.id) throw new Error('این نامک از قبل برای هنرمند دیگری رزرو شده است')
    return { ...input, ...artist, slug, facts }
  },
  mediaUrls: input => input.image ? [String(input.image)] : [],
  async media(input, allowed, ctx, messages, counters) {
    if (!('image' in allowed)) return input
    ctx.organization = { section: 'music', artist: String(input.nameEn || input.name), artistImage: true }
    const [image] = await importImages(ctx, [String(input.image)], messages, counters, 'تصویر هنرمند')
    if (!image) throw new Error('تصویر هنرمند معتبر دریافت نشد')
    return { ...input, image }
  },
  snapshot: async (row, input, reader) => await celebrityImportState(row?.id ?? null, input, reader) as unknown as Record<string,unknown>,
  async write(input, previous, ctx, hooks) {
    const saved = await saveCelebrityProfile({ ...input, ...(previous ? { id: previous.id, expectedSlug: previous.slug } : {}) }, ctx.actor,
      (tx,id,created) => auditSystemStrict({ actor: ctx.actor, action: created ? 'cinema.person.created' : 'cinema.person.updated', targetType: 'cinema-person', targetId: id, metadata: { jobId: ctx.jobId, from: 'imports' } }, tx), hooks)
    return saved.id
  },
  async undo(change, ctx) {
    const before = change.kind === 'updated' ? change.before : jsonObject(change.stamp, 'سابقه').before
    const after = change.kind === 'updated' ? change.after : jsonObject(change.stamp, 'سابقه').after
    if (!before || !after) throw new Error('سابقهٔ پروفایل مرکزی کامل نیست')
    await db.$transaction(async tx => {
      const actor = await destinationActor(ctx, tx, true)
      if (!await tx.celebrity.findUnique({ where: { id: change.id }, select: { id: true } })) { if (change.kind === 'created') return; throw new Error('هنرمند پیدا نشد') }
      await restoreCelebrityImportState(tx, serial(before) as CelebrityImportState, serial(after) as CelebrityImportState, actor,
        (client,id,created) => auditSystemStrict({ actor, action: created ? 'cinema.person.created' : 'cinema.person.updated', targetType: 'cinema-person', targetId: id, metadata: { jobId: ctx.jobId, from: 'import-rollback' } }, client))
      if (change.kind === 'created') await tx.importExternalRef.deleteMany({ where: { entityType: 'celebrity', entityId: change.id } })
      await auditSystemStrict({ actor, action: 'import.profile.rollback', targetType: 'celebrity', targetId: change.id, metadata: { jobId: ctx.jobId } }, tx)
    }, { isolationLevel: 'Serializable', timeout: 30000 })
    const musicId = Number((after as CelebrityImportState).musicArtist?.id)
    if (musicId) contentChanged({ type: 'artist', id: musicId }, null, {})
  },
})
