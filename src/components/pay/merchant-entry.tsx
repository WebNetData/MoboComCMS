import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { merchantPortalAccess } from '@/modules/billing/server/pay'
import Dashboard from './Dashboard'
import s from './Pay.module.css'
const gateCopy = {
  GUEST: ['ورود به فضای پذیرندگان', 'با حساب موبوکامِ معرفی‌شده به مدیریت وارد شوید. دسترسی این پنل پس از تأیید پذیرندگی صادر می‌شود.'],
  PENDING: ['پذیرندگی در انتظار تأیید', 'اطلاعات پذیرندگی شما ثبت شده و برای شروع دریافت وجه به تأیید مدیریت نیاز دارد.'],
  SUSPENDED: ['دسترسی پذیرندگی متوقف شده', 'برای پیگیری وضعیت پذیرندگی با مدیریت تماس بگیرید. سوابق پرداخت و تسویه حفظ شده‌اند.'],
  DENIED: ['دسترسی پذیرندگی فعال نیست', 'این بخش فقط برای پذیرندگان معرفی‌شده توسط مدیریت در دسترس است.'],
} as const

export default async function MerchantEntry({ view = 'overview' }: { view?: string }) {
  await requireModule('mobocom-pay')
  const req = new NextRequest(new URL('/pay/merchant', process.env.NEXTAUTH_URL || 'http://localhost'), { headers: new Headers(await headers()) })
  const access = await merchantPortalAccess(req)
  if (access.status === 'ACTIVE') return <Dashboard initialView={view} />
  const [title, description] = gateCopy[access.status]
  return <section className={s.page}><article className={`${s.card} ${s.stack}`}>
    <span className={s.eyebrow}>پنل خصوصی پذیرندگان</span><h1>{title}</h1><p>{description}</p>
    <div className={s.actions}><Link className={s.button} href={access.status === 'GUEST' ? '/login?next=%2Fpay%2Fmerchant' : '/dashboard'}>{access.status === 'GUEST' ? 'ورود با حساب موبوکام' : 'بازگشت به حساب موبوکام'}</Link></div>
  </article></section>
}
