'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CounterReceipt, CounterSaleInput } from '@/modules/store/domain/counter-sales'

const PENDING_KEY = 'store.counter.pending.v1'
type Submission = Omit<CounterSaleInput, 'requestId'>

/** A network retry reuses the captured sale. Reload recovers the same request before starting another sale. */
export function useCounterSale() {
  const [orderId, setOrderId] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<CounterReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState('')
  const [receiptAttempt, setReceiptAttempt] = useState(0)
  const pending = useRef<(CounterSaleInput & { confirmed: true }) | null>(null)

  const recover = useCallback(async () => {
    const requestId = sessionStorage.getItem(PENDING_KEY)
    if (!requestId) return
    setBusy(true); setUncertain(true)
    try {
      const response = await fetch(`/api/admin/store/counter?request=${encodeURIComponent(requestId)}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'بررسی فروش قبلی ممکن نشد')
      if (body.orderId) { setOrderId(body.orderId); setUncertain(false); sessionStorage.removeItem(PENDING_KEY); setMessage(''); window.history.replaceState(null, '', `/admin/store/counter?order=${body.orderId}`) }
      else setMessage('نتیجهٔ فروش قبلی هنوز تأیید نشده است. پیش از شروع فروش تازه، سفارش‌های ثبت‌شده را بررسی کنید.')
    } catch { setMessage('وضعیت فروش قبلی خوانده نشد؛ دوباره وضعیت را بررسی کنید.') }
    finally { setBusy(false) }
  }, [])

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('order'))
    if (Number.isSafeInteger(id) && id > 0) setOrderId(id)
    else void recover()
  }, [recover])

  useEffect(() => {
    if (!orderId) return
    const controller = new AbortController()
    setReceipt(null); setMessage('')
    fetch(`/api/admin/store/counter?order=${orderId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(body.error || 'رسید خوانده نشد')
        setReceipt(body.receipt)
      }).catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'رسید خوانده نشد') })
    return () => controller.abort()
  }, [orderId, receiptAttempt])

  async function submit(sale: Submission) {
    if (busy) return
    const retrying = pending.current !== null
    const captured = pending.current || { ...sale, requestId: crypto.randomUUID(), confirmed: true as const }
    pending.current = captured
    try { sessionStorage.setItem(PENDING_KEY, captured.requestId) } catch { setMessage('مرورگر امکان نگهداری شناسهٔ فروش را ندارد؛ پیش از ثبت فروش این دسترسی را فعال کنید.'); return }
    setBusy(true); setMessage(''); setUncertain(true)
    try {
      const response = await fetch('/api/admin/store/counter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) })
      const body = await response.json()
      if (!response.ok) {
        // A limit/permission refusal on a retry cannot prove the earlier request did not commit.
        if (response.status < 500 && !retrying && body.code !== 'REQUEST_CONFLICT') { pending.current = null; sessionStorage.removeItem(PENDING_KEY); setUncertain(false) }
        setMessage(body.error || 'ثبت فروش انجام نشد')
        return
      }
      if (!Number.isSafeInteger(body.orderId) || body.orderId <= 0) throw new Error('invalid sale response')
      setOrderId(body.orderId); pending.current = null; sessionStorage.removeItem(PENDING_KEY); setUncertain(false)
      window.history.replaceState(null, '', `/admin/store/counter?order=${body.orderId}`)
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch { setMessage('پاسخ ثبت فروش دریافت نشد. «تلاش مجدد همان فروش» نتیجه را بدون ثبت دوباره بازیابی می‌کند.') }
    finally { setBusy(false) }
  }

  function nextSale() {
    if (uncertain && !window.confirm('فروش قبلی را در سفارش‌ها بررسی کرده‌اید و می‌خواهید فروش جداگانه‌ای شروع کنید؟')) return false
    pending.current = null; sessionStorage.removeItem(PENDING_KEY)
    setReceipt(null); setOrderId(null); setMessage(''); setUncertain(false)
    window.history.replaceState(null, '', '/admin/store/counter')
    return true
  }

  return { orderId, receipt, busy, uncertain, message, submit, recover, nextSale, canRetry: pending.current !== null, retryReceipt: () => setReceiptAttempt((value) => value + 1) }
}
