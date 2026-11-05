import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { assertFieldSelections } from '@/modules/imports/server/field-inputs'
import { claimImportUpdate, importContentState } from '@/modules/imports/server/edit-protection'
import { contentChanged } from '@/modules/content/server/events'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { normalizeAccess } from '@/modules/membership/domain/membership'
import { slugify } from '@/modules/taxonomy/domain/taxonomy'
import type { Counters, FieldDef, Message, PreviewLine, SourceItem } from '@/modules/imports/domain/types'
import { latinSlug, normalizeName, toText } from '@/modules/imports/domain/values'
import { countImages, htmlImageUrls, identityOf, importImages, loadIdentities, localizeHtml, planOnce, saveIdentity, seenBefore, snapshot, suffixOf, tracked, undoChange } from '@/modules/imports/server/adapters/common'
import type { ApplyResult, Change, ImportAdapter, ImportContext, Plan } from '@/modules/imports/server/registry'

/**
 * Magazine posts (Post) with their own category tree (PostCategory, several
 * categories per post). Store categories are a different tree and are never
 * touched here. HTML goes through the site sanitizer; images inside the text
 * and the cover go to the media library.
 */

const ENTITY = 'post'

const FIELDS: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی', type: 'text', group: 'meta', updatable: false, synonyms: ['id', 'external_id', 'post_id', 'source_id', 'guid', 'شناسه'] },
  { key: 'title', label: 'عنوان', type: 'text', group: 'main', requiredOnCreate: true, updateByDefault: false, synonyms: ['title', 'post_title', 'headline', 'name', 'عنوان', 'تیتر'] },
  { key: 'titleEn', label: 'عنوان انگلیسی', type: 'text', group: 'main', synonyms: ['title_en', 'english_title'] },
  { key: 'slug', label: 'نامک (slug)', type: 'slug', group: 'main', updatable: false, synonyms: ['slug', 'post_name', 'permalink', 'url_key'] },
  { key: 'excerpt', label: 'خلاصه', type: 'longtext', group: 'content', synonyms: ['excerpt', 'summary', 'lead', 'description', 'خلاصه', 'لید'] },
  { key: 'excerptEn', label: 'خلاصهٔ انگلیسی', type: 'longtext', group: 'content', synonyms: ['excerpt_en', 'summary_en'] },
  { key: 'content', label: 'متن کامل', type: 'html', group: 'content', requiredOnCreate: true, synonyms: ['content', 'body', 'post_content', 'html', 'content_html', 'text', 'متن', 'محتوا'] },
  { key: 'contentEn', label: 'متن انگلیسی', type: 'html', group: 'content', synonyms: ['content_en', 'body_en'] },
  { key: 'cover', label: 'تصویر شاخص', type: 'image', group: 'media', synonyms: ['cover', 'image', 'featured_image', 'thumbnail', 'post_thumbnail', 'تصویر', 'تصویر شاخص'] },
  { key: 'categories', label: 'دسته‌های مجله', type: 'category', group: 'relations', synonyms: ['categories', 'category', 'category_path', 'دسته', 'دسته‌ها'] },
  { key: 'author', label: 'نویسنده', type: 'text', group: 'relations', synonyms: ['author', 'author_email', 'author_name', 'writer', 'نویسنده'], hint: 'ایمیل یا نام کامل یکی از کاربران' },
  { key: 'status', label: 'وضعیت انتشار', type: 'enum', group: 'meta', enum: [{ value: 'PUBLISHED', label: 'منتشر' }, { value: 'DRAFT', label: 'پیش‌نویس' }], synonyms: ['status', 'post_status', 'published', 'وضعیت'] },
  { key: 'featured', label: 'ویژه', type: 'bool', group: 'meta', synonyms: ['featured', 'sticky', 'ویژه'] },
  { key: 'access', label: 'دسترسی', type: 'enum', group: 'meta', enum: [{ value: 'PUBLIC', label: 'همه' }, { value: 'MEMBERS', label: 'فقط اعضای ویژه' }], synonyms: ['access', 'visibility', 'دسترسی'] },
  { key: 'publishedAt', label: 'تاریخ انتشار', type: 'date', group: 'meta', synonyms: ['published_at', 'date', 'post_date', 'publish_date', 'تاریخ', 'تاریخ انتشار'] },
]

