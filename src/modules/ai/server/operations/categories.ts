import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { richTextToPlain } from '@/shared/content/sanitize'
import { createCategory } from '@/modules/site/server/category-commands'
import { saveTerm } from '@/modules/taxonomy/server/taxonomy'
import { assertParent, isTaxonomy, MAX_TERMS, validateTerm, type Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import { AiOperationError, type AiOperation, type CategoryChange } from '../../domain/operations'

type Reader = Prisma.TransactionClient | typeof db
type Guard = (tx: Prisma.TransactionClient) => Promise<void>
type Commit = (tx: Prisma.TransactionClient, result: Record<string, unknown>) => Promise<void>
type Category = { id: number; name: string; slug: string; parentId: number | null; description?: string; icon?: string }

function owner(tool: string): 'post' | 'product' | Taxonomy {
  const section = tool.endsWith('.categories') ? tool.slice(0, -11) : ''
  if (section === 'post' || section === 'product' || isTaxonomy(section)) return section
  throw new AiOperationError('ابزار دسته‌بندی پشتیبانی نمی‌شود')
}
async function rows(tool: string, reader: Reader, take: number) {
  const kind = owner(tool)
  if (kind === 'post') return reader.postCategory.findMany({ orderBy: { id: 'asc' }, take })
  if (kind === 'product') return reader.productCategory.findMany({ orderBy: { id: 'asc' }, take })
  return reader.taxonomyTerm.findMany({ where: { taxonomy: kind }, orderBy: { id: 'asc' }, take })
}
export async function categoryContext(tool: string, reader: Reader = db) {
  const found = await rows(tool, reader, 101)
  return { categories: found.slice(0, 100).map(({ id, name, slug, parentId }) => ({ id, name, slug, parentId })), truncated: found.length > 100 }
}
export async function categoryPreview(op: AiOperation, reader: Reader = db) {
  const kind = owner(op.tool), entries = op.args.entries as CategoryChange[]
  if (!Array.isArray(entries) || !entries.length || entries.length > 12) throw new AiOperationError('تعداد دسته‌های پیشنهاد معتبر نیست')
  const found = await rows(op.tool, reader, MAX_TERMS + 1)
  if (found.length > MAX_TERMS) throw new AiOperationError('تعداد دسته‌ها برای بررسی این پیشنهاد زیاد است؛ از ویرایشگر دسته‌ها استفاده کنید', 409)
  const nodes: Category[] = found.map(row => ({ ...row }))
  if (kind !== 'post' && kind !== 'product' && found.length + entries.filter(entry => entry.id == null).length > MAX_TERMS) throw new AiOperationError('سقف تعداد دسته‌های این بخش پر شده است', 409)
  const seen = new Set<number>(), slugs = new Set(nodes.map(row => row.slug))
  for (const entry of entries) {
    const old = entry.id == null ? undefined : nodes.find(row => row.id === entry.id)
    if (entry.id != null && (!old || seen.has(entry.id))) throw new AiOperationError('دستهٔ موردنظر پیدا نشد یا در پیشنهاد تکرار شده است', 409)
    if (entry.id != null) seen.add(entry.id)
    if (old && ((entry.slug !== undefined && entry.slug !== old.slug) || (entry.parentId !== undefined && entry.parentId !== old.parentId))) throw new AiOperationError('برای حفظ نشانی فعلی، تغییر نشانی یا والد دسته را در ویرایشگر اصلی انجام دهید', 409)
    if (kind === 'product' && ((entry.description !== undefined && richTextToPlain(entry.description, 1000) !== entry.description) || (entry.icon !== undefined && entry.icon.replace(/[^a-z0-9-]/gi, '').slice(0, 40) !== entry.icon))) throw new AiOperationError('Category fields require normalization; use the category editor', 422)
    if (kind === 'post' && (entry.description !== undefined || entry.icon !== undefined)) throw new AiOperationError('دستهٔ مجله فقط عنوان، نشانی و والد دارد؛ توضیح یا آیکن به آن اضافه نمی‌شود', 422)
    if (!old && (!entry.slug || slugs.has(entry.slug))) throw new AiOperationError('نشانی دسته مشخص نیست یا قبلاً استفاده شده است', 409)
    const parentId = entry.parentId === undefined ? old?.parentId ?? null : entry.parentId
    if (parentId !== null && !nodes.some(row => row.id === parentId)) throw new AiOperationError('دستهٔ والد در همین بخش پیدا نشد', 409)
    if (kind !== 'post' && kind !== 'product') {
      const data = validateTerm({ ...old, ...entry, parentId })
      for (const key of ['name', 'description', 'icon'] as const) {
        const proposed = entry[key] ?? old?.[key] ?? ''
        if (data[key] !== proposed) throw new AiOperationError('Category fields would change during validation; use the category editor', 422)
      }
      if (old) for (const key of ['image', 'color', 'inMenu', 'seoTitle', 'seoDescription', 'sortOrder'] as const) {
        if (data[key] !== (old as unknown as Record<string, unknown>)[key]) throw new AiOperationError('Existing category fields require the category editor', 409)
      }
      if (data.slug !== (entry.slug ?? old?.slug)) throw new AiOperationError('Category slug would change during validation', 409)
      assertParent(nodes, old?.id ?? null, parentId)
    }
    if (!old) slugs.add(entry.slug!)
  }
  const href = kind === 'post' ? '/admin/postcats' : kind === 'product' ? '/admin/productcats' : `/admin/taxonomy?tax=${kind}`
  return { snapshot: found, preview: { title: 'دسته‌های پیشنهادی', href, entries: entries.map(entry => ({ ...entry, ...(entry.id ? { beforeName: found.find(row => row.id === entry.id)?.name } : {}) })), warning: 'نام، نشانی و والد هر دسته را بررسی کنید؛ پس از تأیید، تغییرات در همین بخش ذخیره می‌شوند.' } }
}
export async function executeCategoryOperation(req: NextRequest, actor: { id: number; email: string }, op: AiOperation, snapshot: string, guard: Guard, commit: Commit) {
  await db.$transaction(async tx => {
    await guard(tx)
    const current = await categoryPreview(op, tx)
    if (JSON.stringify(current.snapshot) !== snapshot) throw new AiOperationError('دسته‌ها پس از پیشنهاد تغییر کرده‌اند؛ پیشنهاد تازه بگیرید', 409)
    const kind = owner(op.tool), entries = op.args.entries as CategoryChange[], ids: number[] = []
    for (const entry of entries) {
      if (kind === 'post' || kind === 'product') {
        if (entry.id == null) {
          const row = await createCategory(tx, kind === 'post' ? 'postcats' : 'productcats', { ...entry })
          ids.push(row.id)
        } else if (kind === 'post') {
          const row = await tx.postCategory.update({ where: { id: entry.id }, data: { name: entry.name } }); ids.push(row.id)
        } else {
          const row = await tx.productCategory.update({ where: { id: entry.id }, data: { name: entry.name, ...(entry.description !== undefined ? { description: richTextToPlain(entry.description, 1000) } : {}), ...(entry.icon !== undefined ? { icon: entry.icon.replace(/[^a-z0-9-]/gi, '').slice(0, 40) } : {}) } }); ids.push(row.id)
        }
      } else {
        const old = entry.id == null ? null : await tx.taxonomyTerm.findFirst({ where: { id: entry.id, taxonomy: kind } })
        const row = await saveTerm(kind, { ...old, ...entry }, entry.id ?? null, tx)
        if (row.slug !== (entry.slug ?? old?.slug)) throw new AiOperationError('Category slug changed during save', 409)
        ids.push(row.id)
      }
    }
    await auditAdminStrict({ req, actor, action: 'ai.categories.batch', targetType: op.tool, metadata: { ids } }, tx)
    await commit(tx, { ids, title: 'دسته‌ها ذخیره شدند', href: current.preview.href })
  }, { isolationLevel: 'Serializable' })
}
