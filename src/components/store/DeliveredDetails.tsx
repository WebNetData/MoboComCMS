'use client'

import { useState } from 'react'
import type { DeliveryFileView, DeliveryItem, DeliveryNotice } from '@/modules/store/domain/delivery-details'
import DeliveryCard from '@/components/store/DeliveryCard'
import { formatBytes } from '@/components/media/api'

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

/**
 * What the specialist delivered, on the buyer's order page (store/domain/delivery-details): the product's notices, then
 * the delivery as a card (when the product asks for one) or as rows, its files and the note.
 */
export default function DeliveredDetails({ orderId, items, note, files = [], notices = [], card = null }: { orderId: number; items: DeliveryItem[]; note: string; files?: DeliveryFileView[]; notices?: DeliveryNotice[]; card?: { product: string; brand: string; logo: string } | null }) {
  const [all, setAll] = useState(false)
  const lines = items.map((item) => `${item.label}: ${item.value}`).join('\n')
  async function copyAll() {
    try { await navigator.clipboard.writeText(lines); setAll(true); setTimeout(() => setAll(false), 1600) } catch { /* clipboard blocked */ }
  }
  const asCard = !!card && items.length > 0
  // The text file and «copy text» of the card: what was bought, every row, the note and the notices.
  const text = [card ? [card.product, card.brand].filter(Boolean).join(' — ') : '', lines, note, notices.map((notice) => `• ${notice.text}`).join('\n')].filter(Boolean).join('\n\n')
  return <>
    {notices.length > 0 && <ul className="sx-dlv-notices" aria-label="نکته‌های مهم">{notices.map((notice, index) => <li key={index} className={`is-${notice.tone}`}>{notice.text}</li>)}</ul>}
    {asCard && card && <DeliveryCard orderId={orderId} items={items} brand={card} text={text} />}
    {!asCard && items.length > 0 && <ul className="sx-dlv-rows">{items.map((item, index) => <Row key={`${item.label}-${index}`} item={item} />)}</ul>}
    {files.length > 0 && <ul className="sx-dlv-files" aria-label="فایل‌های تحویل">{files.map((file) => <li key={file.id}>
      <span className="sx-dlv-ext" aria-hidden="true">{(file.filename.split('.').pop() || '').slice(0, 4).toUpperCase() || 'FILE'}</span>
      <span className="sx-dlv-file"><b><bdi>{file.label}</bdi></b><small dir="ltr">{formatBytes(Number(file.sizeBytes))}</small></span>
      <a className="sx-dlv-get" href={`/api/store/orders/${orderId}/files/${file.id}`} download aria-label={`دریافت ${file.label}`}>دریافت</a>
    </li>)}</ul>}
    {note && <p className="sx-dlv-note">{note}</p>}
    {!asCard && items.length > 1 && <button type="button" className={`sx-dlv-all${all ? ' is-done' : ''}`} onClick={() => void copyAll()}>{all ? 'همه کپی شد' : 'کپی همهٔ موارد'}</button>}
  </>
}
