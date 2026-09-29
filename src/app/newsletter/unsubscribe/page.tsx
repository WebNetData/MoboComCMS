import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'لغو عضویت خبرنامه', robots: { index: false } }

/** GET shows a confirm button (mail scanners that open links never unsubscribe anyone); the form POSTs. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams
  const theme = await getServerTheme()
  return <>
    <SiteHeader theme={theme} />
    <main className="container nl-page" dir="rtl"><section className="nl-card">
      {done === '1' ? <><h1>عضویت شما لغو شد</h1><p>دیگر ایمیل خبرنامه برایتان فرستاده نمی‌شود. اعلان‌های سفارش و حساب کاربری همچنان می‌رسد.</p><Link href="/" className="btn btn-primary">صفحهٔ اصلی</Link></>
        : done === '0' ? <><h1>پیوند معتبر نیست</h1><p>ممکن است قبلاً لغو شده باشد.</p></>
          : <><h1>لغو عضویت خبرنامه</h1><p>با تأیید، دیگر ایمیل خبرنامه دریافت نمی‌کنید.</p>
            <form method="post" action={`/api/newsletter/unsubscribe?t=${encodeURIComponent(t || '')}`}><input type="hidden" name="t" value={t || ''} /><button className="btn btn-primary">لغو عضویت</button></form></>}
    </section></main>
    <SiteFooter />
  </>
}
