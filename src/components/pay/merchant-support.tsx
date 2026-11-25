import Link from '@/components/AppLink'
import TicketCenter from '@/components/TicketCenter'
import Icon from '@/components/site/Icon'
import s from './Pay.module.css'
import m from './MerchantShell.module.css'

/** Presentation only: the canonical Support UI, APIs, identity and department permissions remain owners. */
export default function MerchantSupport() {
  return <section className={s.page}>
    <div className={m.supportNotice}><Icon name="ticket" size={24} /><div><strong>پشتیبانی موبوکام‌پی</strong><p>این صفحه همان مرکز تیکت حساب موبوکام شماست؛ سوابق و پاسخ‌ها در هر دو پنل مشترک‌اند. هنگام ثبت درخواست، دپارتمان مناسب را انتخاب و شناسهٔ سفارش یا تسویه را در متن بنویسید.</p><Link href="/dashboard/tickets">مشاهدهٔ مرکز پشتیبانی حساب موبوکام</Link></div></div>
    <TicketCenter />
  </section>
}
