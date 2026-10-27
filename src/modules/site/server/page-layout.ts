import { db } from '@/platform/database/prisma'
import { validateCover } from '@/shared/content/cover'
export const pageLayoutDefaults = { pageLayout: 'full', pageTitle: 'show', pageFrame: 'plain', formSlug: '', cover: '', companyPanel: 'none' }
export function validatePageLayout(input: Record<string, unknown>) {
  const result = { ...pageLayoutDefaults }
  result.cover = validateCover(input.cover)
  for (const [key, choices] of Object.entries({ pageLayout: ['full', 'reading', 'sidebar'], pageTitle: ['show', 'hide'], pageFrame: ['plain', 'card'], companyPanel: ['none', 'about', 'contact'] })) {
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
export async function getPageLayout(id: number) {
  const stored = await db.setting.findUnique({ where: { key: `page.layout.${id}` } })
  try { return validatePageLayout(stored ? JSON.parse(stored.value) : {}) } catch { return { ...pageLayoutDefaults } }
}