type Options = { missingCategories: 'create' | 'error'; categorySeparator: string; missingAuthor: 'importer' | 'error'; defaultStatus: 'PUBLISHED' | 'DRAFT' }
const normalizeOptions = (raw: Record<string, unknown>): Options => ({
  missingCategories: raw.missingCategories === 'error' ? 'error' : 'create',
  categorySeparator: ['>', '/', '|'].includes(String(raw.categorySeparator)) ? String(raw.categorySeparator) : '>',
  missingAuthor: raw.missingAuthor === 'error' ? 'error' : 'importer',
  defaultStatus: raw.defaultStatus === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
})

type Cat = { id: number; slug: string; name: string; parentId: number | null }
type Post = { id: number; slug: string; title: string; titleEn: string; excerpt: string; content: string; cover: string; status: string; editorFormat: string; updatedAt: Date }
type Data = { existing: Post | null; values: Record<string, unknown>; paths: string[][]; authorId: number | null }

async function cats(ctx: ImportContext): Promise<Map<number, Cat>> {
  const hit = ctx.cache.get('postcats') as Map<number, Cat> | undefined
  if (hit) return hit
  const rows = await db.postCategory.findMany({ select: { id: true, slug: true, name: true, parentId: true } })
  const map = new Map(rows.map((r) => [r.id, r]))
  ctx.cache.set('postcats', map)
  return map
}

function walk(map: Map<number, Cat>, path: string[]) {
  const found: Cat[] = []
  let parent: number | null = null
  for (let i = 0; i < path.length; i++) {
    const n = normalizeName(path[i])
    const hit = [...map.values()].find((c) => c.parentId === parent && (normalizeName(c.name) === n || c.slug === (latinSlug(path[i]) || slugify(path[i]))))
    if (!hit) return { found, missing: path.slice(i) }
    found.push(hit); parent = hit.id
  }
  return { found, missing: [] as string[] }
}

async function authors(ctx: ImportContext, names: string[]) {
  const map = (ctx.cache.get('authors') as Map<string, number> | undefined) || new Map<string, number>()
  const missing = names.filter((n) => n && !map.has(normalizeName(n)))
  if (missing.length) {
    const emails = missing.map((n) => n.trim().toLowerCase()).filter((n) => n.includes('@'))
    const users = await db.user.findMany({ where: { OR: [{ email: { in: emails } }, { name: { in: missing } }] }, select: { id: true, email: true, name: true } })
    for (const u of users) for (const key of [u.email, u.name]) if (key) map.set(normalizeName(key), u.id)
  }
  ctx.cache.set('authors', map)
  return map
}

async function prepare(_items: SourceItem[], values: Record<string, unknown>[], ctx: ImportContext) {
  await cats(ctx)
  const ids = values.map((v) => toText(v.externalId, 190)).filter(Boolean)
  await loadIdentities(ctx, ENTITY, ids)
  await authors(ctx, values.map((v) => toText(v.author, 190)).filter(Boolean))
  const fromIdentity = ids.map((id) => identityOf(ctx, ENTITY, id)).filter((id): id is number => !!id)
  const slugs = values.map((v) => toText(v.slug, 190)).filter(Boolean)
  const titles = values.map((v) => toText(v.title, 300)).filter(Boolean)
  const rows = await db.post.findMany({ where: { OR: [{ id: { in: fromIdentity } }, ...(slugs.length ? [{ slug: { in: slugs } }] : []), ...(titles.length ? [{ title: { in: titles } }] : [])] }, select: { id: true, slug: true, title: true, titleEn: true, excerpt: true, content: true, cover: true, status: true, editorFormat: true, updatedAt: true } })
  const map = (ctx.cache.get('posts') as Map<number, Post> | undefined) || new Map<number, Post>()
  for (const r of rows) map.set(r.id, r)
  ctx.cache.set('posts', map)
}

