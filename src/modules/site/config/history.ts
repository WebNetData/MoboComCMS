import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { configurationSnapshot, configurationValue, restoreKnownConfiguration } from '@/modules/settings/server/configuration-history'
import { RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'
import type { SiteConfig, SiteLink, LocalText } from './types'
import { getSiteConfigFrom, SITE_KEY } from './store'
import { validateSite } from './validation'
import { bundledThemes } from '@/themes/registry'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { normalizeCompanyContact } from '@/modules/site/domain/company-contact'
import { isDeepStrictEqual } from 'node:util'

const pick = <T extends object>(value: T, keys: readonly (keyof T)[]) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
const local = (value: LocalText) => Object.fromEntries(Object.entries(value).filter(([key, text]) => /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(key) && typeof text === 'string'))
const link = (value: SiteLink): object => ({ ...pick(value, ['id', 'href', 'icon', 'enabled', 'menuDisplay', 'menuColumns']), label: local(value.label), ...(value.description ? { description: local(value.description) } : {}), ...(value.children ? { children: value.children.map(link) } : {}) })
/** Explicit presentation fields. Runtime/extension activation and unknown metadata never enter history. */
export function sitePresentation(value: SiteConfig) {
  return {
    ...(value.contact ? { contact: normalizeCompanyContact(value.contact) } : {}),
    ...pick(value, ['version', 'brand', 'logo', 'wordmark', 'wordmarkDark', 'wordmarkHeight', 'customCss', 'automaticPageLinks', 'themeId']),
    ...(value.fonts ? { fonts: pick(value.fonts, ['body', 'heading']) } : {}),
    tagline: local(value.tagline), copyright: local(value.copyright),
    ...(value.copy ? { copy: Object.fromEntries(Object.entries(value.copy).map(([key, text]) => [key, local(text)])) } : {}),
    announcement: { enabled: value.announcement.enabled, text: local(value.announcement.text), link: link(value.announcement.link) },
    navigation: value.navigation.map(link), footer: value.footer.map(link),
    ...(value.footerExplore ? { footerExplore: value.footerExplore.map(link) } : {}), ...(value.footerAccount ? { footerAccount: value.footerAccount.map(link) } : {}),
    themes: value.themes.map(theme => ({ ...pick(theme, ['id', 'name', 'description', 'version', 'extends', 'radius']), colors: pick(theme.colors, ['background', 'surface', 'accent', 'text', 'muted', 'border']), ...(theme.lightColors ? { lightColors: pick(theme.lightColors, ['background', 'surface', 'accent', 'text', 'muted', 'border']) } : {}) })),
    sections: value.sections.map(section => ({ ...pick(section, ['id', 'kind', 'enabled', 'formSlug', 'image', 'miniapp']), eyebrow: local(section.eyebrow), title: local(section.title), description: local(section.description), action: link(section.action), items: section.items.map(item => ({ ...pick(item, ['icon', 'href', 'image']), title: local(item.title), text: local(item.text) })) })),
  }
}
export const siteSettingsSnapshot = (value: SiteConfig) => configurationSnapshot(sitePresentation(value))
export const siteSettingsState = async () => siteSettingsSnapshot(await getSiteConfigFrom(db, true))

export function installedSiteConfiguration(value: unknown): value is SiteConfig {
  return validateSite(value) && [...bundledThemes, ...value.themes].some(theme => theme.id === value.themeId) && !value.themes.some(theme => bundledThemes.some(bundled => bundled.id === theme.id)) && !Object.keys(value.plugins).some(id => !extensionCatalog.some(plugin => plugin.id === id))
}

export async function restoreSiteSettings(id: number, snapshot: Snapshot, commit: RestoreCommit) {
  if (id !== 1) throw new RevisionError('not found', 404)
  const raw = configurationValue(snapshot) as Record<string, unknown>
  let before: Snapshot = {}, after: Snapshot = {}
  await updateJsonSetting(SITE_KEY, async (stored, tx) => {
    const current = await getSiteConfigFrom(tx, true), candidate = { ...raw, plugins: current.plugins }
    if (!installedSiteConfiguration(candidate) || !isDeepStrictEqual(sitePresentation(candidate), raw)) throw new RevisionError('نسخهٔ استودیو یا قالب نصب‌شده معتبر نیست؛ چیزی تغییر نکرد.', 422)
    before = siteSettingsSnapshot(current)
    // Only presentation fields return. Unknown root metadata and extension state stay current.
    const restored = restoreKnownConfiguration(stored, sitePresentation(current), raw) as Record<string, unknown>
    Object.keys(stored).forEach(key => delete stored[key])
    Object.assign(stored, restored)
    after = siteSettingsSnapshot(candidate)
    await commit(tx, before, after)
  })
  return { before, after }
}
