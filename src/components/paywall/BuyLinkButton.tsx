'use client'

import { useState } from 'react'
import { startCheckout } from '@/modules/checkout/ui/client'

/**
 * "Buy this file" on one download row that has its own price (a 4K version,
 * a special edition): wallet first, the rest through the payment gateway.
 */
export default function BuyLinkButton({ contentKey, price, listPrice, memberPrice, vipFree, loggedIn }: { contentKey: string; price: string; listPrice: string; memberPrice: boolean; vipFree: boolean; loggedIn: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Back to this page's download box after signing in.
  const login = () => { window.location.href = `/login?next=${encodeURIComponent(`${window.location.pathname}#downloads`)}` }
  if (!loggedIn) return <button type="button" className="md-go is-locked is-buy" onClick={login}>🛒 ورود و خرید · {price}</button>

  async function buy() {
    setBusy(true); setError('')
    try {
      const result = await startCheckout({ contentKey })
      if (result.ok && result.paid) { window.location.reload(); return }
      if (result.ok && result.paymentUrl) { window.location.href = result.paymentUrl; return }
      if (result.code === 'ALREADY_OPEN') { window.location.reload(); return }
      setError(result.message || 'پرداخت آغاز نشد')
    } catch { setError('ارتباط برقرار نشد') }
    setBusy(false)
  }

  return <span className="md-buy">
    <button type="button" className="md-go is-locked is-buy" onClick={() => void buy()} disabled={busy} title={vipFree ? 'اعضای VIP رایگان دریافت می‌کنند' : undefined}>
      {busy ? 'در حال انتقال…' : <>🛒 خرید {memberPrice && <s>{listPrice}</s>} {price}</>}
    </button>
    {vipFree && <small className="md-buy-vip">♛ رایگان برای VIP</small>}
    {error && <small className="md-buy-error" role="alert">{error}</small>}
  </span>
}
