'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import CheckoutError from '@/components/CheckoutError'
import { fetchCheckoutGateways, startCheckout } from '@/modules/checkout/ui/client'
import { STAGE_LABEL, answerText, type Answer, type Stage } from '@/modules/forms/domain/forms'

type Request = {
  id: number; form: string; slug: string; createdAt: string; answers: { label: string; type: string; value: Answer }[]
  amount: number; currency: string; lines: { id: string; label: string; detail: string; amount: number }[]; payStatus: string; paidAt: string | null; stage: string; reply: string
}
const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')
const when = (iso: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso))
const TRACK: Stage[] = ['OPEN', 'IN_PROGRESS', 'DONE']
const TONE: Record<string, string> = { OPEN: 'is-warn', IN_PROGRESS: '', DONE: 'is-good', REJECTED: 'is-bad' }

/** A member's own form answers: what they sent, the bill (and paying it), where the work stands and what staff wrote back. */
export default function MyRequests() {
  const [rows, setRows] = useState<Request[] | null>(null)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(0)
  const [payError, setPayError] = useState<{ id: number; code: string; message: string; needed: number; currency?: string } | null>(null)
  useEffect(() => {
    fetch('/api/me/requests', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (response.ok) setRows(body?.requests || []); else setError(body?.error || 'بارگذاری نشد')
    }).catch(() => setError('ارتباط برقرار نشد'))
  }, [])

  async function pay(row: Request) {
    setPaying(row.id); setPayError(null)
    try {
      const gateways = await fetchCheckoutGateways('IRT')
      const gateway = gateways.find((item) => item.isDefault) || gateways[0]
      const result = await startCheckout({ formSubmissionId: row.id, gatewayRef: gateway?.ref })
      if (result.ok) {
        if (result.paid || result.invoiceUrl) window.location.assign(`/payment/result?invoice=${result.invoiceNumber}`)
        else if (result.paymentUrl) window.location.href = result.paymentUrl
        return
      }
      setPayError({ id: row.id, code: result.code, message: result.message, needed: result.needed, currency: result.currency })
    } catch { setPayError({ id: row.id, code: 'NETWORK_ERROR', message: 'ارتباط برقرار نشد؛ دوباره تلاش کنید.', needed: 0 }) } finally { setPaying(0) }
  }

  return <div className="rq-page">
    <header className="pw-page-head"><h1 className="h2">درخواست‌های من</h1><p className="muted">فرم‌هایی که فرستاده‌اید، وضعیت انجام کار و پیام‌های کارشناس.</p></header>
    {error && <p className="error-text" role="alert">{error}</p>}
    {!rows && !error && <div className="card muted">در حال بارگذاری…</div>}
    {rows && !rows.length && <div className="card"><p className="muted">هنوز درخواستی نفرستاده‌اید.</p></div>}
    {rows && rows.length > 0 && <div className="rq-list">
      {rows.map((row) => {
        const unpaid = row.payStatus === 'UNPAID'
        const at = TRACK.indexOf(row.stage as Stage)
        return <article key={row.id} className="rq-card">
          <div className="rq-head">
            <div><h2>{row.form}</h2><small>شمارهٔ {fa(row.id)} · {when(row.createdAt)}</small></div>
            <div className="rq-badges">
              {row.amount > 0 && <span className={`rq-badge ${unpaid ? 'is-warn' : 'is-good'}`}>{unpaid ? 'در انتظار پرداخت' : 'پرداخت‌شده'}</span>}
              {row.stage && <span className={`rq-badge ${TONE[row.stage] || ''}`}>{STAGE_LABEL[row.stage as Stage]}</span>}
            </div>
          </div>
          {row.stage && row.stage !== 'REJECTED' && <ol className="rq-track" aria-label="مراحل انجام">{TRACK.map((stage, index) => <li key={stage} className={index <= at ? 'is-done' : ''}>{STAGE_LABEL[stage]}</li>)}</ol>}
          {row.reply && <p className="rq-reply"><b>پیام کارشناس</b>{row.reply}</p>}
          <details>
            <summary className="text-link">اطلاعاتی که فرستادید</summary>
            <dl className="rq-answers">{row.answers.map((answer, index) => <div key={index}><dt>{answer.label}</dt><dd dir="auto">{answerText(answer.value) || '—'}</dd></div>)}</dl>
          </details>
          {row.amount > 0 && <div className="rq-pay">
            <span>{unpaid ? 'مبلغ قابل پرداخت' : 'مبلغ پرداخت‌شده'}: <b className="num">{fa(row.amount)}</b> تومان</span>
            {unpaid && <button type="button" className="btn btn-primary" disabled={paying === row.id} onClick={() => void pay(row)}>{paying === row.id ? 'در حال انتقال…' : 'پرداخت'}</button>}
          </div>}
          {unpaid && <small className="muted">مبلغ نهایی هنگام پرداخت با نرخ همان لحظه حساب می‌شود.</small>}
          {payError?.id === row.id && <CheckoutError code={payError.code} message={payError.message} needed={payError.needed} currency={payError.currency || 'IRT'} />}
        </article>
      })}
    </div>}
    <p className="muted text-sm">برای پرسش دربارهٔ یک درخواست از <Link href="/dashboard/tickets" className="text-link">تیکت‌ها</Link> استفاده کنید.</p>
  </div>
}
