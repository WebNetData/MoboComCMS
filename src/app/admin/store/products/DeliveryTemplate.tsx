'use client'

import { DELIVERY_TEMPLATES, MAX_DELIVERY_ITEMS, MAX_DELIVERY_NOTICES, NOTICE_TONES, type DeliveryNotice, type DeliveryTemplateRow, type NoticeTone, type ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import styles from './DeliveryTemplate.module.css'

type Form = Record<string, any>
const TONE_LABEL: Record<NoticeTone, string> = { info: 'راهنما', warning: 'هشدار', danger: 'مهم و جدی' }

/**
 * How this product's deliveries look (store/domain/delivery-details): the rows the specialist's form starts with,
 * a default note, notices the buyer reads above the delivery, and the delivery card. Saved with the product.
 */
export default function DeliveryTemplate({ form, update }: { form: Form; update: (key: string, value: unknown) => void }) {
  const value: ProductDeliveryTemplate = { card: false, rows: [], note: '', notices: [], ...(form.deliveryTemplate || {}) }
  const set = (patch: Partial<ProductDeliveryTemplate>) => update('deliveryTemplate', { ...value, ...patch })
  const setRow = (index: number, patch: Partial<DeliveryTemplateRow>) => set({ rows: value.rows.map((row, at) => at === index ? { ...row, ...patch } : row) })
  const setNotice = (index: number, patch: Partial<DeliveryNotice>) => set({ notices: value.notices.map((notice, at) => at === index ? { ...notice, ...patch } : notice) })
  const addPreset = (id: string) => {
    const preset = DELIVERY_TEMPLATES.find((item) => item.id === id)
    if (preset) set({ rows: [...value.rows, ...preset.items.map((item) => ({ label: item.label, secret: item.secret, aside: item.aside === true }))].slice(0, MAX_DELIVERY_ITEMS) })
  }

  return <section id="sa-delivery" className="sa-card">
    <header className="sa-card-head"><h2>تحویل به خریدار</h2><span className="sa-tag">{value.rows.length ? `${value.rows.length.toLocaleString('fa-IR')} ردیف` : 'بدون الگو'}</span></header>
    <p className="sa-hint">فرم تحویل کارشناس با همین ردیف‌ها و توضیح شروع می‌شود؛ پیام‌های مهم بالای اطلاعات تحویل به خریدار نشان داده می‌شوند.</p>

    <label className={styles.cardToggle}>
      <input type="checkbox" checked={value.card} onChange={(event) => set({ card: event.target.checked })} />
      <span><b>نمایش به‌صورت کارت</b><small>اطلاعات تحویل مثل یک کارت با نام و لوگوی سایت نشان داده می‌شود و خریدار می‌تواند آن را با زمینهٔ دلخواه به‌صورت تصویر یا فایل متنی ذخیره کند.</small></span>
    </label>

    <div className={styles.block}>
      <div className={styles.blockHead}>
        <b>ردیف‌های فرم کارشناس</b>
        <div className={styles.presets} role="group" aria-label="افزودن از الگوهای آماده">
          {DELIVERY_TEMPLATES.map((preset) => <button key={preset.id} type="button" className={styles.chip} disabled={value.rows.length >= MAX_DELIVERY_ITEMS} onClick={() => addPreset(preset.id)}>+ {preset.label}</button>)}
          <button type="button" className={styles.chip} disabled={value.rows.length >= MAX_DELIVERY_ITEMS} onClick={() => set({ rows: [...value.rows, { label: '', secret: false, aside: false }] })}>+ ردیف</button>
        </div>
      </div>
      {value.rows.length > 0 && <ul className={styles.rows}>{value.rows.map((row, index) => <li key={index} className={styles.row}>
        <input className="input" aria-label={`عنوان ردیف ${(index + 1).toLocaleString('fa-IR')}`} maxLength={160} value={row.label} placeholder="مثلاً Apple ID یا سؤال امنیتی" onChange={(event) => setRow(index, { label: event.target.value })} />
        <label className="sa-check"><input type="checkbox" checked={row.secret} onChange={(event) => setRow(index, { secret: event.target.checked })} />محرمانه</label>
        <label className="sa-check" title="مثل سؤال‌های امنیتی: کنار کارت، نه روی آن"><input type="checkbox" checked={row.aside} onChange={(event) => setRow(index, { aside: event.target.checked })} />کنار کارت</label>
        <button type="button" className="sa-link is-danger" aria-label={`حذف ${row.label || 'ردیف'}`} onClick={() => set({ rows: value.rows.filter((_, at) => at !== index) })}>حذف</button>
      </li>)}</ul>}
    </div>

    <label className="sa-field"><span>توضیح پیش‌فرض برای خریدار</span><textarea className="input" rows={2} maxLength={2000} value={value.note} placeholder="مثلاً: برای ورود، اول ایمیل را باز کنید…" onChange={(event) => set({ note: event.target.value })} /></label>

    <div className={styles.block}>
      <div className={styles.blockHead}>
        <b>پیام‌های مهم برای خریدار</b>
        <button type="button" className={styles.chip} disabled={value.notices.length >= MAX_DELIVERY_NOTICES} onClick={() => set({ notices: [...value.notices, { tone: 'info', text: '' }] })}>+ پیام</button>
      </div>
      {value.notices.length > 0 && <ul className={styles.rows}>{value.notices.map((notice, index) => <li key={index} className={`${styles.notice} ${styles[`tone_${notice.tone}`]}`}>
        <select className="select" aria-label="نوع پیام" value={notice.tone} onChange={(event) => setNotice(index, { tone: event.target.value as NoticeTone })}>{NOTICE_TONES.map((tone) => <option key={tone} value={tone}>{TONE_LABEL[tone]}</option>)}</select>
        <textarea className="input" aria-label={`متن پیام ${(index + 1).toLocaleString('fa-IR')}`} rows={2} maxLength={600} value={notice.text} placeholder="مثلاً: پس از ورود، گزینهٔ Find My را خاموش کنید." onChange={(event) => setNotice(index, { text: event.target.value })} />
        <button type="button" className="sa-link is-danger" aria-label={`حذف پیام ${(index + 1).toLocaleString('fa-IR')}`} onClick={() => set({ notices: value.notices.filter((_, at) => at !== index) })}>حذف</button>
      </li>)}</ul>}
    </div>
  </section>
}
