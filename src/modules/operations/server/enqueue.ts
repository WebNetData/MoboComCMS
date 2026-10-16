import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { JOB_LABEL } from '@/modules/operations/domain/job-kinds'
export const isJobKind = (kind: string) => Object.prototype.hasOwnProperty.call(JOB_LABEL, kind)

export async function enqueue(kind: string, payload: Record<string, unknown> = {}, options: { dedupeKey?: string; runAt?: Date } = {}, client: Pick<Prisma.TransactionClient, 'backgroundJob'> = db) {
  if (!isJobKind(kind)) throw new Error(`unknown job kind: ${kind}`)
  if (options.dedupeKey) {
    const existing = await client.backgroundJob.findUnique({ where: { dedupeKey: options.dedupeKey } })
    if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) return existing
    if (existing) {
      const released = await client.backgroundJob.updateMany({ where: { id: existing.id, status: existing.status, dedupeKey: options.dedupeKey }, data: { dedupeKey: null } })
      if (!released.count) {
        const current = await client.backgroundJob.findUnique({ where: { dedupeKey: options.dedupeKey } })
        if (current) return current
      }
    }
  }
  try {
    return await client.backgroundJob.create({ data: { kind, payload: JSON.stringify(payload), dedupeKey: options.dedupeKey ?? null, runAt: options.runAt ?? new Date() } })
  } catch (error) {
    // A unique conflict aborts a PostgreSQL transaction; its caller retries the whole command.
    if (client !== db) throw error
    // Two callers queued the same key at once: the job exists, which is what both asked for.
    const existing = options.dedupeKey && (error as { code?: string }).code === 'P2002' ? await db.backgroundJob.findUnique({ where: { dedupeKey: options.dedupeKey } }) : null
    if (existing) return existing
    throw error
  }
}
