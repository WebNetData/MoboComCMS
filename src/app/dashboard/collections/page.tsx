import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import { myCollections, savedCollections } from '@/modules/content/server/collections'
import MyCollectionsClient from './MyCollectionsClient'
import Link from '@/components/AppLink'
import { isModuleEnabled } from '@/extensions/server/modules'
import MemberLibrarySync from '@/components/engage/MemberLibrarySync'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'مجموعه‌های من | My collections', robots: { index: false } }

export default async function MyCollectionsPage() {
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/dashboard/collections')
  const [rows, saved, locale, promptsOn] = await Promise.all([myCollections(viewer.userId), savedCollections(viewer.userId), getServerLocale(), isModuleEnabled('prompt-master')])
  return <div className="ud collections-page"><MemberLibrarySync /><header className="collections-head"><div><span className="md-eyebrow">{locale === 'fa' ? 'کتابخانهٔ من' : 'My library'}</span><h1>{locale === 'fa' ? 'مجموعه‌های من' : 'My collections'}</h1><p className="muted">{locale === 'fa' ? 'از بخش‌های مختلف سایت فهرست بسازید و دربارهٔ نمایش آن تصمیم بگیرید.' : 'Curate items from across the site and choose who can see them.'}</p></div>
    {promptsOn && <Link href="/prompts/library?view=all" className="btn btn-ghost">{locale === 'fa' ? 'انتخاب الگوی پرامپت برای کالکشن' : 'Discover prompts for a collection'}</Link>}
    </header><MyCollectionsClient initial={rows} saved={saved.map((row) => row.collection)} ownerId={viewer.userId} fa={locale === 'fa'} /></div>
}
