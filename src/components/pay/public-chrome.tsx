import type { ReactNode } from 'react'
import { ThemeHeader,ThemeFooter } from '@/components/content/builder/ThemeChrome'
import { getServerLocale,getServerTheme } from '@/i18n/server'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
export default async function PayPublicChrome({children}:{children:ReactNode}) {
  const [locale,theme,navPages]=await Promise.all([getServerLocale(),getServerTheme(),getPublicNavigationPages()])
  return <><ThemeHeader context={{route:'other'}} locale={locale} theme={theme} navPages={navPages}/>{children}<ThemeFooter context={{route:'other'}} locale={locale} navPages={navPages}/></>
}
