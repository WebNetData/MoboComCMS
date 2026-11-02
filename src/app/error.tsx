'use client'

import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import SiteFeedback from '@/components/site/feedback/SiteFeedback'
import { useTransition } from 'react'
import { useRouter } from '@/platform/routing/navigation'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const retry = () => startTransition(() => { router.refresh(); reset() })
  return <SiteFeedback label={fa ? 'وقفه در بارگذاری' : 'Loading interrupted'} icon="clock" alert
    title={fa ? 'این صفحه فعلاً در دسترس نیست.' : 'A brief interruption.'}
    description={fa ? 'بارگذاری کامل نشد. دوباره تلاش کنید یا به صفحهٔ اصلی بازگردید.' : 'We couldn’t load this page. Try again, or return to your home page.'}
  ><button type="button" className="btn btn-primary" disabled={pending} aria-busy={pending} onClick={retry}>{pending ? (fa ? 'در حال تلاش…' : 'Trying again…') : (fa ? 'تلاش دوباره' : 'Try again')}</button><Link className="btn btn-ghost" href="/">{fa ? 'صفحهٔ اصلی' : 'Back to home'}</Link></SiteFeedback>
}
