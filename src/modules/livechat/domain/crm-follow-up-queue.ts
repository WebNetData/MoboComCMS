import { validFollowUpId } from './crm-follow-ups'

export const FOLLOW_UP_QUEUE_PATH = '/admin/crm/follow-ups'
export const FOLLOW_UP_BUCKET_LABELS = { overdue: 'عقب‌افتاده', today: 'امروز', upcoming: 'آینده' } as const
export type FollowUpBucket = keyof typeof FOLLOW_UP_BUCKET_LABELS
export type FollowUpScope = 'mine' | 'all' | 'unassigned' | number
export type FollowUpQueueQuery = { bucket: FollowUpBucket | 'all'; scope: FollowUpScope; page: number }
export type FollowUpCounts = Record<FollowUpBucket, number>
export type FollowUpQueueItem = {
  id: number; customerId: number; customerName: string; title: string; version: number
  assigneeId: number | null; assigneeName: string; dueDay: string; updatedAt: string
}
export type FollowUpQueue = {
  items: FollowUpQueueItem[]; counts: FollowUpCounts; today: string
  canManage: boolean; staff: { id: number; name: string }[]
  page: number; pageCount: number
}

export function followUpQueueQuery(query: Pick<URLSearchParams, 'get'>): FollowUpQueueQuery | null {
  const bucket = query.get('bucket') || 'all'
  const rawScope = query.get('scope') || 'mine'
  const page = Number(query.get('page') || 1)
  const scope = rawScope === 'mine' || rawScope === 'all' || rawScope === 'unassigned'
    ? rawScope : /^\d{1,10}$/.test(rawScope) ? Number(rawScope) : null
  if (scope === null || (typeof scope === 'number' && !validFollowUpId(scope))) return null
  if (bucket !== 'all' && bucket !== 'overdue' && bucket !== 'today' && bucket !== 'upcoming') return null
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return null
  return { scope, bucket, page }
}
