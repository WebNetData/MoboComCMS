'use client'
import DefaultSiteHeader from '@/components/site/default-theme/DefaultSiteHeader'
import { useSite } from '@/components/site/SiteProvider'
import { codeThemeClients } from '@/themes/generated/client-registry'
import type { ThemeHeaderProps } from '@/themes/types'
import { resolveCodeThemeId } from '@/themes/runtime'

export default function SiteHeader(props: ThemeHeaderProps) {
  const site = useSite()
  const Header = codeThemeClients[resolveCodeThemeId(site)]?.Header || DefaultSiteHeader
  return <Header {...props} />
}
