import { db } from '@/platform/database/prisma'
import { extensionById, extensionCatalog } from '@/extensions/generated/catalog'
import { serverPlugins } from '@/extensions/generated/server-registry'
import type { ExtensionManifest, ExtensionPublicState, ExtensionSettingDefinition } from '@/platform/extensions/contracts'

const stateKey = (id: string) => `extension.${id}.state.v1`
export interface ExtensionStoredState { enabled: boolean; settings: Record<string, unknown> }

function defaults(manifest: ExtensionManifest, legacyEnabled?: boolean): ExtensionStoredState {
  return {
    enabled: typeof legacyEnabled === 'boolean' ? legacyEnabled : manifest.defaultEnabled === true,
    settings: Object.fromEntries((manifest.settings || []).filter(s => typeof s.default !== 'undefined').map(s => [s.key, s.default])),
  }
}

function parseState(value: string | undefined, manifest: ExtensionManifest, legacyEnabled?: boolean): ExtensionStoredState {
  if (!value) return defaults(manifest, legacyEnabled)
  try {
    const parsed = JSON.parse(value) as Partial<ExtensionStoredState>
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults(manifest, legacyEnabled).enabled,
      settings: parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings) ? parsed.settings as Record<string, unknown> : {},
    }
  } catch { return defaults(manifest) }
}

/** Modules that mirror a legacy flag (e.g. `storeEnabled`) read their enabled state from it. */
function mirrored(manifest: ExtensionManifest, state: ExtensionStoredState, settingValue: string | undefined): ExtensionStoredState {
  if (!manifest.stateSetting || settingValue === undefined) return state
  return { ...state, enabled: settingValue === 'true' }
}

/** What the owner saved for this extension, before its dependencies are looked at. */
async function storedExtensionState(id: string): Promise<ExtensionStoredState> {
  const manifest = extensionById.get(id)
  if (!manifest) throw new Error(`Unknown extension: ${id}`)
  const [row, legacy, mirror] = await Promise.all([
    db.setting.findUnique({ where: { key: stateKey(id) } }),
    db.setting.findUnique({ where: { key: 'site.config.v1' } }),
    manifest.stateSetting ? db.setting.findUnique({ where: { key: manifest.stateSetting } }) : null,
  ])
  let legacyEnabled: boolean | undefined
  if (!row && legacy?.value) { try { const site = JSON.parse(legacy.value); if (typeof site?.plugins?.[id] === 'boolean') legacyEnabled = site.plugins[id] } catch {} }
  return mirrored(manifest, parseState(row?.value, manifest, legacyEnabled), mirror?.value)
}

/**
 * The state the site runs on: an extension whose required module is off is off as well, whatever
 * was saved for it, and comes back by itself when that module is turned on again.
 */
export async function getExtensionState(id: string, seen: readonly string[] = []): Promise<ExtensionStoredState> {
  const state = await storedExtensionState(id)
  if (!state.enabled) return state
  for (const dependency of extensionById.get(id)?.requires || []) {
    if (!extensionById.has(dependency) || seen.includes(dependency)) continue
    if (!(await getExtensionState(dependency, [...seen, id])).enabled) return { ...state, enabled: false }
  }
  return state
}

export async function isExtensionEnabled(id: string) {
  return (await getExtensionState(id)).enabled
}

