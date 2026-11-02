import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import Icon from '@/components/site/Icon'
import SiteFeedback from '@/components/site/feedback/SiteFeedback'
import { isModuleEnabled } from '@/extensions/server/modules'

export default async function NotFound() {
  const fa = (await getServerLocale()) === 'fa'
  const searchOn = await isModuleEnabled('search')
  return <><SiteHeader theme={await getServerTheme()}/><SiteFeedback
    label={fa ? '۴۰۴ · صفحه پیدا نشد' : '404 · Page not found'} icon="globe"
    title={fa ? 'این مسیر به جایی نمی‌رسد.' : 'This route leads off the map.'}
    description={fa ? 'ممکن است آدرس تغییر کرده باشد یا این صفحه دیگر منتشر نباشد. از خانه ادامه دهید یا محتوای موردنظر را جست‌وجو کنید.' : 'This page may have moved or is no longer published. Continue from home or search for what you need.'}
    search={searchOn ? <form action="/search" role="search" aria-label={fa ? 'پیدا کردن صفحه' : 'Find a page'}><label>{fa ? 'مسیر تازه‌ای پیدا کنید' : 'Find another way'}<input type="search" name="q" dir="auto" maxLength={100} placeholder={fa ? 'نام مطلب، محصول، فیلم یا هنرمند…' : 'Article, product, film or artist…'} /></label><button type="submit" className="btn btn-primary">{fa ? 'جست‌وجو' : 'Search'}</button></form> : undefined}
  ><Link className="btn btn-primary" href="/"><Icon name="home" size={18}/>{fa ? 'بازگشت به خانه' : 'Back to home'}</Link>{searchOn && <Link className="btn btn-ghost" href="/search"><Icon name="search" size={18}/>{fa ? 'کشف در موبوکام' : 'Explore MoboCom'}</Link>}</SiteFeedback><SiteFooter/></>
}
