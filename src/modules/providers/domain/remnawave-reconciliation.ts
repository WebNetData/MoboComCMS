export type ReconciliationIssue = 'REMOTE_MISSING' | 'PANEL_ERROR' | 'SQUADS_MISSING' | 'DISABLED_LEAK' | 'REMOTE_DISABLED' | 'REMOTE_EXHAUSTED' | 'EXPIRY_DRIFT' | 'TRAFFIC_DRIFT' | 'SUB_URL_MISSING' | 'STATUS_UNKNOWN'

export function reconcileSubscription(local: { status: string; expiresAt: Date; trafficLimit: number; panelSubUrl: string }, remote: {
  found: boolean; error?: boolean; status?: string; expiresAt?: Date | null; trafficLimit?: number; squads?: string[]; subUrl?: string
}): ReconciliationIssue[] {
  if (remote.error) return ['PANEL_ERROR']
  if (!remote.found) return ['REMOTE_MISSING']
  const issues: ReconciliationIssue[] = []
  if (remote.squads?.length === 0) issues.push('SQUADS_MISSING')
  if (local.status === 'DISABLED' && remote.status === 'active') issues.push('DISABLED_LEAK')
  if (local.status === 'ACTIVE' && remote.status === 'disabled') issues.push('REMOTE_DISABLED')
  if (local.status === 'ACTIVE' && (remote.status === 'expired' || remote.status === 'limit_reached')) issues.push('REMOTE_EXHAUSTED')
  if (remote.status === 'unknown') issues.push('STATUS_UNKNOWN')
  if (remote.expiresAt && Math.abs(remote.expiresAt.getTime() - local.expiresAt.getTime()) > 15 * 60_000) issues.push('EXPIRY_DRIFT')
  if (typeof remote.trafficLimit === 'number' && Number.isFinite(remote.trafficLimit) && Math.abs(remote.trafficLimit / 1024 ** 3 - local.trafficLimit) > 0.05) issues.push('TRAFFIC_DRIFT')
  if (remote.subUrl && !local.panelSubUrl) issues.push('SUB_URL_MISSING')
  return issues
}

export function safeRepairable(issues: readonly ReconciliationIssue[]) {
  return issues.filter(issue => issue === 'SQUADS_MISSING' || issue === 'DISABLED_LEAK')
}