function findExisting(ctx: ImportContext, values: Record<string, unknown>): Post | null {
  const rows = [...((ctx.cache.get('posts') as Map<number, Post> | undefined) || new Map<number, Post>()).values()]
  const id = toText(values.externalId, 190) ? identityOf(ctx, ENTITY, toText(values.externalId, 190)) : undefined
  if (id) { const hit = rows.find((r) => r.id === id); if (hit) return hit }
  if (toText(values.slug, 190)) { const hit = rows.find((r) => r.slug === toText(values.slug, 190)); if (hit) return hit }
  const title = normalizeName(values.title)
  const matches = title ? rows.filter((r) => normalizeName(r.title) === title) : []
  return matches.length === 1 ? matches[0] : null
}

async function plan(item: SourceItem, values: Record<string, unknown>, _v: Record<string, unknown>[], ctx: ImportContext): Promise<Plan> {
  const o = ctx.settings.options as unknown as Options
  const messages: Message[] = []
  const counters: Counters = {}
  const title = toText(values.title, 300) || `ردیف ${item.rows[0]}`
  const sourceKey = toText(values.externalId, 190) || toText(values.slug, 190) || normalizeName(title)
  const fail = (text: string): Plan => ({ action: 'FAIL', title, sourceKey, messages: [...messages, { level: 'error', text }], counters, preview: { title, action: 'FAIL', lines: [], messages: [...messages, { level: 'error', text }] } })
  const existing = findExisting(ctx, values)
  const first = seenBefore(ctx, `post:${sourceKey}`, item.index)
  if (first !== null) { counters.duplicates = 1; messages.push({ level: 'warning', text: `تکراری در فایل (مثل رکورد ${first + 1})` }) }
  let action: Plan['action'] = existing || first !== null ? 'UPDATE' : 'CREATE'
  if (action === 'UPDATE' && ctx.settings.existing === 'skip') return { action: 'SKIP', title, sourceKey, entityId: existing?.id, messages: [...messages, { level: 'info', text: 'مطلب از قبل وجود دارد و رد می‌شود' }], counters, preview: { title, action: 'SKIP', lines: [], messages } }
  const mode = action === 'CREATE' ? 'create' : 'update'
  const allowed = ctx.allow(values, mode, existing ? snapshot(existing as unknown as Record<string, unknown>, ['title', 'titleEn', 'excerpt', 'content', 'cover', 'status']) : undefined)
  if (mode === 'create' && !('title' in allowed && 'content' in allowed)) return fail('عنوان و متن برای ساخت مطلب لازم‌اند')
  if (existing?.editorFormat === 'blocks-v1' && 'content' in allowed) return fail('متن این مطلب بلوکی است؛ HTML ورودی جایگزین سند بلوکی نمی‌شود. به‌روزرسانی «متن کامل» را بردارید و متن را در ادیتور همان مطلب ویرایش کنید.')
  const paths = (values.categories as string[][] | undefined) || []
  if ('categories' in allowed && !ctx.selected?.categories?.length) {
    const map = await cats(ctx)
    for (const path of paths) {
      const w = walk(map, path)
      if (!w.missing.length) continue
      if (o.missingCategories === 'error') return fail(`دستهٔ مجلهٔ «${path.join(' > ')}» وجود ندارد`)
      for (let i = w.found.length; i < path.length; i++) planOnce(ctx, `postcat:${path.slice(0, i + 1).map(normalizeName).join('>')}`, counters, 'categoriesCreated')
    }
  }
  let authorId: number | null = null
  if ('author' in allowed) {
    const map = await authors(ctx, [toText(allowed.author, 190)])
    authorId = ctx.selected?.author?.[0] ?? map.get(normalizeName(allowed.author)) ?? null
    if (authorId) counters.authorsMatched = 1
    else if (o.missingAuthor === 'error') return fail(`نویسندهٔ «${toText(allowed.author, 80)}» در کاربران سایت پیدا نشد`)
    else messages.push({ level: 'warning', text: `نویسندهٔ «${toText(allowed.author, 80)}» پیدا نشد؛ واردکننده به‌عنوان نویسنده ثبت می‌شود` })
  }
  countImages(ctx, [...('cover' in allowed ? [String(allowed.cover)] : []), ...('content' in allowed ? htmlImageUrls(String(allowed.content)) : []), ...('contentEn' in allowed ? htmlImageUrls(String(allowed.contentEn)) : [])], counters)
  if (action === 'UPDATE' && !Object.keys(allowed).length) { action = 'SKIP'; messages.push({ level: 'info', text: 'هیچ فیلدی برای به‌روزرسانی فعال نیست' }) }
  const lines: PreviewLine[] = ctx.previewLines(FIELDS, values, allowed, (key, value) => (key === 'categories' ? (value as string[][]).map((p) => p.join(' › ')).join('، ') : key === 'content' ? `${richTextToPlain(String(value), 90)}…` : value instanceof Date ? value.toISOString().slice(0, 10) : toText(value, 120)))
  return { action, title, sourceKey, entityId: existing?.id, messages, counters, data: { existing, values, paths, authorId } satisfies Data, preview: { title, image: toText(values.cover, 2048), action, lines, messages } }
}

