'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Receipt = {
  id: number; status: string; method: string; amountMinor: string; currency: string; payerName: string; payerBank: string; payerCard: string
  trackingCode: string; paidAt: string | null; createdAt: string; adminNote: string; reviewedAt: string | null
  invoice: { number: string; status: string; product: { name: string } | null; plan: { name: string } | null }
  user: { id: number; name: string; email: string; phone: string }
  bankAccount: { bankName: string; holderName: string; cardNumber: string } | null
}
const METHOD: Record<string, string> = { CARD: 'کارت به کارت', PAYA: 'پایا', SATNA: 'ساتنا', ACCOUNT: 'حساب به حساب' }
const TABS = [{ id: 'PENDING', label: 'در انتظار بررسی' }, { id: 'APPROVED', label: 'تأییدشده' }, { id: 'REJECTED', label: 'ردشده' }, { id: 'ALL', label: 'همه' }]
const money = (minor: string, currency: string) => `${BigInt(minor).toLocaleString('fa-IR')} ${currency === 'IRR' ? 'ریال' : 'تومان'}`

/** Staff review of card-to-card receipts: approving settles the invoice and starts delivery. */
export default function ReceiptsPage() {
  const [status, setStatus] = useState('PENDING')
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [zoom, setZoom] = useState(0)
  const [busy, setBusy] = useState(0)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/receipts?status=${status}`, { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (response.ok) { setReceipts(data.receipts); setCounts(data.counts) }
    else setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [status])
  useEffect(() => { void load() }, [load])

  async function review(receipt: Receipt, action: 'approve' | 'reject') {
    if (action === 'approve' && !window.confirm(`پرداخت ${money(receipt.amountMinor, receipt.currency)} برای فاکتور ${receipt.invoice.number} تأیید شود؟ سفارش بلافاصله ثبت و تحویل می‌شود.`)) return
    setBusy(receipt.id); setMessage(null)
    const response = await fetch('/api/admin/receipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: receipt.id, action, note: notes[receipt.id] || '' }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(0)
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); return }
    setMessage({ text: action === 'approve' ? `پرداخت تأیید شد و سفارش ثبت شد${data.warning ? ` (${data.warning})` : ''}` : 'رسید رد شد و دلیل آن به مشتری اطلاع داده شد', error: false })
    void load()
  }

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">PAYMENT RECEIPTS</span><h1>رسیدهای کارت به کارت</h1><p>مبلغ، شمارهٔ پیگیری و بانک مبدأ را با پیامک یا صورت‌حساب بانکی خودتان تطبیق دهید و بعد تأیید کنید. با تأیید، فاکتور پرداخت‌شده ثبت می‌شود و تحویل سفارش شروع می‌شود. <Link href="/admin/bank-accounts">حساب‌های بانکی ←</Link></p></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <nav className="md-chips seo-filter" aria-label="وضعیت">{TABS.map((tab) => <button key={tab.id} type="button" className={status === tab.id ? 'is-active' : ''} onClick={() => setStatus(tab.id)}>{tab.label}{tab.id !== 'ALL' && counts[tab.id] ? ` (${counts[tab.id].toLocaleString('fa-IR')})` : ''}</button>)}</nav>
    <div className="rc-list">{receipts.map((receipt) => (
      <article key={receipt.id} className={`card rc-item is-${receipt.status.toLowerCase()}`}>
        <button type="button" className="rc-image" onClick={() => setZoom(receipt.id)} aria-label="بزرگ‌نمایی رسید"><img src={`/api/receipts/${receipt.id}/image`} alt={`رسید ${receipt.trackingCode}`} loading="lazy" /></button>
        <div className="rc-body">
          <header><strong className="rc-amount">{money(receipt.amountMinor, receipt.currency)}</strong><Link href={`/invoice/${encodeURIComponent(receipt.invoice.number)}`} target="_blank" className="num" dir="ltr">{receipt.invoice.number}</Link><span className="badge">{receipt.invoice.product?.name || receipt.invoice.plan?.name || 'فاکتور'}</span></header>
          <dl className="rc-facts">
            <div><dt>مشتری</dt><dd>{receipt.user.name || receipt.user.email}{receipt.user.phone && <small dir="ltr"> {receipt.user.phone.replace(/^\+98/, '0')}</small>}</dd></div>
            <div><dt>روش</dt><dd>{METHOD[receipt.method] || receipt.method}</dd></div>
            <div><dt>از</dt><dd>{receipt.payerName} — بانک {receipt.payerBank}{receipt.payerCard && <span dir="ltr"> ****{receipt.payerCard}</span>}</dd></div>
            <div><dt>به</dt><dd>{receipt.bankAccount ? `${receipt.bankAccount.bankName} — ${receipt.bankAccount.holderName}` : '—'}</dd></div>
            <div><dt>پیگیری</dt><dd><code dir="ltr">{receipt.trackingCode}</code></dd></div>
            <div><dt>زمان واریز</dt><dd>{receipt.paidAt ? new Date(receipt.paidAt).toLocaleString('fa-IR') : '—'}</dd></div>
            <div><dt>ثبت رسید</dt><dd>{new Date(receipt.createdAt).toLocaleString('fa-IR')}</dd></div>
            {receipt.status !== 'PENDING' && <div><dt>بررسی</dt><dd>{receipt.status === 'APPROVED' ? 'تأیید' : 'رد'}{receipt.reviewedAt ? ` · ${new Date(receipt.reviewedAt).toLocaleString('fa-IR')}` : ''}{receipt.adminNote ? ` · ${receipt.adminNote}` : ''}</dd></div>}
          </dl>
          {receipt.status === 'PENDING' && <div className="rc-actions">
            <input className="input" placeholder="دلیل رد (به مشتری نمایش داده می‌شود)" value={notes[receipt.id] || ''} onChange={(e) => setNotes({ ...notes, [receipt.id]: e.target.value })} maxLength={300} />
            <button type="button" className="btn btn-primary" disabled={busy === receipt.id} onClick={() => void review(receipt, 'approve')}>✓ تأیید پرداخت</button>
            <button type="button" className="btn btn-ghost" disabled={busy === receipt.id} onClick={() => void review(receipt, 'reject')}>✕ رد رسید</button>
          </div>}
        </div>
      </article>
    ))}{!receipts.length && <div className="tb-empty">{status === 'PENDING' ? 'رسیدی در انتظار بررسی نیست.' : 'موردی نیست.'}</div>}</div>
    {zoom > 0 && <div className="rc-zoom" role="dialog" aria-label="تصویر رسید" onClick={() => setZoom(0)}><img src={`/api/receipts/${zoom}/image`} alt="رسید" /></div>}
  </div>
}
