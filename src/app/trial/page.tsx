import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import TrialClient from './TrialClient'
import { requireModule } from '@/extensions/server/modules'

export default async function TrialPage() {
  await requireModule('vpn')
  const [theme, locale] = await Promise.all([getServerTheme(), getServerLocale()])
  return <>
    <ThemeHeader context={{ route: 'other' }} theme={theme} locale={locale} />
    <main className="container page-main"><TrialClient /></main>
    <ThemeFooter context={{ route: 'other' }} locale={locale} />
  </>
}
