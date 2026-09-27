import type { Metadata } from 'next'
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

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'دانلود نرم‌افزار',
  description: 'دانلود آخرین نسخهٔ نرم‌افزارهای ویندوز، مک، لینوکس، اندروید و iOS با لینک مستقیم، راهنمای نصب و تغییرات هر نسخه',
  alternates: { canonical: '/software' },
}

/** Software portal home (Softgozar layout): stats, category tiles, tech news and one shelf per main category. */
export default async function SoftwareHomePage() {
  await requireModule('software')
  const landing = await sectionLanding('software')
  if (landing) return landing
  const [chrome, viewer, latest, newsOn] = await Promise.all([softwarePortalChrome(), getViewer(), softwareShelf(null, 8), isModuleEnabled('journal')])
  const roots = chrome.terms.filter((term) => term.count > 0).slice(0, 4)
  const [news, shelves] = await Promise.all([
    newsOn ? techNews(5) : Promise.resolve([]),
    Promise.all(roots.map(async (root) => ({ root, items: await softwareShelf(await ownerIdsForTermSlug('software', root.slug) || [], 8) }))),
  ])
  return (
    <MediaShell section="software">
      <SoftwareStatsStrip stats={chrome.stats} />
      <div className="container sp-top"><CategoryTiles tiles={chrome.tiles} /></div>
      <SoftwareLayout sidebar={<SoftwareSidebar data={chrome.sidebar} fa terms={chrome.terms} suggestions={chrome.suggestions} promo={chrome.promo} />}>
        <h1 className="sr-only">دانلود نرم‌افزار</h1>
        <NewsBox items={news} />
        {latest.length ? <SoftwareShelf title="جدیدترین نرم‌افزارها" items={latest} more="/software/browse" /> : <EmptyState fa title="بخش نرم‌افزار آماده است" text="به‌زودی نرم‌افزارها اینجا منتشر می‌شوند." />}
        {shelves.map(({ root, items }) => <SoftwareShelf key={root.id} title={`جدیدترین نرم‌افزارهای ${root.name}`} items={items} more={root.path} icon={platformIcon(root.name)} />)}
        {!viewer.member && <VipStrip fa kind="software" />}
      </SoftwareLayout>
    </MediaShell>
  )
}
