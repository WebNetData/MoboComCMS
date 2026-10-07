import { db } from '@/platform/database/prisma'

// Where an item came from: the imports that created or changed it, the ids it carries in the systems it was
// imported from, and what staff have changed since the last import wrote it. Read from what every import
// already records; nothing new is stored.

/** The record name an import uses for each kind of item that has a history page. */
export const IMPORTED_AS: Record<string, string> = { 'cinema-titles': 'cinemaTitle', games: 'gameTitle', software: 'softwareTitle', 'music-tracks': 'musicTrack', posts: 'post' }

type Change = { kind?: string; entity?: string; id?: number; before?: Record<string, unknown>; after?: Record<string, unknown>; stamp?: string }
const same = (a: unknown, b: unknown) => (a instanceof Date ? a.toISOString() : typeof a === 'bigint' ? a.toString() : a) === (b instanceof Date ? b.toISOString() : typeof b === 'bigint' ? b.toString() : b)

export async function itemProvenance(model: string, entityId: number, current: Record<string, unknown> | null) {
  const records = await db.importRecord.findMany({
    where: { entityType: model, entityId, action: { in: ['CREATE', 'UPDATE'] } }, orderBy: { id: 'desc' }, take: 10,
    select: { id: true, action: true, status: true, sourceKey: true, changes: true, createdAt: true, job: { select: { id: true, adapter: true, fileName: true, createdByEmail: true, settings: true } } },
  })
  if (!records.length) return null
  const refs = await db.importExternalRef.findMany({ where: { entityId, jobId: { in: [...new Set(records.map((record) => record.job.id))] } }, orderBy: { id: 'asc' }, select: { source: true, externalId: true, entityType: true } })
  const own = (record: (typeof records)[number]): Change | null => {
    try { return ((JSON.parse(record.changes || '{}').changes || []) as Change[]).find((change) => change.entity === model && change.id === entityId) || null } catch { return null }
  }
  // What the latest import wrote, set against the item as it is now: a difference is an edit made here since.
  const last = records.find((record) => record.status !== 'ROLLED_BACK') || null
  const wrote = last ? own(last) : null
  let editedSince: string[] | boolean = false
  if (current && wrote?.kind === 'updated' && wrote.after) editedSince = Object.keys(wrote.after).filter((key) => key in current && !same(current[key], wrote.after![key])).sort()
  else if (current && wrote?.kind === 'created' && wrote.stamp && current.updatedAt instanceof Date) editedSince = current.updatedAt.toISOString() !== wrote.stamp
  return {
    sources: refs.map((ref) => ({ source: ref.source, externalId: ref.externalId })),
    imports: records.map((record) => {
      const change = own(record)
      return { job: record.job.id, adapter: record.job.adapter, file: record.job.fileName, by: record.job.createdByEmail, at: record.createdAt.toISOString(), action: record.action, undone: record.status === 'ROLLED_BACK', fields: change?.kind === 'updated' && change.after ? Object.keys(change.after).sort() : [] }
    }),
    // true/false for an item an import created (edited at all since), field names for one it updated.
    editedSince,
  }
}
