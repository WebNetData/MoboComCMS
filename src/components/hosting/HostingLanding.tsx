import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import HostingCatalog from '@/components/hosting/HostingCatalog'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { publicHostingCatalog } from '@/modules/hosting/server/catalog'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { getViewer } from '@/modules/membership/server/membership'
import { BASE_CURRENCY } from '@/shared/money'
import { getModuleSettings } from '@/extensions/server/modules'
import { hourlyMinHours } from '@/modules/hosting/domain/services'
import type { HostingGroup } from '@/modules/hosting/domain/catalog'
import './hosting.css'

const COPY: Record<HostingGroup, {
  eyebrow: string; title: string; accent: string; lead: string; other: { href: string; label: string }
  features: { icon: string; title: string; text: string }[]; faqs: [string, string][]
}> = {
  hosting: {
    eyebrow: 'میزبانی وب',
    title: 'سایتت را روی',
    accent: 'زیرساختی سریع و امن',
    lead: 'هاست اشتراکی، نمایندگی و هاست ابری روی دیسک NVMe، با کنترل‌پنل حرفه‌ای و مدیریت کامل از حساب کاربری خودت.',
    other: { href: '/servers', label: 'سرور مجازی و ابری' },
    features: [
      { icon: 'layout', title: 'کنترل‌پنل حرفه‌ای', text: 'cPanel، DirectAdmin و پنل‌های دیگر؛ با یک کلیک از داشبورد وارد شوید.' },
      { icon: 'lock', title: 'SSL و امنیت', text: 'گواهی امنیتی، جداسازی حساب‌ها و نسخهٔ پشتیبان منظم.' },
      { icon: 'wallet', title: 'پرداخت منعطف', text: 'ماهانه، سه‌ماهه، شش‌ماهه یا سالانه؛ تمدید خودکار از کیف پول اگر بخواهید.' },
      { icon: 'chart', title: 'مصرف زیر نظر', text: 'فضا، ترافیک و منابع سرویس را در داشبورد خودتان ببینید.' },
      { icon: 'users', title: 'نمایندگی', text: 'هاست مشتریانتان را با برند خودتان بفروشید و مدیریت کنید.' },
      { icon: 'lifebuoy', title: 'پشتیبانی واقعی', text: 'تیکت از همان داشبورد، کنار سرویس و فاکتورهایتان.' },
    ],
    faqs: [
      ['هاست بعد از پرداخت کی آماده می‌شود؟', 'سرویس‌هایی که به کنترل‌پنل متصل‌اند بلافاصله بعد از پرداخت ساخته می‌شوند و اطلاعات ورود در داشبورد شما نمایش داده می‌شود.'],
      ['می‌توانم پلن را بعداً ارتقا بدهم؟', 'بله؛ ارتقا به پلن بالاتر از داشبورد درخواست می‌شود.'],
      ['هاست ابری با هاست اشتراکی چه فرقی دارد؟', 'هاست ابری منابع تضمین‌شده دارد و می‌توانید ساعتی پرداخت کنید؛ هزینه فقط برای ساعت‌هایی که سرویس دارید از کیف پول کم می‌شود.'],
    ],
  },
  servers: {
    eyebrow: 'سرور مجازی، ابری و اختصاصی',
    title: 'سرور خودت را',
    accent: 'در چند ثانیه بساز',
    lead: 'سرور مجازی، ابری با پرداخت ساعتی و سرور اختصاصی؛ روشن و خاموش، ری‌استارت، نصب دوبارهٔ سیستم‌عامل و کنسول، همه از پنل خودت.',
    other: { href: '/hosting', label: 'هاست و میزبانی وب' },
    features: [
      { icon: 'terminal', title: 'کنترل کامل', text: 'روشن و خاموش، ری‌استارت، ریست، نصب دوباره و کنسول تحت وب.' },
      { icon: 'clock', title: 'پرداخت ساعتی', text: 'سرور ابری را ساعتی بخرید؛ هر وقت حذف کنید، هزینه متوقف می‌شود.' },
      { icon: 'cpu', title: 'منابع اختصاصی', text: 'هستهٔ پردازنده، رم و دیسک NVMe با پورت پرسرعت.' },
      { icon: 'layers', title: 'اسنپ‌شات و بکاپ', text: 'پیش از هر تغییر بزرگ از سرور نسخه بگیرید و برگردید.' },
      { icon: 'globe', title: 'چند موقعیت', text: 'سرور را در دیتاسنتر نزدیک به کاربرانتان انتخاب کنید.' },
      { icon: 'wallet', title: 'یک کیف پول', text: 'سرور، هاست و بقیهٔ خریدها با یک حساب و یک کیف پول.' },
    ],
    faqs: [
      ['پرداخت ساعتی چطور کار می‌کند؟', 'هر ساعت هزینهٔ همان ساعت از کیف پول کم می‌شود. اگر سرور خاموش باشد فقط هزینهٔ دیسک و آی‌پی کم می‌شود و با تمام شدن موجودی، سرور خاموش می‌شود ولی اطلاعات تا مدت مشخصی نگه داشته می‌شود.'],
      ['می‌توانم سیستم‌عامل را عوض کنم؟', 'بله؛ از پنل سرور، سیستم‌عامل دلخواه را انتخاب کنید و سرور دوباره نصب می‌شود. پیش از آن تأیید دوباره خواسته می‌شود چون اطلاعات پاک می‌شود.'],
      ['فرق سرور ابری و مجازی چیست؟', 'سرور ابری ساعتی یا دوره‌ای خریده می‌شود و منابعش سریع تغییر می‌کند؛ سرور مجازی دوره‌ای است و برای کارهای پایدار و طولانی مناسب است.'],
    ],
  },
}

