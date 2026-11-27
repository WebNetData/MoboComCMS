import Link from '@/components/AppLink'
import s from '@/components/hosting/workspace/cloud-financial.module.css'

export default function NotFound() {
  return <section className={s.notice} dir="rtl">
    <h1>صفحه در پنل ابری پیدا نشد</h1>
    <p>نشانی را بررسی کنید یا از منوی پنل به بخش موردنظر بروید.</p>
    <Link href="/cloud/dashboard" className="btn btn-primary">بازگشت به پیشخوان ابری</Link>
  </section>
}
