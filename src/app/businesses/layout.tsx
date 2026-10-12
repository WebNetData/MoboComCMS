import type { ReactNode } from 'react'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'
import { requireModule } from '@/extensions/server/modules'

export default async function BusinessLayout({ children }: { children: ReactNode }) {
  await requireModule('businesses')
  return <><SiteHeader theme={await getServerTheme()} />{children}<SiteFooter /></>
}
