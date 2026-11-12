'use client'

import { DELIVERY_PLACES, DELIVERY_TEMPLATES, MAX_DELIVERY_ITEMS, MAX_DELIVERY_NOTICES, NOTICE_TONES, type DeliveryItem, type DeliveryNotice, type DeliveryPlace, type DeliveryTemplateRow, type NoticeTone, type ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import { CARD_PRESETS, DEFAULT_CARD_DESIGN, type CardDesign } from '@/modules/store/domain/card-designs'
import CardFace from '@/components/store/card/CardFace'
import { PLACE_LABEL } from '@/components/admin/store/DeliveryDetailsEditor'
import CoverField from '../../cms/CoverField'
import styles from './DeliveryTemplate.module.css'

type Form = Record<string, any>
const TONE_LABEL: Record<NoticeTone, string> = { info: 'راهنما', warning: 'هشدار', danger: 'مهم و جدی' }
/** What the preview shows for a row before anything is delivered. */
const SAMPLE: Record<DeliveryPlace, string> = { hero: '$50', card: 'sample@example.com', email: 'mail@example.com', aside: '—' }

/**
 * How this product's deliveries look (store/domain/delivery-details, card-designs): the rows the specialist's form
 * starts with (for every option or only some), a default note, notices the buyer reads above the delivery, and the
 * card with its design. Saved with the product.
 */
export default function DeliveryTemplate({ form, update, onBusy }: { form: Form; update: (key: string, value: unknown) => void; onBusy?: (busy: boolean) => void }) {
  const value: ProductDeliveryTemplate = { card: false, rows: [], note: '', notices: [], ...(form.deliveryTemplate || {}), design: { ...DEFAULT_CARD_DESIGN, ...(form.deliveryTemplate?.design || {}) } }
  const options: string[] = (Array.isArray(form.variants) ? form.variants : []).map((variant: Form) => String(variant.name || '').trim()).filter(Boolean)
  const set = (patch: Partial<ProductDeliveryTemplate>) => update('deliveryTemplate', { ...value, ...patch })
  const setDesign = (patch: Partial<CardDesign>) => set({ design: { ...value.design, ...patch } })
  const setRow = (index: number, patch: Partial<DeliveryTemplateRow>) => set({ rows: value.rows.map((row, at) => at === index ? { ...row, ...patch } : row) })
  const setNotice = (index: number, patch: Partial<DeliveryNotice>) => set({ notices: value.notices.map((notice, at) => at === index ? { ...notice, ...patch } : notice) })
  const addPreset = (id: string) => {
    const preset = DELIVERY_TEMPLATES.find((item) => item.id === id)
    if (preset) set({ rows: [...value.rows, ...preset.items.map((item) => ({ label: item.label, secret: item.secret, place: item.place || 'card', variants: [] }))].slice(0, MAX_DELIVERY_ITEMS) })
  }
  const sample: DeliveryItem[] = (value.rows.length ? value.rows : [{ label: 'Apple ID', secret: false, place: 'card' as const, variants: [] }, { label: 'رمز عبور', secret: true, place: 'card' as const, variants: [] }])
    .filter((row) => row.place !== 'aside').map((row) => ({ label: row.label, value: row.secret ? 'Secret#2048' : SAMPLE[row.place], secret: row.secret, place: row.place }))
  const brand = { title: value.design.title || 'نام سایت شما', logo: '' }

  return <section id="sa-delivery" className="sa-card">
    <header className="sa-card-head"><h2>تحویل به خریدار</h2><span className="sa-tag">{value.rows.length ? `${value.rows.length.toLocaleString('fa-IR')} ردیف` : 'بدون الگو'}</span></header>
    <p className="sa-hint">فرم تحویل کارشناس با همین ردیف‌ها و توضیح شروع می‌شود؛ پیام‌های مهم بالای اطلاعات تحویل به خریدار نشان داده می‌شوند. همین کارت در «چاپ کارت حضوری» هم استفاده می‌شود.</p>

    <div className={styles.block}>
      <div className={styles.blockHead}>
        <b>ردیف‌های فرم کارشناس</b>
        <div className={styles.presets} role="group" aria-label="افزودن از الگوهای آماده">
          {DELIVERY_TEMPLATES.map((preset) => <button key={preset.id} type="button" className={styles.chip} disabled={value.rows.length >= MAX_DELIVERY_ITEMS} onClick={() => addPreset(preset.id)}>+ {preset.label}</button>)}
          <button type="button" className={styles.chip} disabled={value.rows.length >= MAX_DELIVERY_ITEMS} onClick={() => set({ rows: [...value.rows, { label: '', secret: false, place: 'card', variants: [] }] })}>+ ردیف</button>
        </div>
      </div>
      {value.rows.length > 0 && <ul className={styles.rows}>{value.rows.map((row, index) => <li key={index} className={styles.rowBox}>
        <div className={styles.row}>
          <input className="input" aria-label={`عنوان ردیف ${(index + 1).toLocaleString('fa-IR')}`} maxLength={160} value={row.label} placeholder="مثلاً Apple ID یا سؤال امنیتی" onChange={(event) => setRow(index, { label: event.target.value })} />
          <select className="select" aria-label={`جای ردیف ${(index + 1).toLocaleString('fa-IR')}`} value={row.place} onChange={(event) => setRow(index, { place: event.target.value as DeliveryPlace })}>{DELIVERY_PLACES.map((place) => <option key={place} value={place}>{PLACE_LABEL[place]}</option>)}</select>
          <label className="sa-check"><input type="checkbox" checked={row.secret} onChange={(event) => setRow(index, { secret: event.target.checked })} />محرمانه</label>
          <button type="button" className="sa-link is-danger" aria-label={`حذف ${row.label || 'ردیف'}`} onClick={() => set({ rows: value.rows.filter((_, at) => at !== index) })}>حذف</button>
        </div>
        {options.length > 0 && <div className={styles.options} role="group" aria-label={`گزینه‌های ردیف ${(index + 1).toLocaleString('fa-IR')}`}>
          <span>برای کدام گزینه؟</span>
          <label className="sa-check"><input type="checkbox" checked={!row.variants.length} onChange={() => setRow(index, { variants: [] })} />همه</label>
          {options.map((name) => <label key={name} className="sa-check"><input type="checkbox" checked={row.variants.includes(name)} onChange={(event) => setRow(index, { variants: event.target.checked ? [...row.variants, name] : row.variants.filter((item) => item !== name) })} />{name}</label>)}
        </div>}
      </li>)}</ul>}
      {options.length > 0 && <small className={styles.help}>مثلاً ردیف‌های «بخش ایمیل» را فقط برای گزینهٔ «همراه با ساخت ایمیل» بزنید تا در سفارش‌های بدون ایمیل نیایند.</small>}
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

    <label className={styles.cardToggle}>
      <input type="checkbox" checked={value.card} onChange={(event) => set({ card: event.target.checked })} />
      <span><b>نمایش به‌صورت کارت</b><small>اطلاعات تحویل مثل یک کارت (اکانت یا گیفت کارت) نشان داده می‌شود و خریدار آن را به‌صورت تصویر یا فایل متنی ذخیره می‌کند.</small></span>
    </label>

    {value.card && <div className={styles.design}>
      <div className={styles.designForm}>
        <div className={styles.block}>
          <b>طرح کارت</b>
          <div className={styles.presetGrid} role="radiogroup" aria-label="طرح کارت">{CARD_PRESETS.map((preset) => <button key={preset.id} type="button" role="radio" aria-checked={value.design.preset === preset.id} className={styles.presetTile} onClick={() => setDesign({ preset: preset.id })}>
            <span className={styles.presetSwatch} style={{ background: preset.bg === 'site' ? 'color-mix(in srgb, var(--primary) 82%, #000)' : preset.bg, color: preset.ink }}>{preset.stripe && <i style={{ background: `linear-gradient(90deg, ${preset.stripe.map((color, at) => `${color} ${at * 25}% ${(at + 1) * 25}%`).join(', ')})` }} />}<b style={{ background: preset.accent }} /></span>
            <small>{preset.label}</small>
          </button>)}</div>
        </div>
        <div className="sa-grid">
          <label className="sa-field"><span>عنوان روی کارت</span><input className="input" maxLength={60} value={value.design.title} placeholder="خالی = نام سایت" onChange={(event) => setDesign({ title: event.target.value })} /></label>
          <label className="sa-field"><span>رنگ تأکید (مبلغ و خط زیر عنوان)</span><span className={styles.colorRow}><input type="color" aria-label="رنگ تأکید" value={value.design.accent || '#ffffff'} onChange={(event) => setDesign({ accent: event.target.value })} />{value.design.accent && <button type="button" className="sa-link" onClick={() => setDesign({ accent: '' })}>رنگ طرح</button>}</span></label>
          <label className="sa-field"><span>نمایش کد و رمز</span><select className="select" value={value.design.reveal} onChange={(event) => setDesign({ reveal: event.target.value === 'scratch' ? 'scratch' : 'button' })}><option value="button">با دکمهٔ «نمایش»</option><option value="scratch">تراشیدنی (گیفت کارت)</option></select></label>
        </div>
        <div className="sa-grid">
          <div className="sa-field"><span>لوگوی کارت <small className="sa-sub">خالی = لوگوی سایت</small></span><CoverField mode="logo" value={value.design.logo} title={`${form.name || 'محصول'} لوگوی کارت`} onChange={(logo) => setDesign({ logo })} onBusy={(busy) => onBusy?.(busy)} /></div>
          <div className="sa-field"><span>تصویر زمینه <small className="sa-sub">اختیاری؛ متن روی آن سفید می‌شود</small></span><CoverField mode="media" value={value.design.background} title={`${form.name || 'محصول'} زمینهٔ کارت`} onChange={(background) => setDesign({ background })} onBusy={(busy) => onBusy?.(busy)} /></div>
        </div>
      </div>
      <figure className={styles.preview}>
        <CardFace design={value.design} brand={brand} product={String(form.name || 'نام محصول')} items={sample} shown={false} />
        <figcaption>پیش‌نمایش با مقدارهای نمونه</figcaption>
      </figure>
    </div>}
  </section>
}
