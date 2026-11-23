// The supported compatibility syntax is deliberately smaller than npm semver:
// an exact stable version or a caret followed by a complete stable version.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function tuple(value: string): [number, number, number] | null {
  const match = VERSION.exec(value)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every(Number.isSafeInteger) ? parts as [number, number, number] : null
}

export function isCompatibilityRange(value: unknown): value is string {
  return typeof value === 'string' && tuple(value.startsWith('^') ? value.slice(1) : value) !== null
}

/** Prerelease versions do not satisfy these stable-only ranges. */
export function satisfiesCompatibilityRange(range: string, version: string): boolean {
  if (!isCompatibilityRange(range)) return false
  const caret = range.startsWith('^')
  const need = tuple(caret ? range.slice(1) : range)!
  const have = tuple(version)
  if (!have) return false
  const order = have[0] - need[0] || have[1] - need[1] || have[2] - need[2]
  if (!caret) return order === 0
  if (order < 0 || have[0] !== need[0]) return false
  if (need[0] !== 0) return true
  if (have[1] !== need[1]) return false
  return need[1] !== 0 || have[2] === need[2]
}

export interface CompatibilityContract {
  id: string
  requiresCore?: string
  requires?: readonly string[]
  dependencyVersions?: Readonly<Record<string, string>>
  requiresCapabilities?: Readonly<Record<string, readonly string[]>>
}
export interface CompatibilityDependency { id: string; kind: string; version: string; capabilities?: readonly string[] }

/** A contract is consumed by source builds, uploaded packages and runtime guards. */
export function compatibilityIssue(manifest: CompatibilityContract, catalog: readonly CompatibilityDependency[], core: string): string | null {
  if (manifest.requiresCore && !satisfiesCompatibilityRange(manifest.requiresCore, core)) return `${manifest.id}: requires core ${manifest.requiresCore}; current ${core}`
  for (const id of manifest.requires || []) {
    const dependency = catalog.find(item => item.id === id && item.kind === 'module')
    if (!dependency || id === manifest.id) return `${manifest.id}: missing or invalid required module ${id}`
    const range = manifest.dependencyVersions?.[id]
    if (range && !satisfiesCompatibilityRange(range, dependency.version)) return `${manifest.id}: requires ${id} ${range}; current ${dependency.version}`
    const missing = manifest.requiresCapabilities?.[id]?.filter(capability => !dependency.capabilities?.includes(capability))
    if (missing?.length) return `${manifest.id}: ${id} lacks capabilities ${missing.join(', ')}`
  }
  for (const id of [...Object.keys(manifest.dependencyVersions || {}), ...Object.keys(manifest.requiresCapabilities || {})]) {
    if (!manifest.requires?.includes(id)) return `${manifest.id}: dependency contract ${id} must be listed in requires`
  }
  return null
}
