import { PackageError } from '@/modules/packages/domain/format'
import type { StoredPackage } from '../store'

export function applyEnabled(pkg: StoredPackage, enabled: boolean) {
  if (enabled && pkg.manifest.solutionPack) throw new PackageError('Solution Pack با پیش‌نمایش و اعمال پیکربندی اجرا می‌شود، نه کلید فعال‌سازی.')
  if (pkg.manifest.runtime === 'code') throw new PackageError('code packages are switched on in the extension list once their build is deployed')
  pkg.enabled = enabled
}

export function applySettings(pkg: StoredPackage, input: Record<string, unknown>) {
  const definitions = new Map((pkg.manifest.settings || []).map(setting => [setting.key, setting]))
  for (const [key, value] of Object.entries(input)) {
    const definition = definitions.get(key)
    if (!definition) throw new PackageError(`unknown setting "${key}"`)
    if (typeof value !== 'string' || value.length > (definition.type === 'textarea' ? 8000 : 1000)) throw new PackageError(`setting "${key}" is invalid`)
    pkg.settings[key] = value
  }
}
