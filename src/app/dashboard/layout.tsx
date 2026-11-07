import type { ReactNode } from 'react'
import AccountShell from './AccountShell'
import DesignSurface from '@/components/content/builder/DesignSurface'
import { getServerLocale } from '@/i18n/server'

/** Design changes presentation around the real account routes; auth/navigation/actions stay with their owner. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const locale = await getServerLocale()
  return <AccountShell><DesignSurface design={{surface:'account',entryId:0}} locale={locale}>{children}</DesignSurface></AccountShell>
}
