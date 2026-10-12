import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { businessPage } from '@/modules/businesses/server/businesses'
import { BusinessError } from '@/modules/businesses/domain/businesses'
import BusinessStars from '@/components/businesses/BusinessStars'
import { BusinessReviewForm, BusinessReplyForm, BusinessHelpful } from '@/components/businesses/BusinessForms'
import ManageBar from '@/components/admin/ManageBar'
import styles from '@/components/businesses/BusinessExperience.module.css'

export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try { const data = await businessPage((await params).slug, null); return { title: `تجربهٔ خرید از ${data.profile.name} | موبوکام`, description: data.profile.description || `نظر و تجربهٔ کاربران دربارهٔ ${data.profile.name}` } } catch { return { title: 'تجربهٔ خرید | موبوکام' } }
}
export default async function BusinessProfilePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireModule('businesses')
  const [route, query, viewer] = await Promise.all([params, searchParams, getViewer()])
  let data
  try { data = await businessPage(route.slug, viewer.userId, query) } catch (error) { if (error instanceof BusinessError && error.status === 404) notFound(); throw error }
  const { profile, summary } = data, total = Math.max(1, summary.count)
  const pageHref = (page: number) => `/businesses/${profile.slug}?` + new URLSearchParams({ page: String(page), sort: data.sort, stars: data.stars ? String(data.stars) : '' }).toString()
  return <main className={styles.page} dir="rtl" data-testid="business-profile">
    <nav className={styles.crumb} aria-label="مسیر صفحه"><Link href="/businesses">تجربهٔ خرید</Link><span aria-hidden="true">/</span><span>{profile.name}</span></nav>
    <section className={styles.hero}><div className={styles.profileHead}><div className={styles.profileIdentity}><span className={styles.avatar} aria-hidden="true">{Array.from(profile.name)[0]}</span><div><span className={styles.badge}>{profile.kind === 'SELLER' ? 'فروشندهٔ موبوکام' : profile.kind === 'SITE' ? 'فروشگاه موبوکام' : 'کسب‌وکار بیرونی'}</span><h1>{profile.name}</h1><span className={styles.muted}>{profile.category}</span>{profile.domain && <bdi className={styles.domain}>{profile.domain}</bdi>}</div></div><div className={styles.actions}><a href="#write-experience" className="btn btn-primary">ثبت تجربهٔ شما</a>{profile.website && <a href={profile.website} className="btn btn-ghost" target="_blank" rel="noopener noreferrer nofollow">وب‌سایت کسب‌وکار ↗</a>}</div></div>{profile.description && <p style={{ marginTop: 24, marginBottom: 0 }}>{profile.description}</p>}</section>
    <div className={styles.columns}><div>
      <section className={styles.panel} aria-label="خلاصهٔ تجربه‌ها"><div className={styles.score}><strong>{summary.average?.toLocaleString('fa-IR', { minimumFractionDigits: 1 }) || '—'}</strong><div><BusinessStars value={summary.average} /><p className={styles.muted}>{summary.count.toLocaleString('fa-IR')} تجربهٔ منتشرشده</p></div></div><ol className={styles.bars} aria-label="توزیع امتیازها">{[5, 4, 3, 2, 1].map(stars => <li key={stars}><span>{stars.toLocaleString('fa-IR')} ★</span><span className={styles.bar} aria-hidden="true"><i style={{ width: `${summary.distribution[stars - 1] / total * 100}%` }} /></span><span>{summary.distribution[stars - 1].toLocaleString('fa-IR')}</span></li>)}</ol></section>
      <div className={styles.sectionHead}><h2>تجربه‌های کاربران</h2><form method="get" className={styles.filters}><label>ترتیب<select name="sort" defaultValue={data.sort}><option value="new">جدیدترین</option><option value="high">بالاترین امتیاز</option><option value="low">پایین‌ترین امتیاز</option></select></label><label>ستاره<select name="stars" defaultValue={data.stars || ''}><option value="">همه</option>{[5, 4, 3, 2, 1].map(stars => <option key={stars} value={stars}>{stars.toLocaleString('fa-IR')} ستاره</option>)}</select></label><button className="btn btn-ghost" type="submit">نمایش</button></form></div>
      {data.reviews.map(review => <article className={styles.review} key={review.id}><header className={styles.reviewHead}><div><h3>{review.author.name}</h3><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('fa-IR')}</time></div>{review.verified === 'PURCHASE' && <span className={styles.badge}>✓ خرید ثبت‌شده در موبوکام</span>}</header><BusinessStars value={review.rating} /><p className={styles.reviewBody}>{review.body}</p>{review.experiencedOn && <p className={styles.muted}>تاریخ تجربه: {new Date(review.experiencedOn).toLocaleDateString('fa-IR')}</p>}{profile.kind !== 'SELLER' && viewer.userId && !review.mine && <BusinessHelpful reviewId={review.id} count={review.helpfulCount} on={review.helpfulByMe} />}{review.reply && <div className={styles.reply}><strong>پاسخ {profile.name}</strong><p>{review.reply}</p></div>}{data.canReply && <BusinessReplyForm businessId={profile.id} reviewId={review.id} />}</article>)}
      {!data.reviews.length && <div className={styles.empty}><h2>هنوز تجربه‌ای برای نمایش نیست</h2><p className={styles.muted}>تجربه‌های منتشرشده با فیلتر انتخابی اینجا نمایش داده می‌شوند.</p></div>}
      {data.pages > 1 && <nav className={styles.pager} aria-label="صفحه‌بندی تجربه‌ها">{data.page > 1 && <Link href={pageHref(data.page - 1)}>قبل</Link>}<span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>{data.page < data.pages && <Link href={pageHref(data.page + 1)}>بعد</Link>}</nav>}
    </div><aside><BusinessReviewForm businessId={profile.id} kind={profile.kind} loggedIn={!!viewer.userId} canReply={data.canReply} orders={data.orders} mine={data.mine} /><div className={styles.panel} style={{ marginTop: 18 }}><h2>شفافیت در تجربه‌ها</h2><p className={styles.muted}>میانگین سادهٔ امتیازهای منتشرشده نمایش داده می‌شود. تجربهٔ سایت بیرونی با ثبت نظر، نشان خرید تأییدشده نمی‌گیرد. کسب‌وکار فقط می‌تواند پاسخ بدهد؛ انتشار نظر در اختیار مدیریت است.</p></div></aside></div>
    <ManageBar title={profile.name} anyOf={['businesses.manage']} links={[{ href: `/admin/businesses?edit=${profile.id}`, label: 'ویرایش کسب‌وکار' }]} />
  </main>
}
