import { cache } from 'react'
import { getSiteConfig } from '@/modules/site/config/store'
import { fileFor, type LocalText, type PackageSlot } from '@/modules/packages/domain/format'
import { renderPlaceholders, sanitizePackageCss, sanitizePackageHtml } from '@/modules/packages/domain/sanitize'
import { fileText, loadPackage, packageIds, packageRevision, type StoredPackage } from './store'

export interface PackageSlotContent { id: string; html: string }
export interface PublicPackageRuntime {
  slots: Partial<Record<PackageSlot, PackageSlotContent[]>>
  css: string
  nav: { href: string; label: LocalText }[]
}

export const packageAssetBase = (id: string) => `/api/public/packages/${id}/files`
export const packagePagePath = (id: string, slug: string) => `/ext/${id}/${slug}`

// Rendering sanitizes every file, so the result is memoized per package
// revision; any install/edit/toggle bumps the revision and invalidates it.
const memo = new Map<string, PublicPackageRuntime>()

async function activePackages(activeThemeId: string): Promise<StoredPackage[]> {
  const result: StoredPackage[] = []
  for (const id of await packageIds()) {
    const pkg = await loadPackage(id)
    if (!pkg || pkg.manifest.runtime !== 'declarative') continue
    if (pkg.manifest.kind === 'plugin' ? pkg.enabled : pkg.manifest.id === activeThemeId) result.push(pkg)
  }
  return result
}

function renderFile(pkg: StoredPackage, path: string, brand: string, locale: string) {
  const source = fileText(pkg, path)
  if (source === null) return ''
  return sanitizePackageHtml(renderPlaceholders(source, { brand, locale, settings: pkg.settings }), packageAssetBase(pkg.manifest.id))
}

export const getPackageRuntime = cache(async (locale: string): Promise<PublicPackageRuntime> => {
  const [rev, site] = await Promise.all([packageRevision(), getSiteConfig()])
  const key = `${rev}:${locale}:${site.themeId}:${site.brand}`
  const cached = memo.get(key)
  if (cached) return cached
  const runtime: PublicPackageRuntime = { slots: {}, css: '', nav: [] }
  const css: string[] = []
  for (const pkg of await activePackages(site.themeId)) {
    const id = pkg.manifest.id
    for (const [slot, file] of Object.entries(pkg.manifest.slots || {}) as [PackageSlot, NonNullable<StoredPackage['manifest']['slots']>[PackageSlot]][]) {
      const html = file ? renderFile(pkg, fileFor(file, locale), site.brand, locale) : ''
      if (html.trim()) (runtime.slots[slot] ||= []).push({ id, html })
    }
    for (const path of pkg.manifest.styles || []) {
      const source = fileText(pkg, path)
      if (source) css.push(`/* package: ${id} */\n${sanitizePackageCss(source, packageAssetBase(id))}`)
    }
    for (const page of pkg.manifest.pages || []) if (page.nav) runtime.nav.push({ href: packagePagePath(id, page.slug), label: page.title })
  }
  runtime.css = css.join('\n')
  if (memo.size > 50) memo.clear()
  memo.set(key, runtime)
  return runtime
})

/** A public page contributed by an enabled plugin package (or the active theme package). */
export async function getPackagePage(id: string, slug: string, locale: string) {
  const site = await getSiteConfig()
  const pkg = await loadPackage(id)
  if (!pkg || pkg.manifest.runtime !== 'declarative') return null
  if (pkg.manifest.kind === 'plugin' ? !pkg.enabled : site.themeId !== id) return null
  const page = pkg.manifest.pages?.find(item => item.slug === slug)
  if (!page) return null
  return { title: page.title, html: renderFile(pkg, fileFor(page.file, locale), site.brand, locale), packageName: pkg.manifest.name }
}
