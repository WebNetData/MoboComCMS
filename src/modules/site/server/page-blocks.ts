import { db } from '@/platform/database/prisma'
import { validatePageBlocks, type PageBlock } from '@/modules/site/domain/page-blocks'

export async function getPageBlocks(pageId: number): Promise<PageBlock[]> {
  const row = await db.setting.findUnique({ where: { key: `page.builder.${pageId}` } })
  try { return validatePageBlocks(row ? JSON.parse(row.value) : []) } catch { return [] }
}
