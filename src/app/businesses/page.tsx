import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { businessCategoryNames, businessDirectory, businessRequestPolicy } from '@/modules/businesses/server/businesses'
import { BusinessDirectoryHero, BusinessDirectoryCard } from '@/components/businesses/BusinessDirectoryView'
import { businessKinds } from '@/components/businesses/labels'
import Icon from '@/components/site/Icon'
import styles from '@/components/businesses/BusinessExperience.module.css'
import { getViewer } from '@/modules/membership/server/membership'
import BusinessRequestForm from '@/components/businesses/BusinessRequestForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تجربهٔ خرید و کسب‌وکارها | موبوکام', alternates: { canonical: '/businesses' }, description: 'تجربهٔ کاربران از فروشگاه‌های بیرونی، فروشندگان موبوکام و خرید از فروشگاه سایت؛ امتیازها، نظرات و پاسخ کسب‌وکارها.' }
export default async function BusinessDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('businesses')
  const params = await searchParams, [data, viewer, policy] = await Promise.all([businessDirectory(params), getViewer(), businessRequestPolicy()])
  const query = (page: number) => '/businesses?' + new URLSearchParams({ q: data.q, category: data.category, kind: data.kind, page: String(page) }).toString()
  const filtered = !!(data.q || data.category || data.kind)
  return <main className={styles.page} dir="rtl" data-testid="business-directory">
    <nav className={styles.topNav} aria-label="تجربهٔ خرید"><span><Icon name="bag" size={18} /> تجربهٔ خرید موبوکام</span><Link href="/businesses/activity"><Icon name="clock" size={16} /> فعالیت‌ها و درخواست‌های من</Link></nav>
    <BusinessDirectoryHero data={data} suggestions={policy.suggestions} />
    <section className={styles.resultsSection} aria-labelledby="business-results-title" id="business-results">
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>کشف و مقایسه</span><h2 id="business-results-title">کسب‌وکارها را بشناسید</h2><p>{data.total.toLocaleString('fa-IR')} کسب‌وکار{filtered ? ' با فیلتر فعلی' : ' برای کشف تجربه‌های خرید'}</p></div><span className={styles.resultsNote}><Icon name="chat" size={18} /> تجربهٔ شما، راهنمای خرید دیگران</span></div>
    <div className={styles.filterPanel}>
      <form method="get" action="/businesses" className={styles.filters}><Icon name="sliders" size={22} /><input type="hidden" name="q" value={data.q} /><label>نوع کسب‌وکار<select name="kind" defaultValue={data.kind}><option value="">همه</option>{Object.entries(businessKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>زمینهٔ فعالیت<select name="category" defaultValue={data.category}><option value="">همهٔ زمینه‌ها</option>{data.categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label><button type="submit" className="btn btn-ghost">اعمال فیلتر</button>{filtered && <Link href="/businesses#business-results" className={styles.resetFilters}>پاک‌کردن فیلترها</Link>}</form>
      {filtered && <div className={styles.activeFilters} aria-label="فیلترهای فعال">{data.q && <span>جست‌وجو: <bdi>{data.q}</bdi></span>}{data.kind && <span>{businessKinds[data.kind]}</span>}{data.category && <span>{data.category}</span>}</div>}
    </div>
    <div className={styles.grid}>{data.businesses.map(business => <BusinessDirectoryCard key={business.id} business={business} />)}{!data.businesses.length && <div className={styles.empty}><span className={styles.emptyIcon}><Icon name="search" size={30} /></span><h2>{filtered ? 'کسب‌وکاری با این فیلترها پیدا نشد' : 'تجربه‌ها از همین‌جا شروع می‌شوند'}</h2><p className={styles.muted}>{filtered ? 'نام یا دامنهٔ دیگری را امتحان کنید یا فیلترها را بردارید.' : 'کسب‌وکارهای منتشرشده توسط مدیریت در این بخش نمایش داده می‌شوند.'}</p>{filtered && <Link href="/businesses#business-results" className="btn btn-ghost">دیدن همهٔ کسب‌وکارها</Link>}</div>}</div>
    {data.pages > 1 && <nav aria-label="صفحه‌بندی کسب‌وکارها" className={styles.pager}>{data.page > 1 && <Link href={query(data.page - 1)}>صفحهٔ قبل</Link>}<span>{data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>{data.page < data.pages && <Link href={query(data.page + 1)}>صفحهٔ بعد</Link>}</nav>}
    </section>
    {policy.suggestions && <BusinessRequestForm loggedIn={!!viewer.userId} categories={await businessCategoryNames()} />}
    <section className={styles.faq} aria-labelledby="business-faq"><div><span className={styles.eyebrow}>راهنمای تجربهٔ خرید</span><h2 id="business-faq">شفاف، از اولین تجربه</h2><p className={styles.muted}>پیش از نوشتن یا خواندن تجربه‌ها، این نکته‌ها را بدانید.</p></div><div><details><summary>آیا هر تجربه به معنی خرید تأییدشده است؟</summary><p>خیر. نشان خرید فقط زمانی نمایش داده می‌شود که سابقهٔ خرید واجد شرایط در موبوکام وجود داشته باشد. تجربهٔ سایت بیرونی به‌تنهایی نشان خرید نمی‌گیرد. نشان جداگانهٔ «مدرک خرید بررسی‌شده» فقط پس از تطبیق تصویر خصوصی با تجربه توسط مدیر مستقل نمایش داده می‌شود و تضمین کیفیت کسب‌وکار نیست.</p></details><details><summary>آیا کسب‌وکار می‌تواند نظر منفی را حذف کند؟</summary><p>خیر. نماینده فقط به تجربه‌های منتشرشده پاسخ می‌دهد. ثبت نظر مثبت یا منفی، به‌تنهایی دلیل تأیید یا رد نیست.</p></details><details><summary>پس از ویرایش تجربه چه اتفاقی می‌افتد؟</summary><p>تغییر واقعی در متن، امتیاز یا جزئیات تجربه ممکن است نیاز به بررسی دوباره داشته باشد. امتیاز عمومی از نظرهای منتشرشده محاسبه می‌شود.</p></details></div></section>
  </main>
}
