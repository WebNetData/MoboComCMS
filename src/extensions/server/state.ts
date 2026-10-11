import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { extensionById, extensionCatalog } from '@/extensions/generated/catalog'
import { serverPlugins } from '@/extensions/generated/server-registry'
import type { ExtensionManifest, ExtensionPublicState, ExtensionSettingDefinition } from '@/platform/extensions/contracts'
import { logEvent } from '@/platform/observability/logger'

const stateKey = (id: string) => `extension.${id}.state.v1`
export type StateReader = Pick<Prisma.TransactionClient, 'setting'>
export interface ExtensionStoredState { enabled: boolean; settings: Record<string, unknown> }

function defaults(manifest: ExtensionManifest, legacyEnabled?: boolean): ExtensionStoredState {
  return {
    enabled: typeof legacyEnabled === 'boolean' ? legacyEnabled : manifest.defaultEnabled === true,
    settings: Object.fromEntries((manifest.settings || []).filter(s => typeof s.default !== 'undefined').map(s => [s.key, s.default])),
  }
}

function parseState(value: string | undefined, manifest: ExtensionManifest, legacyEnabled?: boolean, strict = false): ExtensionStoredState {
  if (value === undefined || (!value && !strict)) return defaults(manifest, legacyEnabled)
  try {
    const parsed = JSON.parse(value) as Partial<ExtensionStoredState>
    if (strict && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      (parsed.enabled !== undefined && typeof parsed.enabled !== 'boolean') ||
      (parsed.settings !== undefined && (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings))))) throw new Error('invalid stored shape')
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults(manifest, legacyEnabled).enabled,
      settings: parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings) ? parsed.settings as Record<string, unknown> : {},
    }
  } catch {
    if (strict) throw new Error('تنظیمات ذخیره‌شدهٔ افزونه معتبر نیست؛ ابتدا بازیابی کنید.')
    return defaults(manifest)
  }
}

/** Modules that mirror a legacy flag (e.g. `storeEnabled`) read their enabled state from it. */
function mirrored(manifest: ExtensionManifest, state: ExtensionStoredState, settingValue: string | undefined): ExtensionStoredState {
  if (!manifest.stateSetting || settingValue === undefined) return state
  return { ...state, enabled: settingValue === 'true' }
}

/** What the owner saved for this extension, before its dependencies are looked at. */
async function storedExtensionState(id: string, reader: StateReader = db, strict = false): Promise<ExtensionStoredState> {
  const manifest = extensionById.get(id)
  if (!manifest) throw new Error(`Unknown extension: ${id}`)
  const rows = await reader.setting.findMany({ where: { key: { in: [stateKey(id), 'site.config.v1', ...(manifest.stateSetting ? [manifest.stateSetting] : [])] } } })
  const values = new Map(rows.map(row => [row.key, row.value]))
  const value = values.get(stateKey(id)), legacy = values.get('site.config.v1')
  let legacyEnabled: boolean | undefined
  if (value === undefined && legacy !== undefined) {
    try { const site = JSON.parse(legacy); if (typeof site?.plugins?.[id] === 'boolean') legacyEnabled = site.plugins[id] }
    catch { if (strict) throw new Error('تنظیمات قدیمی سایت معتبر نیست؛ ابتدا بازیابی کنید.') }
  }
  return mirrored(manifest, parseState(value, manifest, legacyEnabled, strict), manifest.stateSetting ? values.get(manifest.stateSetting) : undefined)
}

/**
 * The state the site runs on: an extension whose required module is off is off as well, whatever
 * was saved for it, and comes back by itself when that module is turned on again.
 */
