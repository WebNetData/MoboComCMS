export const BULK_LIMIT = 100
export type BulkAction = 'publish' | 'draft' | 'delete'

/** A bounded batch prevents one request from tying up the admin API. */
export function parseBulkRequest(value: unknown): { ids: number[]; action: BulkAction } {
  if (!value || typeof value !== 'object') throw new Error('invalid batch')
  const body = value as Record<string, unknown>
  if (!['publish', 'draft', 'delete'].includes(String(body.action))) throw new Error('invalid action')
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > BULK_LIMIT) throw new Error('invalid ids')
  const ids = body.ids.map(Number)
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw new Error('invalid ids')
  return { ids, action: body.action as BulkAction }
}
