import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { getModuleSettings, requireModule } from '@/extensions/server/modules'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import s from '@/components/pay/pay-public.module.css'
import PayPublicChrome from '@/components/pay/public-chrome'
import { toPublicPath } from '@/platform/routing/aliases'
export async function generateMetadata() { return withSectionSeo('mobocom-pay', { title: 'موبوکام‌پی', description: 'ابزار دریافت و مدیریت پرداخت برای کسب‌وکارها', alternates:{canonical:toPublicPath('/pay')} }) }
export default async function Page() {
  await requireModule('mobocom-pay')
  const settings = await getModuleSettings('mobocom-pay')
  const title = typeof settings['public.title'] === 'string' && settings['public.title'].trim() || 'پرداخت‌های کسب‌وکار، در یک مسیر روشن'
  const description = typeof settings['public.description'] === 'string' && settings['public.description'].trim() || 'موبوکام‌پی به کسب‌وکار شما کمک می‌کند دریافت‌ها، پرداخت‌ها و درخواست‌های تسویه را در فضای پذیرندگان دنبال کنید.'
  return <PayPublicChrome><main className={s.wrap} dir="rtl"><div className={s.inner}>
    <header className={s.header}><span className={s.brand}>MoboCom Pay <span>موبوکام‌پی</span></span><Link href="/pay/merchant">ورود پذیرندگان ←</Link></header>
    <section className={s.hero}><div><p className={s.kicker}>راهکار پرداخت برای کسب‌وکار</p><h1>{title}</h1><p className={s.lead}>{description}</p><div className={s.actions}>{settings['public.applications-enabled'] !== false && <Link className={s.primary} href="/pay/apply">درخواست پذیرندگی</Link>}<a className={s.secondary} href="#services">آشنایی با خدمات</a></div><p className={s.hint}>فعال‌سازی پذیرندگی پس از بررسی مدیریت انجام می‌شود</p></div><div className={s.visual} aria-hidden="true">
      <div className={s.visualTop}><span>فضای پرداخت کسب‌وکار</span><span dir="ltr">MoboCom Pay <i /></span></div>
      <div className={s.previewLayout}>
        <div className={s.previewCard}>
          <div className={s.previewHead}><span className={s.previewIcon}><Icon name="external" size={20} /></span><span><b>درخواست پرداخت</b><small>نمای نمونه</small></span><span className={s.previewDots}>•••</span></div>
          <div className={s.previewAmount}><small>مبلغ درخواست</small><strong>۱٬۲۵۰٬۰۰۰ <em>تومان</em></strong></div>
          <div className={s.previewRow}><span>بابت</span><b>سفارش فروشگاه</b></div>
          <div className={s.previewRow}><span>وضعیت</span><b className={s.previewStatus}>در انتظار پرداخت</b></div>
          <div className={s.previewButton}>مشاهده درخواست <Icon name="arrow" size={16} /></div>
        </div>
        <div className={s.previewSide}><span className={s.previewSideIcon}><Icon name="check" size={20} /></span><b>همه چیز در یک مسیر</b><p>از دریافت پرداخت تا پیگیری در پنل پذیرندگان</p><div className={s.previewTags}><span>وب‌سایت</span><span>شبکه‌های اجتماعی</span><span>ربات</span></div></div>
      </div>
      <div className={s.visualFoot}><span>موبوکام‌پی</span><span>تصویری از تجربه پرداخت</span></div>
    </div></section>
    <section id="services" className={s.services}><div><p className={s.kicker}>برای شیوه‌های مختلف فروش</p><h2>پرداخت در کنار کسب‌وکار شما</h2></div><div className={s.grid}><article><b>۰۱</b><h3>وب‌سایت</h3><p>پایانه‌ای برای مسیر پرداخت و پیگیری تراکنش‌های کسب‌وکار آنلاین.</p></article><article><b>۰۲</b><h3>اینستاگرام و کانال</h3><p>مدیریت مسیر دریافت برای فروش از شبکه‌های اجتماعی و کانال‌ها.</p></article><article><b>۰۳</b><h3>ربات</h3><p>اتصال ربات به پایانه و پیگیری عملیات از فضای پذیرندگان.</p></article><article><b>۰۴</b><h3>گزارش و تسویه</h3><p>مشاهده پرداخت‌ها و ثبت درخواست تسویه در پنل پذیرندگان.</p></article></div></section>
    <section className={s.process}><p className={s.kicker}>مسیر شروع</p><h2>از درخواست تا مدیریت پرداخت</h2><ol><li><b>۱</b><div><h3>ثبت درخواست</h3><p>با حساب موبوکام اطلاعات کسب‌وکار خود را ثبت کنید.</p></div></li><li><b>۲</b><div><h3>بررسی مدیریت</h3><p>درخواست بررسی می‌شود و فعال‌سازی به تأیید مدیریت نیاز دارد.</p></div></li><li><b>۳</b><div><h3>ورود به پنل</h3><p>پس از فعال‌سازی، پرداخت‌ها و درخواست‌های تسویه را پیگیری کنید.</p></div></li></ol></section>
    <section className={s.faq}><p className={s.kicker}>پرسش‌های متداول</p><h2>پیش از شروع</h2><details><summary>آیا ثبت درخواست به معنی فعال شدن درگاه است؟</summary><p>خیر. درخواست ابتدا توسط مدیریت بررسی می‌شود و دسترسی پس از تأیید فعال می‌شود.</p></details><details><summary>شرایط و کارمزد چگونه تعیین می‌شود؟</summary><p>شرایط پذیرندگی و کارمزد برای هر پذیرنده در پنل مدیریت تنظیم می‌شود. برای آگاهی از شرایط کسب‌وکار خود با مدیریت تماس بگیرید.</p></details><details><summary>آیا امکان اتصال فنی وجود دارد؟</summary><p>پذیرندگان فعال می‌توانند از پایانه و API موجود، مطابق تنظیمات و دسترسی‌های حساب خود استفاده کنند.</p></details></section>
  </div></main></PayPublicChrome>
}
