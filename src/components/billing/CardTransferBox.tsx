'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type TransferAccount = { id: number; bankName: string; holderName: string; card: string; sheba: string; accountNumber: string; note: string }
export type TransferReceipt = { id: number; status: string; trackingCode: string; payerBank: string; createdAt: string; adminNote: string }

const METHODS = [
  { id: 'CARD', label: 'کارت به کارت' },
  { id: 'PAYA', label: 'انتقال پایا' },
  { id: 'SATNA', label: 'انتقال ساتنا' },
  { id: 'ACCOUNT', label: 'حساب به حساب / موبایل‌بانک' },
]

function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" className="ct-copy" aria-label={`کپی ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value.replace(/\s/g, '')); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ }
  }}>{done ? 'کپی شد ✓' : 'کپی'}</button>
}

/** Bank accounts, the exact amount, and the receipt form for a card-to-card invoice. */
export default function CardTransferBox({ invoiceNumber, accounts, rial, toman, receipts, banks }: {
  invoiceNumber: string; accounts: TransferAccount[]; rial: string; toman: string; receipts: TransferReceipt[]; banks: string[]
}) {
  const router = useRouter()
  const pending = receipts.find((receipt) => receipt.status === 'PENDING')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [method, setMethod] = useState('CARD')
  const [preview, setPreview] = useState('')
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    const local = String(form.get('paidAtLocal') || '')
    if (local) form.set('paidAt', new Date(local).toISOString())
    form.delete('paidAtLocal')
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceNumber)}/receipt`, { method: 'POST', body: form }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'ارسال رسید انجام نشد'); return }
    router.refresh()
  }

  return (
    <div className="ct-box">
      <div className="ct-amount">
        <span>مبلغ قابل واریز</span>
        <strong>{rial} <small>ریال</small></strong>
        <em>معادل {toman} تومان — لطفاً دقیقاً همین مبلغ را واریز کنید.</em>
      </div>

      <div className="ct-accounts">
        {accounts.map((account) => (
          <article key={account.id} className="ct-account">
            <header><b>بانک {account.bankName}</b><span>به نام {account.holderName}</span></header>
            {account.card && <div className="ct-line"><span>شماره کارت</span><code dir="ltr">{account.card}</code><Copy value={account.card} label="شماره کارت" /></div>}
            {account.sheba && <div className="ct-line"><span>شبا</span><code dir="ltr">{account.sheba}</code><Copy value={account.sheba} label="شماره شبا" /></div>}
            {account.accountNumber && <div className="ct-line"><span>شماره حساب</span><code dir="ltr">{account.accountNumber}</code><Copy value={account.accountNumber} label="شماره حساب" /></div>}
            {account.note && <p className="muted">{account.note}</p>}
          </article>
        ))}
      </div>

      {receipts.length > 0 && <ul className="ct-history">
        {receipts.map((receipt) => (
          <li key={receipt.id} className={`is-${receipt.status.toLowerCase()}`}>
            <b>{receipt.status === 'PENDING' ? '⏳ رسید شما در انتظار تأیید است' : receipt.status === 'APPROVED' ? '✓ رسید تأیید شد' : '✕ رسید تأیید نشد'}</b>
            <span>پیگیری <code dir="ltr">{receipt.trackingCode}</code> · {receipt.payerBank} · {new Date(receipt.createdAt).toLocaleString('fa-IR')}</span>
            {receipt.status === 'REJECTED' && receipt.adminNote && <span>دلیل: {receipt.adminNote}</span>}
          </li>
        ))}
      </ul>}

      {pending ? (
        <p className="ct-wait">رسید شما ثبت شده و معمولاً ظرف چند ساعت کاری بررسی می‌شود. پس از تأیید، سفارش خودکار ثبت می‌شود و پیامک/اعلان دریافت می‌کنید.</p>
      ) : (
        <form className="ct-form" onSubmit={submit}>
          <h4>ثبت رسید پرداخت</h4>
          <div className="ct-grid">
            <label><span>روش پرداخت</span><select className="select" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label><span>واریز به حساب</span><select className="select" name="bankAccountId">{accounts.map((account) => <option key={account.id} value={account.id}>بانک {account.bankName} — {account.holderName}</option>)}</select></label>
            <label><span>نام صاحب حساب مبدأ</span><input className="input" name="payerName" required minLength={3} maxLength={80} autoComplete="name" /></label>
            <label><span>بانک مبدأ</span><input className="input" name="payerBank" list="ct-banks" required maxLength={60} placeholder="مثلاً ملت" /><datalist id="ct-banks">{banks.map((bank) => <option key={bank} value={bank} />)}</datalist></label>
            {method === 'CARD' && <label><span>۴ رقم آخر کارت مبدأ</span><input className="input" name="payerCard" inputMode="numeric" dir="ltr" required pattern="[0-9۰-۹]{4}|[0-9۰-۹]{16}" maxLength={16} placeholder="1234" /></label>}
            <label><span>شمارهٔ پیگیری / ارجاع</span><input className="input" name="trackingCode" dir="ltr" required minLength={4} maxLength={40} /></label>
            <label><span>تاریخ و ساعت واریز</span><input className="input" type="datetime-local" name="paidAtLocal" dir="ltr" defaultValue={now} max={now} required /></label>
            <label className="ct-file"><span>تصویر رسید (PNG، JPG یا WebP تا ۶ مگابایت)</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp" required onChange={(e) => { const file = e.target.files?.[0]; setPreview(file ? URL.createObjectURL(file) : '') }} /></label>
          </div>
          {preview && <img className="ct-preview" src={preview} alt="پیش‌نمایش رسید" />}
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال رسید برای تأیید'}</button>
        </form>
      )}
    </div>
  )
}