function validSetting(def: ExtensionSettingDefinition, value: unknown) {
  if (value == null || value === '') return !def.required
  if (def.type === 'boolean') return typeof value === 'boolean'
  if (def.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (def.type === 'select') return typeof value === 'string' && !!def.options?.some(o => o.value === value)
  return typeof value === 'string' && value.length <= (def.type === 'textarea' ? 12000 : 2000)
}

export async function saveExtensionState(id: string, input: { enabled?: boolean; settings?: Record<string, unknown> }) {
  const manifest = extensionById.get(id)
  if (!manifest) throw new Error('افزونه در این build نصب نشده است')
  const current = await getExtensionState(id)
  const definitions = new Map((manifest.settings || []).map(def => [def.key, def]))
  const settings = { ...current.settings }
  if (input.settings) {
    for (const [key, value] of Object.entries(input.settings)) {
      const def = definitions.get(key)
      if (!def) throw new Error(`تنظیم ناشناخته: ${key}`)
      if (!validSetting(def, value)) throw new Error(`مقدار تنظیم ${key} معتبر نیست`)
      if (def.type === 'secret' && value === '••••••••') continue
      settings[key] = value
    }
  }
  // Saving settings must not write down "off" for an extension that is only off because of a dependency.
  const next: ExtensionStoredState = { enabled: typeof input.enabled === 'boolean' ? input.enabled : (await storedExtensionState(id)).enabled, settings }
  if (typeof input.enabled === 'boolean' && input.enabled !== current.enabled) await assertDependencies(manifest, input.enabled)
  serverPlugins[id]?.validateSettings?.(next.settings)
  await db.setting.upsert({ where: { key: stateKey(id) }, create: { key: stateKey(id), value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } })
  if (manifest.stateSetting) {
    const key = manifest.stateSetting
    const value = next.enabled ? 'true' : 'false'
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  return next
}

/** Enabling needs every required module on; disabling is refused while an enabled module depends on it. */
async function assertDependencies(manifest: ExtensionManifest, enabling: boolean) {
  const label = (m: ExtensionManifest) => m.name
  if (enabling) {
    for (const dependency of manifest.requires || []) {
      const required = extensionById.get(dependency)
      if (required && !(await getExtensionState(dependency)).enabled) throw new Error(`ابتدا «${label(required)}» را فعال کنید / Enable “${required.nameEn || required.name}” first`)
    }
    return
  }
  for (const other of extensionCatalog) {
    if (!(other.requires || []).includes(manifest.id)) continue
    if ((await getExtensionState(other.id)).enabled) throw new Error(`«${label(other)}» به این ماژول وابسته است؛ ابتدا آن را غیرفعال کنید / “${other.nameEn || other.name}” depends on it — disable it first`)
  }
}

export async function getPublicExtensionRuntime(): Promise<Record<string, ExtensionPublicState>> {
  const mirrorKeys = extensionCatalog.flatMap(m => (m.stateSetting ? [m.stateSetting] : []))
  const [rows, legacy] = await Promise.all([db.setting.findMany({ where: { key: { in: [...extensionCatalog.map(m => stateKey(m.id)), ...mirrorKeys] } } }), db.setting.findUnique({ where: { key: 'site.config.v1' } })])
  const values = new Map(rows.map(row => [row.key, row.value]))
  let legacyPlugins: Record<string, boolean> = {}
  if (legacy?.value) { try { const parsed = JSON.parse(legacy.value); if (parsed?.plugins && typeof parsed.plugins === 'object') legacyPlugins = parsed.plugins } catch {} }
  const stored = new Map(extensionCatalog.map(manifest => [manifest.id, mirrored(manifest, parseState(values.get(stateKey(manifest.id)), manifest, legacyPlugins[manifest.id]), manifest.stateSetting ? values.get(manifest.stateSetting) as string | undefined : undefined)]))
  const on = (id: string, seen: readonly string[] = []): boolean => !!stored.get(id)?.enabled && (extensionById.get(id)?.requires || []).every(dependency => !stored.has(dependency) || seen.includes(dependency) || on(dependency, [...seen, id]))
  return Object.fromEntries(extensionCatalog.map(manifest => {
    const state = { ...stored.get(manifest.id)!, enabled: on(manifest.id) }
    const publicKeys = new Set((manifest.settings || []).filter(setting => setting.public && setting.type !== 'secret').map(setting => setting.key))
    const settings = Object.fromEntries(Object.entries(state.settings).filter(([key]) => publicKeys.has(key)))
    return [manifest.id, manifest.kind === 'module' ? { enabled: state.enabled, settings, paths: manifest.publicPaths || [] } : { enabled: state.enabled, settings }]
  }))
}

export async function listExtensionAdminState() {
  const result = []
  for (const manifest of extensionCatalog) {
    const state = await getExtensionState(manifest.id)
    const settings = { ...state.settings }
    for (const def of manifest.settings || []) if (def.type === 'secret' && settings[def.key]) settings[def.key] = '••••••••'
    result.push({ manifest, state: { enabled: state.enabled, settings } })
  }
  return result
}
