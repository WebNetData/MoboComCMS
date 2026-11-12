'use client'

import { useState } from 'react'
import type { DeliveryItem } from '@/modules/store/domain/delivery-details'

const MASK = '••••••••••'

/** One delivered value: copied on its own; a secret stays hidden until the buyer asks to see it. */
function Row({ item }: { item: DeliveryItem }) {
  const [shown, setShown] = useState(!item.secret)
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(item.value); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked: the value is on screen */ }
  }
  return <li className="sx-dlv-row">
    <span className="sx-dlv-label">{item.label}</span>
    <code className={`sx-dlv-value${shown ? '' : ' is-hidden'}`} dir="ltr" aria-live="polite">{shown ? item.value : MASK}</code>
    <span className="sx-dlv-actions">
      {item.secret && <button type="button" aria-pressed={shown} aria-label={`${shown ? 'پنهان کردن' : 'نمایش'} ${item.label}`} onClick={() => setShown((value) => !value)}>{shown ? 'پنهان' : 'نمایش'}</button>}
      <button type="button" className={copied ? 'is-done' : undefined} aria-label={`کپی ${item.label}`} onClick={() => void copy()}>{copied ? 'کپی شد' : 'کپی'}</button>
    </span>
  </li>
}

/** What the specialist delivered, on the buyer's order page (store/domain/delivery-details). */
export default function DeliveredDetails({ items, note }: { items: DeliveryItem[]; note: string }) {
  const [all, setAll] = useState(false)
  async function copyAll() {
    try { await navigator.clipboard.writeText(items.map((item) => `${item.label}: ${item.value}`).join('\n')); setAll(true); setTimeout(() => setAll(false), 1600) } catch { /* clipboard blocked */ }
  }
  return <>
    {items.length > 0 && <ul className="sx-dlv-rows">{items.map((item, index) => <Row key={`${item.label}-${index}`} item={item} />)}</ul>}
    {note && <p className="sx-dlv-note">{note}</p>}
    {items.length > 1 && <button type="button" className={`sx-dlv-all${all ? ' is-done' : ''}`} onClick={() => void copyAll()}>{all ? 'همه کپی شد' : 'کپی همهٔ موارد'}</button>}
  </>
}