export async function getExtensionState(id: string, seen: readonly string[] = [], reader: StateReader = db, strict = false): Promise<ExtensionStoredState> {
  const state = await storedExtensionState(id, reader, strict)
  if (!state.enabled) return state
  for (const dependency of extensionById.get(id)?.requires || []) {
    if (!extensionById.has(dependency) || seen.includes(dependency)) continue
    if (!(await getExtensionState(dependency, [...seen, id], reader, strict)).enabled) return { ...state, enabled: false }
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
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const current = await getExtensionState(id, [], tx, true)
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
        const next: ExtensionStoredState = { enabled: typeof input.enabled === 'boolean' ? input.enabled : (await storedExtensionState(id, tx, true)).enabled, settings }
        if (typeof input.enabled === 'boolean' && input.enabled !== current.enabled) await assertDependencies(manifest, input.enabled, tx)
        serverPlugins[id]?.validateSettings?.(next.settings)
        await tx.setting.upsert({ where: { key: stateKey(id) }, create: { key: stateKey(id), value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } })
        if (manifest.stateSetting) {
          const key = manifest.stateSetting
          const value = next.enabled ? 'true' : 'false'
          await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
        }
        return next
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (['P2034', 'P2002'].includes((error as { code?: string }).code || '') && attempt < 19) continue
      throw error
    }
  }
  throw new Error('extension settings changed repeatedly; retry the request')
}

/** Enabling needs every required module on; disabling is refused while an enabled module depends on it. */
async function assertDependencies(manifest: ExtensionManifest, enabling: boolean, reader: StateReader = db) {
  const label = (m: ExtensionManifest) => m.name
  if (enabling) {
    for (const dependency of manifest.requires || []) {
      const required = extensionById.get(dependency)
      if (required && !(await getExtensionState(dependency, [], reader, true)).enabled) throw new Error(`ابتدا «${label(required)}» را فعال کنید / Enable “${required.nameEn || required.name}” first`)
    }
    return
  }
  for (const other of extensionCatalog) {
    if (!(other.requires || []).includes(manifest.id)) continue
    if ((await getExtensionState(other.id, [], reader, true)).enabled) throw new Error(`«${label(other)}» به این ماژول وابسته است؛ ابتدا آن را غیرفعال کنید / “${other.nameEn || other.name}” depends on it — disable it first`)
  }
}

export async function getPublicExtensionRuntime(reader: StateReader = db): Promise<Record<string, ExtensionPublicState>> {
  const mirrorKeys = extensionCatalog.flatMap(m => (m.stateSetting ? [m.stateSetting] : []))
  let rows: { key: string; value: string }[] = [], available = true
  try { rows = await reader.setting.findMany({ where: { key: { in: [...extensionCatalog.map(m => stateKey(m.id)), ...mirrorKeys, 'site.config.v1'] } } }) }
  catch (error) {
    available = false
    logEvent('warn', 'extensions.runtime_unavailable', { errorName: error instanceof Error ? error.name : 'Unknown' })
  }
  const values = new Map(rows.map(row => [row.key, row.value]))
  let legacyPlugins: Record<string, unknown> = {}, invalidLegacy = false
  const legacy = values.get('site.config.v1')
  if (legacy !== undefined) {
    try {
      const parsed = JSON.parse(legacy)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed.plugins !== undefined && (!parsed.plugins || typeof parsed.plugins !== 'object' || Array.isArray(parsed.plugins)))) throw new Error('invalid legacy shape')
      legacyPlugins = parsed.plugins || {}
    } catch { invalidLegacy = true; logEvent('warn', 'extensions.legacy_state_invalid', {}) }
  }
  const stored = new Map(extensionCatalog.map(manifest => {
    const value = values.get(stateKey(manifest.id)), mirror = manifest.stateSetting ? values.get(manifest.stateSetting) : undefined
    const legacyValue = legacyPlugins[manifest.id]
    // Missing storage is a normal fresh-install default. Failed/corrupt existing storage is not.
    if (!available || (value === undefined && mirror === undefined && (invalidLegacy || (legacyValue !== undefined && typeof legacyValue !== 'boolean')))) return [manifest.id, { enabled: false, settings: {} }] as const
    try { return [manifest.id, mirrored(manifest, parseState(value, manifest, typeof legacyValue === 'boolean' ? legacyValue : undefined, true), mirror)] as const }
    catch { logEvent('warn', 'extensions.state_invalid', { extensionId: manifest.id }); return [manifest.id, { enabled: false, settings: {} }] as const }
  }))
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