/** The public page of web hosting (/hosting) or servers and cloud (/servers). */
export default async function HostingLanding({ group }: { group: HostingGroup }) {
  const [products, locale, theme, navPages, viewer] = await Promise.all([publicHostingCatalog(group), getServerLocale(), getServerTheme(), getPublicNavigationPages(), getViewer()])
  const [gateways, settings] = await Promise.all([checkoutGatewayOptions(products[0]?.currency || BASE_CURRENCY).catch(() => []), getModuleSettings('hosting').catch(() => ({}))])
  const copy = COPY[group]
  const from = products.flatMap((product) => product.prices.filter((price) => price.cycle !== 'HOURLY').map((price) => price.monthly)).filter((value) => value > 0)
  const cheapest = from.length ? Math.min(...from) : 0

  return <>
    <ThemeHeader context={{ route: 'other' }} theme={theme} locale={locale} navPages={navPages} />
    <main className={`hx-page hx-${group}`} dir="rtl">
      <section className="hx-hero">
        <div className="hx-hero-sky" aria-hidden="true"><span /><span /><span /></div>
        <div className="container hx-hero-inner">
          <div className="hx-hero-copy">
            <span className="hx-eyebrow"><span className="hx-live" aria-hidden="true" />{copy.eyebrow}</span>
            <h1>{copy.title} <span className="hx-accent">{copy.accent}</span></h1>
            <p className="hx-lead">{copy.lead}</p>
            <div className="hx-hero-cta">
              <a className="btn btn-primary" href="#plans">{cheapest ? `شروع از ماهانه ${cheapest.toLocaleString('fa-IR')} تومان` : 'مشاهدهٔ پلن‌ها'}</a>
              <Link className="btn btn-ghost" href={copy.other.href}>{copy.other.label}</Link>
            </div>
          </div>
          <div className="hx-rack" aria-hidden="true">
            {[0, 1, 2, 3].map((row) => <div key={row} className="hx-unit" style={{ ['--r' as string]: row }}>
              <span className="hx-led" /><span className="hx-led" /><span className="hx-bays"><i /><i /><i /><i /><i /><i /></span>
            </div>)}
            <div className="hx-panel">
              <div className="hx-panel-head"><Icon name={group === 'servers' ? 'terminal' : 'server'} size={16} /> {group === 'servers' ? 'server-01' : 'my-site.ir'}<span className="hx-pill">فعال</span></div>
              <div className="hx-meter"><span>CPU</span><b style={{ ['--v' as string]: '38%' }} /></div>
              <div className="hx-meter"><span>RAM</span><b style={{ ['--v' as string]: '62%' }} /></div>
              <div className="hx-meter"><span>DISK</span><b style={{ ['--v' as string]: '24%' }} /></div>
              <svg className="hx-spark" viewBox="0 0 120 32" preserveAspectRatio="none"><path d="M0 24 L12 20 L24 22 L36 12 L48 16 L60 8 L72 14 L84 6 L96 12 L108 4 L120 10" /></svg>
            </div>
          </div>
        </div>
      </section>

      <section className="container hx-section" id="plans" aria-labelledby="hx-plans-title">
        <header className="hx-section-head"><h2 id="hx-plans-title">پلن مناسبت را انتخاب کن</h2><p>دورهٔ پرداخت را عوض کن تا قیمت و صرفه‌جویی هر دوره را ببینی.</p></header>
        <HostingCatalog products={products} gateways={gateways} signedIn={Boolean(viewer.userId)} minHours={hourlyMinHours(settings)} />
      </section>

      <section className="container hx-section" aria-labelledby="hx-why-title">
        <header className="hx-section-head"><h2 id="hx-why-title">همه‌چیز از پنل خودت</h2><p>یک حساب، یک داشبورد؛ سرویس‌ها، فاکتورها، کیف پول و پشتیبانی کنار هم.</p></header>
        <div className="hx-feature-grid">{copy.features.map((feature, index) => <article key={feature.title} className="hx-feature" style={{ ['--i' as string]: index }}>
          <span className="hx-feature-icon"><Icon name={feature.icon} size={22} /></span>
          <h3>{feature.title}</h3>
          <p>{feature.text}</p>
        </article>)}</div>
      </section>

      <section className="container hx-section hx-faq" aria-labelledby="hx-faq-title">
        <header className="hx-section-head"><h2 id="hx-faq-title">پرسش‌های پرتکرار</h2></header>
        {copy.faqs.map(([question, answer]) => <details key={question}><summary>{question}<Icon name="chevron" size={18} /></summary><p>{answer}</p></details>)}
      </section>
    </main>
    <ThemeFooter context={{ route: 'other' }} locale={locale} navPages={navPages} />
  </>
}
