import TicketCenter from '@/components/TicketCenter'
import Icon from '@/components/site/Icon'
import s from './Pay.module.css'
import m from './MerchantShell.module.css'

/** Presentation only: the canonical Support UI, APIs, identity and department permissions remain owners. */
export default function MerchantSupport() {
  return <section className={s.page}>
    <div className={m.supportNotice}><Icon name="ticket" size={24} /><div><strong>پشتیبانی موبوکام‌پی</strong><p>درخواستتان را ثبت کنید و درگاه یا سرویس مرتبط را انتخاب کنید. سوابق و پاسخ‌ها در همین پنل نمایش داده می‌شوند.</p></div></div>
    <TicketCenter workspace="pay" />
  </section>
}
