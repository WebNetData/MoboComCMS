import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import MediaShell from '@/components/media/MediaShell'
import { CopyrightReportForm, CopyrightStatusLookup } from '@/components/engage/CopyrightForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'گزارش نقض حق نشر',
  description: 'اگر محتوایی در موبوکام حق نشر شما را نقض می‌کند، از این فرم گزارش دهید تا بررسی و حذف شود.',
  alternates: { canonical: '/copyright' },
}

export default async function CopyrightPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  await requireModule('copyright')
  const { url } = await searchParams
  const prefill = typeof url === 'string' && /^https?:\/\//.test(url) ? url.slice(0, 500) : ''
  return (
    <MediaShell section="copyright">
      <div className="container cr-page">
        <header className="sr-head">
          <h1>گزارش نقض حق نشر</h1>
          <p className="muted">موبوکام به حقوق پدیدآورندگان احترام می‌گذارد. اگر صاحب اثر یا نمایندهٔ قانونی او هستید و محتوایی در این سایت را ناقض حق خود می‌دانید، فرم زیر را کامل کنید.</p>
        </header>
        <div className="cr-layout">
          <CopyrightReportForm prefillUrl={prefill} />
          <aside className="cr-aside">
            <section>
              <h2>روند رسیدگی</h2>
              <ol>
                <li>پس از ثبت، کد پیگیری دریافت می‌کنید.</li>
                <li>تیم ما گزارش را معمولاً ظرف ۷۲ ساعت کاری بررسی می‌کند.</li>
                <li>در صورت تأیید، صفحه یا لینک‌های مورد نظر از دسترس خارج می‌شوند.</li>
                <li>نتیجه و توضیح آن با کد پیگیری در همین صفحه قابل مشاهده است.</li>
              </ol>
            </section>
            <section>
              <h2>پیگیری گزارش</h2>
              <CopyrightStatusLookup />
            </section>
          </aside>
        </div>
      </div>
    </MediaShell>
  )
}
