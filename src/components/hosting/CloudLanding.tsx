import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import CloudBar from '@/components/hosting/CloudBar'
import DomainSearch from '@/components/hosting/DomainSearch'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { publicHostingCatalog } from '@/modules/hosting/server/catalog'
import { publicTlds } from '@/modules/hosting/server/domains'
import type { PublicHostingProduct } from '@/modules/hosting/domain/catalog'
import './hosting.css'
import './domains.css'
import './cloud.css'

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')
const lowest = (values: number[]) => { const v = values.filter((n) => n > 0); return v.length ? Math.min(...v) : 0 }
const monthlyFrom = (products: PublicHostingProduct[]) => lowest(products.flatMap((p) => p.prices.filter((price) => price.cycle !== 'HOURLY').map((price) => price.monthly)))
const hourlyFrom = (products: PublicHostingProduct[]) => lowest(products.flatMap((p) => p.prices.filter((price) => price.cycle === 'HOURLY').map((price) => price.amount)))

const FEATURES = [
  { icon: 'wallet', title: 'یک کیف پول برای همه', text: 'هاست، سرور، دامنه و تمدیدها از همان کیف پول و درگاه؛ فاکتورها کنار هم.' },
  { icon: 'clock', title: 'ساعتی یا دوره‌ای', text: 'سرور ابری را ساعتی بخرید یا هر سرویس را ماهانه، سه‌ماهه، شش‌ماهه و سالانه.' },
  { icon: 'terminal', title: 'کنترل کامل', text: 'روشن و خاموش، ری‌استارت، نصب دوباره و اطلاعات ورود، از داشبورد خودتان.' },
  { icon: 'lock', title: 'امن از پایه', text: 'گذرواژه‌ها رمزگذاری‌شده نگه داشته می‌شوند و فقط با ورود شما نمایش داده می‌شوند.' },
  { icon: 'activity', title: 'تمدید بی‌دردسر', text: 'یادآوری پیش از سررسید و تمدید خودکار از کیف پول، اگر بخواهید.' },
  { icon: 'lifebuoy', title: 'پشتیبانی کنار سرویس', text: 'تیکت از همان داشبورد، کنار سرویس‌ها و فاکتورهایتان.' },
]

const FAQS: [string, string][] = [
  ['موبوکام کلاد چیست؟', 'همهٔ سرویس‌های زیرساخت موبوکام در یک جا: هاست و میزبانی وب، سرور مجازی و اختصاصی، سرور ابری ساعتی و ثبت و انتقال دامنه، با یک حساب و یک داشبورد.'],
  ['سرویس‌هایم را کجا مدیریت کنم؟', 'در داشبورد حساب خودتان، بخش «موبوکام کلاد». وضعیت، اطلاعات ورود، تمدید، ارتقا و دامنه‌ها همه همان‌جاست.'],
  ['پرداخت ساعتی چطور است؟', 'سرورهای ابری ساعتی هر ساعت از کیف پول کم می‌شوند و هر وقت حذفشان کنید، هزینه متوقف می‌شود. وقتی سرور خاموش است فقط هزینهٔ دیسک و آی‌پی کم می‌شود.'],
  ['اگر سفارشم انجام نشد چه می‌شود؟', 'اگر سرویس یا دامنه آماده نشود، سفارش لغو و مبلغ به کیف پول شما برمی‌گردد.'],
]

