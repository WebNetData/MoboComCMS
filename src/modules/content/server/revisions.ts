import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { logEvent } from '@/platform/observability/logger'
import { KEEP_REVISIONS, changedFields, diffOf, parseSnapshot, snapshotOf, type RevisionSource } from '@/modules/content/domain/revisions'

export class RevisionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

type Actor = { id: number; email: string } | null

/**
 * Keeps the state of an item after a save as its next version. The first time an item that existed before
 * versions is edited, the state it had is kept first, so its history starts with what it was. A save that
 * changed none of the snapshot fields adds nothing. Owners using `client`/`strict` keep the write and
 * revision atomic; older best-effort callers still log a history failure without failing their save.
 */
export async function recordRevision(input: { entityType: string; entityId: number; before: Record<string, unknown> | null; after: Record<string, unknown>; actor: Actor; source?: RevisionSource; client?: Prisma.TransactionClient; strict?: boolean }) {
  const client = input.client || db
  try {
    const { entityType, entityId } = input
    const after = snapshotOf(input.after)
    const last = await client.contentRevision.findFirst({ where: { entityType, entityId }, orderBy: { version: 'desc' }, select: { version: true, snapshot: true } })
    let version = last?.version || 0
    let previous = last ? parseSnapshot(last.snapshot) : null
    if (!last && input.before) {
      previous = snapshotOf(input.before)
      await client.contentRevision.create({ data: { entityType, entityId, version: ++version, snapshot: JSON.stringify(previous), changed: '', source: 'baseline', actorId: null, actorEmail: '' } })
    }
    const changed = changedFields(previous, after)
    if (previous && !changed.length) return null
    const row = await client.contentRevision.create({ data: { entityType, entityId, version: version + 1, snapshot: JSON.stringify(after), changed: (previous ? changed : []).join(','), source: input.source || 'edit', actorId: input.actor?.id ?? null, actorEmail: input.actor?.email || '' } })
    // Only the latest versions are kept; the newest is never among those removed.
    const stale = await client.contentRevision.findMany({ where: { entityType, entityId }, orderBy: { version: 'desc' }, skip: KEEP_REVISIONS, select: { id: true } })
    if (stale.length) await client.contentRevision.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } })
    return row.version
  } catch (error) {
    if (input.strict) throw error
    logEvent('error', 'content.revision_failed', { entityType: input.entityType, entityId: input.entityId, error })
    return null
  }
}

/** The versions of an item, newest first, without their content. */
export async function listRevisions(entityType: string, entityId: number) {
  const rows = await db.contentRevision.findMany({ where: { entityType, entityId }, orderBy: { version: 'desc' }, take: KEEP_REVISIONS, select: { version: true, changed: true, source: true, actorEmail: true, createdAt: true } })
  return rows.map((row) => ({ version: row.version, changed: row.changed ? row.changed.split(',') : [], source: row.source, by: row.actorEmail, at: row.createdAt.toISOString() }))
}

/** One version: what it changed compared with the version before it. */
export async function revisionDetail(entityType: string, entityId: number, version: number) {
  const rows = await db.contentRevision.findMany({ where: { entityType, entityId, version: { lte: version } }, orderBy: { version: 'desc' }, take: 2 })
  const row = rows[0]
  if (!row || row.version !== version) throw new RevisionError('این نسخه پیدا نشد', 404)
  const before = rows[1] ? parseSnapshot(rows[1].snapshot) : null
  return { version: row.version, source: row.source, by: row.actorEmail, at: row.createdAt.toISOString(), diff: before ? diffOf(before, parseSnapshot(row.snapshot)) : [] }
}

/** The stored content of a version, for the owner that puts it back. */
export async function revisionSnapshot(entityType: string, entityId: number, version: number) {
  const row = await db.contentRevision.findUnique({ where: { entityType_entityId_version: { entityType, entityId, version } }, select: { snapshot: true } })
  if (!row) throw new RevisionError('این نسخه پیدا نشد', 404)
  return parseSnapshot(row.snapshot)
}

/** When an item is deleted for good its versions go with it. */
export async function dropRevisions(entityType: string, entityId: number) {
  await db.contentRevision.deleteMany({ where: { entityType, entityId } }).catch(() => undefined)
}
