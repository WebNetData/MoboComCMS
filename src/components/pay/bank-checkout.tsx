'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BaleCheckout } from '@/modules/billing/domain/pay-bale-collection'
import { api } from './client'
import BankCheckoutView from './bank-checkout/view'
import ReceiptDialog from './bank-checkout/receipt-dialog'

function sameSite(value: string): string | null {
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && /^https?:$/.test(url.protocol) ? url.href : null } catch { return null }
}

export default function BankCheckout({ id }: { id: string }) {
  const [data, setData] = useState<BaleCheckout | null>(null)
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false), [now, setNow] = useState(0), [copied, setCopied] = useState('')
  const [offset, setOffset] = useState(0), [uploading, setUploading] = useState(false), [payerName, setPayerName] = useState(''), [trackingCode, setTrackingCode] = useState(''), [paidAmount, setPaidAmount] = useState<string | null>(null), [image, setImage] = useState<File | null>(null)
  const [back, setBack] = useState<string | null>(null), action = useRef<AbortController | null>(null), generation = useRef(0)
  const receiptDialog = useRef<HTMLDialogElement | null>(null)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      const current = generation.current
      try {
        const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' })
        if (controller.signal.aborted || current !== generation.current) return
        setOffset(new Date(row.serverTime).getTime() - Date.now()); setData(row); setError('')
        if (['PENDING', 'UNDER_REVIEW'].includes(row.status) && document.visibilityState === 'visible') timer = setTimeout(load, 3000)
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'دریافت وضعیت انجام نشد') }
    }
    function visible() { if (document.visibilityState === 'visible') { clearTimeout(timer); refresh() } else clearTimeout(timer) }
    void load(); document.addEventListener('visibilitychange', visible)
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [id, revision, refresh])
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => { setBack(data?.returnUrl ? sameSite(data.returnUrl) : null) }, [data?.returnUrl])
  useEffect(() => () => action.current?.abort(), [])
  async function accept() {
    if (!accepted || busy) return
    const controller = new AbortController(); action.current = controller; generation.current++
    setBusy(true); setError('')
    try { const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }), cache: 'no-store', signal: controller.signal }); if (!controller.signal.aborted) { generation.current++; setOffset(new Date(row.serverTime).getTime() - Date.now()); setData(row); refresh() } }
    catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'ثبت پذیرش انجام نشد') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function renew() {
    if (busy) return
    const controller = new AbortController(); action.current = controller
    setBusy(true); setError('')
    try {
      const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'renew' }), cache: 'no-store', signal: controller.signal })
      if (!/^[A-Za-z0-9_-]{32}$/.test(row.id)) throw new Error('شناسهٔ پرداخت تازه معتبر نیست')
      if (!controller.signal.aborted) window.location.assign(`/pay/bank/${row.id}`)
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'ساخت پرداخت تازه انجام نشد') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(`${label} کپی شد`) } catch { setCopied(`کپی ${label} انجام نشد؛ مقدار را انتخاب کنید`) }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!image || uploading || !payerName.trim() || !/^\d+$/.test(paidAmount ?? data?.collectedRial ?? '')) return
    if (image.size > 6 * 1024 * 1024) { setError('حجم تصویر باید حداکثر ۶ مگابایت باشد'); return }
    const controller = new AbortController(); action.current = controller; generation.current++; setUploading(true); setError('')
    try { const body = new FormData(); body.set('image', image); body.set('payerName', payerName.trim()); body.set('trackingCode', trackingCode); body.set('paidAmountRial', paidAmount ?? data!.collectedRial)
      const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}/receipt`, { method: 'POST', body, signal: controller.signal, cache: 'no-store' })
      if (!controller.signal.aborted) { generation.current++; setOffset(new Date(row.serverTime).getTime() - Date.now()); setData(row); receiptDialog.current?.close(); refresh() }
    } catch (reason) { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'ثبت رسید انجام نشد'); refresh() } }
    finally { if (!controller.signal.aborted) setUploading(false) }
  }
  const remaining = data && now ? Math.max(0, Math.ceil((new Date(data.expiresAt).getTime() - (now + offset)) / 1000)) : null
  const locallyExpired = data?.status === 'PENDING' && remaining === 0 && !uploading
  const countdown = remaining === null ? '—' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
  useEffect(() => {
    if (!uploading && (data?.status !== 'PENDING' || locallyExpired)) receiptDialog.current?.close()
  }, [data?.status, locallyExpired, uploading])
  return <>
    <BankCheckoutView data={data} error={error} expired={data?.status === 'EXPIRED' || locallyExpired}
      countdown={countdown} remaining={remaining} accepted={accepted} busy={busy} copied={copied}
      uploading={uploading} back={back} onAcceptChoice={setAccepted} onAccept={accept} onRenew={renew}
      onCopy={copy} onReceipt={() => receiptDialog.current?.showModal()} onRefresh={refresh} />
    <ReceiptDialog dialogRef={receiptDialog} uploading={uploading} error={error} payerName={payerName}
      trackingCode={trackingCode} amount={paidAmount ?? data?.collectedRial ?? ''} onPayerName={setPayerName}
      onTrackingCode={setTrackingCode} onAmount={setPaidAmount} onImage={setImage} onSubmit={upload} />
  </>
}
