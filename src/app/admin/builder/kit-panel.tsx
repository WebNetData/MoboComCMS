'use client'

import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_KIT, KIT_BUTTONS, KIT_COLOR_IDS, KIT_FONTS, KIT_RADII, KIT_SCALES, KIT_WEIGHTS, kitCss, validateKit, type BuilderKit } from '@/modules/site/domain/builder-kit'

type L = (en: string, fa: string) => string

/** The kit's colours for the advanced style's swatches; loaded once per editor and refreshed after a save. */
let kitCache: Promise<BuilderKit> | null = null
export function loadKit(fresh = false) {
  if (fresh || !kitCache) kitCache = fetch('/api/admin/builder/kit', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => validateKit(d?.kit)).catch(() => DEFAULT_KIT)
  return kitCache
}
export function useKit() {
  const [kit, setKit] = useState<BuilderKit | null>(null)
  useEffect(() => {
    let live = true
    void loadKit().then((value) => { if (live) setKit(value) })
    const refresh = () => void loadKit().then((value) => { if (live) setKit(value) })
    window.addEventListener('mc-builder-kit', refresh)
    return () => { live = false; window.removeEventListener('mc-builder-kit', refresh) }
  }, [])
  return kit
}

const FONT_NAMES: Record<typeof KIT_FONTS[number], [string, string]> = { theme: ['Like the site', 'مثل قالب سایت'], vazir: ['Vazirmatn', 'وزیرمتن'], inter: ['Inter with Vazirmatn', 'اینتر با وزیرمتن'], system: ['System font', 'فونت سیستم'] }
const SCALE_NAMES: Record<typeof KIT_SCALES[number], [string, string]> = { theme: ['Like the site', 'مثل قالب سایت'], compact: ['Compact', 'جمع‌وجور'], normal: ['Normal', 'معمولی'], large: ['Large and bold', 'درشت و پرقدرت'] }
const RADIUS_NAMES: Record<typeof KIT_RADII[number], [string, string]> = { theme: ['Like the site', 'مثل قالب سایت'], sharp: ['Sharp', 'تیز'], soft: ['Soft', 'نرم'], round: ['Round', 'گرد'], pill: ['Very round', 'خیلی گرد'] }
const BUTTON_NAMES: Record<typeof KIT_BUTTONS[number], [string, string]> = { solid: ['Like the site', 'مثل قالب سایت'], gradient: ['Gradient', 'گرادیان'], glow: ['Glowing', 'درخشان'], outline: ['Outline', 'دورخط'], glass: ['Glass', 'شیشه‌ای'] }

/**
 * The global kit: brand colours, type and shapes for every built page. Changing it changes every page made with the
 * builder, so saving takes the site settings permission (the server says so if it is missing). The sample below is
 * drawn with the same CSS the pages get.
 */
