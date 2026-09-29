import { PrismaClient } from '@prisma/client'
import { recordQuery } from '@/platform/observability/metrics'

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

const instrumented = globalThis as unknown as { __mobocomDbHook?: boolean }
if (!instrumented.__mobocomDbHook) {
  instrumented.__mobocomDbHook = true
  const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'])
  // Query timing for the monitoring page, and cache invalidation for settings written anywhere.
  ;(db as unknown as { $use: (fn: (params: { model?: string; action: string }, next: (params: unknown) => Promise<unknown>) => Promise<unknown>) => void }).$use(async (params, next) => {
    const started = performance.now()
    try {
      return await next(params)
    } finally {
      recordQuery(params.model || 'raw', params.action, performance.now() - started)
      if (params.model === 'Setting' && WRITES.has(params.action)) void import('@/platform/cache/kv').then((cache) => cache.invalidate('settings:')).catch(() => undefined)
    }
  })
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// SQLite: WAL mode allows concurrent readers during writes and a busy
// timeout avoids spurious "database is locked" failures under load.
if ((process.env.DATABASE_URL || '').startsWith('file:')) {
  db.$queryRawUnsafe('PRAGMA journal_mode=WAL;').catch(() => {})
  db.$queryRawUnsafe('PRAGMA busy_timeout=5000;').catch(() => {})
}
