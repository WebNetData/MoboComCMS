'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { CART_EVENT } from '@/modules/store/ui/cart-client'

/** Cart link with the live item count (updated by every cart change on the page). */
export default function CartButton({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial)
  useEffect(() => {
    const onChange = (event: Event) => setCount(Number((event as CustomEvent<{ count: number }>).detail?.count) || 0)
    window.addEventListener(CART_EVENT, onChange)
    return () => window.removeEventListener(CART_EVENT, onChange)
  }, [])
  return <Link href="/cart" className="sx-cart-btn" aria-label={count ? `سبد خرید، ${count.toLocaleString('fa-IR')} کالا` : 'سبد خرید'}>
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L20.5 8H6.1" /><circle cx="10" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>
    {count > 0 && <span className="sx-cart-count" aria-hidden="true">{count > 99 ? '۹۹+' : count.toLocaleString('fa-IR')}</span>}
  </Link>
}