async function ensureCategories(ctx: ImportContext, paths: string[][], changes: Change[], counters: Counters): Promise<number[]> {
  const map = await cats(ctx)
  if (ctx.selected?.categories?.length) {
    const rows = await db.postCategory.findMany({ where: { id: { in: ctx.selected.categories } }, select: { id: true } })
    if (rows.length !== ctx.selected.categories.length) throw new Error('دستهٔ انتخاب‌شده دیگر وجود ندارد')
    return ctx.selected.categories
  }
  const ids: number[] = []
  for (const path of paths) {
    const w = walk(map, path)
    let parent = w.found[w.found.length - 1] || null
    for (const name of w.missing) {
      let slug = latinSlug(name) || slugify(name) || `cat-${suffixOf(path.join('>'))}`
      for (let n = 2; await db.postCategory.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`
      const created = await db.postCategory.create({ data: { slug, name: name.slice(0, 120), parentId: parent?.id ?? null } })
      const cat = { id: created.id, slug, name: created.name, parentId: created.parentId }
      map.set(cat.id, cat)
      changes.push({ kind: 'created', entity: 'postCategory', id: cat.id, stamp: JSON.stringify({ slug, name: cat.name, parentId: cat.parentId }) })
      counters.categoriesCreated = (counters.categoriesCreated || 0) + 1
      parent = cat
    }
    if (parent && !ids.includes(parent.id)) ids.push(parent.id)
  }
  return ids
}

const TRACKED = ['title', 'titleEn', 'slug', 'excerpt', 'excerptEn', 'content', 'contentEn', 'cover', 'status', 'featured', 'access', 'publishedAt', 'authorId', 'categoryId']

function apply(item: SourceItem, planned: Plan, ctx: ImportContext): Promise<ApplyResult> {
  return tracked((changes) => applyPost(item, planned, ctx, changes))
}

/** Serialize an HTML write/undo against conversion to the canonical block document. */
async function claimLegacyBody(tx: Prisma.TransactionClient, id: number): Promise<string | null> {
  const current = await tx.post.findUnique({ where: { id }, select: { editorFormat: true, updatedAt: true } })
  if (!current) return 'مطلب موجود پیدا نشد'
  if (current.editorFormat !== 'legacy') return 'متن اکنون بلوکی است؛ HTML ورودی یا بازگشت آن ذخیره نشد.'
  const claimed = await tx.post.updateMany({ where: { id, editorFormat: current.editorFormat, updatedAt: current.updatedAt }, data: { updatedAt: current.updatedAt } })
  return claimed.count ? null : 'مطلب هم‌زمان تغییر کرده است؛ متن ذخیره نشد.'
}

async function applyPost(item: SourceItem, planned: Plan, ctx: ImportContext, changes: Change[]): Promise<ApplyResult> {
  const data = planned.data as Data
  const o = ctx.settings.options as unknown as Options
  const messages: Message[] = []
  const counters: Counters = {}
  let existing = data.existing
  if (!existing && planned.action === 'UPDATE') {
    const id = identityOf(ctx, ENTITY, toText(data.values.externalId, 190)) ?? identityOf(ctx, ENTITY, planned.sourceKey)
    existing = id ? await db.post.findUnique({ where: { id } }) as Post | null : null
    if (!existing) throw new Error('مطلب تکراریِ پیشین در این فایل پیدا نشد')
  }
  const mode = existing ? 'update' : 'create'
  const allowed = ctx.allow(data.values, mode, existing ? snapshot(existing as unknown as Record<string, unknown>, ['title', 'titleEn', 'excerpt', 'content', 'cover', 'status']) : undefined)
  if (existing?.editorFormat === 'blocks-v1' && 'content' in allowed) throw new Error('متن بلوکی از ورود HTML بازنویسی نمی‌شود؛ انتخاب فیلدهای به‌روزرسانی را اصلاح کنید.')
  const row: Record<string, unknown> = {}
  if ('title' in allowed) row.title = toText(allowed.title, 300)
  if ('titleEn' in allowed) row.titleEn = toText(allowed.titleEn, 300)
  if ('excerpt' in allowed) row.excerpt = richTextToPlain(String(allowed.excerpt), 500)
  if ('excerptEn' in allowed) row.excerptEn = richTextToPlain(String(allowed.excerptEn), 500)
  if ('content' in allowed) row.content = cleanRichText(await localizeHtml(ctx, String(allowed.content), messages, counters, 'تصویر متن'))
  if ('contentEn' in allowed) row.contentEn = cleanRichText(await localizeHtml(ctx, String(allowed.contentEn), messages, counters, 'تصویر متن انگلیسی'))
  if ('cover' in allowed) { const [img] = await importImages(ctx, [String(allowed.cover)], messages, counters, 'تصویر شاخص'); if (img) row.cover = img }
  if ('status' in allowed) row.status = allowed.status
  else if (!existing) row.status = o.defaultStatus
  if ('featured' in allowed) row.featured = allowed.featured === true
  if ('access' in allowed) row.access = normalizeAccess(allowed.access)
  if ('publishedAt' in allowed) row.publishedAt = allowed.publishedAt as Date
  if ('author' in allowed) row.authorId = data.authorId ?? (existing ? undefined : ctx.actor.id)
  else if (!existing) row.authorId = ctx.actor.id
  if (row.authorId === undefined) delete row.authorId
  const categoryIds = 'categories' in allowed && data.paths.length ? await ensureCategories(ctx, data.paths, changes, counters) : null
  let contentFingerprint: string | undefined
  const saved = await db.$transaction(async (tx) => {
    await assertFieldSelections('magazine', item.values, data.values, tx, o.categorySeparator)
    if (existing) await claimImportUpdate(tx, ctx, 'post', existing.id)
    if (existing && 'content' in row) {
      const refusal = await claimLegacyBody(tx, existing.id)
      if (refusal) throw new Error(refusal)
    }
    if (categoryIds) { row.categoryId = categoryIds[0] || null; row.categories = existing ? { deleteMany: {}, create: categoryIds.map((categoryId) => ({ categoryId })) } : { create: categoryIds.map((categoryId) => ({ categoryId })) } }
    if (!existing) {
      let slug = toText(allowed.slug, 120) || latinSlug(data.values.titleEn || data.values.title, 100) || slugify(data.values.title) || `post-${suffixOf(planned.sourceKey)}`
      for (let n = 2; await tx.post.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`
      row.slug = slug
      const created = await tx.post.create({ data: row as never })
      changes.push({ kind: 'created', entity: 'post', id: created.id, stamp: created.updatedAt.toISOString() })
      contentFingerprint = (await importContentState('magazine', created.id, tx))?.fingerprint
      return created
    }
    const before = await tx.post.findUnique({ where: { id: existing.id } })
    const updated = await tx.post.update({ where: { id: existing.id }, data: row as never })
    const keys = TRACKED.filter((k) => k in row)
    if (keys.length) changes.push({ kind: 'updated', entity: 'post', id: existing.id, before: snapshot(before as unknown as Record<string, unknown>, keys), after: snapshot(updated as unknown as Record<string, unknown>, keys) })
    contentFingerprint = (await importContentState('magazine', updated.id, tx))?.fingerprint
    return updated
  }, { ...(ctx.settings.protectEdits ? { isolationLevel: 'Serializable' as const } : {}) })
  if (toText(data.values.externalId, 190)) await saveIdentity(db, ctx, ENTITY, toText(data.values.externalId, 190), saved.id)
  else await saveIdentity(db, ctx, ENTITY, planned.sourceKey, saved.id)
  contentChanged({ type: 'post', id: saved.id }, existing, saved)
  return { action: existing ? 'UPDATE' : 'CREATE', entityType: 'post', entityId: saved.id, writtenAt: saved.updatedAt.toISOString(), contentFingerprint, changes, messages, counters }
}

