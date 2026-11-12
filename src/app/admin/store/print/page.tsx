'use client'

import { useEffect, useRef, useState } from 'react'
import { StoreShell } from '../shared'
import DeliveryDetailsEditor, { EMPTY_DELIVERY, draftFromItems, draftFromTemplate, type DeliveryDraft } from '@/components/admin/store/DeliveryDetailsEditor'
import CardFace, { type CardBrand } from '@/components/store/card/CardFace'
import { drawCard, saveBlob } from '@/components/store/card/drawCard'
import { CARD_PRESETS, DEFAULT_CARD_DESIGN, type CardDesign } from '@/modules/store/domain/card-designs'
import { placeOf, type DeliveryNotice, type ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import './print.css'

type Product = { id: number; name: string; active: boolean; variants: string[]; template: ProductDeliveryTemplate }
type Source = 'order' | 'product' | 'manual'
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: 'product', label: 'از محصول', hint: 'طرح، ردیف‌ها و پیام‌های محصول؛ پیش‌نویس و غیرفعال هم هست' },
  { id: 'order', label: 'از سفارش', hint: 'کارت یک سفارش تحویل‌شده، با همان اطلاعات' },
  { id: 'manual', label: 'دستی', hint: 'همه‌چیز را خودتان بنویسید' },
]
const DAY = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' })

/**
 * Print a delivery card for a customer in the shop (owner 2026-11-12). Start from a product (its design, rows and
 * notices; drafts and hidden products too), from a delivered order, or from nothing; type or adjust the values, then
 * print the card alone at card size or a delivery sheet, or save the card as an image. Nothing here is stored.
 */
