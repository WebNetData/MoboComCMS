import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'
import { confirmSubscription } from '@/modules/mail/server/newsletter'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تأیید عضویت خبرنامه', robots: { index: false } }

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const [theme, email] = await Promise.all([getServerTheme(), confirmSubscription(t)])
  return <>
    <SiteHeader theme={theme} />
    <main className="container nl-page" dir="rtl"><section className="nl-card">
      {email ? <><h1>عضویت شما تأیید شد</h1><p>از این پس خبرنامه به <bdi dir="ltr">{email}</bdi> فرستاده می‌شود.</p></> : <><h1>پیوند معتبر نیست</h1><p>ممکن است پیوند قدیمی باشد؛ دوباره عضو شوید.</p></>}
      <Link href="/" className="btn btn-primary">صفحهٔ اصلی</Link>
    </section></main>
    <SiteFooter />
  </>
}
