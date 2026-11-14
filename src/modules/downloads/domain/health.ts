export type LinkHealthSettings = { enabled: boolean; intervalHours: number; batchSize: number; hosts: string[] }
export function normalizeHealthSettings(raw: unknown): LinkHealthSettings {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const hosts = (Array.isArray(input.hosts) ? input.hosts : []).map(value => String(value).trim().toLowerCase()).filter(value => /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) && !value.endsWith('.local') && !value.endsWith('.internal')).slice(0, 20)
  return { enabled: input.enabled === true, intervalHours: Math.max(6, Math.min(168, Number(input.intervalHours) || 24)), batchSize: Math.max(1, Math.min(3, Math.floor(Number(input.batchSize) || 2))), hosts: [...new Set(hosts)] }
}