async function rollback(changes: Change[]) {
  const conflicts: string[] = []
  let undone = 0
  for (const change of [...changes].reverse()) {
    let problem: string | null = null
    if (change.entity === 'post') {
      problem = change.kind === 'updated' && Object.hasOwn(change.after, 'content')
        ? await db.$transaction(async tx => (await claimLegacyBody(tx, change.id)) || undoChange(change, 'post', { label: 'مطلب', dates: ['publishedAt'], client: tx }))
        : await undoChange(change, 'post', { label: 'مطلب', dates: ['publishedAt'], canDelete: async (id) => ((await db.postComment.count({ where: { postId: id } })) ? 'دیدگاه دارد' : null) })
    }
    else if (change.entity === 'postCategory' && change.kind === 'created') {
      const cat = await db.postCategory.findUnique({ where: { id: change.id }, include: { _count: { select: { posts: true, assignments: true, children: true } } } })
      if (cat) {
        if (JSON.stringify({ slug: cat.slug, name: cat.name, parentId: cat.parentId }) !== change.stamp) problem = `دستهٔ «${cat.name}» پس از ورود اطلاعات تغییر کرده؛ حذف نشد`
        else if (cat._count.posts || cat._count.assignments || cat._count.children) problem = `دستهٔ «${cat.name}» هنوز مطلب یا زیردسته دارد؛ حذف نشد`
        else await db.postCategory.delete({ where: { id: cat.id } })
      }
    }
    if (problem) conflicts.push(problem); else undone++
  }
  return { undone, conflicts }
}

