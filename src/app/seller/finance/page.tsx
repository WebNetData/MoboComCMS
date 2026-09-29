'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { call, faDate, faNum, toman } from '../SellerContext'

type Finance = {
  balance: number; available: number; pending: number; minPayout: number; holdDays: number; iban: string; ibanOwner: string; page: number; pages: number
  rows: { id: number; kind: string; amount: number; orderId: number | null; note: string; availableAt: string; createdAt: string }[]
  payouts: { id: number; amount: number; status: string; iban: string; reference: string; note: string; createdAt: string; processedAt: string | null }[]
}

const KIND: Record<string, string> = { SALE: 'فروش', COMMISSION: 'کارمزد', REFUND: 'برگشت وجه', PAYOUT: 'برداشت', ADJUST: 'اصلاحیه' }
const PAYOUT: Record<string, [string, string]> = { REQUESTED: ['در حال بررسی', 'is-warn'], PAID: ['واریز شد', 'is-ok'], REJECTED: ['رد شد', 'is-bad'] }

export default function SellerFinance() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Finance | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const load = useCallback(async () => {
    const response = await fetch(`/api/seller/finance?page=${page}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setData(await response.json())
  }, [page])
  useEffect(() => { void load() }, [load])

  async function withdraw(event: FormEvent) {
    event.preventDefault()
    if (!window.confirm(`درخواست برداشت ${toman(Number(amount))} به شبای ${data?.iban} ثبت شود؟`)) return
    setBusy(true)
    const result = await call('/api/seller/finance', 'POST', { amount })
    setBusy(false)
    setNotice({ ok: result.ok, text: result.ok ? 'درخواست برداشت ثبت شد؛ پس از واریز به شما اطلاع داده می‌شود.' : result.error })
    if (result.ok) { setAmount(''); void load() }
  }

  if (!data) return <div className="sa-skeleton" aria-busy="true" />
  const waiting = data.payouts.some((row) => row.status === 'REQUESTED')
  return <div className="sa">
    <header className="sa-head"><h1>مالی و تسویه</h1></header>
    <div className="sa-kpis">
      <div className="sa-kpi"><small>قابل برداشت</small><b>{toman(data.available)}</b></div>
      <div className="sa-kpi"><small>در دورهٔ مرجوعی ({faNum(data.holdDays)} روز)</small><b>{toman(data.pending)}</b></div>
      <div className="sa-kpi"><small>مانده کل حساب</small><b>{toman(data.balance)}</b></div>
    </div>
    {notice && <p className={`sa-notice ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">{notice.text}</p>}

    <div className="sa-cols">
      <form className="sa-card sa-form" onSubmit={withdraw}>
        <header className="sa-card-head"><h2>درخواست تسویه</h2></header>
        {data.iban ? <p className="sa-hint">واریز به شبای <bdi dir="ltr">{data.iban}</bdi>{data.ibanOwner ? ` به نام ${data.ibanOwner}` : ''} — <Link href="/seller/profile" className="sa-link">تغییر</Link></p> : <p className="sa-notice is-error">ابتدا شمارهٔ شبا را در <Link href="/seller/profile" className="sa-link">پروفایل فروشگاه</Link> ثبت کنید.</p>}
        <label className="sa-field"><span>مبلغ (تومان)</span><input className="input" dir="ltr" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder={String(data.available)} /></label>
        <div className="sa-row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAmount(String(data.available))}>کل موجودی قابل برداشت</button></div>
        <p className="sa-hint">حداقل برداشت {toman(data.minPayout)}. هر بار یک درخواست در حال بررسی می‌توانید داشته باشید.</p>
        <button type="submit" className="btn btn-primary" disabled={busy || !data.iban || waiting || !amount}>{waiting ? 'یک درخواست در حال بررسی است' : busy ? 'در حال ثبت…' : 'ثبت درخواست برداشت'}</button>
      </form>

      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>درخواست‌های برداشت</h2></header>
        <table className="data sa-table"><thead><tr><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th><th>پیگیری</th></tr></thead><tbody>
          {data.payouts.map((row) => <tr key={row.id}><td className="num">{toman(row.amount)}</td><td><span className={`sa-state ${(PAYOUT[row.status] || ['', ''])[1]}`}>{(PAYOUT[row.status] || [row.status])[0]}</span>{row.note && <small className="sa-sub">{row.note}</small>}</td><td>{faDate(row.createdAt)}</td><td dir="ltr">{row.reference || '—'}</td></tr>)}
          {!data.payouts.length && <tr><td colSpan={4} className="sa-empty">هنوز درخواستی ثبت نشده است.</td></tr>}
        </tbody></table>
      </section>
    </div>

    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>گردش حساب</h2></header>
      <table className="data sa-table" style={{ minWidth: 640 }}><thead><tr><th>تاریخ</th><th>نوع</th><th>شرح</th><th>مبلغ</th><th>قابل برداشت از</th></tr></thead><tbody>
        {data.rows.map((row) => <tr key={row.id}>
          <td>{faDate(row.createdAt)}</td>
          <td>{KIND[row.kind] || row.kind}</td>
          <td>{row.note}{row.orderId ? <small className="sa-sub">سفارش #{faNum(row.orderId)}</small> : null}</td>
          <td className={`num ${row.amount < 0 ? 'sl-neg' : 'sl-pos'}`} dir="ltr">{row.amount < 0 ? '−' : '+'}{Math.abs(row.amount).toLocaleString('fa-IR')}</td>
          <td>{row.kind === 'SALE' && new Date(row.availableAt) > new Date() ? faDate(row.availableAt) : '—'}</td>
        </tr>)}
        {!data.rows.length && <tr><td colSpan={5} className="sa-empty">هنوز تراکنشی ثبت نشده است.</td></tr>}
      </tbody></table>
      {data.pages > 1 && <nav className="sa-pager" aria-label="صفحه‌بندی"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{faNum(page)} از {faNum(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
    </section>
  </div>
}
