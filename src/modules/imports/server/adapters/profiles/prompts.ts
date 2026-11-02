import { db } from '@/platform/database/prisma'
import { auditSystemStrict } from '@/platform/audit/server'
import { destinationActor } from '@/modules/imports/server/authority'
import { writePromptTemplate } from '@/modules/prompts/server/prompts'
import { templateInput, readShowcase, INPUT_KEYS } from '@/modules/prompts/domain/prompts'
import { knownCodes } from '@/modules/vocabulary/server/vocabulary'
import { reindexItem } from '@/modules/search/server/search'
import { logEvent } from '@/platform/observability/logger'
import { latinSlug } from '@/modules/imports/domain/values'
import { importImages, importFileLink } from '../common'
import type { FieldDef } from '@/modules/imports/domain/types'
import { profileImporter, equal, jsonObject, serial, type ProfileRow } from './shared'

const fields: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی الگو', type: 'text', maxLength: 190, group: 'meta', updatable: false, synonyms: ['external_id', 'id', 'source_id'] },
  { key: 'title', label: 'عنوان الگو', type: 'text', maxLength: 120, group: 'main', requiredOnCreate: true, updateByDefault: false, synonyms: ['title', 'name', 'عنوان'] },
  { key: 'slug', label: 'نامک انگلیسی ثابت', type: 'slug', maxLength: 100, group: 'main', updatable: false, synonyms: ['slug', 'permalink'] },
  { key: 'kind', label: 'نوع پرامپت', type: 'enum', group: 'main', requiredOnCreate: true, enum: ['TEXT','IMAGE','VIDEO','CODE','WEB'].map(value => ({ value, label: ({TEXT:'متن',IMAGE:'تصویر',VIDEO:'ویدیو',CODE:'کد',WEB:'وب'} as Record<string,string>)[value] })), synonyms: ['kind', 'type'] },
  { key: 'content', label: 'متن الگو با {{idea}}', type: 'longtext', maxLength: 12000, group: 'content', requiredOnCreate: true, synonyms: ['content', 'prompt', 'template', 'متن پرامپت'] },
  { key: 'summary', label: 'خلاصهٔ الگو', type: 'longtext', maxLength: 500, group: 'content', synonyms: ['summary', 'description'] },
  { key: 'example', label: 'ایدهٔ نمونه', type: 'longtext', maxLength: 1500, group: 'content', synonyms: ['example', 'idea'] },
  { key: 'category', label: 'کد دستهٔ فعال پرامپت', type: 'text', maxLength: 40, group: 'relations', synonyms: ['category', 'category_code'] },
  { key: 'tags', label: 'برچسب‌ها', type: 'list', group: 'relations', synonyms: ['tags', 'keywords'] },
  { key: 'defaults', label: 'مقادیر اولیه (شیء JSON)', type: 'json', group: 'content', synonyms: ['defaults', 'default_values'] },
  { key: 'sampleCover', label: 'تصویر نمونه یا پوستر', type: 'image', maxLength: 2048, group: 'media', synonyms: ['sample_cover', 'cover', 'image'] },
  { key: 'sampleVideo', label: 'لینک مستقیم ویدیوی نمونه', type: 'url', maxLength: 2048, group: 'media', synonyms: ['sample_video', 'video'] },
  { key: 'sampleAlt', label: 'توضیح دسترس‌پذیر تصویر', type: 'text', maxLength: 300, group: 'media', synonyms: ['sample_alt', 'alt'] },
  { key: 'sampleCaption', label: 'شرح نتیجهٔ نمونه', type: 'longtext', maxLength: 1000, group: 'content', synonyms: ['sample_caption', 'caption'] },
  { key: 'sampleCredit', label: 'اعتبار سازندهٔ نمونه', type: 'text', maxLength: 160, group: 'content', synonyms: ['sample_credit', 'credit'] },
  { key: 'sampleResult', label: 'متن نتیجهٔ نمونه', type: 'longtext', maxLength: 12000, group: 'content', synonyms: ['sample_result', 'result'] },
  { key: 'webLayout', label: 'ترکیب امن نمونهٔ وب', type: 'enum', group: 'content', enum: ['none','landing','dashboard'].map(value => ({ value, label: value })), synonyms: ['web_layout'] },
  { key: 'aspect', label: 'نسبت قاب نمونه', type: 'enum', group: 'media', enum: ['square','portrait','wide'].map(value => ({ value, label: value })), synonyms: ['aspect'] },
  { key: 'featured', label: 'انتخاب سردبیر', type: 'bool', group: 'meta', synonyms: ['featured'] },
  { key: 'sortOrder', label: 'ترتیب نمایش', type: 'int', group: 'meta', synonyms: ['sort_order'] },
  { key: 'status', label: 'وضعیت انتشار', type: 'enum', group: 'meta', enum: [{value:'DRAFT',label:'پیش‌نویس'},{value:'PUBLISHED',label:'منتشرشده'}], synonyms: ['status'] },
]
const payload = (input: Record<string, unknown>) => ({ ...input, tags: Array.isArray(input.tags) ? input.tags.join(', ') : input.tags || '', showcase: { cover: input.sampleCover || '', video: input.sampleVideo || '', alt: input.sampleAlt || '', caption: input.sampleCaption || '', credit: input.sampleCredit || '', result: input.sampleResult || '', webLayout: input.webLayout || 'none', aspect: input.aspect || 'square' } })

