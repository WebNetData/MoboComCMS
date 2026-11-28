import type { PayCheckout } from '@/modules/billing/domain/pay'
import s from '../Pay.module.css'

export default function CheckoutResult({ data, refresh }: { data: PayCheckout; refresh: () => void }) {
  const status = data.botDelivery?.status
  let message = 'نتیجه در سامانه ثبت شد؛ فروشنده پس از بررسی نتیجه، سفارش را تحویل می‌دهد.'
  if (status === 'SENT') message = 'تأیید سفارش در ربات ثبت شده است. وضعیت سفارش را در همان ربات بررسی کنید.'
  else if (status === 'UNKNOWN' || status === 'BLOCKED') message = 'وجه تأیید شده است؛ ارسال نتیجه به ربات نیاز به بررسی دارد. دوباره پرداخت نکنید.'
  else if (status) message = 'تأیید سفارش برای ربات ارسال می‌شود؛ نیازی به پرداخت دوباره نیست.'
  return <section className={s.notice} role="status">
    <h2>پرداخت شما تأیید شد.</h2><p>{message}</p>
    <div className={s.actions}>
      {!status && data.returnUrl && <a className={s.button} href={data.returnUrl} rel="noreferrer">بازگشت به فروشنده</a>}
      <button className={s.secondary} type="button" onClick={refresh}>بررسی دوبارهٔ نتیجه</button>
    </div>
  </section>
}