export default function KitPanel({ open, L, onClose, onSaved }: { open: boolean; L: L; onClose: () => void; onSaved: (message: string) => void }) {
  const [kit, setKit] = useState<BuilderKit>(DEFAULT_KIT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setError(''); void loadKit(true).then(setKit) } }, [open])
  const css = useMemo(() => kitCss(kit).split(':is(.br-doc, .br-page)').join('html[data-design] .admin-shell .bld-kit-sample'), [kit])
  if (!open) return null
  const color = (id: string) => kit.colors.find((entry) => entry.id === id)
  const setColor = (id: typeof KIT_COLOR_IDS[number], change: { name?: string; hex?: string }) => {
    const rest = kit.colors.filter((entry) => entry.id !== id)
    const current = color(id) || { id, name: '', hex: '' }
    setKit(validateKit({ ...kit, colors: [...rest, { ...current, ...change }].sort((a, b) => a.id.localeCompare(b.id)) }))
  }
  const choice = <K extends 'headingFont' | 'bodyFont' | 'scale' | 'radius' | 'buttons'>(key: K, label: string, list: readonly string[], names: Record<string, [string, string]>) => <label className="bld-field"><span>{label}</span>
    <select className="select" value={kit[key] as string} onChange={(event) => setKit(validateKit({ ...kit, [key]: event.target.value }))}>{list.map((entry) => <option key={entry} value={entry}>{L(names[entry][0], names[entry][1])}</option>)}</select>
  </label>
  async function save() {
    setBusy(true); setError('')
    const response = await fetch('/api/admin/builder/kit', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kit }) }).catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(response?.status === 403 ? L('Changing the kit needs the site settings permission.', 'تغییر کیت سراسری به دسترسی تنظیمات سایت نیاز دارد.') : L('Could not save.', 'ذخیره انجام نشد.')); return }
    await loadKit(true); window.dispatchEvent(new Event('mc-builder-kit'))
    onSaved(L('Global kit saved; every built page uses it.', 'کیت سراسری ذخیره شد؛ همهٔ صفحه‌های ساخته‌شده از آن استفاده می‌کنند.'))
    onClose()
  }
  return <div className="bld-modal" role="dialog" aria-modal="true" aria-label={L('Global kit', 'کیت سراسری')} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <div className="bld-modal-box bld-kit">
      <header className="bld-kit-head"><div><h2>{L('Global kit', 'کیت سراسری')}</h2><p className="muted text-sm">{L('Brand colours, type and shapes shared by every page made with the builder.', 'رنگ‌های برند، تایپوگرافی و فرم‌هایی که همهٔ صفحه‌های ساخته‌شده با صفحه‌ساز از آن‌ها استفاده می‌کنند.')}</p></div><button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={L('Close', 'بستن')}>×</button></header>
      <div className="bld-kit-body">
        <div className="bld-kit-form">
          <h3>{L('Colours', 'رنگ‌ها')}</h3>
          <p className="muted text-xs">{L('The first colour becomes the accent of every block. Pick any of them in a block\'s advanced style.', 'رنگ اول، رنگ اصلی همهٔ بلوک‌ها می‌شود. هر کدام را در استایل پیشرفتهٔ بلوک‌ها انتخاب کنید.')}</p>
          <div className="bld-kit-colors">
            {KIT_COLOR_IDS.map((id, index) => { const entry = color(id); return <div key={id} className="bld-kit-color">
              <input type="color" aria-label={L(`Colour ${index + 1}`, `رنگ ${(index + 1).toLocaleString('fa-IR')}`)} value={entry?.hex || '#888888'} onChange={(event) => setColor(id, { hex: event.target.value })} />
              <input className="input" placeholder={index === 0 ? L('Main', 'اصلی') : L(`Colour ${index + 1}`, `رنگ ${(index + 1).toLocaleString('fa-IR')}`)} value={entry?.name || ''} onChange={(event) => setColor(id, { name: event.target.value })} aria-label={L(`Name of colour ${index + 1}`, `نام رنگ ${(index + 1).toLocaleString('fa-IR')}`)} />
              {entry?.hex && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setColor(id, { hex: '' })} aria-label={L('Clear', 'حذف رنگ')}>×</button>}
            </div> })}
          </div>
          <h3>{L('Type', 'تایپوگرافی')}</h3>
          {choice('headingFont', L('Heading font', 'فونت تیترها'), KIT_FONTS, FONT_NAMES)}
          {choice('bodyFont', L('Text font', 'فونت متن'), KIT_FONTS, FONT_NAMES)}
          <label className="bld-field"><span>{L('Heading weight', 'ضخامت تیترها')}</span><select className="select" value={kit.headingWeight} onChange={(event) => setKit(validateKit({ ...kit, headingWeight: Number(event.target.value) }))}>{KIT_WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight || L('Like the site', 'مثل قالب سایت')}</option>)}</select></label>
          {choice('scale', L('Heading sizes', 'اندازهٔ تیترها'), KIT_SCALES, SCALE_NAMES)}
          <h3>{L('Shapes', 'فرم‌ها')}</h3>
          {choice('radius', L('Corners', 'گردی گوشه‌ها'), KIT_RADII, RADIUS_NAMES)}
          {choice('buttons', L('Main buttons', 'دکمه‌های اصلی'), KIT_BUTTONS, BUTTON_NAMES)}
        </div>
        <div className="bld-kit-preview" aria-label={L('Sample', 'نمونه')}>
          <style>{css}</style>
          <div className="bld-kit-sample">
            <h1>{L('Main heading', 'تیتر اصلی صفحه')}</h1>
            <h3>{L('A smaller heading', 'یک تیتر کوچک‌تر')}</h3>
            <p>{L('Body text in the chosen font, as visitors will read it.', 'متن صفحه با فونت انتخابی، همان‌طور که بازدیدکننده می‌خواند.')}</p>
            <div className="bld-kit-buttons"><span className="btn btn-primary">{L('Main button', 'دکمهٔ اصلی')}</span><span className="btn btn-ghost">{L('Second button', 'دکمهٔ دوم')}</span></div>
            <div className="bld-kit-swatches">{kit.colors.filter((entry) => entry.hex).map((entry) => <span key={entry.id} style={{ background: entry.hex }} title={entry.name}>{entry.name}</span>)}</div>
            <div className="br-iconbox is-top"><span className="br-iconbox-copy"><strong>{L('A card', 'یک کارت')}</strong><span>{L('Corners follow the kit.', 'گوشه‌ها از کیت پیروی می‌کنند.')}</span></span></div>
          </div>
        </div>
      </div>
      {error && <p className="bld-kit-error" role="alert">{error}</p>}
      <footer className="bld-kit-foot"><button type="button" className="btn btn-ghost" onClick={() => setKit(DEFAULT_KIT)}>{L('Reset to defaults', 'بازگشت به پیش‌فرض')}</button><button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? L('Saving…', 'در حال ذخیره…') : L('Save kit', 'ذخیرهٔ کیت')}</button></footer>
    </div>
  </div>
}
