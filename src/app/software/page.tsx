import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { requireModule, isModuleEnabled } from '@/extensions/server/modules'
import { softwareShelf, techNews } from '@/modules/media/server/queries'
import { softwarePortalChrome } from '@/modules/media/server/software-portal'
import { getViewer } from '@/modules/membership/server/membership'
import { ownerIdsForTermSlug } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import VipStrip from '@/components/media/VipStrip'
import { CategoryTiles, NewsBox, SoftwareLayout, SoftwareShelf, SoftwareSidebar, SoftwareStatsStrip, platformIcon } from '@/components/software/SoftwarePortal'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'
import { toPublicPath } from '@/platform/routing/aliases'
import { getSoftwareSettings } from '@/modules/software/server/admin'
import { railOrder } from '@/shared/section-layout'
import type { SoftwareRail } from '@/modules/software/domain/software'
import { Fragment, type ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return withSectionSeo('software', {
  title: 'دانلود نرم‌افزار',
  description: 'دانلود آخرین نسخهٔ نرم‌افزارهای ویندوز، مک، لینوکس، اندروید و iOS با لینک مستقیم، راهنمای نصب و تغییرات هر نسخه',
  alternates: { canonical: toPublicPath('/software') },
})
}

/** Software portal home (Softgozar layout): stats, category tiles, tech news and one shelf per main category. */
export default async function SoftwareHomePage() {
  await requireModule('software')
  const landing = await sectionLanding('software')
  if (landing) return landing
  const settings = await getSoftwareSettings()
  const [chrome, viewer, latest, newsOn] = await Promise.all([softwarePortalChrome(), getViewer(), softwareShelf(null, settings.shelfSize), isModuleEnabled('journal')])
  const order = railOrder(settings.rails)
  const roots = order.includes('categoryShelves') ? chrome.terms.filter((term) => term.count > 0).slice(0, settings.categoryShelfCount) : []
  const [news, shelves] = await Promise.all([
    newsOn && order.includes('news') ? techNews(settings.newsCount) : Promise.resolve([]),
    Promise.all(roots.map(async (root) => ({ root, items: await softwareShelf(await ownerIdsForTermSlug('software', root.slug) || [], settings.shelfSize) }))),
  ])
  // Blocks follow «مدیریت نرم‌افزار ← صفحهٔ اصلی»; stats and tiles sit above the sidebar layout.
  const blocks: Record<SoftwareRail, () => ReactNode> = {
    stats: () => null,
    tiles: () => null,
    news: () => <NewsBox items={news} />,
    latest: () => latest.length ? <SoftwareShelf title="جدیدترین نرم‌افزارها" items={latest} more="/software/browse" /> : <EmptyState fa title="بخش نرم‌افزار آماده است" text="به‌زودی نرم‌افزارها اینجا منتشر می‌شوند." />,
    categoryShelves: () => shelves.map(({ root, items }) => <SoftwareShelf key={root.id} title={`جدیدترین نرم‌افزارهای ${root.name}`} items={items} more={root.path} icon={platformIcon(root.name)} />),
    vipStrip: () => !viewer.member && <VipStrip fa kind="software" />,
  }
  return (
    <MediaShell section="software">
      {order.includes('stats') && <SoftwareStatsStrip stats={chrome.stats} />}
      {order.includes('tiles') && <div className="container sp-top"><CategoryTiles tiles={chrome.tiles} /></div>}
      <SoftwareLayout sidebar={<SoftwareSidebar data={chrome.sidebar} fa terms={chrome.terms} suggestions={chrome.suggestions} promo={chrome.promo} />}>
        <h1 className="sr-only">دانلود نرم‌افزار</h1>
        <nav className="sp-release-entry" aria-label="کشف نرم‌افزار"><Link href="/software/releases">نسخه‌ها و به‌روزرسانی‌ها ←</Link><Link href="/studios">سازندگان و ناشران ←</Link></nav>
        {order.filter((key) => key !== 'stats' && key !== 'tiles').map((key) => <Fragment key={key}>{blocks[key]()}</Fragment>)}
      </SoftwareLayout>
    </MediaShell>
  )
}
