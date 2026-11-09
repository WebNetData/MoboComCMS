// Uploadable package format.
//
// A package is a .zip with a manifest.json at its root (or inside one top-level
// folder). "declarative" packages contain only HTML, CSS, JSON, Markdown and
// media: they install instantly and never execute code on the server or in the
// browser. "code" packages carry TypeScript sources for a trusted rebuild and
// are stored until an administrator applies them (see code-apply).

export const PACKAGE_SLOTS = [
  'site.before-header', 'site.after-header', 'site.before-footer', 'site.after-footer',
  'home.before-main', 'home.after-main', 'dashboard.top', 'dashboard.bottom', 'miniapp.home',
] as const
export type PackageSlot = typeof PACKAGE_SLOTS[number]
export type PackageKind = 'plugin' | 'theme'
export type PackageRuntime = 'declarative' | 'code'
export type LocalText = { fa: string; en: string }
/** A slot/page file may be one file for every language or one per language. */
export type LocalizedFile = string | { fa?: string; en?: string }

export interface PackageSettingDefinition { key: string; label: string; labelEn?: string; type: 'text' | 'textarea'; default?: string }
export interface PackagePage { slug: string; title: LocalText; file: LocalizedFile; nav?: boolean }
/** A builder component a declarative package offers: template and style files, typed fields, no script. */
export interface PackageComponent { name: string; title: LocalText; category?: string; description?: string; template: LocalizedFile; style?: string; fields?: unknown[] }
export interface PackagePalette { background: string; surface: string; accent: string; text: string; muted: string; border: string }
export interface PackageDesign { extends?: string; radius: number; colors: PackagePalette; lightColors?: PackagePalette }

export interface PackageManifest {
  id: string
  name: string
  nameEn?: string
  description?: string
  descriptionEn?: string
  version: string
  author?: string
  kind: PackageKind
  runtime: PackageRuntime
  requiresCore?: string
  slots?: Partial<Record<PackageSlot, LocalizedFile>>
  styles?: string[]
  pages?: PackagePage[]
  settings?: PackageSettingDefinition[]
  components?: PackageComponent[]
  design?: PackageDesign
}

export const PACKAGE_LIMITS = {
  uploadBytes: 3 * 1024 * 1024,
  maxEntries: 200,
  maxEntryBytes: 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
  maxTextFileChars: 400_000,
  maxRevisions: 30,
} as const

const TEXT_TYPES: Record<string, string> = {
  json: 'application/json', html: 'text/html', htm: 'text/html', css: 'text/css', md: 'text/markdown', txt: 'text/plain',
  svg: 'image/svg+xml', ts: 'text/plain', tsx: 'text/plain',
}
const BINARY_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2',
}
const CODE_ONLY = new Set(['ts', 'tsx'])

export const extensionOf = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase()
export const isTextFile = (path: string) => extensionOf(path) in TEXT_TYPES
export const contentTypeOf = (path: string) => TEXT_TYPES[extensionOf(path)] || BINARY_TYPES[extensionOf(path)] || 'application/octet-stream'
/** Files the in-browser editor may change. Media is replaced by uploading a new version. */
export const isEditable = (path: string) => isTextFile(path) && extensionOf(path) !== 'svg'

/** Safe relative path: no traversal, no absolute paths, conservative characters. */
export function validPackagePath(path: string, runtime: PackageRuntime = 'declarative') {
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,5}$/.test(path) || path.length > 160) return false
  if (path.split('/').some(part => part === '.' || part === '..' || part.startsWith('.'))) return false
  const ext = extensionOf(path)
  if (CODE_ONLY.has(ext)) return runtime === 'code'
  return ext in TEXT_TYPES || ext in BINARY_TYPES
}

export class PackageError extends Error {}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const COLOR = /^#[0-9a-f]{6}$/i
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const shortText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
const optionalText = (value: unknown, max: number) => value === undefined || shortText(value, max)

