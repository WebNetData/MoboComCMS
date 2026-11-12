'use client'
import { useEffect, useState } from 'react'

type Quote = { subtotalMinor: string; discountMinor: string; shippingMinor: string; totalMinor: string; currency: string }
/** Quote state is bound to the exact draft; a previous answer cannot confirm changed lines or an address. */
export function useCounterQuote(draft: Record<string, unknown> | null) {
  const key = draft ? JSON.stringify(draft) : ''
  const [state, setState] = useState<{ key: string; quote?: Quote; error?: string }>({ key: '' })
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/store/counter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(key), op: 'quote' }), signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw Error(body.error || 'مبلغ نهایی دریافت نشد')
        if (!controller.signal.aborted) setState({ key, quote: body.quote })
      } catch (error) { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'ارتباط برقرار نشد' }) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key])
  const current = key && state.key === key ? state : null
  return { quote: current?.quote || null, error: current?.error || '', loading: !!key && !current }
}
