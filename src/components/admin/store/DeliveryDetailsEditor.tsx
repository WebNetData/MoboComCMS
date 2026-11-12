'use client'

import { useId, useState } from 'react'
import { DELIVERY_PLACES, DELIVERY_TEMPLATES, MAX_DELIVERY_ITEMS, placeOf, rowsForVariant, type DeliveryItem, type DeliveryPlace, type ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import DeliveryFiles from './DeliveryFiles'
import styles from './DeliveryDetailsEditor.module.css'

export type DeliveryDraft = { items: (DeliveryItem & { id: string })[]; note: string }
export const EMPTY_DELIVERY: DeliveryDraft = { items: [], note: '' }

let counter = 0
const row = (item: Partial<DeliveryItem> = {}) => ({ id: `d${++counter}`, label: item.label || '', value: item.value || '', secret: item.secret === true, place: placeOf(item) })
/** Where a row sits on the card, in the words of the form. */
export const PLACE_LABEL: Record<DeliveryPlace, string> = { card: 'روی کارت', hero: 'درشت (مبلغ)', email: 'بخش ایمیل', aside: 'کنار کارت' }
/** The product's delivery template as a fresh form: its rows to fill in and its default note. */
/** Delivered rows (an order being printed) as a form to adjust. */
export const draftFromItems = (items: DeliveryItem[], note = ''): DeliveryDraft => ({ items: items.map((item) => row(item)), note })
export const draftFromTemplate = (template: ProductDeliveryTemplate, variant = ''): DeliveryDraft => ({ items: rowsForVariant(template, variant).map((item) => row(item)), note: template.note })
/** A password a person can still type: no look-alike characters, mixed case, digits and a few symbols. */
function strongPassword(length = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*-_=+']
  const all = sets.join(''), pick = (from: string) => from[crypto.getRandomValues(new Uint32Array(1))[0] % from.length]
  const chars = [...sets.map(pick), ...Array.from({ length: length - sets.length }, () => pick(all))]
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

/**
 * What the specialist hands the buyer of a virtual order (store/domain/delivery-details): named items the buyer copies
 * one by one, secret ones hidden on their side until they ask, and a note. Encrypted when the order is marked delivered.
 */
export default function DeliveryDetailsEditor({ orderId, value, onChange, hasPrevious, title = 'اطلاعات تحویل به خریدار', hint }: { orderId?: number; title?: string; hint?: string; value: DeliveryDraft; onChange: (next: DeliveryDraft) => void; hasPrevious?: boolean }) {
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const noteId = useId()
  const set = (id: string, patch: Partial<DeliveryItem>) => onChange({ ...value, items: value.items.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const full = value.items.length >= MAX_DELIVERY_ITEMS
  const addTemplate = (id: string) => {
    const template = DELIVERY_TEMPLATES.find((item) => item.id === id)
    if (!template) return
    // Rows already typed stay; the template's rows are added after them.
    const kept = value.items.filter((item) => item.label.trim() || item.value.trim())
    onChange({ ...value, items: [...kept, ...template.items.map((item) => row(item))].slice(0, MAX_DELIVERY_ITEMS) })
  }

  return <div className={styles.editor}>
    <div className={styles.head}>
      <span className={styles.title}>{title}</span>
      <small>{hint ?? `رمزنگاری می‌شود و فقط خریدار همین سفارش می‌بیند${hasPrevious ? ' · اطلاعات قبلی با این جایگزین می‌شود' : ''}`}</small>
    </div>
    <div className={styles.templates} role="group" aria-label="الگوهای آماده">
      {DELIVERY_TEMPLATES.map((template) => <button key={template.id} type="button" className={styles.chip} disabled={full} onClick={() => addTemplate(template.id)}>{template.label}</button>)}
      <button type="button" className={styles.chip} disabled={full} onClick={() => onChange({ ...value, items: [...value.items, row()] })}>+ ردیف</button>
    </div>
    {value.items.length > 0 ? <ul className={styles.rows}>
      {value.items.map((item) => {
        const hidden = item.secret && !shown[item.id]
        return <li key={item.id} className={styles.row}>
          <input className="input" aria-label="عنوان" placeholder="عنوان (مثلاً ایمیل)" maxLength={60} value={item.label} onChange={(event) => set(item.id, { label: event.target.value })} />
          <div className={styles.valueBox}>
            <input className={`input ${styles.value}`} dir="ltr" aria-label={`مقدار ${item.label || 'ردیف'}`} type={hidden ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder="مقدار" value={item.value} onChange={(event) => set(item.id, { value: event.target.value })} />
            {item.secret && <button type="button" className={styles.icon} aria-pressed={!hidden} aria-label={hidden ? 'نمایش مقدار' : 'پنهان کردن مقدار'} onClick={() => setShown((current) => ({ ...current, [item.id]: !current[item.id] }))}>{hidden ? 'نمایش' : 'پنهان'}</button>}
            {item.secret && <button type="button" className={styles.icon} onClick={() => { set(item.id, { value: strongPassword() }); setShown((current) => ({ ...current, [item.id]: true })) }}>رمز قوی</button>}
          </div>
          <span className={styles.flags}>
            <label className={styles.secret}><input type="checkbox" checked={item.secret} onChange={(event) => set(item.id, { secret: event.target.checked })} />محرمانه</label>
            <select className={styles.place} aria-label={`جای ${item.label || 'ردیف'} روی کارت`} value={placeOf(item)} onChange={(event) => set(item.id, { place: event.target.value as DeliveryPlace })}>{DELIVERY_PLACES.map((place) => <option key={place} value={place}>{PLACE_LABEL[place]}</option>)}</select>
          </span>
          <button type="button" className={styles.remove} aria-label={`حذف ${item.label || 'ردیف'}`} onClick={() => onChange({ ...value, items: value.items.filter((other) => other.id !== item.id) })}>×</button>
        </li>
      })}
    </ul> : <p className={styles.empty}>یکی از الگوها را بزنید یا ردیف اضافه کنید. می‌توانید فقط توضیح هم بنویسید.</p>}
    <label className={styles.note} htmlFor={noteId}>توضیح برای خریدار <small>(اختیاری، مثلاً مراحل ورود)</small></label>
    <textarea id={noteId} className="input" rows={3} maxLength={2000} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} />
    {orderId ? <DeliveryFiles orderId={orderId} /> : null}
  </div>
}
