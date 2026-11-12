'use client'

import { checkoutDestination } from '@/modules/checkout/domain/surface'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import CheckoutError from '@/components/CheckoutError'
import { fetchCheckoutGateways, startCheckout } from '@/modules/checkout/ui/client'
import { SECRET_MASK, STAGE_LABEL, answerText, type Answer, type Stage } from '@/modules/forms/domain/forms'

type Request = {
  id: number; form: string; slug: string; createdAt: string; answers: { label: string; type: string; value: Answer }[]
  amount: number; currency: string; lines: { id: string; label: string; detail: string; amount: number }[]; payStatus: string; paidAt: string | null; stage: string; stageLabel?: string; receiptToken?: string; reply: string
}
const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')
const whenFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const when = (iso: string) => whenFormat.format(new Date(iso))
const TRACK: Stage[] = ['OPEN', 'IN_PROGRESS', 'DONE']
const TONE: Record<string, string> = { OPEN: 'is-warn', IN_PROGRESS: '', DONE: 'is-good', REJECTED: 'is-bad' }
const PAGE = 10
/** Which filter a request falls under: to pay, being worked on, done, rejected, or just sent. */
const groupOf = (row: Request) => (row.payStatus === 'UNPAID' ? 'pay' : row.stage === 'DONE' ? 'done' : row.stage === 'REJECTED' ? 'rejected' : row.stage ? 'active' : 'sent')
const FILTERS = [['', 'همه'], ['pay', 'نیاز به پرداخت'], ['active', 'در حال انجام'], ['done', 'انجام‌شده'], ['rejected', 'ردشده']] as const

