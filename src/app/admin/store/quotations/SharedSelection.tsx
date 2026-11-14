'use client'
import { useEffect, useState } from 'react'
import type { ShareView } from '@/components/store/SharedCart'
export default function SharedSelection({ onImport }: { onImport: (lines: { productId: number; variantId: number | null; quantity: number; name: string }[]) => void }) {
  const [view, setView] = useState<ShareView | null>(null), [error, setError] = useState('')
  useEffect(() => { const token = new URLSearchParams(window.location.search).get('shared'); if (!token || !/^[a-f0-9]{48}$/.test(token)) return; const controller = new AbortController(); fetch(`/api/cart/share/${token}`, { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error); if (!controller.signal.aborted) setView(body) }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) }); return () => controller.abort() }, [])
  if (!view && !error) return null
  return <section className="sa-card"><h2>ترکیب سبد مشترک</h2>{error ? <p role="alert">{error}</p> : view && <><p>{view.title}؛ مشتری و تخفیف را خودتان در فرم پایین تعیین کنید. قیمت نهایی بر اساس مشتری پیشنهاد بررسی می‌شود.</p><ul>{view.lines.map(line => <li key={`${line.productId}:${line.variantId}`}>{line.name} · {line.variantName} · {line.quantity} {line.issue}</li>)}</ul><button type="button" className="btn" disabled={view.lines.some(line => !!line.issue)} onClick={() => onImport(view.lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity, name: `${line.name} ${line.variantName}` })))}>جایگزینی کالاهای پیش‌نویس با این ترکیب</button></>}</section>
}
