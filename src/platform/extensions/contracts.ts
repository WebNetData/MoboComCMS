export const EXTENSION_API_VERSION = 1 as const

export type ExtensionKind = 'plugin' | 'module' | 'theme' | 'integration'
export type ExtensionCapability = 'ui' | 'admin' | 'api' | 'events' | 'jobs' | 'settings' | 'storage'
export type ExtensionUiSlot =
  | 'site.before-header'
  | 'site.after-header'
  | 'site.before-footer'
  | 'site.after-footer'
  | 'home.before-main'
  | 'home.after-main'
  | 'dashboard.top'
  | 'dashboard.bottom'
  | 'miniapp.home'

export type ExtensionSettingType = 'text' | 'textarea' | 'boolean' | 'number' | 'select' | 'secret'
export interface ExtensionSettingDefinition {
  key: string
  label: string
  labelEn?: string
  description?: string
  descriptionEn?: string
  type: ExtensionSettingType
  required?: boolean
  public?: boolean
  default?: string | number | boolean
  options?: readonly { label: string; value: string }[]
}

export interface ExtensionPermissionDefinition { id: string; label: string; description?: string }
export interface ExtensionAdminNavigation { href: string; label: string; labelEn?: string; icon?: string; permission?: string }

export interface ExtensionPublicState {
  enabled: boolean
  settings: Readonly<Record<string, unknown>>
  /** Modules only: public URL prefixes owned by the module (hidden from menus when disabled). */
  paths?: readonly string[]
}

export type ExtensionLocalText = { fa: string; en: string; readonly [locale: string]: string }
export interface ExtensionSiteContext {
  brand: string
  tagline: ExtensionLocalText
  announcement: { enabled: boolean; text: ExtensionLocalText; link: { label: ExtensionLocalText; href: string } }
}

export interface ExtensionManifest {
  id: string
  name: string
  nameEn?: string
  description?: string
  descriptionEn?: string
  version: string
  kind: ExtensionKind
  apiVersion: typeof EXTENSION_API_VERSION
  capabilities?: readonly ExtensionCapability[]
  requiresCore?: string
  defaultEnabled?: boolean
  permissions?: readonly ExtensionPermissionDefinition[]
  adminNavigation?: readonly ExtensionAdminNavigation[]
  settings?: readonly ExtensionSettingDefinition[]
  // ---- feature modules (kind: 'module') -------------------------------
  /** Other modules that must be enabled for this one to work. */
  requires?: readonly string[]
  /** Public URL prefixes owned by the module; they 404 and leave menus while it is off. */
  publicPaths?: readonly string[]
  /** Core admin routes owned by the module; hidden from the admin menu while it is off. */
  adminPaths?: readonly string[]
  /** Legacy setting that mirrors the enabled flag (e.g. `storeEnabled`). */
  stateSetting?: string
  /** Display group in the module manager. */
  category?: 'core' | 'commerce' | 'content' | 'engagement' | 'design'
  icon?: string
}

const EXTENSION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SETTING_KEY = /^[a-z][a-z0-9._-]{0,79}$/
const PERMISSION_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/

export function assertValidExtensionManifest(manifest: ExtensionManifest) {
  if (!EXTENSION_ID.test(manifest.id)) throw new Error(`Invalid extension id "${manifest.id}". Use lowercase kebab-case.`)
  if (!manifest.name.trim()) throw new Error(`Extension "${manifest.id}" has no name.`)
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version)) throw new Error(`Extension "${manifest.id}" must use a semantic version.`)
  if (manifest.apiVersion !== EXTENSION_API_VERSION) throw new Error(`Extension "${manifest.id}" targets unsupported API version ${manifest.apiVersion}.`)
  for (const setting of manifest.settings || []) {
    if (!SETTING_KEY.test(setting.key)) throw new Error(`Extension "${manifest.id}" has invalid setting key "${setting.key}".`)
    if (setting.type === 'select' && (!setting.options || setting.options.length === 0)) throw new Error(`Select setting "${setting.key}" must define options.`)
  }
  for (const permission of manifest.permissions || []) {
    if (!PERMISSION_ID.test(permission.id)) throw new Error(`Extension "${manifest.id}" has invalid permission "${permission.id}".`)
  }
  for (const nav of manifest.adminNavigation || []) {
    if (!nav.href.startsWith('/admin/extensions/')) throw new Error(`Extension admin navigation must live under /admin/extensions/: ${nav.href}`)
  }
  if (manifest.kind !== 'module' && (manifest.requires?.length || manifest.publicPaths?.length || manifest.adminPaths?.length || manifest.stateSetting)) {
    throw new Error(`Only feature modules may declare requires/publicPaths/adminPaths/stateSetting: ${manifest.id}`)
  }
  for (const path of [...(manifest.publicPaths || []), ...(manifest.adminPaths || [])]) {
    if (!/^\/[a-z0-9/_-]*$/.test(path)) throw new Error(`Extension "${manifest.id}" has an invalid path "${path}".`)
  }
}

/** True when `href` points into a public area owned by a disabled module. */
export function pathDisabled(href: string, runtime: Readonly<Record<string, ExtensionPublicState>>): boolean {
  const path = href.split(/[?#]/)[0] || '/'
  return Object.values(runtime).some((state) => !state.enabled && (state.paths || []).some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))
}

export function assertUniqueExtensionIds(manifests: readonly ExtensionManifest[]) {
  const seen = new Set<string>()
  const permissions = new Set<string>()
  for (const manifest of manifests) {
    assertValidExtensionManifest(manifest)
    if (seen.has(manifest.id)) throw new Error(`Duplicate extension id: ${manifest.id}`)
    seen.add(manifest.id)
    for (const dependency of manifest.requires || []) {
      if (!manifests.some((other) => other.id === dependency)) throw new Error(`Extension "${manifest.id}" requires missing module "${dependency}"`)
    }
    for (const permission of manifest.permissions || []) {
      if (permissions.has(permission.id)) throw new Error(`Duplicate extension permission: ${permission.id}`)
      permissions.add(permission.id)
    }
  }
}
