import Link from '@/components/AppLink'
import NavigationIcon from '@/components/site/NavigationIcon'
import { companyFigures } from '@/modules/site/server/company-figures'
import { Channels, Location, companyData } from './CompanyParts'
import shared from './company.module.css'
import styles from './about.module.css'

const fa = (value: number) => value.toLocaleString('fa-IR')
// A section's icon when its menu link has none, from the first part of its address (as the header picks them).
const SECTION_ICONS: Record<string, string> = { products: 'bag', shop: 'bag', blog: 'book', journal: 'book', music: 'music', cinema: 'film', games: 'gamepad', software: 'devices', forum: 'chat', celebrities: 'users', people: 'users', businesses: 'star', vip: 'crown', plans: 'globe' }
const sectionIcon = (href: string, icon?: string) => icon || SECTION_ICONS[href.split(/[/?#]/).filter(Boolean)[0] || ''] || 'sparkles'

/**
 * The «درباره ما» page template (chosen per page in Pages admin): the page title over the brand's story with what the
 * site really holds, the page's own text as «داستان ما», the menu's sections, the homepage's reasons, the ways to reach
 * the team and the place on a large map. Every word but the page text comes from Site settings and the menu.
 */
export default async function AboutTemplate({ title, body }: { title: string; body: string }) {
  const [data, figures] = await Promise.all([companyData(), companyFigures()]), { site } = data
  const reasons = (site.sections.find((section) => section.kind === 'features' && section.enabled)?.items || []).slice(0, 6)
  const sections = site.navigation.filter((link) => link.href !== '/' && link.enabled !== false)
  const services = site.sections.find((section) => section.kind === 'services')?.items || []
  const describe = (href: string) => sections.find((link) => link.href === href)?.description?.fa || services.find((item) => item.href === href)?.text.fa || ''
  return <div className={`container ${styles.about}`}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={shared.eyebrow}>{site.brand}</span>
        <h1>{title}</h1>
        <p>{site.tagline.fa}</p>
        <div className={styles.actions}><Link href="/products" className="btn btn-primary">شروع از فروشگاه</Link><Link href="/p/contact" className="btn btn-ghost">تماس با ما</Link></div>
      </div>
      {figures.length > 0 && <ul className={styles.figures} aria-label={`${site.brand} در یک نگاه`}>{figures.map((figure) => <li key={figure.label}><Link href={figure.href}><span aria-hidden="true"><NavigationIcon name={figure.icon} size={20} /></span><b>{fa(figure.value)}</b><small>{figure.label}</small></Link></li>)}</ul>}
    </header>

    {body && <section className={styles.story} aria-labelledby="about-story-title">
      <header className={shared.blockHead}><span className={shared.eyebrow}>از زبان ما</span><h2 id="about-story-title">داستان ما</h2></header>
      <div className={`prose ${styles.storyText}`} dangerouslySetInnerHTML={{ __html: body }} />
    </section>}

    {sections.length > 0 && <section className={shared.block} aria-labelledby="about-sections-title">
      <header className={shared.blockHead}><span className={shared.eyebrow}>همه‌چیز در یک‌جا</span><h2 id="about-sections-title">بخش‌های {site.brand}</h2><p className={styles.blockLead}>یک حساب کاربری، و همهٔ دنیای {site.brand} در دسترس شما.</p></header>
      <ul className={styles.bento}>{sections.map((link, index) => {
        const about = describe(link.href), figure = figures.find((item) => item.href === link.href)
        const subs = (link.children || []).filter((child) => child.enabled !== false && child.href !== link.href).slice(0, 4)
        return <li key={link.id || link.href} className={index < 2 ? styles.bentoWide : ''} style={{ '--tone': `var(--company-tone-${index % 6})` } as React.CSSProperties}>
          <Link href={link.href} className={styles.bentoMain}>
            <span className={styles.bentoIcon} aria-hidden="true"><NavigationIcon name={sectionIcon(link.href, link.icon)} size={index < 2 ? 30 : 24} /></span>
            <span className={styles.bentoText}><b>{link.label.fa}</b>{about && <small>{about}</small>}</span>
            {figure && <span className={styles.bentoFigure}><b>{fa(figure.value)}</b><small>{figure.label}</small></span>}
            <span className={styles.bentoGo} aria-hidden="true">←</span>
          </Link>
          {subs.length > 0 && <nav className={styles.bentoSubs} aria-label={`زیربخش‌های ${link.label.fa}`}>{subs.map((child) => <Link key={child.id || child.href} href={child.href}>{child.label.fa}</Link>)}</nav>}
        </li>
      })}</ul>
    </section>}

    {reasons.length > 0 && <section className={shared.block} aria-labelledby="about-reasons-title">
      <header className={shared.blockHead}><span className={shared.eyebrow}>چرا {site.brand}</span><h2 id="about-reasons-title">آنچه به آن پایبندیم</h2></header>
      <ul className={styles.reasons}>{reasons.map((reason, index) => <li key={index}><span aria-hidden="true"><NavigationIcon name={reason.icon || 'check'} size={22} /></span><b>{reason.title.fa}</b>{reason.text.fa && <p>{reason.text.fa}</p>}</li>)}</ul>
    </section>}

    <section className={shared.block} aria-labelledby="about-channels-title">
      <header className={shared.blockHead}><span className={shared.eyebrow}>در دسترس شما</span><h2 id="about-channels-title">راه‌های ارتباط</h2></header>
      <Channels channels={data.channels} />
    </section>

    <Location data={data} headingId="about-location-title" />
  </div>
}
