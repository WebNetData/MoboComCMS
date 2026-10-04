import { createHash } from 'node:crypto'

export type SearchBoundary = { score: number; publishedAt: number; boost: number; id: number }
export type SearchCursor = SearchBoundary & { direction: 'after' | 'before'; page: number }

/** Navigation state only: never grants access. Every request rechecks source visibility. */
export function searchCursorScope(query: string, type: string, epoch: string): string {
  return createHash('sha256').update(JSON.stringify([query, type, epoch])).digest('base64url')
}

export function encodeSearchCursor(cursor: SearchCursor, scope: string): string {
  return Buffer.from(JSON.stringify({ v: 1, scope, ...cursor })).toString('base64url')
}

export function decodeSearchCursor(value: unknown, scope: string): SearchCursor | null {
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const decoded = Buffer.from(value, 'base64url')
    if (decoded.toString('base64url') !== value) return null
    const data = JSON.parse(decoded.toString('utf8'))
    if (!data || data.v !== 1 || data.scope !== scope || !['after', 'before'].includes(data.direction)
      || !Number.isSafeInteger(data.page) || data.page < 1 || data.page > Math.floor(Number.MAX_SAFE_INTEGER / 20)
      || typeof data.score !== 'number' || !Number.isFinite(data.score) || data.score < 0
      || !Number.isSafeInteger(data.publishedAt) || Math.abs(data.publishedAt) > 8.64e15
      || !Number.isSafeInteger(data.boost) || data.boost < 0 || data.boost > 1_000_000
      || !Number.isSafeInteger(data.id) || data.id < 1) return null
    return { direction: data.direction, page: data.page, score: data.score, publishedAt: data.publishedAt, boost: data.boost, id: data.id }
  } catch { return null }
}

export function compareSearchBoundary(a: SearchBoundary, b: SearchBoundary): number {
  return b.score - a.score || b.publishedAt - a.publishedAt || b.boost - a.boost || a.id - b.id
}
