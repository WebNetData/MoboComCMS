import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import { myCollections, savedCollections } from '@/modules/content/server/collections'
import MyCollectionsClient from './MyCollectionsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'مجموعه‌های من | My collections', robots: { index: false } }

export default async function MyCollectionsPage() {
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/dashboard/collections')
  const [rows, saved, locale] = await Promise.all([myCollections(viewer.userId), savedCollections(viewer.userId), getServerLocale()])
  return <div className="ud collections-page"><header className="collections-head"><div><span className="md-eyebrow">{locale === 'fa' ? 'کتابخانهٔ من' : 'My library'}</span><h1>{locale === 'fa' ? 'مجموعه‌های من' : 'My collections'}</h1><p className="muted">{locale === 'fa' ? 'از بخش‌های مختلف سایت فهرست بسازید و دربارهٔ نمایش آن تصمیم بگیرید.' : 'Curate items from across the site and choose who can see them.'}</p></div></header><MyCollectionsClient initial={rows} saved={saved.map((row) => row.collection)} ownerId={viewer.userId} fa={locale === 'fa'} /></div>
}
