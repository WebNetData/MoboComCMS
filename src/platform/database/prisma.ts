import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Single Prisma client for the application process.
 *
 * Domain/application code must not import Prisma directly. Infrastructure
 * adapters are the only place allowed to depend on this module.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// SQLite: WAL mode allows concurrent readers during writes and a busy
// timeout avoids spurious "database is locked" failures under load.
if ((process.env.DATABASE_URL || '').startsWith('file:')) {
  db.$queryRawUnsafe('PRAGMA journal_mode=WAL;').catch(() => {})
  db.$queryRawUnsafe('PRAGMA busy_timeout=5000;').catch(() => {})
}
