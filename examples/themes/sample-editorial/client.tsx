'use client'

import { DefaultThemeFooter, DefaultThemeHeader, useThemeSite } from '@/themes/sdk/client'
import type { ThemeClientModule, ThemeFooterProps } from '@/themes/types'

/**
 * Client part of a theme: the site header and footer.
 * Start from the default components (re-exported by the SDK) and wrap or replace only what you need —
 * search, language switch, login and plugin outlets then keep working without extra code.
 */
function EditorialFooter(props: ThemeFooterProps) {
  const site = useThemeSite()
  return <>
    <DefaultThemeFooter {...props} />
    <p className="ed-colophon">© {new Date().getFullYear()} {site.brand}</p>
  </>
}

export const theme: ThemeClientModule = { Header: DefaultThemeHeader, Footer: EditorialFooter }