export default function CardPrintPage() {
  const [source, setSource] = useState<Source>('product')
  const [brand, setBrand] = useState<CardBrand>({ title: '', logo: '' })
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [product, setProduct] = useState<Product | null>(null)
  const [variant, setVariant] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [design, setDesign] = useState<CardDesign>(DEFAULT_CARD_DESIGN)
  const [notices, setNotices] = useState<(DeliveryNotice & { on: boolean })[]>([])
  const [draft, setDraft] = useState<DeliveryDraft>(EMPTY_DELIVERY)
  const [layout, setLayout] = useState<'sheet' | 'card'>('sheet')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (source !== 'product') return
    const controller = new AbortController(), timer = setTimeout(() => {
      fetch(`/api/admin/store/print?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
        .then((body) => { setProducts(body.products || []); setBrand(body.brand || { title: '', logo: '' }) })
        .catch((error) => { if (error.name !== 'AbortError') setMessage('فهرست محصولات خوانده نشد') })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [source, query])

  function applyTemplate(template: ProductDeliveryTemplate, option: string) {
    setDesign(template.design)
    setNotices(template.notices.map((notice) => ({ ...notice, on: true })))
    setDraft(draftFromTemplate(template, option))
  }
  function pickProduct(next: Product) {
    const option = next.variants[0] || ''
    setProduct(next); setVariant(option); setName(next.name + (option ? ` — ${option}` : ''))
    applyTemplate(next.template, option)
  }
  async function loadOrder(number = orderNumber) {
    setMessage(''); setBusy(true)
    try {
      const response = await fetch(`/api/admin/store/print?order=${encodeURIComponent(number.trim())}`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setMessage(body.error || 'سفارش خوانده نشد'); return }
      setBrand(body.brand); setName(body.order.product); setCustomer(body.order.customer)
      setDesign(body.order.template.design); setNotices(body.order.template.notices.map((notice: DeliveryNotice) => ({ ...notice, on: true })))
      setDraft(draftFromItems(body.order.items, body.order.note))
    } finally { setBusy(false) }
  }
  // Opened from an order (?order=ID): that order's card.
  useEffect(() => {
    const number = new URLSearchParams(window.location.search).get('order')
    if (!number) return
    setSource('order'); setOrderNumber(number); void loadOrder(number)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveImage() {
    const face = sheet.current?.querySelector<HTMLElement>('[data-card-face]')
    if (!face) return
    try { saveBlob(await drawCard(face), `card-${Date.now()}.png`) } catch { setMessage('ساخت تصویر ممکن نشد') }
  }

  const items = draft.items.filter((item) => item.label.trim())
  const onCard = items.filter((item) => placeOf(item) !== 'aside'), aside = items.filter((item) => placeOf(item) === 'aside')
  const chosenNotices = notices.filter((notice) => notice.on && notice.text.trim())

  return <StoreShell title="چاپ کارت حضوری" actions={<>
    <button type="button" className="btn btn-ghost" onClick={() => void saveImage()}>ذخیرهٔ تصویر کارت</button>
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>چاپ</button>
  </>}>
    <p className="sa-hint">برای مشتری حضوری: کارت را از یک محصول، یک سفارش یا به‌صورت دستی بسازید و چاپ کنید. اطلاعاتی که اینجا می‌نویسید جایی ذخیره نمی‌شود و با بستن صفحه پاک می‌شود.</p>
    <div className="pc-layout">
      <div className="pc-controls">
        <section className="sa-card">
          <div className="pc-sources" role="radiogroup" aria-label="شروع از">{SOURCES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={source === item.id} className="pc-source" onClick={() => { setSource(item.id); setMessage('') }}><b>{item.label}</b><small>{item.hint}</small></button>)}</div>

          {source === 'product' && <div className="pc-pick">
            <input className="input" type="search" aria-label="جست‌وجوی محصول" placeholder="نام محصول (مثلاً گیفت کارت پلی‌استیشن)" value={query} onChange={(event) => setQuery(event.target.value)} />
            <ul className="pc-results">{products.map((item) => <li key={item.id}><button type="button" aria-pressed={product?.id === item.id} onClick={() => pickProduct(item)}>
              <span>{item.name}</span>{!item.active && <small className="pc-tag">پیش‌نویس / غیرفعال</small>}{item.template.card && <small className="pc-tag is-card">کارت</small>}
            </button></li>)}{!products.length && <li className="pc-empty">محصول مجازی‌ای پیدا نشد؛ از «دستی» استفاده کنید.</li>}</ul>
            {product && product.variants.length > 0 && <label className="sa-field"><span>گزینهٔ محصول</span><select className="select" value={variant} onChange={(event) => { setVariant(event.target.value); setName(product.name + (event.target.value ? ` — ${event.target.value}` : '')); setDraft(draftFromTemplate(product.template, event.target.value)) }}>{product.variants.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
          </div>}

          {source === 'order' && <div className="pc-order">
            <label className="sa-field"><span>شمارهٔ سفارش</span><input className="input" dir="ltr" inputMode="numeric" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.replace(/[^\d]/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') void loadOrder() }} /></label>
            <button type="button" className="btn btn-ghost" disabled={busy || !orderNumber} onClick={() => void loadOrder()}>{busy ? 'در حال خواندن…' : 'بارگذاری'}</button>
          </div>}

          {message && <p className="pc-message" role="alert">{message}</p>}

          <div className="sa-grid">
            <label className="sa-field"><span>نام محصول روی کارت</span><input className="input" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="sa-field"><span>نام مشتری <small className="sa-sub">فقط روی برگهٔ تحویل</small></span><input className="input" maxLength={80} value={customer} onChange={(event) => setCustomer(event.target.value)} /></label>
            <label className="sa-field"><span>طرح کارت</span><select className="select" value={design.preset} onChange={(event) => setDesign({ ...design, preset: event.target.value, background: source === 'manual' ? '' : design.background })}>{CARD_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
            <label className="sa-field"><span>عنوان روی کارت</span><input className="input" maxLength={60} value={design.title} placeholder={brand.title || 'نام سایت'} onChange={(event) => setDesign({ ...design, title: event.target.value })} /></label>
          </div>
        </section>

        <DeliveryDetailsEditor value={draft} onChange={setDraft} title="اطلاعات روی کارت" hint="مقدارها را بنویسید؛ «کنار کارت» روی برگه زیر کارت می‌آید." />

        {notices.length > 0 && <section className="sa-card pc-notices">
          <b>پیام‌های مهم روی برگه</b>
          {notices.map((notice, index) => <label key={index} className="sa-check"><input type="checkbox" checked={notice.on} onChange={(event) => setNotices(notices.map((item, at) => at === index ? { ...item, on: event.target.checked } : item))} />{notice.text}</label>)}
        </section>}

        <section className="sa-card">
          <div className="pc-sources" role="radiogroup" aria-label="نوع چاپ">
            <button type="button" role="radio" aria-checked={layout === 'sheet'} className="pc-source" onClick={() => setLayout('sheet')}><b>برگهٔ تحویل</b><small>کارت، سؤال‌ها، پیام‌ها و توضیح</small></button>
            <button type="button" role="radio" aria-checked={layout === 'card'} className="pc-source" onClick={() => setLayout('card')}><b>فقط کارت</b><small>اندازهٔ کارت بانکی (۸۶×۵۴ میلی‌متر) با خط برش</small></button>
          </div>
        </section>
      </div>

      <div className="pc-preview">
        <div ref={sheet} className={`pc-print is-${layout}`}>
          {layout === 'sheet' && <header className="pc-sheet-head">
            <b>{design.title || brand.title}</b>
            <span>برگهٔ تحویل{customer ? ` · ${customer}` : ''}</span>
            <small suppressHydrationWarning>{DAY.format(new Date())}</small>
          </header>}
          <div className="pc-card"><CardFace design={design} brand={brand} product={name} items={onCard} shown tilt={false} /></div>
          {layout === 'sheet' && <>
            {aside.length > 0 && <dl className="pc-aside">{aside.map((item, index) => <div key={index}><dt><bdi>{item.label}</bdi></dt><dd dir="ltr">{item.value}</dd></div>)}</dl>}
            {chosenNotices.length > 0 && <ul className="pc-sheet-notices">{chosenNotices.map((notice, index) => <li key={index} className={`is-${notice.tone}`}>{notice.text}</li>)}</ul>}
            {draft.note.trim() && <p className="pc-sheet-note">{draft.note}</p>}
            <footer className="pc-sheet-foot">این برگه اطلاعات محرمانه دارد؛ آن را در جای امن نگه دارید و رمزها را پس از ورود عوض کنید.</footer>
          </>}
        </div>
      </div>
    </div>
  </StoreShell>
}
