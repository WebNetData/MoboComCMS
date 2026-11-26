export const FOLLOW_UP_STATUS = {
  OPEN: 'در انتظار پیگیری', DONE: 'انجام شد', CANCELLED: 'لغو شد',
} as const
export type FollowUpStatus = keyof typeof FOLLOW_UP_STATUS
export type FollowUp = {
  id: number
  title: string
  dueDay: string
  status: FollowUpStatus
  assigneeId: number | null
  assigneeName: string
  version: number
  mayEdit: boolean
}
export type FollowUpList = {
  rows: FollowUp[]
  staff: { id: number; name: string }[]
  ownId: number
  mayAssign: boolean
  today: string
  hasMore: boolean
}

export function validFollowUpId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
}

export function validFollowUpDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[2-9]\d{3}-\d\d-\d\d$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
