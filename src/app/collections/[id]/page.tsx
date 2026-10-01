import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import { collectionId, collectionIsFollowed, collectionIsReacted, collectionIsSaved, collectionPublicMetadata, getCollection } from '@/modules/content/server/collections'
import CollectionControls, { ItemControls } from './CollectionControls'
import { ITEM_LABEL } from '@/modules/content/domain/items'

export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const raw = (await params).id
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) return { title: 'مجموعه | Collection', robots: { index: false } }
  const row = await collectionPublicMetadata(id)
  if (!row) return { title: 'مجموعه | Collection', robots: { index: false } }
  return { title: row.title, description: row.description.slice(0, 160) }
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ share?: string }> }) {
  const viewer = await getViewer()
  const locale = await getServerLocale()
  const fa = locale === 'fa'
  let collection
  try { collection = await getCollection(collectionId((await params).id), viewer.userId, (await searchParams).share) } catch { notFound() }
  const [followed, saved, reacted] = viewer.userId ? await Promise.all([collection.visibility === 'PUBLIC' ? collectionIsFollowed(viewer.userId, collection.id) : Promise.resolve(false), collectionIsSaved(viewer.userId, collection.id), collectionIsReacted(viewer.userId, collection.id)]) : [false, false, false]
  return <main className="container collections-page collections-detail">
    <nav className="collections-breadcrumb"><Link href="/collections">{fa ? 'مجموعه‌ها' : 'Collections'}</Link><span> / </span><span>{collection.title}</span></nav>
    <header className="collections-head"><div><span className="md-eyebrow">{collection.visibility === 'PRIVATE' ? (fa ? 'خصوصی' : 'Private') : collection.visibility === 'UNLISTED' ? (fa ? 'فقط با لینک' : 'Unlisted') : collection.visibility === 'EDITORIAL' ? (fa ? 'منتخب تحریریه' : 'Editorial pick') : (fa ? 'مجموعهٔ عمومی' : 'Public collection')}</span><h1>{collection.title}</h1><p className="muted">{collection.description || (fa ? 'هنوز توضیحی نوشته نشده است.' : 'No description yet.')}</p><small className="muted">{fa ? 'گردآورنده:' : 'Curated by:'} {collection.ownerName || (fa ? 'کاربر' : 'Member')}</small></div><div className="collections-head-actions">{collection.canEdit && <Link className="btn btn-ghost" href="/dashboard/collections">{fa ? 'مجموعه‌های من' : 'My collections'}</Link>}<CollectionControls collection={collection} loggedIn={!!viewer.userId} followed={!!followed} saved={!!saved} reacted={!!reacted} fa={fa} /></div></header>
    <section className="collections-items" aria-label={fa ? 'موارد مجموعه' : 'Collection items'}>{collection.items.length ? collection.items.map(({ card, id }, index) => <article className="collections-item" key={id}><Link href={card.url}>{card.image ? <img src={card.image} alt="" loading="lazy" /> : <span className="collections-item-fallback" aria-hidden="true">▦</span>}<span><strong>{card.title}</strong><small>{card.subtitle}</small><em>{fa ? ITEM_LABEL[card.type].one : card.type}</em></span></Link>{collection.canEdit && <ItemControls collectionId={collection.id} item={`${card.type}:${card.id}`} first={index === 0} last={index === collection.items.length - 1} fa={fa} />}</article>) : <p className="collections-empty">{fa ? 'این مجموعه هنوز موردی ندارد. از صفحهٔ هر فیلم، آهنگ یا محتوای دیگر موردی اضافه کنید.' : 'This collection is empty. Add items from content pages.'}</p>}</section>
  </main>
}
