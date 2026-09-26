import { db } from '@/platform/database/prisma'
import { defaultConnectionGuide, validateConnectionGuide } from '@/modules/site/domain/connection-guide'
export const CONNECTION_GUIDE_KEY = 'site.connection-guide'
export async function getConnectionGuide() {
  const row = await db.setting.findUnique({ where: { key: CONNECTION_GUIDE_KEY } })
  if (!row) return defaultConnectionGuide
  return validateConnectionGuide(JSON.parse(row.value))
}
