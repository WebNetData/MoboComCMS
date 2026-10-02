import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { isModuleEnabled } from '@/extensions/server/modules'
import { studioProfile } from '@/modules/studios/server/queries'
import { browseGames, softwareShelf } from '@/modules/media/server/queries'
import MediaShell from '@/components/media/MediaShell'
import { ItemActionBar } from '@/components/engage/Engagement'
import RelatedDiscussions from '@/components/forum/RelatedDiscussions'
import { toPublicPath } from '@/platform/routing/aliases'
import '../studios.css'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const [games, software] = await Promise.all([isModuleEnabled('games'), isModuleEnabled('software')])
  const profile = await studioProfile(Number(id), { games, software })
  if (!profile) return {}
  return { title: `${profile.studio.name} | سازنده و ناشر`, description: profile.studio.summary.slice(0, 180) || `بازی‌ها و نرم‌افزارهای ${profile.studio.name}`, alternates: { canonical: toPublicPath(`/studios/${profile.studio.id}`) } }
}

export default async function StudioPage({ params }: Props) {
  const { id } = await params
  const [games, software] = await Promise.all([isModuleEnabled('games'), isModuleEnabled('software')])
  const profile = await studioProfile(Number(id), { games, software })
  if (!profile) notFound()
  const { studio, ids, counts } = profile
  const gameIds = [...new Set([...ids.gameDeveloper, ...ids.gamePublisher])]
  const softwareIds = [...new Set([...ids.softwareDeveloper, ...ids.softwarePublisher])]
  const [gameResult, softwareItems] = await Promise.all([
    games && gameIds.length ? browseGames({ ids: gameIds }) : { games: [] },
    software && softwareIds.length ? softwareShelf(softwareIds, 24) : [],
  ])
  const gameMap = new Map(gameResult.games.map((item) => [item.id, item]))
  const softwareMap = new Map(softwareItems.map((item) => [item.id, item]))
  const groups = [
    { key: 'gameDeveloper', title: 'بازی‌های ساخته‌شده', count: counts.gamesDeveloped, href: `/games/browse?developer=${encodeURIComponent(studio.name)}&developerStudioId=${studio.id}`, ids: ids.gameDeveloper, items: gameMap, base: '/games' },
    { key: 'gamePublisher', title: 'بازی‌های منتشرشده', count: counts.gamesPublished, href: `/games/browse?publisher=${encodeURIComponent(studio.name)}&publisherStudioId=${studio.id}`, ids: ids.gamePublisher, items: gameMap, base: '/games' },
    { key: 'softwareDeveloper', title: 'نرم‌افزارهای ساخته‌شده', count: counts.softwareDeveloped, href: `/software/browse?developer=${encodeURIComponent(studio.name)}&developerStudioId=${studio.id}`, ids: ids.softwareDeveloper, items: softwareMap, base: '/software' },
    { key: 'softwarePublisher', title: 'نرم‌افزارهای منتشرشده', count: counts.softwarePublished, href: `/software/browse?publisher=${encodeURIComponent(studio.name)}&publisherStudioId=${studio.id}`, ids: ids.softwarePublisher, items: softwareMap, base: '/software' },
  ].filter((group) => group.count > 0)
  return <MediaShell section={software ? 'software' : 'games'}>
    <div className="container org-page">
      <nav className="org-crumbs" aria-label="مسیر صفحه"><Link href="/studios">سازندگان و ناشران</Link><span>›</span><span aria-current="page">{studio.name}</span></nav>
      <header className="org-profile-head"><span className="org-logo is-large">{studio.logo ? <img src={studio.logo} alt="" /> : studio.name.slice(0, 1)}</span><div><p>سازنده / ناشر</p><h1>{studio.name}</h1>{studio.summary && <p className="org-summary">{studio.summary}</p>}{studio.website && <a href={studio.website} target="_blank" rel="nofollow noopener noreferrer">وب‌سایت رسمی ↗</a>}<ItemActionBar item={{ type: 'studio', id: studio.id }} title={studio.name} image={studio.logo} followLabel="بازی یا نرم‌افزار تازه" favoriteLabels={{ off: 'دنبال‌کردن', on: 'دنبال می‌کنید' }} /></div></header>
      {groups.map((group) => <section className="org-section" key={group.key}><header><h2>{group.title}</h2><span>{group.count.toLocaleString('fa-IR')} مورد</span></header><ul className="org-products">{group.ids.map((itemId) => { const item = group.items.get(itemId); return item ? <li key={itemId}><Link href={`${group.base}/${item.slug}`}><span className="org-product-icon">{'cover' in item && item.cover ? <img src={item.cover} alt="" loading="lazy" /> : item.title.slice(0, 1)}</span><span><b>{item.title}</b>{item.summary && <small>{item.summary}</small>}</span><span className="org-arrow" aria-hidden="true">←</span></Link></li> : null })}</ul>{group.count > group.ids.length && <Link className="org-more" href={group.href}>نمایش همه ←</Link>}</section>)}
      <RelatedDiscussions item={{ type: 'studio', id: studio.id }} />
    </div>
  </MediaShell>
}
