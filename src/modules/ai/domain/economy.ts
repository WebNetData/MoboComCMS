export const ECONOMY_PROVIDERS = ['ollama', 'openrouter', 'omniroute'] as const
export type EconomyProvider = typeof ECONOMY_PROVIDERS[number]
export type EconomyPolicy = { version: 1; revision: number; enabled: boolean; providers: EconomyProvider[]; gatewayFreeOnly: boolean; maxAttempts: number }
export const DEFAULT_ECONOMY: EconomyPolicy = { version: 1, revision: 0, enabled: false, providers: ['ollama', 'openrouter'], gatewayFreeOnly: false, maxAttempts: 2 }
export function economyPolicy(raw: unknown): EconomyPolicy {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !Object.keys(raw).length) return { ...DEFAULT_ECONOMY }
  const v = raw as EconomyPolicy
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !Object.keys(DEFAULT_ECONOMY).includes(k)) || v.version !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 0 || typeof v.enabled !== 'boolean' || typeof v.gatewayFreeOnly !== 'boolean' || !Number.isSafeInteger(v.maxAttempts) || v.maxAttempts < 1 || v.maxAttempts > 3 || !Array.isArray(v.providers) || !v.providers.length || v.providers.length > 3 || new Set(v.providers).size !== v.providers.length || v.providers.some(p => !ECONOMY_PROVIDERS.includes(p)) || v.providers.includes('omniroute') && !v.gatewayFreeOnly) throw Error('invalid economy policy')
  return v
}
export const validModelId = (value: unknown): value is string => typeof value === 'string' && /^[\w.:/@-]{1,120}$/.test(value)
/** Reject remote/cloud aliases; the server additionally checks Ollama's remote metadata. */
export const localModelId = (model: string) => validModelId(model) && !/cloud|remote/i.test(model)