/** MoboCom Cloud (/cloud): every infrastructure product in one place, each linking to its own page. */
export default async function CloudLanding() {
  const [hosting, servers, tlds, locale, theme, navPages, viewer] = await Promise.all([
    publicHostingCatalog('hosting'), publicHostingCatalog('servers'), publicTlds().catch(() => []), getServerLocale(), getServerTheme(), getPublicNavigationPages(), getViewer(),
  ])
  const cloudHourly = hourlyFrom([...servers, ...hosting])
  const domainFrom = lowest(tlds.map((tld) => tld.register))
  const families = [
    { key: 'hosting', href: '/hosting', icon: 'server', title: 'میزبانی وب', text: 'هاست اشتراکی، نمایندگی و هاست ابری با کنترل‌پنل حرفه‌ای.', points: ['cPanel، DirectAdmin و پنل‌های دیگر', 'SSL و نسخهٔ پشتیبان', 'ارتقا و ترافیک اضافه'], price: monthlyFrom(hosting), unit: 'ماهانه', count: hosting.length },
    { key: 'servers', href: '/servers', icon: 'cpu', title: 'سرور مجازی و اختصاصی', text: 'منابع اختصاصی، دسترسی کامل و مدیریت از پنل خودتان.', points: ['دسترسی root و کنسول', 'نصب دوبارهٔ سیستم‌عامل', 'چند موقعیت جغرافیایی'], price: monthlyFrom(servers.filter((p) => !p.hourly)), unit: 'ماهانه', count: servers.filter((p) => !p.hourly).length },
    { key: 'cloud', href: '/servers#plans', icon: 'cloud', title: 'سرور ابری ساعتی', text: 'فقط برای ساعت‌هایی که روشن است بپردازید؛ در چند ثانیه بسازید.', points: ['کسر ساعتی از کیف پول', 'خاموش: فقط دیسک و آی‌پی', 'حذف هر وقت بخواهید'], price: cloudHourly, unit: 'ساعتی', count: [...servers, ...hosting].filter((p) => p.hourly).length },
    { key: 'domains', href: '/domains', icon: 'globe', title: 'دامنه', text: 'ثبت و انتقال دامنه‌های ایرانی و بین‌المللی.', points: ['جست‌وجوی هم‌زمان همهٔ پسوندها', 'تمدید خودکار', 'نیم‌سرور و کد انتقال'], price: domainFrom, unit: 'سالانه', count: tlds.length },
  ]
  const live = families.filter((family) => family.count > 0).length

  return <>
    <ThemeHeader context={{ route: 'other' }} theme={theme} locale={locale} navPages={navPages} />
    <CloudBar active="overview" />
    <main className="hx-page cx-page" dir="rtl">
      <section className="hx-hero cx-hero">
        <div className="hx-hero-sky" aria-hidden="true"><span /><span /><span /></div>
        <div className="container hx-hero-inner">
          <div className="hx-hero-copy">
            <span className="hx-eyebrow"><span className="hx-live" aria-hidden="true" />موبوکام کلاد</span>
            <h1>هاست، سرور و دامنه؛ <span className="hx-accent">همه در یک ابر</span></h1>
            <p className="hx-lead">زیرساخت کسب‌وکارت را از یک جا بخر و مدیریت کن: میزبانی وب، سرور مجازی و اختصاصی، سرور ابری با پرداخت ساعتی و دامنه، با یک حساب، یک کیف پول و یک داشبورد.</p>
            <div className="hx-hero-cta">
              <a className="btn btn-primary" href="#family">انتخاب سرویس</a>
              {tlds.length > 0 && <a className="btn btn-ghost" href="#domain">جست‌وجوی دامنه</a>}
            </div>
            <ul className="cx-proof" aria-label="در موبوکام کلاد">
              <li><Icon name="layers" size={16} />{nf(live || 4)} خانوادهٔ سرویس</li>
              <li><Icon name="wallet" size={16} />یک کیف پول</li>
              <li><Icon name="clock" size={16} />پرداخت ساعتی</li>
            </ul>
          </div>
          <div className="cx-orbit" aria-hidden="true">
            <div className="cx-ring cx-ring-1"><span className="cx-node"><Icon name="server" size={18} /></span></div>
            <div className="cx-ring cx-ring-2"><span className="cx-node"><Icon name="globe" size={18} /></span></div>
            <div className="cx-ring cx-ring-3"><span className="cx-node"><Icon name="cpu" size={18} /></span></div>
            <div className="cx-core"><Icon name="cloud" size={40} /><b>MoboCom Cloud</b></div>
          </div>
        </div>
      </section>

      <section className="container hx-section" id="family" aria-labelledby="cx-family-title">
        <header className="hx-section-head"><h2 id="cx-family-title">هر چه برای آنلاین بودن لازم داری</h2><p>هر سرویس صفحهٔ خودش را دارد؛ از همین‌جا شروع کن.</p></header>
        <div className="cx-family">
          {families.map((family, index) => <Link key={family.key} href={family.href} className={`cx-card cx-${family.key}`} style={{ ['--i' as string]: index }}>
            <span className="cx-card-icon"><Icon name={family.icon} size={24} /></span>
            <h3>{family.title}</h3>
            <p>{family.text}</p>
            <ul>{family.points.map((point) => <li key={point}><Icon name="check" size={14} />{point}</li>)}</ul>
            <span className="cx-card-foot">
              <span className="cx-price">{family.price ? <>از <b>{nf(family.price)}</b> تومان <small>{family.unit}</small></> : family.count ? 'مشاهدهٔ پلن‌ها' : 'به‌زودی'}</span>
              <span className="cx-go" aria-hidden="true"><Icon name="arrow" size={18} /></span>
            </span>
          </Link>)}
        </div>
      </section>

      {tlds.length > 0 && <section className="container hx-section cx-domain" id="domain" aria-labelledby="cx-domain-title">
        <header className="hx-section-head"><h2 id="cx-domain-title">دامنهٔ برندت را پیدا کن</h2><p>{domainFrom ? `ثبت از سالانه ${nf(domainFrom)} تومان؛ ` : ''}همهٔ پسوندها هم‌زمان بررسی می‌شوند.</p></header>
        <DomainSearch signedIn={Boolean(viewer.userId)} />
      </section>}

      <section className="container hx-section" aria-labelledby="cx-flow-title">
        <header className="hx-section-head"><h2 id="cx-flow-title">از انتخاب تا اجرا، در سه قدم</h2></header>
        <ol className="cx-steps">
          <li><span className="cx-step-num">۱</span><b>انتخاب</b><p>پلن یا دامنه را انتخاب کن و دورهٔ پرداخت را مشخص کن.</p></li>
          <li><span className="cx-step-num">۲</span><b>پرداخت</b><p>از کیف پول یا درگاه؛ اگر سرویس آماده نشد، مبلغ برمی‌گردد.</p></li>
          <li><span className="cx-step-num">۳</span><b>مدیریت</b><p>اطلاعات ورود، وضعیت، تمدید و ارتقا در داشبورد «موبوکام کلاد».</p></li>
        </ol>
        <div className="cx-dash" aria-hidden="true">
          <div className="cx-dash-row"><Icon name="server" size={16} /><b dir="ltr">my-site.ir</b><span className="hx-pill">فعال</span></div>
          <div className="cx-dash-row"><Icon name="cpu" size={16} /><b dir="ltr">cloud-01</b><span className="cx-meter"><i style={{ ['--v' as string]: '46%' }} /></span></div>
          <div className="cx-dash-row"><Icon name="globe" size={16} /><b dir="ltr">brand.com</b><span className="cx-chip">تمدید خودکار</span></div>
        </div>
      </section>

      <section className="container hx-section" aria-labelledby="cx-why-title">
        <header className="hx-section-head"><h2 id="cx-why-title">چرا موبوکام کلاد</h2></header>
        <div className="hx-feature-grid">{FEATURES.map((feature, index) => <article key={feature.title} className="hx-feature" style={{ ['--i' as string]: index }}>
          <span className="hx-feature-icon"><Icon name={feature.icon} size={22} /></span>
          <h3>{feature.title}</h3>
          <p>{feature.text}</p>
        </article>)}</div>
      </section>

      <section className="container hx-section hx-faq" aria-labelledby="cx-faq-title">
        <header className="hx-section-head"><h2 id="cx-faq-title">پرسش‌های پرتکرار</h2></header>
        {FAQS.map(([question, answer]) => <details key={question}><summary>{question}<Icon name="chevron" size={18} /></summary><p>{answer}</p></details>)}
      </section>
    </main>
    <ThemeFooter context={{ route: 'other' }} locale={locale} navPages={navPages} />
  </>
}
