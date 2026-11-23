export interface SolutionCompositionReceipt {
  theme?: { id: string; action: 'set' | 'preserve' }
  navigation?: { action: 'set' | 'preserve'; count: number }
  /** Stable identities survive customer renames and deliberate deletion. Never imply purge ownership. */
  roles?: { template: string; roleId: number }[]
  starterContent?: { key: string; pageId: number }[]
}

/** One-time provisioning receipt; complete history stays in canonical strict Audit. */
export interface SolutionApplyReceipt {
  fingerprint: string
  appliedAt: string
  actorId: number
  modules: string[]
  defaultKeys: string[]
  composition?: SolutionCompositionReceipt
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const only = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))
const id = (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length >= 2 && value.length <= 50
const positive = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0
const action = (value: unknown) => value === 'set' || value === 'preserve'

function bindings(value: unknown, key: string, identity: string): boolean {
  if (!Array.isArray(value) || value.length > 100) return false
  return value.every(item => record(item) && only(item, [key, identity]) && id(item[key]) && positive(item[identity]))
    && new Set(value.map(item => item[key])).size === value.length
    && new Set(value.map(item => item[identity])).size === value.length
}

function composition(value: unknown): boolean {
  if (!record(value) || !only(value, ['theme', 'navigation', 'roles', 'starterContent'])) return false
  return (value.theme === undefined || record(value.theme) && only(value.theme, ['id', 'action']) && id(value.theme.id) && action(value.theme.action))
    && (value.navigation === undefined || record(value.navigation) && only(value.navigation, ['action', 'count']) && action(value.navigation.action) && Number.isSafeInteger(value.navigation.count) && (value.navigation.count as number) >= 0 && (value.navigation.count as number) <= 20)
    && (value.roles === undefined || bindings(value.roles, 'template', 'roleId'))
    && (value.starterContent === undefined || bindings(value.starterContent, 'key', 'pageId'))
}

export function isSolutionApplyReceipt(value: unknown): value is SolutionApplyReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).every(key => ['fingerprint', 'appliedAt', 'actorId', 'modules', 'defaultKeys', 'composition'].includes(key))
    && typeof item.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(item.fingerprint)
    && typeof item.appliedAt === 'string' && Number.isFinite(Date.parse(item.appliedAt))
    && Number.isSafeInteger(item.actorId) && (item.actorId as number) > 0
    && Array.isArray(item.modules) && item.modules.length <= 30 && item.modules.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]{1,49}$/.test(id))
    && Array.isArray(item.defaultKeys) && item.defaultKeys.length <= 900 && item.defaultKeys.every(key => typeof key === 'string' && /^[a-z][a-z0-9-]{1,49}\.[a-zA-Z0-9._-]{1,80}$/.test(key))
    && (item.composition === undefined || composition(item.composition))
}
