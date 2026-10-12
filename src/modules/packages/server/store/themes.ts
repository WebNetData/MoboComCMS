import { getSiteConfigFrom, SITE_KEY } from '@/modules/site/config/store'
import { validateSite } from '@/modules/site/config/validation'
import type { ThemeManifest } from '@/modules/site/config/types'
import { PackageError, type PackageManifest } from '@/modules/packages/domain/format'
import type { PackageReader } from './persistence'

function themeEntry(manifest: PackageManifest): ThemeManifest {
  const design = manifest.design!
  return {
    id: manifest.id, name: manifest.name.slice(0, 80), description: (manifest.description || '').slice(0, 300), version: manifest.version.slice(0, 30),
    extends: design.extends || 'clean', radius: design.radius, colors: design.colors, ...(design.lightColors ? { lightColors: design.lightColors } : {}),
  }
}
// Read the current site document inside the same transaction as package/index writes.
export async function syncSiteTheme(reader: PackageReader, manifest: PackageManifest | null, options: { removeId?: string; activate?: boolean } = {}) {
  const site = structuredClone(await getSiteConfigFrom(reader, true))
  const id = manifest?.id || options.removeId!
  const others = site.themes.filter(theme => theme.id !== id)
  site.themes = manifest ? [...others, themeEntry(manifest)] : others
  if (!manifest && site.themeId === id) site.themeId = 'clean'
  if (manifest && options.activate) site.themeId = id
  if (site.themes.length > 20) throw new PackageError('Site Studio already holds 20 custom themes; remove one first')
  if (!validateSite(site)) throw new PackageError('the theme design could not be added to Site Studio')
  await reader.setting.upsert({ where: { key: SITE_KEY }, create: { key: SITE_KEY, value: JSON.stringify(site) }, update: { value: JSON.stringify(site) } })
}
