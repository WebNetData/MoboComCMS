import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import Icon from '@/components/site/Icon'

export default async function NotFound() {
  const fa = (await getServerLocale()) === 'fa'
  return <><SiteHeader theme={await getServerTheme()}/><main className="site-feedback"><span className="site-feedback-icon"><Icon name="globe" size={40}/></span><span className="content-eyebrow">404</span><h1>{fa ? 'این مسیر به جایی نمی‌رسد.' : 'This route leads off the map.'}</h1><p>{fa ? 'ممکن است آدرس تغییر کرده باشد. از صفحهٔ اصلی مسیر تازه‌ای انتخاب کنید.' : 'This page may have moved. Let’s find your way back.'}</p><Link className="btn btn-primary" href="/">{fa ? 'بازگشت به خانه' : 'Back to home'}</Link></main><SiteFooter/></>
}
