import { db } from '@/platform/database/prisma'
export async function isPublicApiEnabled() {
  return (await db.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value === 'true'
}
