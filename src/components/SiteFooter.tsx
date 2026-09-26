'use client'
import DefaultSiteFooter from '@/components/site/default-theme/DefaultSiteFooter'
import { useSite } from '@/components/site/SiteProvider'
import { codeThemeClients } from '@/themes/generated/client-registry'
import type { ThemeFooterProps } from '@/themes/types'
import { resolveCodeThemeId } from '@/themes/runtime'

export default function SiteFooter(props: ThemeFooterProps) {
  const site = useSite()
  const Footer = codeThemeClients[resolveCodeThemeId(site)]?.Footer || DefaultSiteFooter
  return <Footer {...props} />
}
