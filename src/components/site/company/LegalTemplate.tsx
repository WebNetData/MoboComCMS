import Link from '@/components/AppLink'
import NavigationIcon from '@/components/site/NavigationIcon'
import ArticleToc from '@/components/ArticleToc'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import PrintButton from './PrintButton'
import styles from './legal.module.css'

const fa = (value: number) => value.toLocaleString('fa-IR')

/**
 * The «سند حقوقی» page template (terms, privacy, refunds…): a document head with when it last changed, how long it
 * reads and a print button; the page text with numbered sections and a contents list that follows the reader; the
 * other documents using this template; and where to ask about it. The text is the page's own, edited in Pages admin.
 */
export default async function LegalTemplate({ title, body, updatedAt, related }: { title: string; body: string; updatedAt: Date; related: { slug: string; title: string }[] }) {
  const site = await getPublicSiteConfig()
  const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  const sections = (body.match(/<h2[\s>]/g) || []).length
  return <div className={`container ${styles.legal}`}>
    <header className={styles.hero}>
      <span className={styles.badge}><NavigationIcon name="book" size={16} />اسناد و قوانین {site.brand}</span>
      <h1>{title}</h1>
      <ul className={styles.meta} aria-label="دربارهٔ این سند">
        <li><NavigationIcon name="clock" size={16} /><span>آخرین به‌روزرسانی <time dateTime={updatedAt.toISOString()}>{updatedAt.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })}</time></span></li>
        <li><NavigationIcon name="eye" size={16} /><span>زمان مطالعه حدود {fa(Math.max(1, Math.round(words / 200)))} دقیقه</span></li>
        {sections > 0 && <li><NavigationIcon name="layers" size={16} /><span>{fa(sections)} بخش</span></li>}
      </ul>
      <PrintButton className={styles.print} />
    </header>

    <div className={styles.layout}>
      <aside className={styles.toc} aria-label="فهرست این سند"><ArticleToc targetId="legal-body" /></aside>
      <article id="legal-body" className={`prose ${styles.doc}`} dangerouslySetInnerHTML={{ __html: body }} />
    </div>

    {related.length > 0 && <nav className={styles.related} aria-labelledby="legal-related-title">
      <h2 id="legal-related-title">اسناد مرتبط</h2>
      <ul>{related.map((doc) => <li key={doc.slug}><Link href={`/p/${doc.slug}`}><NavigationIcon name="file" size={20} /><span>{doc.title}</span><b aria-hidden="true">←</b></Link></li>)}</ul>
    </nav>}

    <section className={styles.help} aria-labelledby="legal-help-title">
      <div><h2 id="legal-help-title">سؤالی دربارهٔ این سند دارید؟</h2><p>اگر بخشی از این متن روشن نیست، از تیم {site.brand} بپرسید.</p></div>
      <div className={styles.helpActions}><Link href="/p/contact" className="btn btn-primary">تماس با ما</Link><Link href="/dashboard/tickets" className="btn btn-ghost">مرکز پشتیبانی</Link></div>
    </section>
  </div>
}
