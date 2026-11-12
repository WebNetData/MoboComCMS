'use client'

import { useEffect, useState } from 'react'
import { useParams } from '@/platform/routing/navigation'
import ReceiptSheet from '@/components/forms/ReceiptSheet'
import type { Receipt } from '@/modules/forms/domain/forms'
import '@/app/receipt.css'

/** A receipt to print at the counter: the customer's copy, or the shop's (reading it is recorded). */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>()
  const [copy, setCopy] = useState<'customer' | 'shop'>('customer')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { setCopy(new URLSearchParams(window.location.search).get('copy') === 'shop' ? 'shop' : 'customer') }, [])
  useEffect(() => {
    let live = true
    setReceipt(null); setError('')
    fetch(`/api/admin/forms/submissions?receipt=${encodeURIComponent(id)}&copy=${copy}`, { cache: 'no-store' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!live) return; if (response.ok) setReceipt(body); else setError(body.error || 'رسید خوانده نشد') })
      .catch(() => { if (live) setError('رسید خوانده نشد') })
    return () => { live = false }
  }, [id, copy])
  return <main className="rc-page">
    <div className="rc-tools" role="group" aria-label="نسخهٔ رسید">
      <button type="button" className={`btn ${copy === 'customer' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={copy === 'customer'} onClick={() => setCopy('customer')}>نسخهٔ مشتری</button>
      <button type="button" className={`btn ${copy === 'shop' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={copy === 'shop'} onClick={() => setCopy('shop')}>نسخهٔ مغازه</button>
      <button type="button" className="btn btn-ghost" disabled={!receipt} onClick={() => window.print()}>چاپ</button>
    </div>
    {error && <p className="sa-hint" role="alert">{error}</p>}
    {receipt && <ReceiptSheet receipt={receipt} />}
  </main>
}
