import { cache } from 'react'
import { createSectionSettingsHistory } from '@/modules/settings/server'
import { liveSnippets, normalizeSiteCode, type SiteCodeSettings } from '@/modules/site/domain/site-code'

export const SITE_CODE_KEY = 'site.code.v1'
const owner = () => createSectionSettingsHistory(SITE_CODE_KEY, 'settings-site-code', normalizeSiteCode, (settings: SiteCodeSettings) => ({
  enabled: settings.enabled, snippets: settings.snippets.length, live: settings.snippets.filter(s => s.enabled).length,
}), { action: 'site.code.settings', targetId: SITE_CODE_KEY })
export const getSiteCode = () => owner().read()
export const saveSiteCode = (...args: Parameters<ReturnType<typeof owner>['save']>) => owner().save(...args)
export const siteCodeState = () => owner().current()
export const restoreSiteCode = (...args: Parameters<ReturnType<typeof owner>['restore']>) => owner().restore(...args)

/** Snippets for this render; the environment switch wins over stored settings, for recovery from the server. */
export const siteCodeForRender = cache(async () => {
  if (process.env.SITE_CODE_DISABLED === '1') return []
  try { return liveSnippets(await getSiteCode()) } catch { return [] }
})
