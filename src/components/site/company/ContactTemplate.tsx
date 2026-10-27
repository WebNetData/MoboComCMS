import Link from '@/components/AppLink'
import NavigationIcon from '@/components/site/NavigationIcon'
import PublicForm from '@/components/site/PublicForm'
import type { FormDefinition } from '@/modules/forms/domain/forms'
import { Channels, Location, companyData } from './CompanyParts'
import shared from './company.module.css'
import styles from './contact.module.css'

/**
 * The «تماس با ما» page template: a welcoming head with the quickest ways in, the page's form (attached in Pages
 * admin, built in «فرم‌ها و پاسخ‌ها») beside the ways to reach the team, the place on a map band and the homepage's
 * frequent questions. Without a form the channels take the page.
 */
export default async function ContactTemplate({ title, body, form }: { title: string; body: string; form: FormDefinition | null }) {
  const data = await companyData(), { site, contact, channels } = data
  const questions = (site.sections.find((section) => section.kind === 'faq' && section.enabled)?.items || []).slice(0, 6)
  const quick = channels.filter((channel) => channel.icon === 'phone' || channel.icon === 'mail').slice(0, 2)
  return <div className={`container ${styles.contact}`}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.badge}><i aria-hidden="true" />پاسخ‌گوی شما هستیم</span>
        <h1>{title}</h1>
        {body ? <div className={`prose ${styles.intro}`} dangerouslySetInnerHTML={{ __html: body }} /> : <p className={styles.intro}>پرسش، پیشنهاد یا درخواستی دارید؟ پیام بفرستید یا از راه‌های زیر با {site.brand} در تماس باشید.</p>}
        <div className={styles.quick}>
          {quick.map((channel) => <a key={channel.label} href={channel.href} className={styles.quickLink}><NavigationIcon name={channel.icon} size={18} /><span><small>{channel.label}</small><bdi>{channel.value}</bdi></span></a>)}
          {contact.hours && <span className={styles.quickHours}><NavigationIcon name="clock" size={18} /><span><small>ساعت پاسخ‌گویی</small>{contact.hours}</span></span>}
        </div>
      </div>
      <div className={styles.heroArt} aria-hidden="true"><span><NavigationIcon name="mail" size={34} /></span><span><NavigationIcon name="chat" size={30} /></span><span><NavigationIcon name="phone" size={28} /></span></div>
    </header>

    <div className={styles.grid}>
      <section className={styles.formCard} aria-labelledby="contact-form-title">
        <header><span className={shared.eyebrow}>فرم تماس</span><h2 id="contact-form-title">پیام خود را بفرستید</h2><p>{form?.description || `پیام شما مستقیم به تیم ${site.brand} می‌رسد و پاسخ را از همین راه دریافت می‌کنید.`}</p></header>
        {form ? <PublicForm form={form} /> : <p className={styles.noForm}>فرم تماس هنوز به این صفحه وصل نشده است؛ تا آن زمان از <Link href="/dashboard/tickets">مرکز پشتیبانی</Link> یا راه‌های ارتباطی کنار صفحه استفاده کنید.</p>}
      </section>
      <aside className={styles.side} aria-labelledby="contact-channels-title">
        <h2 id="contact-channels-title">راه‌های ارتباط</h2>
        <Channels channels={channels} layout="stack" />
      </aside>
    </div>

    <Location data={data} size="band" headingId="contact-location-title" />

    {questions.length > 0 && <section className={shared.block} aria-labelledby="contact-faq-title">
      <header className={shared.blockHead}><span className={shared.eyebrow}>پیش از ارسال پیام</span><h2 id="contact-faq-title">پرسش‌های پرتکرار</h2></header>
      <div className={styles.faq}>{questions.map((question, index) => <details key={index}><summary><NavigationIcon name={question.icon || 'chat'} size={18} /><span>{question.title.fa}</span></summary><p>{question.text.fa}</p></details>)}</div>
    </section>}
  </div>
}
