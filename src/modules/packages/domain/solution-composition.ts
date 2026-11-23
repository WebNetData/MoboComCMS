/** Portable, declarative inputs; installed owners validate the actual targets. */
export interface SolutionNavigationItem {
  label: string
  href: string
  icon?: string
  children?: SolutionNavigationItem[]
}

export interface SolutionStarterPage {
  key: string
  slug: string
  title: string
  document: Record<string, unknown>
}

export interface SolutionComposition {
  theme?: { id: string }
  navigation?: SolutionNavigationItem[]
  roles?: string[]
  starterContent?: SolutionStarterPage[]
}

const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const validId = (value: unknown, max = 50): value is string => typeof value === 'string' && value.length >= 2 && value.length <= max && idPattern.test(value)
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => !forbidden.has(key) && allowed.includes(key))
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !!value.trim()

/** Reject prototype-bearing/non-JSON values anywhere in the portable document. */
function safeJson(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (depth > 40) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (!value || typeof value !== 'object' || seen.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false
  seen.add(value)
  const valid = Object.keys(value).every(key => !forbidden.has(key) && safeJson((value as Record<string, unknown>)[key], depth + 1, seen))
  seen.delete(value)
  return valid
}

/** Strictly bound v2 input before any database access or owner-specific validation. */
export function parseSolutionComposition(value: Record<string, unknown>): SolutionComposition {
  const fail = (message: string): never => { throw new Error(`solutionPack: ${message}`) }
  const result: SolutionComposition = {}
  if (value.theme !== undefined) {
    if (!record(value.theme) || !keys(value.theme, ['id']) || !validId(value.theme.id)) return fail('invalid theme')
    result.theme = { id: value.theme.id }
  }
  if (value.navigation !== undefined) {
    let count = 0
    const parseItems = (input: unknown, depth: number): SolutionNavigationItem[] => {
      if (!Array.isArray(input) || depth > 4) return fail('invalid navigation depth or list')
      return input.map((item: unknown) => {
        if (++count > 20 || !record(item) || !keys(item, ['label', 'href', 'icon', 'children']) || !text(item.label, 160) || !text(item.href, 500) || (item.icon !== undefined && (typeof item.icon !== 'string' || item.icon.length > 40))) return fail('invalid navigation item')
        const children = item.children === undefined ? undefined : parseItems(item.children, depth + 1)
        return { label: item.label, href: item.href, ...(item.icon !== undefined ? { icon: item.icon as string } : {}), ...(children !== undefined ? { children } : {}) }
      })
    }
    result.navigation = parseItems(value.navigation, 1)
  }
  if (value.roles !== undefined) {
    if (!Array.isArray(value.roles) || value.roles.length > 20 || !value.roles.every(id => validId(id, 40) && id !== 'admin' && id !== 'site-deputy') || new Set(value.roles).size !== value.roles.length) return fail('invalid or duplicate role template')
    result.roles = [...value.roles]
  }
  if (value.starterContent !== undefined) {
    if (!Array.isArray(value.starterContent) || value.starterContent.length > 10) return fail('invalid starterContent list')
    const pageKeys = new Set<string>(), slugs = new Set<string>()
    result.starterContent = value.starterContent.map((item: unknown) => {
      if (!record(item) || !keys(item, ['key', 'slug', 'title', 'document']) || !validId(item.key) || !validId(item.slug, 100) || !text(item.title, 160) || !record(item.document)) return fail('invalid starter page')
      if (pageKeys.has(item.key) || slugs.has(item.slug)) return fail('duplicate starter page key or slug')
      if (!keys(item.document, ['version', 'blocks']) || item.document.version !== 1 || !Array.isArray(item.document.blocks) || !item.document.blocks.length || !safeJson(item.document)) return fail('invalid starter document')
      const serialized = JSON.stringify(item.document)
      if (new TextEncoder().encode(serialized).length > 200_000) return fail('starter document is too large')
      pageKeys.add(item.key); slugs.add(item.slug)
      return { key: item.key, slug: item.slug, title: item.title, document: item.document }
    })
  }
  if (!result.theme && !result.navigation?.length && !result.roles?.length && !result.starterContent?.length) return fail('version 2 needs at least one composition')
  return result
}
