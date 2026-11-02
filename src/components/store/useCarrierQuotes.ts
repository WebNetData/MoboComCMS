'use client'

import { useEffect, useState } from 'react'

export type CarrierOption =
  | { ok: true; carrierId: string; name: string; kind: string; zone: string; fee: number; eta: string; scheduled: boolean; free: boolean; note: string; freeBy?: string; collect?: boolean }
  | { ok: false; carrierId: string; name: string; reason: string }
type Quote = { addressId: number; options: CarrierOption[]; weightGrams: number }

/** Read-only quotes belong to the selected address; late replies cannot change its price. */
export function useCarrierQuotes(addressId: number, enabled: boolean) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [failure, setFailure] = useState<{ addressId: number; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setQuote(null); setFailure(null)
    if (!enabled || !addressId) return
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/shipping/quotes?addressId=${addressId}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok || !Array.isArray(body?.options) || !Number.isFinite(body.weightGrams) || body.options.some((o: CarrierOption) => !o || typeof o.ok !== 'boolean' || typeof o.carrierId !== 'string')) throw new Error('QUOTES_UNAVAILABLE')
        if (!controller.signal.aborted) setQuote({ addressId, options: body.options, weightGrams: body.weightGrams })
      } catch {
        if (!controller.signal.aborted) setFailure({ addressId, message: 'هزینهٔ ارسال دریافت نشد. دوباره تلاش کنید یا آدرس دیگری انتخاب کنید.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [addressId, enabled, attempt])

  const active = enabled && !!addressId
  return {
    carriers: active && quote?.addressId === addressId ? quote : null,
    error: active && failure?.addressId === addressId ? failure.message : '',
    retry: () => { setFailure(null); setQuote(null); setAttempt(value => value + 1) },
  }
}
