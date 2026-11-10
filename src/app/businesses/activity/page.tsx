import SectionName from '@/components/site/SectionName'
import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { getViewer } from '@/modules/membership/server/membership'
import { requireModule } from '@/extensions/server/modules'
import { myBusinessRequests } from '@/modules/businesses/server/businesses'
import styles from '@/components/businesses/BusinessExperience.module.css'
import BusinessTrustActivity from '@/components/businesses/BusinessTrustActivity'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'فعالیت‌های تجربهٔ خرید من | موبوکام', robots: { index: false, follow: false } }
export default async function BusinessActivityPage() {
  await requireModule('businesses')
  const viewer = await getViewer(), rows = viewer.userId ? await myBusinessRequests(viewer.userId) : []
  return <main className={styles.page} dir="rtl"><nav className={styles.crumb} aria-label="مسیر صفحه"><Link href="/businesses"><SectionName id="businesses">تجربهٔ خرید</SectionName></Link><span aria-hidden="true">/</span><span>فعالیت‌های من</span></nav><section className={styles.hero}><span className={styles.eyebrow}>فضای شخصی شما</span><h1>فعالیت‌های من</h1><p>پیگیری مدارک خصوصی، گزارش‌ها، کسب‌وکارهای پیشنهادی و درخواست‌های نمایندگی؛ فقط برای حساب شما.</p></section>
    {!viewer.userId ? <div className={styles.empty}><h2>برای پیگیری درخواست‌ها وارد شوید</h2><Link className="btn btn-primary" href="/login">ورود به حساب</Link></div> : !rows.length ? <div className={styles.empty}><h2>هنوز درخواستی ثبت نکرده‌اید</h2><p className={styles.muted}>از فهرست کسب‌وکارها می‌توانید کسب‌وکار جدیدی پیشنهاد دهید.</p><Link href="/businesses#suggest-business">معرفی کسب‌وکار</Link></div> : <section className={styles.activity} aria-label="۵۰ درخواست اخیر">{rows.map(row => <article className={styles.review} key={row.id}><header className={styles.reviewHead}><div><span className={styles.eyebrow}>{row.kind === 'CLAIM' ? 'درخواست نمایندگی' : 'معرفی کسب‌وکار'}</span><h2>{row.name}</h2><bdi className={styles.domain}>{row.domain}</bdi></div><span className={styles.badge}>{row.status === 'PENDING' ? 'در انتظار بررسی' : row.status === 'APPROVED' ? 'تأییدشده' : 'تأیید نشد'}</span></header><time className={styles.muted} dateTime={row.createdAt.toISOString()}>{row.createdAt.toLocaleDateString('fa-IR')}</time>{row.decisionNote && <p className={styles.notice}>{row.decisionNote}</p>}{row.business?.status === 'PUBLISHED' && <Link href={`/businesses/${row.business.slug}`}>مشاهدهٔ صفحهٔ کسب‌وکار ←</Link>}</article>)}</section>}
    {viewer.userId && <BusinessTrustActivity userId={viewer.userId}/>}
  </main>
}
