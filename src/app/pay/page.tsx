import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { getModuleSettings, requireModule } from '@/extensions/server/modules'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'
import PayPublicChrome from '@/components/pay/public-chrome'
import s from '@/components/pay/PayLanding.module.css'

export async function generateMetadata() {
  return withSectionSeo('mobocom-pay', {
    title: 'موبوکام‌پی',
    description: 'ابزار دریافت و مدیریت پرداخت برای کسب‌وکارها',
    alternates: { canonical: toPublicPath('/pay') },
  })
}

const services = [
  { icon: 'globe', title: 'وب‌سایت', description: 'برای فروشگاه آنلاین خود پایانه بسازید و وضعیت پرداخت‌ها را در پنل ببینید.' },
  { icon: 'link', title: 'شبکه‌های اجتماعی', description: 'برای فروش در شبکه‌های اجتماعی و کانال‌ها لینک پرداخت بسازید و ارسال کنید.' },
  { icon: 'plug', title: 'ربات', description: 'ربات فروش را به پایانه متصل کنید و نتیجهٔ پرداخت هر سفارش را پیگیری کنید.' },
  { icon: 'chart', title: 'گزارش و تسویه', description: 'دریافت‌ها را بررسی کنید و درخواست تسویه را از داشبورد پذیرندگان ثبت کنید.' },
] as const

const steps = [
  { title: 'ثبت درخواست', description: 'با حساب موبوکام اطلاعات کسب‌وکار خود را ثبت کنید.' },
  { title: 'بررسی درخواست', description: 'تیم موبوکام درخواست و شرایط پذیرندگی شما را بررسی می‌کند.' },
  { title: 'ورود به پنل', description: 'پس از فعال‌سازی، پرداخت‌ها و تسویه‌های خود را در پنل مدیریت کنید.' },
] as const

const questions = [
  { title: 'آیا ثبت درخواست به معنی فعال شدن درگاه است؟', description: 'درخواست ابتدا بررسی می‌شود و دسترسی پس از تأیید مدیریت فعال می‌شود.' },
  { title: 'شرایط و کارمزد چگونه تعیین می‌شود؟', description: 'شرایط پذیرندگی و کارمزد برای هر پذیرنده تنظیم می‌شود. برای آگاهی از شرایط کسب‌وکار خود با مدیریت تماس بگیرید.' },
  { title: 'آیا امکان اتصال فنی وجود دارد؟', description: 'پذیرندگان فعال می‌توانند از پایانه و API، مطابق تنظیمات و دسترسی‌های حساب خود استفاده کنند.' },
] as const

function PaymentPreview() {
  return <figure className={s.preview}>
    <figcaption className={s.previewBar}><bdi>MoboCom Pay</bdi><span>نمونهٔ پنل پرداخت</span></figcaption>
    <div className={s.previewGrid}>
      <div className={s.exampleInvoice}>
        <div className={s.invoiceHeading}><span className={s.invoiceIcon}><Icon name="receipt" /></span><strong>درخواست پرداخت</strong></div>
        <dl className={s.invoiceDetails}>
          <div className={s.invoiceAmount}><dt>مبلغ درخواست</dt><dd>۱٬۲۵۰٬۰۰۰ <small>تومان</small></dd></div>
          <div><dt>بابت</dt><dd>سفارش فروشگاه</dd></div>
          <div><dt>وضعیت</dt><dd className={s.invoiceStatus}><Icon name="clock" size={15} />در انتظار پرداخت</dd></div>
        </dl>
      </div>
      <ul className={s.previewFlow}>
        <li><span><Icon name="link" size={19} /></span>ساخت لینک</li>
        <li><span><Icon name="card" size={19} /></span>دریافت پرداخت</li>
        <li><span><Icon name="chart" size={19} /></span>گزارش و تسویه</li>
      </ul>
    </div>
  </figure>
}

export default async function Page() {
  await requireModule('mobocom-pay')
  const settings = await getModuleSettings('mobocom-pay')
  const title = typeof settings['public.title'] === 'string' && settings['public.title'].trim() || 'پرداخت‌های کسب‌وکار، در یک مسیر روشن'
  const description = typeof settings['public.description'] === 'string' && settings['public.description'].trim() || 'با موبوکام‌پی لینک پرداخت بسازید، تراکنش‌ها را پیگیری کنید و تسویه‌ها را در داشبورد پذیرندگان مدیریت کنید.'
  const applicationsEnabled = settings['public.applications-enabled'] !== false

  return <PayPublicChrome>
    <main className={s.landing} dir="rtl">
      <div className={s.frame}>
        <div className={s.localHeader}><bdi className={s.brand}><Icon name="card" size={19} /> MoboCom Pay</bdi><a href="#services">امکانات</a></div>
        <section className={s.hero} aria-labelledby="pay-title">
          <div className={s.intro}>
            <h1 id="pay-title">{title}</h1>
            <p>{description}</p>
            <div className={s.actions}>
              <Link className={s.dashboardLink} href="/pay/merchant"><Icon name="grid" size={20} />داشبورد پذیرندگان<Icon name="arrow" size={18} /></Link>
              {applicationsEnabled && <Link className={s.applyLink} href="/pay/apply">درخواست پذیرندگی</Link>}
            </div>
          </div>
          <PaymentPreview />
        </section>
        <section id="services" className={s.services} aria-labelledby="pay-services">
          <h2 id="pay-services">پرداخت در کنار کسب‌وکار شما</h2>
          <div className={s.features}>{services.map(service => <article key={service.icon}>
            <span className={s.serviceIcon}><Icon name={service.icon} size={23} /></span>
            <h3>{service.title}</h3><p>{service.description}</p>
          </article>)}</div>
        </section>
        {applicationsEnabled && <section className={s.start} aria-labelledby="pay-start">
          <h2 id="pay-start">چطور شروع کنید؟</h2>
          <ol>{steps.map(step => <li key={step.title}><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
        </section>}
        <section className={s.faq} aria-labelledby="pay-faq">
          <h2 id="pay-faq">پرسش‌های متداول</h2>
          <div>{questions.map(question => <details key={question.title}>
            <summary>{question.title}<Icon name="chevron" size={18} /></summary>
            <p>{question.description}</p>
          </details>)}</div>
        </section>
      </div>
    </main>
  </PayPublicChrome>
}
