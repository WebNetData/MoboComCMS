import type { SiteConfig, ThemeManifest } from './types'

export function safeHref(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && !/[\s\\\u0000-\u001f]/.test(value) && (/^\/(?!\/)/.test(value) || /^#[\w-]*$/.test(value) || /^https:\/\//.test(value) || /^mailto:[^@]+@[^@]+$/.test(value))
}
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = 6000): v is string => typeof v === 'string' && v.length <= max
const localized = (v: unknown) => record(v) && text(v.fa) && text(v.en)
const link = (v: unknown) => record(v) && localized(v.label) && safeHref(v.href)
const palette = (v: unknown) => record(v) && ['background', 'surface', 'accent', 'text', 'muted', 'border'].every(k => /^#[0-9a-fA-F]{6}$/.test((v as any)[k]))
const FONT_STACK = /^[A-Za-z0-9 ,.'"()\[\]-]*$/
export function validateFonts(v: unknown): v is { body: string; heading: string } {
  return record(v) && text(v.body, 140) && text(v.heading, 140) && FONT_STACK.test(v.body) && FONT_STACK.test(v.heading)
}
export function validateCustomCss(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 50000 && !/<\s*\/?\s*(style|script)/i.test(v) && !/javascript:/i.test(v)
}
/** Defensive filter applied when injecting custom CSS into <head>. */
export function safeCustomCss(value: string): string {
  return value.replace(/<\s*\/?\s*(style|script)/gi, '')
}
export function validateTheme(v: unknown): v is ThemeManifest {
  return record(v) && /^[a-z][a-z0-9-]{1,49}$/.test(v.id) && (typeof v.extends === 'undefined' || (/^[a-z][a-z0-9-]{1,49}$/.test(v.extends) && v.extends !== v.id)) && text(v.name, 80) && !!v.name && text(v.description, 300) && text(v.version, 30) && Number.isInteger(v.radius) && v.radius >= 0 && v.radius <= 32 && palette(v.colors) && (v.lightColors === undefined || palette(v.lightColors))
}
export function validateSite(v: unknown): v is SiteConfig {
  if (!record(v) || v.version !== 1 || !text(v.brand, 60) || !v.brand.trim() || !localized(v.tagline) || !localized(v.copyright)) return false
  if (v.logo !== undefined && v.logo !== '' && !safeHref(v.logo)) return false
  if (v.fonts !== undefined && !validateFonts(v.fonts)) return false
  if (v.customCss !== undefined && !validateCustomCss(v.customCss)) return false
  if (v.copy !== undefined && (!record(v.copy) || Object.keys(v.copy).length > 300 || !Object.entries(v.copy).every(([key, value]) => key.length <= 300 && localized(value)))) return false
  if (Array.isArray(v.sections) && v.sections.some((s: any) => s.image !== undefined && s.image !== '' && !safeHref(s.image))) return false
  if (!record(v.announcement) || typeof v.announcement.enabled !== 'boolean' || !localized(v.announcement.text) || !link(v.announcement.link)) return false
  if (![v.navigation, v.footer].every(a => Array.isArray(a) && a.length <= 12 && a.every(link))) return false
  if (!text(v.themeId, 50) || !Array.isArray(v.themes) || v.themes.length > 20 || !v.themes.every(validateTheme) || new Set(v.themes.map((t: ThemeManifest) => t.id)).size !== v.themes.length) return false
  if (!record(v.plugins) || Object.keys(v.plugins).length > 50 || !Object.entries(v.plugins).every(([k, enabled]) => /^[a-z][a-z0-9-]{1,60}$/.test(k) && typeof enabled === 'boolean')) return false
  if (!Array.isArray(v.sections) || v.sections.length > 30 || new Set(v.sections.map((s: any) => s?.id)).size !== v.sections.length) return false
  return v.sections.every((s: any) => record(s) && /^[a-z][a-z0-9-]{0,60}$/.test(s.id) && ['hero','features','plans','network','steps','apps','products','posts','faq','cta','form','services','showcase'].includes(s.kind) && typeof s.enabled === 'boolean' && (s.miniapp === undefined || typeof s.miniapp === 'boolean') && localized(s.eyebrow) && localized(s.title) && localized(s.description) && link(s.action) && text(s.formSlug, 80) && Array.isArray(s.items) && s.items.length <= 30 && s.items.every((i: any) => record(i) && localized(i.title) && localized(i.text) && text(i.icon, 30) && (i.href === '' || safeHref(i.href)) && (i.image === undefined || i.image === '' || safeHref(i.image))))
}
