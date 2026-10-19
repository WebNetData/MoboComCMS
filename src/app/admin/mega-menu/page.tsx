'use client'
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import SectionMegaBar, { MegaPanel } from '@/components/site/SectionMegaBar'
import type { MegaMenuConfig, MegaSection, SectionBar, SectionMenuConfig } from '@/modules/navigation/domain/megamenu'
import MenuTreeEditor from '@/components/admin/MenuTreeEditor'
import MenuIconField from '@/components/admin/MenuIconField'
import CategoryMenuControls from './CategoryMenuControls'
import AutomaticLinkControls from './AutomaticLinkControls'
import { identifyMenu } from '@/modules/site/config/menus'

type SectionState = { section: MegaSection; label: string; available: boolean; preview: SectionBar }
type State = { config: MegaMenuConfig; revision: string; sections: SectionState[]; moduleEnabled: boolean }

function identifyDraft(config: MegaMenuConfig): MegaMenuConfig {
  const sections = { ...config.sections }
  for (const section of Object.keys(sections) as MegaSection[]) sections[section] = { ...sections[section], customItems: identifyMenu(sections[section].customItems) }
  return { ...config, sections }
}

/** Per-section mega menu settings with a live preview of the panel. */
export default function AdminMegaMenuPage() {
  const [state, setState] = useState<State | null>(null)
  const [config, setConfig] = useState<MegaMenuConfig | null>(null)
  const [active, setActive] = useState<MegaSection>('shop')
  const [preview, setPreview] = useState<SectionBar | null>(null)
  const [panel, setPanel] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/mega-menu', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (controller.signal.aborted) return
      if (!response.ok) { setMessage({ text: body?.error || 'دریافت تنظیمات ناموفق بود', error: true }); return }
      setState(body); setConfig(identifyDraft(body.config))
    }).catch(() => { if (!controller.signal.aborted) setMessage({ text: 'ارتباط برقرار نشد', error: true }) })
    return () => controller.abort()
  }, [])

  const section = config?.sections[active]
  // Live preview of unsaved changes (debounced).
  useEffect(() => {
    if (!section) return
    const controller = new AbortController()
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(async () => {
      const response = await fetch('/api/admin/mega-menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ preview: active, config: section }) }).catch(() => null)
      const body = await response?.json().catch(() => null)
      if (controller.signal.aborted) return
      if (response?.ok) { setPreview(body.preview); setPreviewError('') }
      else setPreviewError(body?.error || 'پیش‌نمایش به‌روز نشد؛ ارتباط را بررسی کنید')
    }, 350)
    return () => { controller.abort(); if (previewTimer.current) clearTimeout(previewTimer.current) }
  }, [active, section])

  if (!state || !config || !section) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="sh-skeleton" aria-busy="true" />}</div>

  const info = state.sections.find((s) => s.section === active)!
  const patch = (next: Partial<SectionMenuConfig>) => setConfig({ ...config, sections: { ...config.sections, [active]: { ...section, ...next } } })
  const setLink = (index: number, key: 'label' | 'href' | 'icon', value: string) => patch({ links: section.links.map((link, i) => (i === index ? { ...link, [key]: value } : link)) })

  async function save() {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/mega-menu', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': state!.revision }, body: JSON.stringify(config) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'ذخیره نشد', error: true }); return }
    setState(body); setConfig(identifyDraft(body.config))
    setMessage({ text: 'مگامنوها ذخیره شد و با تازه‌سازی صفحهٔ سایت نمایش داده می‌شود', error: false })
  }

  const numberField = (key: 'columns' | 'linksPerColumn' | 'features', label: string, min: number, max: number) => <label className="sh-field"><span>{label}</span>
    <input className="sh-input" type="number" dir="ltr" min={min} max={max} value={section[key]} onChange={(e) => patch({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })} />
  </label>

  return <div className="xm-page sh-admin" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">ناوبری · مگامنو</span><h1>منو و مگامنوی بخش‌ها</h1>
      <p>نمایش، ترتیب، عنوان و آیکن منوهای هر بخش را تنظیم کنید و منو و زیرمنوی دلخواه بسازید. <Link href="/admin/studio?tab=design">منوی اصلی هدر و فوتر</Link> در استودیوی سایت مدیریت می‌شود.</p></div></header>
    {!state.moduleEnabled && <div className="xm-notice is-error">ماژول «مگامنوی بخش‌ها» غیرفعال است؛ از بخش افزونه‌ها فعالش کنید.</div>}
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <fieldset disabled={busy} aria-label="ویرایش منوهای بخش‌ها" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <label className="sh-check"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />نمایش منوی اختصاصی بخش‌ها</label>

    <div className="mmx-layout">
      <ul className="mmx-sections" role="tablist" aria-label="بخش‌ها" aria-orientation="vertical" onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const index = state.sections.findIndex(item => item.section === active)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.sections.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + state.sections.length) % state.sections.length
        setActive(state.sections[next].section); setPreview(null); setPanel('')
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
      }}>
        {state.sections.map((s) => <li key={s.section} role="presentation"><button type="button" role="tab" id={`menu-tab-${s.section}`} aria-controls="menu-section-editor" tabIndex={s.section === active ? 0 : -1} aria-selected={s.section === active} onClick={() => { setActive(s.section); setPreview(null); setPanel('') }}>
          <span>{s.label}</span><small>{!s.available ? 'ماژول خاموش' : config.sections[s.section].enabled ? 'فعال' : 'خاموش'}</small>
        </button></li>)}
      </ul>

      <div className="mmx-editor" id="menu-section-editor" role="tabpanel" aria-labelledby={`menu-tab-${active}`}>
        <nav aria-label="مدیریت دسته‌بندی بخش" className="flex gap-2 flex-wrap"><Link className="sh-btn sh-btn-ghost" href={active === 'shop' ? '/admin/productcats' : active === 'blog' ? '/admin/postcats' : active === 'forum' ? '/admin/forum' : `/admin/taxonomy?tax=${active}`}>افزودن، ویرایش یا حذف دسته‌ها</Link>{active === 'music' && <Link className="sh-btn sh-btn-ghost" href="/admin/taxonomy?tax=music-language">زبان و گویش آهنگ‌ها</Link>}</nav>
        {!info.available && <div className="xm-notice">ماژول این بخش خاموش است؛ مگامنوی آن تا روشن شدن ماژول نمایش داده نمی‌شود.</div>}
        <section className="sh-panel">
          <header className="sh-panel-head"><h2>منوی بخش {info.label}</h2>
            <label className="sh-check"><input type="checkbox" checked={section.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />فعال</label></header>
          <div className="sh-grid sh-admin-fields">
            {numberField('columns', 'ستون در منوی هر دسته', 1, 6)}
            {numberField('linksPerColumn', 'لینک در هر ستون', 3, 15)}
            {numberField('features', 'موارد ویژهٔ تصویردار', 0, 3)}
          </div>
          <p className="sh-muted">هر دستهٔ اصلی یک آیتم منوی بخش است؛ زیردسته‌هایش ستون‌های منوی کشویی آن را می‌سازند و زیردسته‌های بدون فرزند در ستون اول کنار هم می‌آیند.</p>
        </section>

        <section className="sh-panel">
          <header className="sh-panel-head"><h2>آیتم‌های منوی بخش</h2><small className="sh-muted">ترتیب، نمایش و تعداد</small></header>
          {(preview || info.preview).catalog.length ? <ol className="mmx-items">{(preview || info.preview).catalog.map((item, index, list) => {
            const move = (delta: number) => { const keys = list.map((entry) => entry.key); const target = index + delta; if (target < 0 || target >= keys.length) return; [keys[index], keys[target]] = [keys[target], keys[index]]; patch({ itemOrder: keys }) }
            const hidden = section.hiddenItems.includes(item.key) || section.nodeOverrides[item.key]?.hidden === true
            return <li key={item.key} className={hidden ? 'is-off' : ''}>
              <span className="mmx-item-index num">{(index + 1).toLocaleString('fa-IR')}</span>
              <label className="sh-check"><input type="checkbox" checked={!hidden} onChange={(e) => patch({ hiddenItems: e.target.checked ? section.hiddenItems.filter((key) => key !== item.key) : [...section.hiddenItems, item.key], nodeOverrides: { ...section.nodeOverrides, [item.key]: { ...section.nodeOverrides[item.key], hidden: false } } })} />{item.label}</label>
              <span className="mmx-item-move"><button type="button" className="sh-btn sh-btn-ghost" disabled={index === 0} onClick={() => move(-1)} aria-label={`بالا بردن ${item.label}`}>↑</button><button type="button" className="sh-btn sh-btn-ghost" disabled={index === list.length - 1} onClick={() => move(1)} aria-label={`پایین بردن ${item.label}`}>↓</button></span>
              <details style={{ gridColumn: '1 / -1' }}><summary>عنوان و آیکن</summary><label className="sh-field"><span>عنوان در منو</span><input className="sh-input" maxLength={120} placeholder={item.label} value={section.nodeOverrides[item.key]?.label || ''} onChange={event => patch({ nodeOverrides: { ...section.nodeOverrides, [item.key]: { ...section.nodeOverrides[item.key], label: event.target.value } } })} /></label><MenuIconField automatic value={section.nodeOverrides[item.key]?.icon} onChange={icon => { const value = { ...section.nodeOverrides[item.key] }; if (icon === undefined) delete value.icon; else value.icon = icon; patch({ nodeOverrides: { ...section.nodeOverrides, [item.key]: value } }) }} /></details>
            </li>
          })}</ol> : <p className="sh-muted">این بخش هنوز دستهٔ اصلی ندارد.</p>}
          <div className="sh-grid sh-admin-fields">
            <label className="sh-field"><span>حداکثر آیتم در نوار (بقیه در «بیشتر»)</span><input className="sh-input" type="number" dir="ltr" min={0} max={20} value={section.maxItems} onChange={(e) => patch({ maxItems: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} /><small className="sh-muted">۰ = هر تعداد که جا شود؛ آیتم‌هایی که جا نشوند خودکار به «بیشتر» می‌روند.</small></label>
          </div>
          <label className="sh-check"><input type="checkbox" checked={section.showSearch} onChange={(e) => patch({ showSearch: e.target.checked })} />کادر جست‌وجوی بخش در نوار منو</label>
          <label className="sh-check"><input type="checkbox" checked={section.showQuick} onChange={(e) => patch({ showQuick: e.target.checked })} />لینک‌های سریع در نوار منو</label>
          <div className="sh-grid"><label className="sh-field"><span>عنوان لینک خانهٔ بخش</span><input className="sh-input" maxLength={120} placeholder={`خانهٔ ${info.label}`} value={section.homeLabel || ''} onChange={event => patch({ homeLabel: event.target.value })} /></label><MenuIconField automatic value={section.homeIcon ?? undefined} onChange={homeIcon => patch({ homeIcon: homeIcon ?? null })} /></div>
          <label className="sh-check"><input type="checkbox" checked={section.showHome} onChange={event => patch({ showHome: event.target.checked })} />نمایش لینک خانهٔ بخش</label>
        </section>

        <section className="sh-panel">
          <header className="sh-panel-head"><h2>لینک‌های سریع</h2>
            <button type="button" className="sh-btn sh-btn-ghost" disabled={section.links.length >= 12} onClick={() => patch({ links: [...section.links, { label: '', href: '' }] })}>+ لینک</button></header>
          <div className="mmx-links">
            {section.links.map((link, index) => <div key={index} className="mmx-link-row">
              <input className="sh-input" aria-label="عنوان" placeholder="عنوان (مثلاً حراج هفته)" value={link.label} onChange={(e) => setLink(index, 'label', e.target.value)} />
              <input className="sh-input" aria-label="نشانی" dir="ltr" placeholder="/products?category=..." value={link.href} onChange={(e) => setLink(index, 'href', e.target.value)} />
              <div className="mmx-link-controls"><MenuIconField value={link.icon || ''} onChange={icon => setLink(index, 'icon', icon || '')} />
              <label className="sh-check"><input type="checkbox" checked={link.enabled !== false} onChange={event => patch({ links: section.links.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item) })} />نمایش لینک</label>
              <button type="button" className="sh-btn sh-btn-ghost" disabled={index === 0} aria-label={`بالا بردن لینک ${link.label}`} onClick={() => { const links = [...section.links]; [links[index - 1], links[index]] = [links[index], links[index - 1]]; patch({ links }) }}>↑</button>
              <button type="button" className="sh-btn sh-btn-ghost" disabled={index === section.links.length - 1} aria-label={`پایین بردن لینک ${link.label}`} onClick={() => { const links = [...section.links]; [links[index + 1], links[index]] = [links[index], links[index + 1]]; patch({ links }) }}>↓</button>
              <button type="button" className="sh-link is-danger" onClick={() => patch({ links: section.links.filter((_, i) => i !== index) })}>حذف</button>
              </div>
            </div>)}
            {!section.links.length && <p className="sh-muted">لینکی اضافه نشده؛ لینک‌های خودکار بخش نمایش داده می‌شوند.</p>}
          </div>
          <label className="sh-check"><input type="checkbox" checked={section.hideAutoLinks} onChange={(e) => patch({ hideAutoLinks: e.target.checked })} />لینک‌های خودکار (جدیدترین، پربازدید، …) نمایش داده نشوند</label>
          <AutomaticLinkControls items={(preview || info.preview).quickCatalog || []} config={section} onChange={patch} />
        </section>

        <CategoryMenuControls key={active} nodes={(preview || info.preview).categoryCatalog || []} config={section} onChange={patch} />
        <section className="sh-panel"><header className="sh-panel-head"><h2>منوها و زیرمنوهای دلخواه</h2></header><p className="sh-muted">لینک به صفحه، دسته یا نشانی دلخواه؛ بدون تغییر دسته‌بندی محتوای سایت. نمایش در بخش خاموش به‌صورت خودکار متوقف می‌شود.</p><MenuTreeEditor value={section.customItems} onChange={customItems => patch({ customItems })} /></section>

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
          {previewError && <p role="status" className="xm-notice is-error">{previewError}</p>}
          {preview ? <>
            <div className="mmx-bar-preview"><SectionMegaBar bar={preview} /></div>
            {preview.items.some((item) => item.columns.length) ? <>
              <div className="mmx-panel-pick" role="group" aria-label="پیش‌نمایش منوی هر دسته">{preview.items.filter((item) => item.columns.length || item.features.length).map((item) => <button key={item.key} type="button" aria-pressed={(panel || preview.items[0].key) === item.key} onClick={() => setPanel(item.key)}>{item.label}</button>)}</div>
              {(() => { const item = preview.items.find((entry) => entry.key === panel) || preview.items.find((entry) => entry.columns.length || entry.features.length); return item ? <MegaPanel item={item} promo={preview.promo} /> : null })()}
            </> : <p className="sh-muted mmx-empty-note">این بخش هنوز دسته‌بندی ندارد؛ از «دسته‌بندی و زیردسته‌ها» دسته بسازید تا هر دسته منوی کشویی خودش را داشته باشد.</p>}
          </> : <div className="sh-skeleton" aria-busy="true" />}
        </section>

        <div className="sh-sticky-save"><button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ مگامنوها'}</button></div>
      </div>
    </div>
    </fieldset>
  </div>
}
