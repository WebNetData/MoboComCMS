export type BackupHealth = {
  status: 'available' | 'disabled' | 'unconfigured' | 'running' | 'failed' | 'stale' | 'unavailable'
  enabled: boolean; scheduler: boolean; latestAt: string | null; restoreTest: 'passed' | 'failed' | 'unknown'
}
