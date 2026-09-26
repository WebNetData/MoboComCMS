import { db } from '@/platform/database/prisma'

export async function databaseReady(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`
    // Reaching PostgreSQL is not enough: readiness must stay red until the
    // committed schema migrations have created the core application tables.
    await db.user.findFirst({ select: { id: true } })
    return true
  } catch {
    return false
  }
}
