export type ExpertWorkSource = 'store' | 'form'

export const EXPERT_WORK_LIMITS = { min: 1, max: 43_200 }
export const EXPERT_WORK_POLICY = { claimMinutes: 60, replyMinutes: 120, deliveryMinutes: 1440 }
export const EXPERT_WORK_POLICY_FIELDS = ['claimMinutes', 'replyMinutes', 'deliveryMinutes'] as const

export type ExpertWorkPolicy = typeof EXPERT_WORK_POLICY
export type ExpertWorkDeadline = 'claim' | 'reply' | 'delivery'

export type ExpertWorkQueue = {
  policy: ExpertWorkPolicy
  revision: string
  items: {
    id: number
    title: string
    href: string
    assignee: string | null
    deadlines: { kind: ExpertWorkDeadline; dueAt: string }[]
  }[]
  nextAfter: number | null
}

export function isExpertWorkMinute(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= EXPERT_WORK_LIMITS.min && value <= EXPERT_WORK_LIMITS.max
}

export function normalizeExpertWorkPolicy(input: unknown): ExpertWorkPolicy {
  const value = input as Partial<ExpertWorkPolicy> | null
  const settings = { ...EXPERT_WORK_POLICY }
  for (const field of EXPERT_WORK_POLICY_FIELDS) {
    const minutes = value?.[field]
    if (isExpertWorkMinute(minutes)) settings[field] = minutes
  }
  return settings
}
