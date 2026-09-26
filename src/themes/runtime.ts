import type { SiteConfig } from '@/modules/site/config/types'

export function resolveCodeThemeId(site: SiteConfig) {
  const custom = site.themes.find(theme => theme.id === site.themeId)
  return custom?.extends || site.themeId
}
