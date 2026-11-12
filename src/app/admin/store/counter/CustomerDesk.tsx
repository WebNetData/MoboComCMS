'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import type { CounterCustomer } from '@/modules/store/domain/counter-sales'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { formatMoney } from '@/shared/money'

type Context = { wallets: { currency: string; balanceMinor: string }[]; club: { enabled: boolean; balance: number; tier: string; pointValueToman: number; minRedeem: number }; history: { id: number; kind: string; title: string; channel: string; status: string; statusLabel: string; createdAt: string; href: string }[] }
type Found = CounterCustomer & { firstName: string; lastName: string }
export type Buyer = { firstName: string; lastName: string; phone: string }
export const EMPTY_BUYER: Buyer = { firstName: '', lastName: '', phone: '' }
const CHANNEL: Record<string, string> = { COUNTER: 'حضوری', REPAIR: 'تعمیر' }

/** What the counter will do with this buyer; the sale command creates or links the account in its own transaction. */
export function buyerState(buyer: Buyer, customer: CounterCustomer | null) {
  const phone = normalizeMobile(buyer.phone), named = buyer.firstName.trim().length >= 2 && buyer.lastName.trim().length >= 2
  if (customer) return { kind: 'linked' as const, problem: '' }
  if (!buyer.phone.trim()) return { kind: 'guest' as const, problem: '' }
  if (!phone) return { kind: 'invalid' as const, problem: 'شمارهٔ موبایل را کامل و درست بنویسید' }
  return { kind: 'new' as const, problem: named ? '' : 'برای ساخت حساب، نام و نام خانوادگی مشتری را بنویسید' }
}

export default function CustomerDesk({ customer, buyer, onCustomer, onBuyer }: { customer: CounterCustomer | null; buyer: Buyer; onCustomer: (value: CounterCustomer | null) => void; onBuyer: (value: Buyer) => void }) {
  const [context, setContext] = useState<Context | null>(null), [message, setMessage] = useState(''), [checking, setChecking] = useState(false)
  const phone = normalizeMobile(buyer.phone), state = buyerState(buyer, customer)
  const patch = (part: Partial<Buyer>) => onBuyer({ ...buyer, ...part })

  // A complete mobile is looked up (read-only) so an existing customer is recognised before the sale.
  useEffect(() => {
    if (!phone || customer) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setChecking(true); setMessage('')
      fetch(`/api/admin/store/counter?lookup=${encodeURIComponent(phone)}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const data = await response.json(); if (!response.ok) throw Error(data.error || 'حساب بررسی نشد')
          if (controller.signal.aborted) return
          const found = data.customer as Found | null
          if (!found) return
          onCustomer({ id: found.id, name: found.name, email: found.email, phone: found.phone })
          const [first = '', ...rest] = found.name.trim().split(' ')
          onBuyer({ phone: buyer.phone, firstName: found.firstName || first, lastName: found.lastName || rest.join(' ') })
        })
        .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد') })
        .finally(() => { if (!controller.signal.aborted) setChecking(false) })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
    // The lookup follows the mobile only; names typed meanwhile must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, customer])

  useEffect(() => {
    setContext(null); if (!customer) return
    const controller = new AbortController()
    fetch(`/api/admin/store/counter?customer=${customer.id}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw Error(data.error || 'سابقه دریافت نشد'); if (!controller.signal.aborted) setContext(data) })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [customer])

  const named = !!customer?.name.trim()
  return <div className="cd-customer">
    <div className="cd-buyer">
      <label className="cd-field cd-buyer-phone"><span>شمارهٔ موبایل</span><input id="counter-customer-phone" className="input" type="tel" dir="ltr" inputMode="tel" autoComplete="off" maxLength={20} placeholder="09xx xxx xxxx" value={buyer.phone} onChange={(event) => { patch({ phone: event.target.value }); if (customer) onCustomer(null) }} /></label>
      <label className="cd-field"><span>نام</span><input id="counter-customer-first" className="input" autoComplete="off" maxLength={40} value={buyer.firstName} readOnly={named} onChange={(event) => patch({ firstName: event.target.value })} /></label>
      <label className="cd-field"><span>نام خانوادگی</span><input id="counter-customer-last" className="input" autoComplete="off" maxLength={40} value={buyer.lastName} readOnly={named} onChange={(event) => patch({ lastName: event.target.value })} /></label>
    </div>

    {customer ? <div className="cd-person">
      <span className="cd-avatar" aria-hidden="true">{(customer.name || buyer.firstName || 'م').trim().charAt(0)}</span>
      <div className="cd-person-name"><b>{customer.name || [buyer.firstName, buyer.lastName].join(' ').trim() || 'مشتری بدون نام'}</b><span>حساب موجود · فاکتور به نام این مشتری صادر می‌شود</span></div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onCustomer(null); onBuyer({ firstName: '', lastName: '', phone: '' }); setContext(null) }}>مشتری دیگر</button>
    </div>
      : <p className={`cd-buyer-note is-${state.kind}`} role="status">{checking ? 'در حال بررسی حساب این شماره…'
        : state.kind === 'new' ? (state.problem || <>حساب تازه به نام <b>{buyer.firstName} {buyer.lastName}</b> با همین موبایل ساخته و فاکتور به نام او صادر می‌شود</>)
        : state.kind === 'invalid' ? state.problem
        : 'بدون موبایل، فروش مهمان ثبت می‌شود؛ نام نوشته‌شده روی فاکتور چاپ می‌شود'}</p>}
    {message && <p className="cd-error" role="alert">{message}</p>}

    {customer && context && <>
      <dl className="cd-facts">{context.wallets.map((wallet) => <div key={wallet.currency}><dt>کیف پول {wallet.currency}</dt><dd className="cd-num">{formatMoney(BigInt(wallet.balanceMinor), wallet.currency, 'fa-IR')}</dd></div>)}<div><dt>باشگاه مشتریان</dt><dd>{context.club.enabled ? <><span className="cd-num">{context.club.balance.toLocaleString('fa-IR')}</span> امتیاز · {context.club.tier}</> : 'غیرفعال'}</dd></div></dl>
      <details className="cd-history"><summary>سابقهٔ خرید و تعمیر <span className="cd-meta">{context.history.length.toLocaleString('fa-IR')}</span></summary>{context.history.length ? <ul>{context.history.map((row) => <li key={`${row.kind}:${row.id}`}><Link className="sa-link" href={row.href}>{row.title}</Link><span className="cd-meta">{CHANNEL[row.channel] || 'آنلاین'} · {row.statusLabel}</span></li>)}</ul> : <p className="sa-hint">سابقه‌ای در دسترس شما نیست.</p>}</details>
    </>}
  </div>
}
