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