/** A member's own form answers: what they sent, the bill (and paying it), where the work stands and what staff wrote back. */
export default function MyRequests() {
  const [rows, setRows] = useState<Request[] | null>(null)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(0)
  const [payError, setPayError] = useState<{ id: number; code: string; message: string; needed: number; currency?: string } | null>(null)
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [copied, setCopied] = useState('')
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied((now) => (now === key ? '' : now)), 1600) } catch { /* the value stays selectable by hand */ }
  }
  const counts = useMemo(() => (rows || []).reduce<Record<string, number>>((acc, row) => { const group = groupOf(row); acc[group] = (acc[group] || 0) + 1; return acc }, {}), [rows])
  const visible = (rows || []).filter((row) => !filter || groupOf(row) === filter)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/me/requests', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (!controller.signal.aborted) setError(body?.error || 'درخواست‌ها دریافت نشدند')
        return
      }
      const body = await response.json().catch(() => null)
      if (controller.signal.aborted) return
      if (Array.isArray(body?.requests)) setRows(body.requests)
      else setError('درخواست‌ها دریافت نشدند')
    }).catch(() => { if (!controller.signal.aborted) setError('ارتباط برقرار نشد') })
    return () => controller.abort()
  }, [loadAttempt])

  async function pay(row: Request) {
    setPaying(row.id); setPayError(null)
    try {
      const gateways = await fetchCheckoutGateways('IRT')
      const gateway = gateways.find((item) => item.isDefault) || gateways[0]
      const result = await startCheckout({ surface: 'dashboard', formSubmissionId: row.id, gatewayRef: gateway?.ref })
      if (result.ok) {
        const destination = checkoutDestination(result, 'dashboard'); if (destination) window.location.assign(destination)
        return
      }
      setPayError({ id: row.id, code: result.code, message: result.message, needed: result.needed, currency: result.currency })
    } catch { setPayError({ id: row.id, code: 'NETWORK_ERROR', message: 'ارتباط برقرار نشد؛ دوباره تلاش کنید.', needed: 0 }) } finally { setPaying(0) }
  }

  return <div className="rq-page dt-page">
    <header className="dt-head"><div><h1>درخواست‌های من</h1><p>فرم‌هایی که فرستاده‌اید، وضعیت انجام کار و پیام‌های کارشناس.</p></div></header>
    {error && <div className="dt-empty is-bad" role="alert"><b>{error}</b><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" className="btn btn-ghost" onClick={() => { setError(''); setRows(null); setLoadAttempt(attempt => attempt + 1) }}>تلاش دوباره</button></div>}
    {!rows && !error && <div className="dt-skeleton" role="status" aria-label="در حال دریافت درخواست‌ها" aria-busy="true"><i /><i /><i /></div>}
    {rows && !rows.length && <div className="dt-empty"><b>هنوز درخواستی نفرستاده‌اید</b><span>درخواست‌هایی که با فرم‌های سایت می‌فرستید، با وضعیت و پاسخ کارشناس این‌جا می‌آیند.</span></div>}
    {rows && rows.length > 0 && <nav className="dt-chips" aria-label="وضعیت درخواست">{FILTERS.map(([id, label]) => (!id || counts[id]) ? <button key={id || 'all'} type="button" aria-pressed={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => { setFilter(id); setShown(PAGE) }}>{label}<i>{fa(id ? counts[id] || 0 : rows.length)}</i></button> : null)}</nav>}
    {rows && rows.length > 0 && <div className="rq-list">
      {visible.slice(0, shown).map((row) => {
        const unpaid = row.payStatus === 'UNPAID'
        const at = TRACK.indexOf(row.stage as Stage)
        const complete = row.stage === 'DONE'
        const tone = row.stage === 'REJECTED' ? 'is-bad' : complete ? 'is-good' : unpaid ? 'is-warn' : ''
        const shownAnswers = row.answers.filter((answer) => answerText(answer.value))
        return <article key={row.id} className={`rq-card ${tone}`}>
          <div className="rq-head">
            <span className="rq-icon" aria-hidden="true"><Icon name="file" size={20} /></span>
            <div className="rq-title"><h2>{row.form}</h2><small><span>شمارهٔ <b className="num">{fa(row.id)}</b></span><span>{when(row.createdAt)}</span>{row.slug && <Link href={row.amount > 0 ? `/dashboard/order/forms/${encodeURIComponent(row.slug)}` : `/forms/${row.slug}`} className="text-link">ثبت دوباره</Link>}</small></div>
            <div className="rq-badges">
              {row.amount > 0 && <span className={`rq-badge ${unpaid ? 'is-warn' : 'is-good'}`}>{unpaid ? 'در انتظار پرداخت' : 'پرداخت‌شده'}</span>}
              {row.stage && <span className={`rq-badge ${TONE[row.stage] || ''}`}>{row.stageLabel || STAGE_LABEL[row.stage as Stage]}</span>}{row.receiptToken && <a className="text-link rq-receipt" href={`/receipt/${row.receiptToken}`} target="_blank">رسید دستگاه</a>}
            </div>
          </div>
          {row.stage && row.stage !== 'REJECTED' && TRACK.includes(row.stage as Stage) && <ol className="rq-track" aria-label="مراحل انجام">{TRACK.map((stage, index) => {
            const passed = index < at || (complete && index === at), now = index === at && !complete
            return <li key={stage} className={passed ? 'is-done' : now ? 'is-now' : ''} aria-current={now ? 'step' : undefined}>
              <span className="rq-step" aria-hidden="true">{passed ? <Icon name="check" size={14} /> : fa(index + 1)}</span>
              <span className="rq-step-label">{STAGE_LABEL[stage]}</span>
            </li>
          })}</ol>}
          {row.reply && <div className="rq-reply"><span className="rq-reply-icon" aria-hidden="true"><Icon name="chat" size={18} /></span><div><b>پیام کارشناس</b><p>{row.reply}</p></div></div>}
          {shownAnswers.length > 0 && <details className="rq-sent">
            <summary><Icon name="layers" size={17} /><span>اطلاعاتی که فرستادید</span><small>{fa(shownAnswers.length)} مورد</small><Icon name="chevron" size={16} className="rq-sent-chevron" /></summary>
            <dl className="rq-answers">{shownAnswers.map((answer, index) => {
              const text = answerText(answer.value), key = `${row.id}:${index}`, secret = answer.type === 'secret' || text === SECRET_MASK
              return <div key={index} className="rq-fact">
                <dt>{answer.label}</dt>
                <dd dir="auto" className={secret ? "is-secret" : undefined}>{text}</dd>
                {!secret && <button type="button" className="rq-copy" onClick={() => void copy(key, text)} aria-label={`کپی ${answer.label}`}><Icon name={copied === key ? 'check' : 'copy'} size={14} /></button>}
              </div>
            })}</dl>
          </details>}
          {row.amount > 0 && <div className={`rq-pay ${unpaid ? 'is-due' : ''}`}>
            <div><small>{unpaid ? 'مبلغ قابل پرداخت' : 'مبلغ پرداخت‌شده'}</small><b><span className="num">{fa(row.amount)}</span> تومان</b>{unpaid && <em>مبلغ نهایی هنگام پرداخت با نرخ همان لحظه حساب می‌شود.</em>}</div>
            {unpaid && <button type="button" className="btn btn-primary" disabled={paying === row.id} onClick={() => void pay(row)}>{paying === row.id ? 'در حال انتقال…' : 'پرداخت'}</button>}
          </div>}
          {payError?.id === row.id && <CheckoutError code={payError.code} message={payError.message} needed={payError.needed} currency={payError.currency || 'IRT'} />}
        </article>
      })}
    </div>}
    {visible.length > shown && <button type="button" className="dt-more" onClick={() => setShown((count) => count + PAGE)}>نمایش {fa(Math.min(PAGE, visible.length - shown))} درخواست دیگر <small>({fa(visible.length - shown)} باقی‌مانده)</small></button>}
    <p className="rq-help">برای پرسش دربارهٔ یک درخواست از <Link href="/dashboard/tickets" className="text-link">تیکت‌ها</Link> استفاده کنید.</p>
  </div>
}
