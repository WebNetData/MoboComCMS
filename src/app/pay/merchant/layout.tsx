import type { Metadata } from 'next'
import MerchantShell from '@/components/pay/merchant-shell'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { requireModule } from '@/extensions/server/modules'
export const metadata: Metadata = { title: 'پنل پذیرندگان موبوکام‌پی', robots: { index: false, follow: false } }
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireModule('mobocom-pay')
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  return <MerchantShell locale={locale} theme={theme}>{children}</MerchantShell>
}