export const promptsImporter = profileImporter({
  id: 'prompts', model: 'promptTemplate', label: 'پرامپت مستر', entity: 'الگوی پرامپت', module: 'prompt-master', permissions: ['prompts.manage'], defaultStatus: 'DRAFT', fields, titleKey: 'title', identity: ['شناسهٔ خارجی در همین منبع', 'نامک انگلیسی', 'عنوان یکتای الگو'],
  read: async (id, reader) => await reader.promptTemplate.findUnique({ where: { id } }) as ProfileRow | null,
  matches: async (values, reader) => await reader.promptTemplate.findMany({ where: { OR: [...(values.slug ? [{ slug: String(values.slug) }] : []), ...(values.title ? [{ title: String(values.title) }] : [])] }, take: 3 }) as ProfileRow[],
  input(row) { const sample = readShowcase(row?.showcase); return row ? { title: row.title, slug: row.slug, content: row.content, summary: row.summary, example: row.example, category: row.category, kind: row.kind, tags: row.tags, defaults: row.defaults, status: row.status, featured: row.featured, sortOrder: row.sortOrder, sampleCover: sample.cover, sampleVideo: sample.video, sampleAlt: sample.alt, sampleCaption: sample.caption, sampleCredit: sample.credit, sampleResult: sample.result, webLayout: sample.webLayout, aspect: sample.aspect } : {} },
  async validate(input, previous, reader) {
    if (previous && !['DRAFT','PUBLISHED'].includes(String(previous.status))) throw new Error('الگوی در حال بازبینی یا زباله‌دان از ورود گروهی ویرایش نمی‌شود')
    const defaults = input.defaults === undefined ? {} : jsonObject(input.defaults, 'مقادیر اولیه')
    if ((Array.isArray(input.tags) ? input.tags.join(', ') : String(input.tags || '')).length > 300) throw new Error('مجموع برچسب‌ها حداکثر ۳۰۰ نویسه است')
    if (Object.entries(defaults).some(([key,value]) => !(INPUT_KEYS as readonly string[]).includes(key) || key === 'idea' || typeof value !== 'string' || value.length > 1000)) throw new Error('کلید یا مقدار اولیهٔ الگو پشتیبانی نمی‌شود')
    const raw = { ...input, slug: previous?.slug || input.slug || latinSlug(input.title), defaults: JSON.stringify(defaults) }
    const data = templateInput(payload(raw))
    if (data.category && !(await knownCodes(reader, 'prompts', 'CATEGORY', [data.category], previous ? [String(previous.category)] : [])).includes(data.category)) throw new Error('کد دستهٔ پرامپت را از فهرست مدیریت‌شده انتخاب کنید')
    return { ...raw, ...data }
  },
  mediaUrls: input => input.sampleCover ? [String(input.sampleCover)] : [],
  async media(input, allowed, ctx, messages, counters) {
    const data = { ...input }
    if ('sampleCover' in allowed) { const [url] = await importImages(ctx, [String(input.sampleCover)], messages, counters, 'تصویر نمونه'); if (!url) throw new Error('تصویر نمونه معتبر دریافت نشد'); data.sampleCover = url }
    if ('sampleVideo' in allowed) data.sampleVideo = await importFileLink(ctx, String(input.sampleVideo), messages)
    return data
  },
  async write(input, previous, ctx, hooks) {
    const row = await db.$transaction(async tx => { await hooks.beforeWrite(tx); const saved = await writePromptTemplate(tx, ctx.actor, { ...payload(input), ...(previous ? { id: previous.id, version: previous.version } : {}) }); await hooks.afterWrite(tx, saved.id); return saved }, { isolationLevel: 'Serializable', timeout: 30000 })
    await reindexItem({ type: 'prompt', id: row.id }).catch(() => logEvent('warn', 'imports.index_failed', { adapter: 'prompts', id: row.id })); return row.id
  },
  async undo(change, ctx) {
    await db.$transaction(async tx => {
      const actor = await destinationActor(ctx, tx, true), row = await tx.promptTemplate.findUnique({ where: { id: change.id } })
      if (!row) { if (change.kind === 'created') return; throw new Error('الگو پیدا نشد') }
      const expected = change.kind === 'updated' ? change.after : jsonObject(change.stamp, 'سابقه').after
      if (!equal(serial(row), expected)) throw new Error('الگو پس از ورود تغییر کرده؛ بازگردانی انجام نشد')
      if (change.kind === 'created') {
        if (await tx.itemFavorite.count({ where: { itemType: 'prompt', itemId: row.id } }) || await tx.userCollectionItem.count({ where: { itemType: 'prompt', itemId: row.id } })) throw new Error('الگو در فهرست کاربران استفاده شده؛ حذف نشد')
        if (!(await tx.promptTemplate.deleteMany({ where: { id: row.id, version: row.version } })).count) throw new Error('نسخهٔ الگو تغییر کرده است')
        await tx.importExternalRef.deleteMany({ where: { entityType: 'promptTemplate', entityId: row.id } })
      } else {
        const before = change.before, sample = readShowcase(before.showcase)
        const saved = await writePromptTemplate(tx, actor, { ...before, id: row.id, version: row.version, showcase: sample })
        await tx.promptTemplate.updateMany({ where: { id: row.id, version: saved.version }, data: { publishedAt: before.publishedAt ? new Date(String(before.publishedAt)) : null } })
      }
      await auditSystemStrict({ actor, action: 'import.profile.rollback', targetType: 'promptTemplate', targetId: row.id, metadata: { jobId: ctx.jobId } }, tx)
    }, { isolationLevel: 'Serializable' })
    await reindexItem({ type: 'prompt', id: change.id }).catch(() => logEvent('warn', 'imports.index_failed', { adapter: 'prompts', id: change.id }))
  },
})
