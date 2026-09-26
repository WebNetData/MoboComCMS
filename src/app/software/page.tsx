import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { getSoftwareHome } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { softwareNav } from '@/components/media/nav'
import { Chips, EmptyState, Shelf, SoftwareCard } from '@/components/media/MediaCards'
import VipStrip from '@/components/media/VipStrip'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return { title: fa ? 'دانلود نرم‌افزار' : 'Software downloads', description: fa ? 'دانلود نرم‌افزار ویندوز، مک، لینوکس، اندروید و iOS با آخرین نسخه و لینک مستقیم' : 'Download the latest Windows, macOS, Linux, Android and iOS software.', alternates: { canonical: '/software' } }
}

export default async function SoftwareHomePage() {
  await requireModule('software')
  const [data, locale, viewer] = await Promise.all([getSoftwareHome(), getServerLocale(), getViewer()])
  const fa = locale === 'fa'
  return (
    <MediaShell section="software" active="home" nav={softwareNav(fa)} search={{ action: '/software/browse', placeholder: fa ? 'جست‌وجوی نرم‌افزار…' : 'Search software…' }}>
      <section className="sw-hero">
        <div className="container sw-hero-inner">
          <div>
            <span className="md-eyebrow">{fa ? 'دانلود نرم‌افزار' : 'Software'}</span>
            <h1>{fa ? 'نرم‌افزار مورد نیازت را پیدا کن' : 'Find the software you need'}</h1>
            <p>{fa ? 'آخرین نسخهٔ برنامه‌های ویندوز، مک، لینوکس، اندروید و iOS با لینک مستقیم و بررسی‌شده.' : 'Latest versions for Windows, macOS, Linux, Android and iOS with verified direct links.'}</p>
            <form action="/software/browse" className="sw-hero-search" role="search"><input name="q" type="search" placeholder={fa ? 'نام نرم‌افزار، سازنده یا دسته…' : 'App name, developer or category…'} aria-label={fa ? 'جست‌وجو' : 'Search'} /><button type="submit">{fa ? 'جست‌وجو' : 'Search'}</button></form>
          </div>
          {data.platforms.length > 0 && <div className="sw-platforms">{data.platforms.map((p) => <Link key={p} href={`/software/browse?platform=${encodeURIComponent(p)}`}>{p}</Link>)}</div>}
        </div>
      </section>
      <div className="container md-body">
        {data.categories.length > 0 && <Chips items={data.categories} hrefFor={(c) => `/software/browse?category=${encodeURIComponent(c)}`} all={{ label: fa ? 'همه دسته‌ها' : 'All categories', href: '/software/browse' }} />}
        {!data.latest.length && <EmptyState fa={fa} title={fa ? 'بخش نرم‌افزار آماده است' : 'Software section is ready'} text={fa ? 'به‌زودی نرم‌افزارها اینجا منتشر می‌شوند.' : 'Software will be published here soon.'} />}
        {data.featured.length > 0 && <section className="md-shelf is-software"><header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'منتخب' : 'Featured'}</span><h2>{fa ? 'پیشنهاد موبوکام' : 'Editor’s picks'}</h2></div></header><div className="sw-grid">{data.featured.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</div></section>}
        {data.latest.length > 0 && <section className="md-shelf is-software"><header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'تازه‌ها' : 'Latest'}</span><h2>{fa ? 'به‌روزشده‌های اخیر' : 'Recently updated'}</h2></div><Link href="/software/browse" className="md-more">{fa ? 'همه ←' : 'All →'}</Link></header><div className="sw-grid">{data.latest.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</div></section>}
        {data.popular.length > 0 && <Shelf tone="software" eyebrow={fa ? 'محبوب' : 'Popular'} title={fa ? 'پردانلودترین‌ها' : 'Most downloaded'} href="/software/browse?sort=popular" more={fa ? 'رده‌بندی ←' : 'Ranking →'}>{data.popular.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</Shelf>}
        {!viewer.member && <VipStrip fa={fa} kind="software" />}
      </div>
    </MediaShell>
  )
}
