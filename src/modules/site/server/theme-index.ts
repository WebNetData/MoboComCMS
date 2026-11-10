import type { Prisma } from '@prisma/client'
import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { parseTemplateIndex, type ThemeTemplateMeta } from '../domain/theme-templates'
import { createHash } from 'node:crypto'

export const THEME_INDEX_KEY = 'theme.templates.v1'
export class ThemeIndexError extends Error { constructor(message: string, public status = 409) { super(message) } }
export const themeIndexRevision = (raw: string | undefined) => createHash('sha256').update(raw || '[]').digest('hex')
/** The stored index row, read once per server render; a claimed transaction always reads its own. */
export const themeIndexRowForRequest = cache(() => db.setting.findUnique({ where: { key: THEME_INDEX_KEY } }))
export async function readThemeIndex(reader: Pick<Prisma.TransactionClient, 'setting'> = db) {
  const row = reader === db ? await themeIndexRowForRequest() : await reader.setting.findUnique({ where: { key: THEME_INDEX_KEY } })
  let raw: unknown
  try { raw = JSON.parse(row?.value || '[]') } catch { throw new ThemeIndexError('فهرست قالب‌ها قابل خواندن نیست؛ دادهٔ قبلی حفظ شد', 503) }
  const list = parseTemplateIndex(row?.value)
  if (!Array.isArray(raw) || raw.length !== list.length || list.length > 200) throw new ThemeIndexError('فهرست قالب‌ها نیازمند بررسی است؛ دادهٔ قبلی حفظ شد', 503)
  return { row, list, revision: themeIndexRevision(row?.value) }
}
/** The existing array-format template index and its documents share one claimed transaction. */
export async function mutateThemeIndex<T>(work: (list: ThemeTemplateMeta[], tx: Prisma.TransactionClient, revision: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(async tx => {
      const { row, list, revision } = await readThemeIndex(tx), result = await work(list, tx, revision)
      const value = JSON.stringify(list)
      if (row) { const claim = await tx.setting.updateMany({ where: { key: THEME_INDEX_KEY, value: row.value }, data: { value } }); if (claim.count !== 1) throw new ThemeIndexError('قالب‌ها هم‌زمان تغییر کرده‌اند؛ صفحه را تازه کنید') }
      else await tx.setting.create({ data: { key: THEME_INDEX_KEY, value } })
      return result
    }, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 }) }
    catch (e) { if (attempt >= 3 || !['P2002', 'P2034'].includes(String((e as { code?: string }).code))) throw e }
  }
}
