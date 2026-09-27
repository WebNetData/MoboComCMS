'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MegaMenuPanelBody } from '@/components/site/MegaMenu'
import type { MegaMenu, MegaMenuConfig, MegaSection, SectionMenuConfig } from '@/modules/navigation/domain/megamenu'

type SectionState = { section: MegaSection; label: string; available: boolean; preview: MegaMenu }
type State = { config: MegaMenuConfig; sections: SectionState[]; moduleEnabled: boolean }

/** Per-section mega menu settings with a live preview of the panel. */
export default function AdminMegaMenuPage() {
  const [state, setState] = useState<State | null>(null)
  const [config, setConfig] = useState<MegaMenuConfig | null>(null)
  const [active, setActive] = useState<MegaSection>('shop')
  const [preview, setPreview] = useState<MegaMenu | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/admin/mega-menu', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (!response.ok) { setMessage({ text: body?.error || 'دریافت تنظیمات ناموفق بود', error: true }); return }
      setState(body); setConfig(body.config)
    }).catch(() => setMessage({ text: 'ارتباط برقرار نشد', error: true }))
  }, [])

  const section = config?.sections[active]
  // Live preview of unsaved changes (debounced).
  useEffect(() => {
    if (!section) return
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(async () => {
      const response = await fetch('/api/admin/mega-menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: active, config: section }) }).catch(() => null)
      const body = await response?.json().catch(() => null)
      if (response?.ok) setPreview(body.preview)
    }, 350)
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current) }
  }, [active, section])

  if (!state || !config || !section) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="sh-skeleton" aria-busy="true" />}</div>

  const info = state.sections.find((s) => s.section === active)!
  const patch = (next: Partial<SectionMenuConfig>) => setConfig({ ...config, sections: { ...config.sections, [active]: { ...section, ...next } } })
  const setLink = (index: number, key: 'label' | 'href', value: string) => patch({ links: section.links.map((link, i) => (i === index ? { ...link, [key]: value } : link)) })

  async function save() {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/mega-menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'ذخیره نشد', error: true }); return }
    setState(body); setConfig(body.config)
    setMessage({ text: 'مگامنوها ذخیره شد؛ تا یک دقیقه روی سایت اعمال می‌شود', error: false })
  }

  const numberField = (key: 'columns' | 'linksPerColumn' | 'features', label: string, min: number, max: number) => <label className="sh-field"><span>{label}</span>
    <input className="sh-input" type="number" dir="ltr" min={min} max={max} value={section[key]} onChange={(e) => patch({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })} />
  </label>

  return <div className="xm-page sh-admin" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">NAVIGATION · MEGA MENU</span><h1>مگامنوی بخش‌ها</h1>
      <p>هر بخش گستردهٔ سایت زیر آیتم خودش در منوی اصلی یک مگامنوی جدا دارد که از دسته‌بندی‌ها و زیردسته‌های همان بخش ساخته می‌شود و با اضافه شدن محتوا خودکار به‌روز می‌شود. ترتیب و عنوان آیتم‌های منوی اصلی را در <Link href="/admin/studio">ظاهر و منوها</Link> تنظیم کنید.</p></div></header>
    {!state.moduleEnabled && <div className="xm-notice is-error">ماژول «مگامنوی بخش‌ها» غیرفعال است؛ از بخش افزونه‌ها فعالش کنید.</div>}
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <label className="sh-check"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />نمایش مگامنو در سایت</label>

    <div className="mmx-layout">
      <ul className="mmx-sections" role="tablist" aria-label="بخش‌ها">
        {state.sections.map((s) => <li key={s.section}><button type="button" role="tab" aria-current={s.section === active} aria-selected={s.section === active} onClick={() => { setActive(s.section); setPreview(null) }}>
          <span>{s.label}</span><small>{!s.available ? 'ماژول خاموش' : config.sections[s.section].enabled ? 'فعال' : 'خاموش'}</small>
        </button></li>)}
      </ul>

      <div className="mmx-editor">
        {!info.available && <div className="xm-notice">ماژول این بخش خاموش است؛ مگامنوی آن تا روشن شدن ماژول نمایش داده نمی‌شود.</div>}
        <section className="sh-panel">
          <header className="sh-panel-head"><h2>مگامنوی {info.label}</h2>
            <label className="sh-check"><input type="checkbox" checked={section.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />فعال</label></header>
          <div className="sh-grid sh-admin-fields">
            {numberField('columns', 'تعداد ستون‌ها', 1, 6)}
            {numberField('linksPerColumn', 'لینک در هر ستون', 3, 15)}
            {numberField('features', 'موارد ویژهٔ تصویردار', 0, 3)}
          </div>
          <p className="sh-muted">ستون‌ها از دسته‌های اصلی و زیرشاخه‌هایشان ساخته می‌شوند؛ دسته‌های بدون زیرشاخه در ستون اول کنار هم قرار می‌گیرند.</p>
        </section>

        <section className="sh-panel">
          <header className="sh-panel-head"><h2>لینک‌های سریع</h2>
            <button type="button" className="sh-btn sh-btn-ghost" disabled={section.links.length >= 12} onClick={() => patch({ links: [...section.links, { label: '', href: '' }] })}>+ لینک</button></header>
          <div className="mmx-links">
            {section.links.map((link, index) => <div key={index} className="mmx-link-row">
              <input className="sh-input" aria-label="عنوان" placeholder="عنوان (مثلاً حراج هفته)" value={link.label} onChange={(e) => setLink(index, 'label', e.target.value)} />
              <input className="sh-input" aria-label="نشانی" dir="ltr" placeholder="/products?category=..." value={link.href} onChange={(e) => setLink(index, 'href', e.target.value)} />
              <button type="button" className="sh-link is-danger" onClick={() => patch({ links: section.links.filter((_, i) => i !== index) })}>حذف</button>
            </div>)}
            {!section.links.length && <p className="sh-muted">لینکی اضافه نشده؛ لینک‌های خودکار بخش نمایش داده می‌شوند.</p>}
          </div>
          <label className="sh-check"><input type="checkbox" checked={section.hideAutoLinks} onChange={(e) => patch({ hideAutoLinks: e.target.checked })} />لینک‌های خودکار (جدیدترین، پربازدید، …) نمایش داده نشوند</label>
        </section>

        <section className="sh-panel">
          <header className="sh-panel-head"><h2>بنر تبلیغاتی</h2>
            <label className="sh-check"><input type="checkbox" checked={section.promo.enabled} onChange={(e) => patch({ promo: { ...section.promo, enabled: e.target.checked } })} />نمایش بنر</label></header>
          <div className="sh-grid">
            <label className="sh-field"><span>عنوان</span><input className="sh-input" maxLength={80} value={section.promo.title} onChange={(e) => patch({ promo: { ...section.promo, title: e.target.value } })} /></label>
            <label className="sh-field"><span>متن دکمه</span><input className="sh-input" maxLength={30} placeholder="مشاهده" value={section.promo.cta} onChange={(e) => patch({ promo: { ...section.promo, cta: e.target.value } })} /></label>
            <label className="sh-field sh-span"><span>توضیح کوتاه</span><input className="sh-input" maxLength={160} value={section.promo.text} onChange={(e) => patch({ promo: { ...section.promo, text: e.target.value } })} /></label>
            <label className="sh-field"><span>نشانی</span><input className="sh-input" dir="ltr" placeholder="/vip" value={section.promo.href} onChange={(e) => patch({ promo: { ...section.promo, href: e.target.value } })} /></label>
            <label className="sh-field"><span>تصویر پس‌زمینه (اختیاری)</span><input className="sh-input" dir="ltr" placeholder="/uploads/banner.jpg" value={section.promo.image} onChange={(e) => patch({ promo: { ...section.promo, image: e.target.value } })} /></label>
          </div>
        </section>

        <section className="mmx-preview" aria-label="پیش‌نمایش">
          <div className="mmx-preview-label">پیش‌نمایش زنده (با داده‌های واقعی این بخش)</div>
          {preview ? <MegaMenuPanelBody menu={preview} /> : <div className="sh-skeleton" aria-busy="true" />}
        </section>

        <div className="sh-sticky-save"><button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ مگامنوها'}</button></div>
      </div>
    </div>
  </div>
}