function palette(value: unknown): value is PackagePalette {
  return isRecord(value) && ['background', 'surface', 'accent', 'text', 'muted', 'border'].every(key => typeof value[key] === 'string' && COLOR.test(value[key] as string))
}
function localizedFile(value: unknown): value is LocalizedFile {
  if (typeof value === 'string') return true
  return isRecord(value) && Object.keys(value).every(key => key === 'fa' || key === 'en') && Object.values(value).every(item => typeof item === 'string') && Object.keys(value).length > 0
}
export function filesOf(value: LocalizedFile): string[] {
  return typeof value === 'string' ? [value] : Object.values(value).filter((item): item is string => !!item)
}
export function fileFor(value: LocalizedFile, locale: string): string {
  if (typeof value === 'string') return value
  return (locale === 'fa' ? value.fa || value.en : value.en || value.fa) || ''
}

/** Checks shape and every file reference; returns the normalized manifest. */
export function parseManifest(raw: unknown, files: ReadonlySet<string>): PackageManifest {
  const fail = (message: string): never => { throw new PackageError(`manifest.json: ${message}`) }
  if (!isRecord(raw)) fail('must be a JSON object')
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !ID.test(m.id) || m.id.length < 2 || m.id.length > 50) fail('"id" must be lowercase kebab-case (2–50 characters)')
  if (!shortText(m.name, 80) || !(m.name as string).trim()) fail('"name" is required (max 80 characters)')
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) fail('"version" must be semantic, e.g. 1.0.0')
  if (m.kind !== 'plugin' && m.kind !== 'theme') fail('"kind" must be "plugin" or "theme"')
  const runtime = m.runtime === undefined ? 'declarative' : m.runtime
  if (runtime !== 'declarative' && runtime !== 'code') fail('"runtime" must be "declarative" or "code"')
  for (const key of ['nameEn', 'author'] as const) if (!optionalText(m[key], 80)) fail(`"${key}" is too long`)
  for (const key of ['description', 'descriptionEn'] as const) if (!optionalText(m[key], 400)) fail(`"${key}" is too long`)
  if (m.requiresCore !== undefined && (typeof m.requiresCore !== 'string' || !/^\^?\d+\.\d+\.\d+$/.test(m.requiresCore))) fail('"requiresCore" must look like ^1.0.0')
  if (m.requiresCore && Number(String(m.requiresCore).replace('^', '').split('.')[0]) !== 1) fail('this package needs a different MoboComCMS core version')

  const need = (path: string, where: string) => { if (!files.has(path)) fail(`${where} references missing file "${path}"`) }
  if (m.slots !== undefined) {
    if (!isRecord(m.slots)) fail('"slots" must be an object')
    for (const [slot, file] of Object.entries(m.slots as Record<string, unknown>)) {
      if (!(PACKAGE_SLOTS as readonly string[]).includes(slot)) fail(`unknown slot "${slot}"`)
      if (!localizedFile(file)) fail(`slot "${slot}" must name an .html file or { fa, en } files`)
      for (const path of filesOf(file as LocalizedFile)) { if (!/\.html?$/.test(path)) fail(`slot "${slot}" must use .html files`); need(path, `slot "${slot}"`) }
    }
  }
  if (m.styles !== undefined) {
    if (!Array.isArray(m.styles) || m.styles.length > 10 || !m.styles.every(path => typeof path === 'string' && path.endsWith('.css'))) fail('"styles" must list up to 10 .css files')
    for (const path of m.styles as string[]) need(path, '"styles"')
  }
  if (m.pages !== undefined) {
    if (!Array.isArray(m.pages) || m.pages.length > 30) fail('"pages" must be a list (max 30)')
    const slugs = new Set<string>()
    for (const page of m.pages as unknown[]) {
      if (!isRecord(page) || typeof page.slug !== 'string' || !ID.test(page.slug) || page.slug.length > 60) fail('each page needs a kebab-case "slug"')
      const p = page as Record<string, unknown>
      if (slugs.has(p.slug as string)) fail(`duplicate page "${p.slug}"`)
      slugs.add(p.slug as string)
      if (!isRecord(p.title) || !shortText(p.title.fa, 120) || !shortText(p.title.en, 120)) fail(`page "${p.slug}" needs title.fa and title.en`)
      if (!localizedFile(p.file)) fail(`page "${p.slug}" must name an .html file`)
      for (const path of filesOf(p.file as LocalizedFile)) need(path, `page "${p.slug}"`)
      if (p.nav !== undefined && typeof p.nav !== 'boolean') fail(`page "${p.slug}": "nav" must be true or false`)
    }
  }
  if (m.components !== undefined) {
    if (runtime !== 'declarative') fail('"components" are only for declarative packages')
    if (!Array.isArray(m.components) || m.components.length > 30) fail('"components" must be a list (max 30)')
    const names = new Set<string>()
    for (const entry of m.components as unknown[]) {
      if (!isRecord(entry) || typeof entry.name !== 'string' || !ID.test(entry.name) || entry.name.length > 40) fail('each component needs a kebab-case "name"')
      const c = entry as Record<string, unknown>
      if (names.has(c.name as string)) fail(`duplicate component "${c.name}"`)
      names.add(c.name as string)
      if (!isRecord(c.title) || !shortText(c.title.fa, 80) || !shortText(c.title.en, 80)) fail(`component "${c.name}" needs title.fa and title.en`)
      if (!optionalText(c.category, 40) || !optionalText(c.description, 300)) fail(`component "${c.name}": category or description is too long`)
      if (!localizedFile(c.template)) fail(`component "${c.name}" must name an .html template`)
      for (const path of filesOf(c.template as LocalizedFile)) { if (!/\.html?$/.test(path)) fail(`component "${c.name}" must use .html templates`); need(path, `component "${c.name}"`) }
      if (c.style !== undefined) { if (typeof c.style !== 'string' || !c.style.endsWith('.css')) fail(`component "${c.name}": "style" must be a .css file`); need(c.style as string, `component "${c.name}"`) }
      if (c.fields !== undefined && (!Array.isArray(c.fields) || c.fields.length > 20)) fail(`component "${c.name}": "fields" must be a list (max 20)`)
    }
  }
  // Code packages declare settings in the build-time extension format, validated by generate-extensions.
  if (m.settings !== undefined && runtime === 'declarative') {
    if (!Array.isArray(m.settings) || m.settings.length > 30) fail('"settings" must be a list (max 30)')
    for (const setting of m.settings as unknown[]) {
      if (!isRecord(setting) || typeof setting.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(setting.key)) fail('each setting needs a "key" (letters, digits, _)')
      const s = setting as Record<string, unknown>
      if (!shortText(s.label, 120) || !optionalText(s.labelEn, 120) || (s.type !== 'text' && s.type !== 'textarea') || !optionalText(s.default, 4000)) fail(`setting "${s.key}" is invalid (type must be text or textarea)`)
    }
  }
  if (runtime === 'code') {
    // Code packages become src/plugins/<id> or src/themes/code/<id> and must satisfy the build-time registry too.
    if (m.apiVersion !== 1) fail('code packages need "apiVersion": 1')
    if (m.kind === 'theme' && (!isRecord(m.design) || (m.design as Record<string, unknown>).id !== m.id)) fail('a code theme needs design.id equal to its id')
  }
  if (m.kind === 'theme') {
    if (!isRecord(m.design)) fail('a theme needs a "design" object')
    const d = m.design as Record<string, unknown>
    if (!palette(d.colors) || (d.lightColors !== undefined && !palette(d.lightColors))) fail('design colors need background, surface, accent, text, muted and border as #rrggbb')
    if (!Number.isInteger(d.radius) || (d.radius as number) < 0 || (d.radius as number) > 32) fail('design.radius must be an integer 0–32')
    if (d.extends !== undefined && (typeof d.extends !== 'string' || !ID.test(d.extends) || d.extends === m.id)) fail('design.extends must be the id of an installed code theme')
  } else if (m.design !== undefined) fail('"design" is only allowed for themes')

  return { ...(m as unknown as PackageManifest), runtime: runtime as PackageRuntime }
}

/** Zip files often wrap everything in one folder; drop it so manifest.json is at the root. */
export function normalizeEntries(entries: Map<string, Buffer>): Map<string, Buffer> {
  const names = [...entries.keys()].filter(name => !name.startsWith('__MACOSX/') && !name.split('/').pop()!.startsWith('.'))
  const prefix = names.includes('manifest.json') ? '' : names.find(name => /^[^/]+\/manifest\.json$/.test(name))?.replace('manifest.json', '') ?? ''
  const out = new Map<string, Buffer>()
  for (const name of names) {
    if (prefix && !name.startsWith(prefix)) continue
    out.set(name.slice(prefix.length), entries.get(name)!)
  }
  return out
}
