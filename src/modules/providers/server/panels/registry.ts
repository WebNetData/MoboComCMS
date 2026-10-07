import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { type PanelAdapter } from '@/modules/providers/server/panels/contract'
import { RemnaWaveAdapter } from '@/modules/providers/server/panels/remnawave'
import { PasarGuardAdapter } from '@/modules/providers/server/panels/pasarguard'

// ============ Factory ============
export interface PanelConfig {
  type: string
  url: string
  token: string
  password: string
  inbounds: string
  internalSquads?: string
  /** Provider-specific non-secret JSON settings. Credentials stay in token/password. */
  config?: string
}

function csv(value?: string) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type PanelAdapterFactory = (panel: PanelConfig) => PanelAdapter

const panelAdapterFactories = new Map<string, PanelAdapterFactory>([
  ['REMNAWAVE', (panel) => new RemnaWaveAdapter(panel.url, panel.token, csv(panel.inbounds), csv(panel.internalSquads))],
  ['PASARGUARD', (panel) => new PasarGuardAdapter(panel.url, panel.token, panel.password, csv(panel.inbounds), csv(panel.internalSquads))],
])

/**
 * Registering adapters behind one factory keeps provisioning/subscription code
 * provider-agnostic. A new panel normally needs only an adapter + registry entry.
 */
export function registerPanelAdapter(type: string, factory: PanelAdapterFactory) {
  const key = type.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{2,40}$/.test(key)) throw new Error('invalid panel adapter type')
  panelAdapterFactories.set(key, factory)
}

export function panelConfigJson(panel: PanelConfig): Record<string, unknown> {
  try {
    const value = JSON.parse(panel.config || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function getPanelAdapter(panel: PanelConfig): PanelAdapter | null {
  if (!panel.url || !panel.token) return null
  const factory = panelAdapterFactories.get(String(panel.type || '').toUpperCase())
  if (!factory) return null
  try {
    return factory({
      ...panel,
      token: decryptPanelCredential(panel.token),
      password: decryptPanelCredential(panel.password),
    })
  } catch {
    // A missing/wrong production key must never result in sending ciphertext to
    // a VPN panel. Admin connection-test will report the adapter unavailable.
    return null
  }
}
