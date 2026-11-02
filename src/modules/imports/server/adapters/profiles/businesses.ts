import { db } from '@/platform/database/prisma'
import { auditSystemStrict } from '@/platform/audit/server'
import { writeBusinessProfile } from '@/modules/businesses/server/businesses'
import { normalizeBusinessProfile } from '@/modules/businesses/domain/profiles'
import { normalizeBusinessWebsite } from '@/modules/businesses/domain/businesses'
import { listedCategory } from '@/modules/businesses/server/vocabulary'
import { destinationActor } from '@/modules/imports/server/authority'
import { reindexItem } from '@/modules/search/server/search'
import { logEvent } from '@/platform/observability/logger'
import { latinSlug } from '@/modules/imports/domain/values'
import type { FieldDef } from '@/modules/imports/domain/types'
import { profileImporter, equal, jsonObject, serial, type ProfileRow } from './shared'

const fields: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی کسب‌وکار', type: 'text', maxLength: 190, updatable: false, group: 'meta', synonyms: ['external_id','id','business_id'] },
  { key: 'name', label: 'نام کسب‌وکار', type: 'text', maxLength: 120, requiredOnCreate: true, updateByDefault: false, group: 'main', synonyms: ['name','title','business_name','نام'] },
  { key: 'slug', label: 'نامک انگلیسی ثابت', type: 'slug', maxLength: 80, updatable: false, group: 'main', synonyms: ['slug','permalink'] },
  { key: 'kind', label: 'نوع کسب‌وکار', type: 'enum', group: 'main', updatable: false, enum: [{value:'EXTERNAL',label:'سایت بیرونی'},{value:'SELLER',label:'فروشندهٔ داخلی'},{value:'SITE',label:'فروشگاه خود سایت'}], synonyms: ['kind','type'] },
  { key: 'website', label: 'نشانی وب‌سایت', type: 'url', maxLength: 2048, group: 'main', synonyms: ['website','website_url','domain','url'] },
  { key: 'sellerId', label: 'شناسهٔ فروشندهٔ فعال (فقط ساخت)', type: 'int', group: 'relations', updatable: false, synonyms: ['seller_id'] },
  { key: 'category', label: 'دستهٔ مدیریت‌شدهٔ کسب‌وکار', type: 'text', maxLength: 80, group: 'relations', synonyms: ['category','category_name'] },
  { key: 'description', label: 'توضیح کسب‌وکار', type: 'longtext', maxLength: 2000, group: 'content', synonyms: ['description','summary','درباره'] },
  { key: 'status', label: 'وضعیت انتشار', type: 'enum', group: 'meta', enum: [{value:'DRAFT',label:'پیش‌نویس'},{value:'PUBLISHED',label:'منتشرشده'}], synonyms: ['status'] },
]
export const businessesImporter = profileImporter({
  id: 'businesses', model: 'businessProfile', label: 'کسب‌وکارها', entity: 'کسب‌وکار', module: 'businesses', requiredModules: ['reviews'], permissions: ['businesses.manage'], fields, titleKey: 'name', defaultStatus: 'DRAFT', identity: ['شناسهٔ خارجی در همین منبع', 'نامک ثابت', 'دامنهٔ استاندارد یا فروشندهٔ یکتا', 'نام یکتا'],
  read: async (id, reader) => await reader.businessProfile.findUnique({ where: { id } }) as ProfileRow | null,
  async matches(values, reader) {
    const domain = values.website ? normalizeBusinessWebsite(values.website).domain : null
    return await reader.businessProfile.findMany({ where: { OR: [...(values.slug ? [{ slug: String(values.slug) }] : []), ...(domain ? [{ domain }] : []), ...(values.sellerId ? [{ sellerId: Number(values.sellerId) }] : []), ...(values.name ? [{ name: String(values.name) }] : [])] }, take: 4 }) as ProfileRow[]
  },
  input: row => row ? { name: row.name, slug: row.slug, kind: row.kind, website: row.website, sellerId: row.sellerId, representativeId: row.representativeId, category: row.category, description: row.description, status: row.status } : { kind: 'EXTERNAL', category: '', description: '' },
  assertIdentity(values, previous) {
    if (values.kind && values.kind !== previous.kind || values.sellerId && Number(values.sellerId) !== previous.sellerId || values.website && normalizeBusinessWebsite(values.website).domain !== previous.domain) throw new Error('شناسهٔ خارجی، دامنه، نوع یا فروشنده به هویت‌های متفاوت اشاره می‌کنند')
  },
  async validate(input, previous, reader) {
    const data = normalizeBusinessProfile({ ...input, slug: previous?.slug || input.slug || latinSlug(input.name, 80), kind: input.kind || 'EXTERNAL' })
    if (previous && (data.slug !== previous.slug || data.kind !== previous.kind || data.domain !== previous.domain || data.sellerId !== previous.sellerId)) throw new Error('دامنه، نوع، نامک و اتصال فروشندهٔ کسب‌وکار ثبت‌شده تغییر نمی‌کند')
    const entries = data.category ? await reader.vocabulary.findMany({ where: { section: 'businesses', list: 'CATEGORY' }, select: { code: true, name: true, nameEn: true } }) : []
    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
    const exact = entries.find(entry => entry.code === data.category)
    const matching = exact ? [exact] : entries.filter(entry => [entry.name, entry.nameEn].some(value => value && normalize(value) === normalize(data.category)))
    if (matching.length > 1) throw new Error('نام دستهٔ کسب‌وکار مبهم است؛ کد دقیق دسته را وارد کنید')
    const category = await listedCategory(reader, matching[0]?.code || data.category, previous?.category as string | undefined)
    if (data.category && !category) throw new Error('دستهٔ کسب‌وکار در فهرست مدیریت‌شده وجود ندارد')
    if (data.sellerId && !await reader.seller.findFirst({ where: { id: data.sellerId, status: 'ACTIVE' }, select: { id: true } })) throw new Error('شناسهٔ فروشندهٔ فعال پیدا نشد')
    if (data.kind === 'SITE' && await reader.businessProfile.findFirst({ where: { kind: 'SITE', ...(previous ? { id: { not: previous.id } } : {}) }, select: { id: true } })) throw new Error('پروفایل فروشگاه سایت از قبل وجود دارد')
    return { ...data, category }
  },
  async write(input, previous, ctx, hooks) {
    const saved = await db.$transaction(async tx => { await hooks.beforeWrite(tx); const row = await writeBusinessProfile(tx, ctx.actor, { ...input, ...(previous ? { id: previous.id } : {}) }); await hooks.afterWrite(tx, row.id); return row }, { isolationLevel: 'Serializable', timeout: 30000 })
    await reindexItem({ type: 'business', id: saved.id }).catch(() => logEvent('warn', 'imports.index_failed', { adapter: 'businesses', id: saved.id })); return saved.id
  },
  async undo(change, ctx) {
    await db.$transaction(async tx => {
      const actor = await destinationActor(ctx, tx, true), row = await tx.businessProfile.findUnique({ where: { id: change.id } })
      if (!row) { if (change.kind === 'created') return; throw new Error('کسب‌وکار پیدا نشد') }
      const expected = change.kind === 'updated' ? change.after : jsonObject(change.stamp, 'سابقه').after
      if (!equal(serial(row), expected)) throw new Error('کسب‌وکار پس از ورود تغییر کرده؛ بازگردانی انجام نشد')
      if (change.kind === 'created') {
        const used = await Promise.all([tx.itemReview.count({ where: { itemType: 'business', itemId: row.id } }), tx.businessRequest.count({ where: { businessId: row.id } }), tx.businessPurchaseProof.count({ where: { businessId: row.id } }), tx.communityReport.count({ where: { businessId: row.id } }), tx.itemFavorite.count({ where: { itemType: 'business', itemId: row.id } }), tx.userCollectionItem.count({ where: { itemType: 'business', itemId: row.id } })])
        if (used.some(Boolean) || row.representativeId) throw new Error('کسب‌وکار تجربه، درخواست، نماینده یا فهرست مرتبط دارد؛ حذف نشد')
        if (!(await tx.businessProfile.deleteMany({ where: { id: row.id, updatedAt: row.updatedAt } })).count) throw new Error('کسب‌وکار هم‌زمان تغییر کرده است')
        await tx.itemStat.deleteMany({ where: { itemType: 'business', itemId: row.id } })
        await tx.importExternalRef.deleteMany({ where: { entityType: 'businessProfile', entityId: row.id } })
      } else {
        const before = change.before
        if (before.category && !await listedCategory(tx, String(before.category), row.category)) throw new Error('دستهٔ قبلی اکنون در دسترس نیست؛ بازگردانی نیازمند بررسی است')
        await writeBusinessProfile(tx, actor, { ...before, id: row.id })
      }
      await auditSystemStrict({ actor, action: 'import.profile.rollback', targetType: 'businessProfile', targetId: row.id, metadata: { jobId: ctx.jobId } }, tx)
    }, { isolationLevel: 'Serializable' })
    await reindexItem({ type: 'business', id: change.id }).catch(() => logEvent('warn', 'imports.index_failed', { adapter: 'businesses', id: change.id }))
  },
})
