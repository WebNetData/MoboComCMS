import type { PayCheckout } from '@/modules/billing/domain/pay'
import s from '../Pay.module.css'

export default function CheckoutProgress({ data }: { data: PayCheckout }) {
  const current = data.status === 'PAID' ? 3 : data.verification.verified ? 2 : 1
  const steps = ['تأیید شماره', 'پرداخت', 'نتیجه']
  return <ol className={s.checkoutProgress} aria-label="مراحل پرداخت">{steps.map((label, index) => <li key={label} data-complete={index + 1 < current || data.status === 'PAID'} aria-current={index + 1 === current ? 'step' : undefined}><span aria-hidden="true">{(index + 1).toLocaleString('fa-IR')}</span><strong>{label}</strong></li>)}</ol>
}
