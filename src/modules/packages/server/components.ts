import { cache } from 'react'
import { getSiteConfig } from '@/modules/site/config/store'
import { normalizeField, packageComponentId, type ComponentDef, type ComponentField } from '@/modules/site/domain/components'
import { fileFor } from '@/modules/packages/domain/format'
import { sanitizePackageCss, sanitizePackageHtml } from '@/modules/packages/domain/sanitize'
import { fileText, loadPackage, packageIds, packageRevision, type StoredPackage } from './store'
import { packageAssetBase } from './runtime'

const memo = new Map<string, ComponentDef[]>()

async function active(themeId: string): Promise<StoredPackage[]> {
  const result: StoredPackage[] = []
  for (const id of await packageIds()) {
    const pkg = await loadPackage(id)
    if (!pkg || pkg.manifest.runtime !== 'declarative' || !pkg.manifest.components?.length) continue
    if (pkg.manifest.kind === 'plugin' ? pkg.enabled : pkg.manifest.id === themeId) result.push(pkg)
  }
  return result
}

/** Components offered by enabled declarative packages: their own template and style, typed fields, never a script. */
export const getPackageComponents = cache(async (locale: string): Promise<ComponentDef[]> => {
  const [rev, site] = await Promise.all([packageRevision(), getSiteConfig()])
  const key = `${rev}:${locale}:${site.themeId}`
  const cached = memo.get(key)
  if (cached) return cached
  const out: ComponentDef[] = []
  for (const pkg of await active(site.themeId)) {
    const id = pkg.manifest.id, base = packageAssetBase(id)
    for (const c of pkg.manifest.components || []) {
      const keys = new Set<string>()
      out.push({
        id: packageComponentId(id, c.name), package: id,
        name: (locale === 'fa' ? c.title.fa : c.title.en) || c.name, category: c.category || pkg.manifest.name, description: c.description || '',
        fields: (c.fields || []).map(normalizeField).filter((f): f is ComponentField => !!f && !keys.has(f.key) && !!keys.add(f.key)).slice(0, 20),
        html: fileText(pkg, fileFor(c.template, locale)) || '',
        css: c.style ? sanitizePackageCss(fileText(pkg, c.style) || '', base) : '',
        js: '',
      })
    }
  }
  if (memo.size > 50) memo.clear()
  memo.set(key, out)
  return out
})

/** A package component's HTML after its values are filled in: escaped values, then the package sanitizer. */
export const sanitizePackageComponent = (pkg: string, html: string) => sanitizePackageHtml(html, packageAssetBase(pkg))
