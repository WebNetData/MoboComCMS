import { isCompatibilityRange } from '../../../platform/extensions/compatibility'
import { parseSolutionComposition, type SolutionComposition } from './solution-composition'
export type { SolutionNavigationItem, SolutionStarterPage } from './solution-composition'

/** Declarative configuration only; the host validates each target against its own catalog. */
export interface SolutionPackModule {
  id: string
  version?: string
  defaults?: Record<string, string | number | boolean>
}
export interface SolutionPack extends SolutionComposition {
  apiVersion: 1 | 2
  modules: SolutionPackModule[]
  recommendations?: string[]
}

const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const keyPattern = /^[a-z][a-z0-9._-]{0,79}$/
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const validId = (value: unknown): value is string => typeof value === 'string' && value.length >= 2 && value.length <= 50 && idPattern.test(value)
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key))

/** Reject unsupported fields and bound all work before catalog or database reads. */
export function parseSolutionPack(value: unknown): SolutionPack {
  const fail = (reason: string): never => { throw new Error(`solutionPack: ${reason}`) }
  if (!record(value)) return fail('invalid object or unknown field')
  if (value.apiVersion !== 1 && value.apiVersion !== 2) return fail('apiVersion must be 1 or 2')
  if (!onlyKeys(value, value.apiVersion === 1 ? ['apiVersion', 'modules', 'recommendations'] : ['apiVersion', 'modules', 'recommendations', 'theme', 'navigation', 'roles', 'starterContent'])) return fail('invalid object or unknown field')
  if (!Array.isArray(value.modules) || value.modules.length < (value.apiVersion === 1 ? 1 : 0) || value.modules.length > 30) return fail('modules must contain at most 30 entries and version 1 requires at least one')
  const seen = new Set<string>()
  const modules = value.modules.map((entry: unknown): SolutionPackModule => {
    if (!record(entry) || !onlyKeys(entry, ['id', 'version', 'defaults'])) return fail('invalid module or unknown field')
    if (!validId(entry.id) || seen.has(entry.id)) return fail('module id must be unique lowercase kebab-case')
    const id = entry.id
    seen.add(id)
    if (entry.version !== undefined && !isCompatibilityRange(entry.version)) return fail(`invalid version for ${id}`)
    let defaults: Record<string, string | number | boolean> | undefined
    if (entry.defaults !== undefined) {
      if (!record(entry.defaults) || Object.keys(entry.defaults).length > 30) return fail(`invalid defaults for ${id}`)
      defaults = Object.create(null) as Record<string, string | number | boolean>
      for (const [key, setting] of Object.entries(entry.defaults)) {
        if (!keyPattern.test(key) || forbiddenKeys.has(key)) return fail(`invalid default key for ${id}`)
        if (!(typeof setting === 'string' && setting.length <= 2000 || typeof setting === 'number' && Number.isFinite(setting) || typeof setting === 'boolean')) return fail(`invalid default value for ${id}.${key}`)
        defaults[key] = setting
      }
    }
    return { id, ...(typeof entry.version === 'string' ? { version: entry.version } : {}), ...(defaults ? { defaults } : {}) }
  })
  let recommendations: string[] | undefined
  if (value.recommendations !== undefined) {
    if (!Array.isArray(value.recommendations) || value.recommendations.length > 20 || !value.recommendations.every(validId) || new Set(value.recommendations).size !== value.recommendations.length) return fail('recommendations must contain at most 20 unique package ids')
    recommendations = [...value.recommendations]
  }
  return { apiVersion: value.apiVersion, modules, ...(recommendations ? { recommendations } : {}), ...(value.apiVersion === 2 ? parseSolutionComposition(value) : {}) }
}
