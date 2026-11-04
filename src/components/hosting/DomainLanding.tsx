import Icon from '@/components/site/Icon'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import DomainSearch from '@/components/hosting/DomainSearch'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { publicTlds } from '@/modules/hosting/server/domains'
import './hosting.css'
import './domains.css'

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')

const STEPS = [
  { icon: 'search', title: 'جست‌وجو کنید', text: 'نام دلخواه را بنویسید؛ همهٔ پسوندهای پرطرفدار یک‌جا بررسی می‌شوند.' },
  { icon: 'wallet', title: 'پرداخت کنید', text: 'از کیف پول یا درگاه؛ اگر ثبت نشد، مبلغ کامل به کیف پول برمی‌گردد.' },
  { icon: 'globe', title: 'مدیریت کنید', text: 'نیم‌سرورها، تمدید خودکار و انتقال، همه از داشبورد خودتان.' },
]
const FAQS: [string, string][] = [
  ['دامنهٔ .ir چه چیزی لازم دارد؟', 'دامنه‌های ایرانی به نام شناسهٔ ایرنیک (NIC handle) ثبت می‌شوند. شناسه را رایگان در سایت nic.ir بسازید و هنگام سفارش وارد کنید.'],
  ['چقدر طول می‌کشد تا دامنه فعال شود؟', 'دامنه‌های بین‌المللی معمولاً چند دقیقه تا چند ساعت و دامنه‌های .ir پس از تأیید ایرنیک فعال می‌شوند. وضعیت در داشبورد شما نمایش داده می‌شود.'],
  ['اگر دامنه ثبت نشد چه می‌شود؟', 'اگر دامنه پیش از ثبت توسط شخص دیگری گرفته شود یا رجیستری نپذیرد، سفارش لغو و تمام مبلغ به کیف پول شما برمی‌گردد.'],
  ['تمدید دامنه چطور است؟', 'پیش از انقضا یادآوری می‌گیرید و می‌توانید تمدید خودکار از کیف پول را روشن کنید تا دامنه هیچ‌وقت از دست نرود.'],
]

/** The public domain page (/domains): search first, then the price list of every extension. */
export default async function DomainLanding() {
  const [tlds, locale, theme, navPages, viewer] = await Promise.all([publicTlds(), getServerLocale(), getServerTheme(), getPublicNavigationPages(), getViewer()])
  const cheapest = tlds.length ? Math.min(...tlds.map((tld) => tld.register)) : 0
  return <>
    <ThemeHeader context={{ route: 'other' }} theme={theme} locale={locale} navPages={navPages} />
    <main className="hx-page dx-page" dir="rtl">
      <section className="hx-hero dx-hero">
        <div className="hx-hero-sky" aria-hidden="true"><span /><span /><span /></div>
        <div className="container dx-hero-inner">
          <span className="hx-eyebrow"><span className="hx-live" aria-hidden="true" />ثبت و انتقال دامنه</span>
          <h1>نام برندت را <span className="hx-accent">همین حالا</span> ثبت کن</h1>
          <p className="hx-lead">دامنه‌های ایرانی و بین‌المللی{cheapest ? ` از سالانه ${nf(cheapest)} تومان` : ''}؛ جست‌وجوی هم‌زمان روی همهٔ پسوندها، پرداخت از کیف پول و مدیریت کامل از داشبورد.</p>
          {tlds.length ? <DomainSearch signedIn={Boolean(viewer.userId)} /> : <div className="hx-soon"><h2>فروش دامنه به‌زودی</h2><p>پسوندها در حال آماده‌سازی‌اند.</p></div>}
          {tlds.length > 0 && <ul className="dx-chips" aria-label="پسوندهای پرطرفدار">{tlds.filter((tld) => tld.featured).slice(0, 8).map((tld) => <li key={tld.suffix}><b dir="ltr">.{tld.suffix}</b><span className="num">{nf(tld.register)}</span></li>)}</ul>}
        </div>
      </section>

      <section className="container hx-section" aria-labelledby="dx-steps-title">
        <header className="hx-section-head"><h2 id="dx-steps-title">سه قدم تا دامنهٔ خودت</h2></header>
        <ol className="dx-steps">{STEPS.map((step, index) => <li key={step.title} style={{ ['--i' as string]: index }}><span className="hx-feature-icon"><Icon name={step.icon} size={22} /></span><b>{step.title}</b><p>{step.text}</p></li>)}</ol>
      </section>

      {tlds.length > 0 && <section className="container hx-section" aria-labelledby="dx-prices-title">
        <header className="hx-section-head"><h2 id="dx-prices-title">قیمت همهٔ پسوندها</h2><p>به تومان، برای یک سال. قیمت تمدید هنگام سفارش ثابت می‌ماند.</p></header>
        <div className="dx-table-wrap" tabIndex={0} role="region" aria-label="جدول قیمت پسوندها"><table className="dx-table">
          <thead><tr><th>پسوند</th><th>ثبت</th><th>تمدید</th><th>انتقال</th><th>مدت</th></tr></thead>
          <tbody>{tlds.map((tld) => <tr key={tld.suffix} className={tld.featured ? 'is-featured' : ''}>
            <td><b dir="ltr">.{tld.suffix}</b>{tld.needsHandle && <small>شناسهٔ ایرنیک</small>}</td>
            <td className="num">{nf(tld.register)}</td>
            <td className="num">{nf(tld.renew)}</td>
            <td className="num">{tld.transfer ? nf(tld.transfer) : '—'}</td>
            <td>{tld.years.map((y) => nf(y)).join('، ')} سال</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      <section className="container hx-section hx-faq" aria-labelledby="dx-faq-title">
        <header className="hx-section-head"><h2 id="dx-faq-title">پرسش‌های پرتکرار</h2></header>
        {FAQS.map(([question, answer]) => <details key={question}><summary>{question}<Icon name="chevron" size={18} /></summary><p>{answer}</p></details>)}
      </section>
    </main>
    <ThemeFooter context={{ route: 'other' }} locale={locale} navPages={navPages} />
  </>
}
