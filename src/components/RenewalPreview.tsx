'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

type Preview = {
  planName: string; terms: string; checkedAt: string; currentExpiresAt: string; nextExpiresAt: string
  currentRemainingGB: number | null; nextRemainingGB: number | null; days: number; trafficGB: number
  price: number; balance: number; currency: string; canPay: boolean
}

export default function RenewalPreview({ subscriptionId, busy, onClose, onConfirm }: {
  subscriptionId: number; busy: boolean; onClose: () => void
  onConfirm: (terms: string) => Promise<{ ok: boolean; data: any }>
}) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const pathname = usePathname()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const confirming = useRef(false)
  const L = (a: string, b: string) => fa ? a : b
  const number = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US', { maximumFractionDigits: 2 })
  const traffic = (n: number | null) => n === null ? L('نامحدود', 'Unlimited') : `${number(n)} GB`
  const date = (value: string) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const money = (value: number) => formatCurrency(value, preview!.currency, fa ? 'fa-IR' : 'en-US')
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setLoading(true); setError(''); setPreview(null); setExpired(false)
    fetch(`/api/subscriptions/${subscriptionId}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.code || 'PREVIEW_UNAVAILABLE')
        if (controller.signal.aborted) return
        setPreview(data)
        timer = setTimeout(() => setExpired(true), Math.max(0, new Date(data.checkedAt).getTime() + 300_000 - Date.now()))
      }).catch(error => {
        if (!controller.signal.aborted) setError(error.message === 'RENEWAL_PENDING' ? L('تمدید قبلی هنوز در حال پردازش است. پس از تکمیل دوباره بررسی کنید.', 'Your previous renewal is still processing. Please check again after it completes.') : L('دریافت اطلاعات تازهٔ اشتراک ممکن نشد. هیچ مبلغی کسر نشده است.', 'Current subscription details are unavailable. Nothing has been charged.'))
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [subscriptionId, revision, locale])

  async function confirm() {
    if (!preview || expired || busy || confirming.current || !preview.canPay) return
    if (Date.now() - new Date(preview.checkedAt).getTime() >= 300_000) { setExpired(true); return }
    confirming.current = true
    try {
      const result = await onConfirm(preview.terms)
      if (result.ok) onClose()
      else if (result.data?.code === 'RENEWAL_CHANGED') { setExpired(true); setError(L('شرایط پلن تغییر کرده است؛ پیش‌نمایش را تازه‌سازی کنید.', 'The plan has changed. Refresh the preview.')) }
    } finally { confirming.current = false }
  }
  return <section className="renewal-preview" aria-label={L('پیش‌نمایش تمدید', 'Renewal preview')} aria-busy={loading || busy}>
    <h4 ref={heading} tabIndex={-1} className="font-bold text-lg">{L('قبل از تمدید بررسی کنید', 'Review your renewal')}</h4>
    {loading && <p role="status" className="muted mt-3">{L('در حال دریافت اطلاعات تازهٔ اشتراک…', 'Checking your current subscription…')}</p>}
    {error && <p role="alert" className="error-text mt-3">{error}</p>}
    {preview && <>
      <p className="muted text-sm mt-2">{preview.planName} · {number(preview.days)} {L('روز', 'days')} · {traffic(preview.trafficGB === 0 ? null : preview.trafficGB)}</p>
      <div className="renewal-comparison">
        <div><h5>{L('اکنون', 'Current')}</h5><dl><dt>{L('حجم باقی‌مانده', 'Remaining data')}</dt><dd dir="auto">{traffic(preview.currentRemainingGB)}</dd><dt>{L('تاریخ انقضا', 'Expiry')}</dt><dd>{date(preview.currentExpiresAt)}</dd></dl></div>
        <div className="renewal-after"><h5>{L('پس از تمدید', 'After renewal')}</h5><dl><dt>{L('حجم باقی‌مانده', 'Remaining data')}</dt><dd dir="auto">{traffic(preview.nextRemainingGB)}</dd><dt>{L('تاریخ انقضا', 'Expiry')}</dt><dd>{date(preview.nextExpiresAt)}</dd></dl></div>
      </div>
      <dl className="renewal-payment"><div><dt>{L('هزینه تمدید', 'Renewal cost')}</dt><dd>{money(preview.price)}</dd></div><div><dt>{L('موجودی کیف پول', 'Wallet balance')}</dt><dd>{money(preview.balance)}</dd></div></dl>
      <p className="muted text-xs">{L('حجم مصرف‌شده صفر نمی‌شود. نتیجه بر اساس اطلاعات همین لحظه است؛ مصرف تا زمان انجام تمدید می‌تواند حجم باقی‌مانده را تغییر دهد. برای اشتراک منقضی‌شده، مدت از زمان تمدید محاسبه می‌شود.', 'Used traffic is kept. This estimate uses current data; usage before completion can change the remaining amount. Expired subscriptions restart from renewal time.')}</p>
      {!preview.canPay && <p className="error-text mt-3">{L('موجودی کیف پول برای تمدید کافی نیست.', 'Your wallet balance is insufficient.')}</p>}
      {expired && <p role="status" className="muted mt-3">{L('برای ادامه، پیش‌نمایش را تازه‌سازی کنید.', 'Refresh this preview to continue.')}</p>}
    </>}
    <div className="flex flex-wrap gap-2 mt-4">
      {preview && !expired && preview.canPay && <button className="btn btn-primary" disabled={busy || loading} onClick={confirm}>{busy ? L('در حال پردازش…', 'Processing…') : L(`تأیید و پرداخت ${money(preview.price)} از کیف پول`, `Confirm and pay ${money(preview.price)} from wallet`)}</button>}
      {preview && !preview.canPay && <Link className="btn btn-primary" href={pathname.startsWith('/miniapp') ? '/miniapp/wallet' : '/dashboard/wallet'}>{L('شارژ کیف پول', 'Top up wallet')}</Link>}
      {!loading && <button className="btn btn-ghost" disabled={busy} onClick={() => setRevision(n => n + 1)}>{L('تازه‌سازی', 'Refresh')}</button>}
      <button className="btn btn-ghost" disabled={busy} onClick={onClose}>{L('انصراف', 'Cancel')}</button>
    </div>
  </section>
}
