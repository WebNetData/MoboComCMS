'use client'

import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  return <main className="site-feedback"><span className="site-feedback-icon"><Icon name="globe" size={40}/></span><h1>{fa ? 'این صفحه فعلاً در دسترس نیست.' : 'A brief interruption.'}</h1><p role="alert">{fa ? 'بارگذاری کامل نشد. دوباره تلاش کنید یا به صفحهٔ اصلی بازگردید.' : 'We couldn’t load this page. Try again, or return to your home page.'}</p><div className="flex gap-3 flex-wrap justify-center"><button className="btn btn-primary" onClick={reset}>{fa ? 'تلاش دوباره' : 'Try again'}</button><Link className="btn btn-ghost" href="/">{fa ? 'صفحهٔ اصلی' : 'Back to home'}</Link></div></main>
}
