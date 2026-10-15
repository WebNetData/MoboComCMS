import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { businessDirectory, businessRequestPolicy } from '@/modules/businesses/server/businesses'
import BusinessStars from '@/components/businesses/BusinessStars'
import styles from '@/components/businesses/BusinessExperience.module.css'
import { getViewer } from '@/modules/membership/server/membership'
import BusinessRequestForm from '@/components/businesses/BusinessRequestForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تجربهٔ خرید و کسب‌وکارها | موبوکام', description: 'تجربهٔ کاربران از فروشگاه‌های بیرونی، فروشندگان موبوکام و خرید از فروشگاه سایت؛ امتیازها، نظرات و پاسخ کسب‌وکارها.' }
const kinds: Record<string, string> = { EXTERNAL: 'کسب‌وکار بیرونی', SELLER: 'فروشندهٔ موبوکام', SITE: 'فروشگاه موبوکام' }
export default async function BusinessDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('businesses')
  const params = await searchParams, [data, viewer, policy] = await Promise.all([businessDirectory(params), getViewer(), businessRequestPolicy()])
  const query = (page: number) => '/businesses?' + new URLSearchParams({ q: data.q, category: data.category, kind: data.kind, page: String(page) }).toString()
  return <main className={styles.page} dir="rtl" data-testid="business-directory">
    <nav className={styles.topNav} aria-label="تجربهٔ خرید"><span>تجربهٔ خرید موبوکام</span><Link href="/businesses/activity">درخواست‌های من <span aria-hidden="true">↗</span></Link></nav>
    <section className={`${styles.hero} ${styles.directoryHero}`} aria-labelledby="business-directory-title">
      <div className={styles.heroArt} aria-hidden="true"><div className={styles.orbit} /><div className={styles.orbitInner} /><span className={styles.heroMark}>✓</span><span className={styles.artLabel}>هر تجربه، یک انتخاب آگاهانه</span></div>
      <div className={styles.heroContent}>
      <span className={styles.eyebrow}>تجربهٔ خرید · انتخاب آگاهانه</span>
      <h1 id="business-directory-title">قبل از خرید،<br />تجربه‌ها را بخوانید.</h1>
      <p>از فروشندگان موبوکام تا سایت‌های دیگر؛ تجربهٔ خرید و برخورد پشتیبانی را بخوانید و تجربهٔ خودتان را با دیگران به اشتراک بگذارید.</p>
      <form method="get" action="/businesses" className={styles.search}><label>نام کسب‌وکار یا نشانی سایت<input name="q" type="search" defaultValue={data.q} maxLength={100} placeholder="کدام کسب‌وکار را جست‌وجو می‌کنید؟" /></label><button className="btn btn-primary" type="submit">جست‌وجوی کسب‌وکار</button></form>
      <div className={styles.heroLinks}><a href="#business-results">کشف کسب‌وکارها ↓</a>{policy.suggestions && <a href="#suggest-business">معرفی کسب‌وکار</a>}<Link href="/dashboard/reviews">تجربه‌های من</Link></div></div>
    </section>
    <section className={styles.principles} aria-label="اصول تجربهٔ خرید"><div><span aria-hidden="true">۰۱</span><h2>تجربهٔ واقعی، روایت شما</h2><p>از کیفیت خرید تا برخورد پشتیبانی، به انتخاب دیگران کمک کنید.</p></div><div><span aria-hidden="true">۰۲</span><h2>امتیاز شفاف و قابل بررسی</h2><p>میانگین از تجربه‌های منتشرشده است؛ بدون امتیاز یا آمار ساختگی.</p></div><div><span aria-hidden="true">۰۳</span><h2>فرصت پاسخ برای کسب‌وکار</h2><p>نمایندهٔ بررسی‌شده پاسخ می‌دهد؛ تصمیم انتشار با مدیریت است.</p></div></section>
    <div className={styles.sectionHead} id="business-results"><div><span className={styles.eyebrow}>کشف و مقایسه</span><h2>کسب‌وکارها را بشناسید</h2><p>{data.total.toLocaleString('fa-IR')} کسب‌وکار · امتیازها از تجربه‌های منتشرشده</p></div>
      <form method="get" action="/businesses" className={styles.filters}><input type="hidden" name="q" value={data.q} /><label>نوع کسب‌وکار<select name="kind" defaultValue={data.kind}><option value="">همه</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>زمینهٔ فعالیت<select name="category" defaultValue={data.category}><option value="">همهٔ زمینه‌ها</option>{data.categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label><button type="submit" className="btn btn-ghost">اعمال فیلتر</button></form>
    </div>
    <div className={styles.grid}>{data.businesses.map(business => <article className={styles.card} key={business.id}>
      <div className={styles.cardTop}><span className={styles.avatar} aria-hidden="true">{Array.from(business.name)[0]}</span><div><h3><Link href={`/businesses/${business.slug}`}>{business.name}</Link></h3>{business.domain && <bdi className={styles.domain}>{business.domain}</bdi>}</div></div>
      <span className={styles.badge}>{kinds[business.kind]}</span>
      {business.description && <p className={styles.cardDescription}>{business.description}</p>}
      <div className={styles.rating}><BusinessStars value={business.average} /><strong>{business.average?.toLocaleString('fa-IR', { minimumFractionDigits: 1 }) || '—'}</strong><span className={styles.muted}>{business.reviewCount.toLocaleString('fa-IR')} تجربه</span></div>
      <div className={styles.cardBottom}><span className={styles.muted}>{business.category || 'کسب‌وکار'}</span><Link href={`/businesses/${business.slug}`}>مشاهدهٔ تجربه‌ها ←</Link></div>
    </article>)}{!data.businesses.length && <div className={styles.empty}><h2>{data.q ? 'کسب‌وکاری با این جست‌وجو پیدا نشد' : 'تجربه‌ها از همین‌جا شروع می‌شوند'}</h2><p className={styles.muted}>{data.q ? 'نام یا دامنهٔ دیگری را امتحان کنید.' : 'کسب‌وکارهای منتشرشده توسط مدیریت در این بخش نمایش داده می‌شوند.'}</p>{data.q && <Link href="/businesses">دیدن همهٔ کسب‌وکارها</Link>}</div>}</div>
    {data.pages > 1 && <nav aria-label="صفحه‌بندی کسب‌وکارها" className={styles.pager}>{data.page > 1 && <Link href={query(data.page - 1)}>صفحهٔ قبل</Link>}<span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>{data.page < data.pages && <Link href={query(data.page + 1)}>صفحهٔ بعد</Link>}</nav>}
    {policy.suggestions && <BusinessRequestForm loggedIn={!!viewer.userId} />}
    <section className={styles.faq} aria-labelledby="business-faq"><div><span className={styles.eyebrow}>راهنمای تجربهٔ خرید</span><h2 id="business-faq">شفاف، از اولین تجربه</h2><p className={styles.muted}>پیش از نوشتن یا خواندن تجربه‌ها، این نکته‌ها را بدانید.</p></div><div><details><summary>آیا هر تجربه به معنی خرید تأییدشده است؟</summary><p>خیر. نشان خرید فقط زمانی نمایش داده می‌شود که سابقهٔ خرید واجد شرایط در موبوکام وجود داشته باشد. تجربهٔ سایت بیرونی به‌تنهایی نشان خرید نمی‌گیرد. نشان جداگانهٔ «مدرک خرید بررسی‌شده» فقط پس از تطبیق تصویر خصوصی با تجربه توسط مدیر مستقل نمایش داده می‌شود و تضمین کیفیت کسب‌وکار نیست.</p></details><details><summary>آیا کسب‌وکار می‌تواند نظر منفی را حذف کند؟</summary><p>خیر. نماینده فقط به تجربه‌های منتشرشده پاسخ می‌دهد. ثبت نظر مثبت یا منفی، به‌تنهایی دلیل تأیید یا رد نیست.</p></details><details><summary>پس از ویرایش تجربه چه اتفاقی می‌افتد؟</summary><p>تغییر واقعی در متن، امتیاز یا جزئیات تجربه ممکن است نیاز به بررسی دوباره داشته باشد. امتیاز عمومی از نظرهای منتشرشده محاسبه می‌شود.</p></details></div></section>
  </main>
}
