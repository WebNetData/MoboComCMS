import Link from '@/components/AppLink'
import { getModuleSettings, requireModule } from '@/extensions/server/modules'
import { requestMerchantAccess } from '@/components/pay/merchant-entry'
import { PayRestricted } from '@/components/pay/pay-public'
import PayApplication from '@/components/pay/pay-application'
import s from '@/components/pay/pay-public.module.css'
import PayPublicChrome from '@/components/pay/public-chrome'
export const metadata = { title: 'درخواست پذیرندگی موبوکام‌پی', robots: { index: false, follow: false } }
export default async function Page() {
  await requireModule('mobocom-pay')
  const [access, settings] = await Promise.all([requestMerchantAccess(), getModuleSettings('mobocom-pay')])
  if (access.status === 'GUEST' || access.status === 'PENDING' || access.status === 'SUSPENDED') return <PayRestricted status={access.status} />
  return <PayPublicChrome><main className={s.wrap} dir="rtl"><div className={s.gate}><Link className={s.brand} href="/pay">MoboCom Pay <span>موبوکام‌پی</span></Link><p className={s.kicker}>درخواست پذیرندگی</p><h1>{access.status === 'ACTIVE' ? 'پذیرندگی شما فعال است' : 'درباره کسب‌وکارتان بگویید'}</h1>{access.status === 'ACTIVE' ? <Link className={s.primary} href="/pay/merchant">ورود به پنل پذیرندگان</Link> : settings['public.applications-enabled'] === false ? <p>ثبت درخواست پذیرندگی فعلاً بسته است.</p> : <><p>درخواست شما بررسی می‌شود و فعال‌سازی به تأیید مدیریت نیاز دارد.</p><PayApplication /></>}</div></main></PayPublicChrome>
}
