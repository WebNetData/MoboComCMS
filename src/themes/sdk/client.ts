'use client'

export { default as DefaultThemeHeader } from '@/components/site/default-theme/DefaultSiteHeader'
export { default as DefaultThemeFooter } from '@/components/site/default-theme/DefaultSiteFooter'
export { useI18n as useThemeI18n } from '@/i18n/LocaleProvider'
export { useSite as useThemeSite } from '@/components/site/SiteProvider'
export { Wordmark as ThemeWordmark } from '@/components/site/SiteLogo'
export { PluginOutlet as ThemePluginOutlet } from '@/plugins/registry'
export { default as ThemeLangControls } from '@/components/ThemeLangControls'
export { useSession as useThemeSession, signOut as themeSignOut } from 'next-auth/react'
export { default as ThemeSiteSearch } from '@/components/search/SiteSearch'
export { default as Link } from '@/platform/routing/Link'
export { default as ThemeLiveSearch } from '@/components/search/LiveSearchInput'
export { default as ThemeNavigationBranch } from '@/components/site/NavigationBranch'
export { default as ThemeNavigationIcon } from '@/components/site/NavigationIcon'
export { localizeMenu, flattenMenu, DEFAULT_FOOTER_ACCOUNT, type PublicMenuLink } from '@/modules/site/config/menus'

/** Trust seals (eNamad, Samandehi, …) configured in the admin; renders nothing when none are set. */
export { default as ThemeTrustSeals } from '@/components/site/TrustSeals'