export const magazineImporter: ImportAdapter = {
  id: 'magazine', label: 'مجله — مطالب', entity: 'مطلب', module: 'journal',
  description: 'مطالب مجله با دسته‌های چندسطحی مجله، نویسنده، تصویر شاخص و تصاویر داخل متن (متن HTML پاک‌سازی می‌شود)',
  fields: FIELDS, supports: {},
  identity: ['شناسهٔ خارجی', 'نامک (slug)', 'عنوان (فقط اگر یکتا باشد)'],
  options: [
    { key: 'categorySeparator', label: 'جداکنندهٔ سطح‌های دسته', type: 'select', step: 4, default: '>', choices: [{ value: '>', label: 'A > B' }, { value: '/', label: 'A / B' }, { value: '|', label: 'A | B' }] },
    { key: 'missingCategories', label: 'دستهٔ مجله موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
    { key: 'missingAuthor', label: 'نویسنده در کاربران سایت نیست', type: 'select', step: 4, default: 'importer', choices: [{ value: 'importer', label: 'واردکننده نویسنده شود' }, { value: 'error', label: 'خطا' }] },
    { key: 'defaultStatus', label: 'وضعیت مطالب جدید (اگر ستون وضعیت نگاشت نشده)', type: 'select', step: 8, default: 'DRAFT', choices: [{ value: 'PUBLISHED', label: 'منتشر' }, { value: 'DRAFT', label: 'پیش‌نویس' }] },
  ],
  normalizeOptions: normalizeOptions as unknown as (raw: Record<string, unknown>) => Record<string, unknown>,
  prepare, plan, apply, rollback,
}
