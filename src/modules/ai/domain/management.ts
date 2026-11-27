export const managementPermissions = [
  'settings.manage', 'orders.manage', 'cms.pages', 'cms.posts', 'music.manage', 'cinema.manage',
  'games.manage', 'software.manage', 'forum.moderate', 'reviews.moderate', 'tickets.handle',
  'hosting.manage', 'mobocom-pay.manage', 'users.manage', 'support.chat',
] as const

export type ManagementSignal = {
  id: string
  label: string
  count: number
  detail: string
  recommendation: string
  tone: 'urgent' | 'attention'
  destination?: { href: string; label: string }
}

export type ManagementSection = {
  id: string
  label: string
  href: string
  state: 'attention' | 'clear' | 'unavailable'
  signals: ManagementSignal[]
}

export type ManagementReport = { checkedAt: string; sections: ManagementSection[] }
export type ManagementAdvice = { signalId: string; text: string }

export const reviewCadences = ['OFF', 'DAILY', 'WEEKLY'] as const
export type ReviewCadence = typeof reviewCadences[number]
export type ReviewDecision = 'APPROVED' | 'DISMISSED' | 'DONE'
export type ManagementFinding = ManagementSignal & {
  sectionId: string
  sectionLabel: string
  href: string
  status: 'PENDING' | ReviewDecision
  outcome: string
  decidedAt?: string
  action?: ManagementAction
}

export const actionSignals = ['support.stale', 'store.fulfilment', 'pay.delivery'] as const
export type ActionSignal = typeof actionSignals[number]
export type DeskCommand = 'TICKET_NOTE' | 'TICKET_REPLY' | 'ORDER_NOTE' | 'ORDER_ASSIGN' | 'PAY_ASSESSMENT'
export type DeskTarget = {
  id: string
  stamp: string
  label: string
  facts: string[]
  commands: DeskCommand[]
}
export type ManagementAction = {
  command: DeskCommand
  target: DeskTarget
  text: string
  assigneeId?: number
  assessment?: 'CONFIRMED' | 'UNCONFIRMED' | 'NEEDS_REVIEW'
  result?: { id: number | string; at: string }
}
export type DeskTargets = { targets: DeskTarget[]; assignees: { id: number; name: string }[] }
export type ReviewHistory = {
  cadence: ReviewCadence
  nextRunAt: string | null
  scheduleVersion: number
  reviews: {
    id: number
    version: number
    checkedAt: string
    unavailable: string[]
    findings: ManagementFinding[]
  }[]
}

export function managementAdvice(raw: string, ids: ReadonlySet<string>): ManagementAdvice[] {
  const value: unknown = JSON.parse(raw)
  const result = value && typeof value === 'object' && 'advice' in value ? value.advice : null
  if (!Array.isArray(result) || !result.length || result.length > ids.size) throw new Error('Invalid advice')
  const seen = new Set<string>()
  return result.map(row => {
    if (!row || typeof row !== 'object' || typeof row.signalId !== 'string' ||
      !ids.has(row.signalId) || seen.has(row.signalId) || typeof row.text !== 'string' ||
      !row.text.trim() || row.text.length > 450 || /[<>\u0000-\u001f\u202a-\u202e\u2066-\u2069]|https?:\/\//i.test(row.text)) {
      throw new Error('Invalid advice')
    }
    seen.add(row.signalId)
    return { signalId: row.signalId, text: row.text.trim() }
  })
}
