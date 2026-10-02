import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { isModuleEnabled, requireModule } from '@/extensions/server/modules'
import MediaShell from '@/components/media/MediaShell'
import { studioProfile } from '@/modules/studios/server/queries'
import { studioProductReviews } from '@/modules/studios/server/reviews'
import { StudioReviewCards } from '@/components/studios/StudioReviews'
import '../../studios.css'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const [games, software] = await Promise.all([isModuleEnabled('games'), isModuleEnabled('software')])
  const profile = await studioProfile(Number(id), { games, software })
  return profile ? { title: `دیدگاه‌های محصولات ${profile.studio.name}` } : {}
}

export default async function StudioReviewArchive({ params, searchParams }: Props) {
  await requireModule('reviews')
  const [{ id }, { page }] = await Promise.all([params, searchParams])
  const [games, software] = await Promise.all([isModuleEnabled('games'), isModuleEnabled('software')])
  const profile = await studioProfile(Number(id), { games, software })
  if (!profile) notFound()
  const reviews = await studioProductReviews(profile.studio.id, { games, software }, { page: Number(page), size: 20 })
  return <MediaShell section={software ? 'software' : 'games'}><div className="container org-page">
    <nav className="org-crumbs" aria-label="مسیر صفحه"><Link href="/studios">سازندگان و ناشران</Link><span>›</span><Link href={`/studios/${profile.studio.id}`}>{profile.studio.name}</Link><span>›</span><span>دیدگاه‌ها</span></nav>
    <header className="org-heading"><div><p>تجربهٔ کاربران</p><h1>دیدگاه‌های محصولات {profile.studio.name}</h1><span>{reviews.total.toLocaleString('fa-IR')} دیدگاه تأییدشده</span></div></header>
    {reviews.items.length ? <StudioReviewCards reviews={reviews.items} /> : <div className="org-empty">هنوز دیدگاه تأییدشده‌ای برای این محصولات ثبت نشده است.</div>}
    {reviews.pages > 1 && <nav className="org-review-pages" aria-label="صفحه‌بندی دیدگاه‌ها">{reviews.page > 1 && <Link href={`/studios/${id}/reviews?page=${reviews.page - 1}`}>صفحهٔ قبل</Link>}<span>صفحهٔ {reviews.page.toLocaleString('fa-IR')} از {reviews.pages.toLocaleString('fa-IR')}</span>{reviews.page < reviews.pages && <Link href={`/studios/${id}/reviews?page=${reviews.page + 1}`}>صفحهٔ بعد</Link>}</nav>}
  </div></MediaShell>
}
