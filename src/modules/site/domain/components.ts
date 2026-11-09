/**
 * Custom components: reusable blocks a site admin defines once (HTML template, CSS, optional JavaScript and a
 * list of fields) and anyone who builds pages places anywhere with their own field values. Placing a component
 * only supplies values, which are always escaped, so the code itself stays the admin's. Placeholders follow the
 * package format: {{field.key}}, {{site.brand}}, {{locale}}; {{#field.key}}…{{/field.key}} shows a part only when
 * the field is set.
 */
export const COMPONENT_FIELD_TYPES = ['text', 'textarea', 'color', 'number', 'url', 'image', 'select', 'toggle'] as const
export type ComponentFieldType = typeof COMPONENT_FIELD_TYPES[number]
export type ComponentField = { key: string; label: string; type: ComponentFieldType; default: string; options: string[] }
export type ComponentDef = { id: string; name: string; description: string; category: string; fields: ComponentField[]; html: string; css: string; js: string }
export type ComponentLibrary = { components: ComponentDef[] }
export const COMPONENT_MAX = 60
export const COMPONENT_LIMITS = { html: 60000, css: 40000, js: 30000, fields: 20 } as const
export const COMPONENT_ID = /^cc-[a-z0-9]{4,16}$/

const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : ''
const KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/

export function normalizeField(input: unknown): ComponentField | null {
  if (!input || typeof input !== 'object') return null
  const f = input as Record<string, unknown>
  if (typeof f.key !== 'string' || !KEY.test(f.key)) return null
  const type = (COMPONENT_FIELD_TYPES as readonly unknown[]).includes(f.type) ? f.type as ComponentFieldType : 'text'
  const options = type === 'select' ? (Array.isArray(f.options) ? f.options : typeof f.options === 'string' ? f.options.split('\n') : []).map(o => str(o, 80).trim()).filter(Boolean).slice(0, 20) : []
  return { key: f.key, label: str(f.label, 80).trim() || f.key, type, default: fieldValue({ key: f.key, label: '', type, default: '', options }, f.default), options }
}

export function normalizeComponent(input: unknown): ComponentDef | null {
  if (!input || typeof input !== 'object') return null
  const c = input as Record<string, unknown>
  if (typeof c.id !== 'string' || !COMPONENT_ID.test(c.id)) return null
  const keys = new Set<string>()
  const fields = (Array.isArray(c.fields) ? c.fields : []).map(normalizeField).filter((f): f is ComponentField => !!f && !keys.has(f.key) && !!keys.add(f.key)).slice(0, COMPONENT_LIMITS.fields)
  return { id: c.id, name: str(c.name, 80).trim() || 'کامپوننت', description: str(c.description, 300).trim(), category: str(c.category, 40).trim(), fields, html: str(c.html, COMPONENT_LIMITS.html), css: str(c.css, COMPONENT_LIMITS.css), js: str(c.js, COMPONENT_LIMITS.js) }
}

export function normalizeLibrary(input: unknown): ComponentLibrary {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const ids = new Set<string>()
  return { components: (Array.isArray(raw.components) ? raw.components : []).map(normalizeComponent).filter((c): c is ComponentDef => !!c && !ids.has(c.id) && !!ids.add(c.id)).slice(0, COMPONENT_MAX) }
}

const SAFE_URL = /^(?:\/(?!\/)|#|https?:\/\/|mailto:|tel:)[^\s<>"'\\]*$/i
const COLOR = /^(?:#[0-9a-f]{3,8}|var\(--[a-z0-9-]{1,40}\)|transparent|currentColor)$/i

/** A value as the field type allows; anything else falls back to the field's default. */
export function fieldValue(field: ComponentField, value: unknown): string {
  const v = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  switch (field.type) {
    case 'text': return v.slice(0, 2000)
    case 'textarea': return v.slice(0, 8000)
    case 'color': return COLOR.test(v.trim()) ? v.trim() : field.default
    case 'number': return v.trim() !== '' && Number.isFinite(Number(v)) ? String(Number(v)) : field.default
    case 'url': case 'image': return SAFE_URL.test(v.trim()) ? v.trim() : v.trim() === '' ? '' : field.default
    case 'select': return field.options.includes(v) ? v : field.default || field.options[0] || ''
    case 'toggle': return v === '1' || v === 'true' ? '1' : ''
  }
}

export function componentValues(def: ComponentDef, raw: unknown): Record<string, string> {
  let parsed: unknown = raw
  if (typeof raw === 'string') { try { parsed = JSON.parse(raw) } catch { parsed = {} } }
  const given = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  return Object.fromEntries(def.fields.map(f => [f.key, Object.hasOwn(given, f.key) ? fieldValue(f, given[f.key]) : f.default]))
}

const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Fills the template: values are escaped (multi-line text keeps its line breaks); unknown keys become empty. */
export function renderComponentHtml(def: ComponentDef, values: Record<string, string>, context: { brand: string; locale: string }) {
  const typeOf = new Map(def.fields.map(f => [f.key, f.type]))
  return def.html
    .replace(/\{\{#field\.([a-zA-Z][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/field\.\1\}\}/g, (_m, key: string, inner: string) => values[key] ? inner : '')
    .replace(/\{\{\s*(site\.brand|locale|field\.([a-zA-Z][a-zA-Z0-9_]*))\s*\}\}/g, (_m, name: string, key?: string) => {
      if (name === 'site.brand') return escape(context.brand)
      if (name === 'locale') return escape(context.locale)
      const value = escape(values[key!] ?? '')
      return typeOf.get(key!) === 'textarea' ? value.replace(/\r?\n/g, '<br>') : value
    })
}

export const componentClass = (id: string) => COMPONENT_ID.test(id) ? id : ''
/** `selector` is the component's root; braces must balance or no CSS is written. */
export function componentCss(def: ComponentDef) {
  const css = def.css.replace(/<\/?style/gi, '').replace(/@import[^;{]*;?/gi, '').trim()
  if (!css) return ''
  let depth = 0
  for (const c of css) { if (c === '{') depth++; else if (c === '}' && --depth < 0) return '' }
  return depth ? '' : css.replace(/\bselector\b/g, `.${componentClass(def.id)}`)
}
/** Each instance runs the component's JavaScript once with `root` set to its own element. */
export const componentScript = (def: ComponentDef, instance: string) => def.js.trim()
  ? `(function (root) {\n${def.js}\n})(document.querySelector('[data-cc-instance="${instance.replace(/[^a-zA-Z0-9_-]/g, '')}"]'));`
  : ''
export const newComponentId = () => `cc-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`
