import type { ReactNode } from 'react'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import { requireModule } from '@/extensions/server/modules'
import { getServerTheme } from '@/i18n/server'

export default async function PromptLayout({ children }: { children: ReactNode }) {
  await requireModule('prompt-master')
  return <><SiteHeader theme={await getServerTheme()} /><SectionBarSlot section="prompts" />{children}<SiteFooter /></>
}
