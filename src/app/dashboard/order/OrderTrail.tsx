export default function OrderTrail({ step = 1 }: { step?: 1 | 2 | 3 }) {
  return <ol className="do-trail" aria-label="مراحل سفارش">{['انتخاب سرویس', 'اطلاعات و پرداخت', 'پیگیری در حساب شما'].map((label, index) => <li key={label} aria-current={index + 1 === step ? 'step' : undefined}><span aria-hidden="true">{(index + 1).toLocaleString('fa-IR')}</span>{label}</li>)}</ol>
}
