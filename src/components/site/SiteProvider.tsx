'use client'
import { createContext, useContext } from 'react'
import { defaultSite } from '@/modules/site/config/defaults'
import type { SiteConfig } from '@/modules/site/config/types'
const SiteContext = createContext<SiteConfig>(defaultSite)
export const useSite = () => useContext(SiteContext)
export default function SiteProvider({ config, children }: { config: SiteConfig; children: React.ReactNode }) {
  return <SiteContext.Provider value={config}>{children}</SiteContext.Provider>
}
