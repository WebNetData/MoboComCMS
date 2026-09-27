import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { getSoftwareHome, softwareFeed, softwareSidebar } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { softwareNav } from '@/components/media/nav'
import { EmptyState, SoftwareCard } from '@/components/media/MediaCards'
import VipStrip from '@/components/media/VipStrip'
import { Icon, Pager, SoftwareLayout, SoftwarePost, SoftwareSidebar, platformIcon } from '@/components/software/SoftwarePortal'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'
import { primaryTerms, termTree } from '@/modules/taxonomy/server/taxonomy'

export const dynamic = 'force-dynamic'
type Props = { searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [fa, { page }] = [(await getServerLocale()) === 'fa', await searchParams]
  const n = Number(page) || 1
  return {
    title: fa ? `دانلود نرم‌افزار${n > 1 ? ` — صفحه ${n}` : ''}` : 'Software downloads',
    description: fa ? 'دانلود آخرین نسخهٔ نرم‌افزارهای ویندوز، مک، لینوکس، اندروید و iOS با لینک مستقیم، راهنمای نصب و تغییرات هر نسخه' : 'Download the latest Windows, macOS, Linux, Android and iOS software.',
    alternates: { canonical: n > 1 ? `/software?page=${n}` : '/software' },
  }
}

export default async function SoftwareHomePage({ searchParams }: Props) {
  await requireModule('software')
  const [{ page }, locale, viewer] = await Promise.all([searchParams, getServerLocale(), getViewer()])
  const landing = !page ? await sectionLanding('software') : null
  if (landing) return landing
  const fa = locale === 'fa'
  const current = Math.max(1, Number(page) || 1)
  const [home, feed, sidebar, terms] = await Promise.all([getSoftwareHome(), softwareFeed({ page: current }), softwareSidebar(), termTree('software')])
  const primary = await primaryTerms('software', feed.items.map((item) => item.id))
  const platforms = terms.length ? terms.map((term) => ({ key: String(term.id), name: term.name, href: term.path, count: term.count })) : sidebar.tree.map((node) => ({ key: node.platform, name: node.platform, href: `/software/browse?platform=${encodeURIComponent(node.platform)}`, count: node.count }))
  return (
    <MediaShell section="software" active="home" nav={softwareNav(fa)} search={{ action: '/software/browse', placeholder: fa ? 'جست‌وجوی نرم‌افزار…' : 'Search software…' }}>
      <section className="sp-hero">
        <div className="container sp-hero-inner">
          <div>
            <span className="md-eyebrow">{fa ? 'دانلود نرم‌افزار' : 'Software'}</span>
            <h1>{fa ? 'آخرین نسخهٔ نرم‌افزارها، با لینک مستقیم' : 'Latest software, direct downloads'}</h1>
          </div>
          <nav className="sp-platforms" aria-label={fa ? 'دسته‌های اصلی' : 'Platforms'}>{platforms.map((node) => <Link key={node.key} href={node.href}><Icon name={platformIcon(node.name)} size={22} /><span><b>{node.name}</b><small>{node.count.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'برنامه' : 'apps'}</small></span></Link>)}</nav>
        </div>
      </section>
      {current === 1 && home.featured.length > 0 && <div className="container sp-featured"><h2>{fa ? 'پیشنهاد موبوکام' : 'Editor’s picks'}</h2><div className="md-rail">{home.featured.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</div></div>}
      <SoftwareLayout sidebar={<SoftwareSidebar data={sidebar} fa={fa} terms={terms} />}>
        <header className="sp-feed-head"><h2>{fa ? 'آخرین نرم‌افزارها و به‌روزرسانی‌ها' : 'Latest releases'}</h2><Link href="/software/browse?sort=popular">{fa ? 'پردانلودها ←' : 'Most downloaded →'}</Link></header>
        {feed.items.length ? feed.items.map((item) => <SoftwarePost key={item.id} item={item} fa={fa} term={primary.get(item.id)} />) : <EmptyState fa={fa} title={fa ? 'بخش نرم‌افزار آماده است' : 'Software section is ready'} text={fa ? 'به‌زودی نرم‌افزارها اینجا منتشر می‌شوند.' : 'Software will be published here soon.'} />}
        <Pager page={feed.page} pages={feed.pages} fa={fa} href={(n) => (n === 1 ? '/software' : `/software?page=${n}`)} />
        {!viewer.member && <VipStrip fa={fa} kind="software" />}
      </SoftwareLayout>
    </MediaShell>
  )
}
