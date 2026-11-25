import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import s from './pay-public.module.css'
const gates = {
  GUEST: ['ورود به فضای پذیرندگان', 'پس از ورود با حساب موبوکام می‌توانید درخواست پذیرندگی ثبت کنید.'],
  DENIED: ['دسترسی پذیرندگی فعال نیست', 'برای شروع، درخواست پذیرندگی خود را ثبت کنید.'],
  PENDING: ['درخواست در انتظار بررسی است', 'اطلاعات شما ثبت شده است. فعال‌سازی پذیرندگی پس از بررسی مدیریت انجام می‌شود.'],
  SUSPENDED: ['دسترسی پذیرندگی متوقف شده است', 'برای پیگیری وضعیت با مدیریت تماس بگیرید. سوابق پرداخت و تسویه حفظ شده‌اند.'],
} as const
export function PayRestricted({ status }: { status: keyof typeof gates }) {
  const [title, description] = gates[status]
  return <main className={s.wrap} dir="rtl"><div className={s.gate}><Link href="/pay" className={s.brand}>MoboCom Pay <span>موبوکام‌پی</span></Link><div className={s.accessMark} aria-hidden="true"><Icon name="shield" size={28} /></div><p className={s.kicker}>فضای پذیرندگان</p><p className={s.accessCaption}>دسترسی فقط برای پذیرندگان مجاز است</p><h1>{title}</h1><p>{description}</p><div className={s.actions}><Link className={s.primary} href={status === 'GUEST' ? '/login?next=%2Fpay%2Fapply' : status === 'DENIED' ? '/pay/apply' : '/pay'}>{status === 'GUEST' ? 'ورود و ثبت درخواست' : status === 'DENIED' ? 'درخواست پذیرندگی' : 'صفحه موبوکام‌پی'}</Link></div></div></main>
}
