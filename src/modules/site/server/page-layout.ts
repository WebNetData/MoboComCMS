import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { validateCover } from '@/shared/content/cover'
/** `companyPanel` is the page's design template («قالب طراحی صفحه»): none, about, contact or legal (owner, 2026-10-28). */
export const pageLayoutDefaults = { pageLayout: 'full', pageTitle: 'show', pageFrame: 'plain', formSlug: '', cover: '', companyPanel: 'none' }
export function validatePageLayout(input: Record<string, unknown>) {
  const result = { ...pageLayoutDefaults }
  result.cover = validateCover(input.cover)
  for (const [key, choices] of Object.entries({ pageLayout: ['full', 'reading', 'sidebar'], pageTitle: ['show', 'hide'], pageFrame: ['plain', 'card'], companyPanel: ['none', 'about', 'contact', 'legal'] })) {
    const value = input[key]
    if (value === undefined || value === '') continue
    if (typeof value !== 'string' || !choices.includes(value)) throw new Error('تنظیم چیدمان صفحه معتبر نیست')
    ;(result as Record<string, string>)[key] = value
  }
  if (input.formSlug !== undefined) {
    if (typeof input.formSlug !== 'string' || (input.formSlug && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(input.formSlug))) throw new Error('شناسه فرم معتبر نیست')
    result.formSlug = input.formSlug
  }
  return result
}
export type PageLayout = ReturnType<typeof validatePageLayout>
type Reader = Pick<Prisma.TransactionClient, 'setting'>

/** Strict mutation reads preserve corrupt/unknown settings instead of replacing them with render defaults. */
export async function readPageLayout(id: number, reader: Reader = db) {
  const stored = await reader.setting.findUnique({ where: { key: `page.layout.${id}` } })
  const raw: unknown = stored ? JSON.parse(stored.value) : {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('تنظیمات ذخیره‌شدهٔ صفحه معتبر نیست')
  return { raw: raw as Record<string, unknown>, layout: validatePageLayout(raw as Record<string, unknown>) }
}

export async function savePageLayout(id: number, layout: PageLayout, tx: Prisma.TransactionClient) {
  const { raw } = await readPageLayout(id, tx)
  const value = JSON.stringify({ ...raw, ...layout })
  await tx.setting.upsert({ where: { key: `page.layout.${id}` }, create: { key: `page.layout.${id}`, value }, update: { value } })
}

export function pageLayoutSnapshot<T extends Record<string, unknown>>(row: T, layout: PageLayout) {
  return { ...row, __relations: JSON.stringify({ version: 1, pageLayout: layout }) }
}

export async function getPageLayout(id: number) {
  try { return (await readPageLayout(id)).layout } catch { return { ...pageLayoutDefaults } }
}
