'use client'
import Link from '@/components/AppLink'
import s from '@/components/hosting/workspace/cloud-financial.module.css'
export default function Error({reset}:{error:Error&{digest?:string};reset:()=>void}){return <section className={s.notice} role="alert"><span className={s.eyebrow}>ابر موبوکام</span><h1>دریافت صفحه انجام نشد</h1><p>سرویس‌های شما حفظ شده‌اند. چند لحظه بعد دوباره تلاش کنید.</p><button type="button" className="btn btn-primary" onClick={reset}>تلاش دوباره</button><Link href="/cloud/dashboard">بازگشت به پیشخوان ابری</Link></section>}
