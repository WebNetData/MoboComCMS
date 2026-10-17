import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { businessDirectory } from '@/modules/businesses/server/businesses'
import BusinessStars from './BusinessStars'
import styles from './BusinessExperience.module.css'
import { businessKinds } from './labels'

type Directory = Awaited<ReturnType<typeof businessDirectory>>

export function BusinessDirectoryHero({ data, suggestions }: { data: Directory; suggestions: boolean }) {
  return <section className={`${styles.hero} ${styles.directoryHero}`} aria-labelledby="business-directory-title">
    <div className={styles.heroContent}>
      <span className={styles.eyebrow}><Icon name="bag" size={18} /> تجربهٔ خرید، به روایت شما</span>
      <h1 id="business-directory-title">قبل از خرید،<br />تجربه‌ها را بخوانید.</h1>
      <p>پشت هر خرید، یک تجربه هست. فروشگاه‌های دیگر و فروشندگان موبوکام را بشناسید؛ از کیفیت سفارش تا برخورد پشتیبانی.</p>
      <form method="get" action="/businesses" className={styles.search} role="search" aria-label="جست‌وجوی کسب‌وکارها">
        <input type="hidden" name="kind" value={data.kind} /><input type="hidden" name="category" value={data.category} />
        <label>نام کسب‌وکار یا نشانی سایت<span className={styles.searchInput}><Icon name="search" size={22} /><input name="q" type="search" defaultValue={data.q} maxLength={100} placeholder="دنبال کدام کسب‌وکار می‌گردید؟" /></span></label>
        <button className="btn btn-primary" type="submit">جست‌وجوی کسب‌وکار <Icon name="arrow" size={18} /></button>
      </form>
      <div className={styles.heroLinks}><a href="#business-results">کشف کسب‌وکارها <Icon name="chevron" size={16} /></a>{suggestions && <a href="#suggest-business"><Icon name="plus" size={16} /> معرفی کسب‌وکار</a>}<Link href="/dashboard/reviews">تجربه‌های من</Link></div>
    </div>
    <aside className={styles.heroGuide} aria-label="راهنمای انتخاب آگاهانه">
      <div className={styles.guideHeading}><span className={styles.guideIcon}><Icon name="chat" size={30} /></span><div><span className={styles.eyebrow}>برای خرید بعدی شما</span><h2>با دید باز انتخاب کنید.</h2></div></div>
      <div className={styles.guideItems}>
        <a href="#business-results"><Icon name="globe" /><span><strong>کسب‌وکار را پیدا کنید</strong><small>نام یا نشانی سایت را جست‌وجو کنید.</small></span><Icon name="arrow" size={18} /></a>
        <a href="#business-faq"><Icon name="star" /><span><strong>تجربه‌ها را بهتر بشناسید</strong><small>امتیازها، پاسخ‌ها و معنای نشان‌ها را ببینید.</small></span><Icon name="arrow" size={18} /></a>
        <Link href="/dashboard/reviews"><Icon name="users" /><span><strong>از تجربهٔ خودتان بنویسید</strong><small>به انتخاب نفر بعد کمک کنید.</small></span><Icon name="arrow" size={18} /></Link>
      </div>
      <p className={styles.guideNote}><Icon name="shield" size={18} /> امتیازها از تجربه‌های منتشرشده محاسبه می‌شوند.</p>
    </aside>
  </section>
}

export function BusinessDirectoryCard({ business }: { business: Directory['businesses'][number] }) {
  return <article className={styles.card} data-kind={business.kind}>
    <div className={styles.cardTop}><span className={styles.avatar} aria-hidden="true">{Array.from(business.name)[0]}</span><div><span className={styles.cardCategory}>{business.category || 'کسب‌وکار'}</span><h3><Link href={`/businesses/${business.slug}`}>{business.name}</Link></h3>{business.domain && <bdi className={styles.domain}>{business.domain}</bdi>}</div></div>
    <span className={styles.badge}><Icon name={business.kind === 'EXTERNAL' ? 'globe' : 'bag'} size={14} />{businessKinds[business.kind]}</span>
    <p className={styles.cardDescription}>{business.description || 'تجربه‌های کاربران و پاسخ‌های کسب‌وکار را در صفحهٔ اختصاصی آن بخوانید.'}</p>
    <div className={styles.cardRating}><div className={styles.rating}><BusinessStars value={business.average} /><strong>{business.average?.toLocaleString('fa-IR', { minimumFractionDigits: 1 }) || '—'}</strong></div><span className={styles.muted}>{business.reviewCount ? `${business.reviewCount.toLocaleString('fa-IR')} تجربهٔ منتشرشده` : 'هنوز امتیازی ثبت نشده'}</span></div>
    <div className={styles.cardBottom}><Link href={`/businesses/${business.slug}`}>مشاهدهٔ تجربه‌ها <Icon name="arrow" size={18} /><span className="sr-only"> دربارهٔ {business.name}</span></Link></div>
  </article>
}
