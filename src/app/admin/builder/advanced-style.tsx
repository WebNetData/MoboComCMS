'use client'

import { useState } from 'react'
import { BORDER_STYLES, FONT_WEIGHTS, HOVERS, MOBILE_ALIGNS, MOTIONS, SHADOWS, validateAdvancedStyle, type AdvancedStyle, type Box } from '@/modules/site/domain/builder-style'

// The "Advanced" part of the inspector, for a block or a section: spacing per side (with phone values),
// typography, background and gradient, border and corners, shadow and opacity, hover and entrance motion,
// layout limits and CSS classes. Every change goes through validateAdvancedStyle, so what is stored is what
// the renderer can write.

type L = (en: string, fa: string) => string
const ZERO: Box = { t: 0, r: 0, b: 0, l: 0 }

function BoxField({ label, value, min, max, onChange, L }: { label: string; value: Box | undefined; min: number; max: number; onChange: (next: Box | undefined) => void; L: L }) {
  const box = value || ZERO
  const [linked, setLinked] = useState(box.t === box.r && box.r === box.b && box.b === box.l)
  const set = (side: keyof Box, raw: string) => {
    const n = Math.max(min, Math.min(max, Math.round(Number(raw) || 0)))
    const next = linked ? { t: n, r: n, b: n, l: n } : { ...box, [side]: n }
    onChange(next.t || next.r || next.b || next.l ? next : undefined)
  }
  const SIDES: [keyof Box, string][] = [['t', L('Top', 'بالا')], ['r', L('Start', 'ابتدا')], ['b', L('Bottom', 'پایین')], ['l', L('End', 'انتها')]]
  return <div className="bld-field bld-box">
    <span>{label}<button type="button" className={`bld-link${linked ? ' is-on' : ''}`} aria-pressed={linked} onClick={() => setLinked(!linked)} title={L('Same on every side', 'همهٔ طرف‌ها یکسان')}>{linked ? '🔗' : '⛓'}</button></span>
    <div className="bld-box-grid" dir="ltr">{SIDES.map(([side, name]) => <label key={side}><input className="input num" type="number" min={min} max={max} value={box[side]} onChange={(event) => set(side, event.target.value)} aria-label={`${label} — ${name}`} /><small>{name}</small></label>)}</div>
  </div>
}

function Colour({ label, value, onChange, L }: { label: string; value: string | undefined; onChange: (next: string | undefined) => void; L: L }) {
  return <label className="bld-field"><span>{label}</span>
    <div className="bld-color" dir="ltr">
      <input type="color" value={value || '#ffffff'} onChange={(event) => onChange(event.target.value)} />
      <input aria-label={L('Colour code', 'کد رنگ')} className="input mono" dir="ltr" placeholder="#RRGGBB" value={value || ''} onChange={(event) => onChange(/^#[0-9a-fA-F]{6}$/.test(event.target.value) ? event.target.value : value)} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(undefined)}>{L('Clear', 'حذف')}</button>
    </div>
  </label>
}

export default function AdvancedStyleFields({ value, onChange, L, section = false }: { value: AdvancedStyle | undefined; onChange: (next: AdvancedStyle | undefined, history?: boolean) => void; L: L; section?: boolean }) {
  const adv = value || {}
  const [phone, setPhone] = useState(false)
  const patch = (change: Partial<AdvancedStyle>, history = false) => onChange(validateAdvancedStyle({ ...adv, ...change }), history)
  const number = (key: keyof AdvancedStyle, raw: string) => patch({ [key]: raw === '' ? undefined : Number(raw) } as Partial<AdvancedStyle>)
  const choice = <T extends string>(key: keyof AdvancedStyle, label: string, list: readonly T[], names: Record<T, string>) => <label className="bld-field"><span>{label}</span>
    <select className="select" value={(adv[key] as string) || ''} onChange={(event) => patch({ [key]: event.target.value || undefined } as Partial<AdvancedStyle>, true)}>
      <option value="">{L('None', 'بدون')}</option>{list.map((entry) => <option key={entry} value={entry}>{names[entry]}</option>)}
    </select>
  </label>
  const set = Object.keys(adv).length

  return <details className="bld-style bld-adv">
    <summary>{L('Advanced', 'پیشرفته')}{set > 0 && <em className="bld-adv-dot" title={L(`${set} set`, `${set.toLocaleString('fa-IR')} تنظیم`)} />}</summary>

    <div className="bld-adv-device" role="group" aria-label={L('Values for', 'مقدارها برای')}>
      <button type="button" className={phone ? '' : 'is-on'} aria-pressed={!phone} onClick={() => setPhone(false)}>🖥 {L('Desktop', 'دسکتاپ')}</button>
      <button type="button" className={phone ? 'is-on' : ''} aria-pressed={phone} onClick={() => setPhone(true)}>📱 {L('Phone', 'موبایل')}</button>
    </div>

    <h4>{L('Spacing', 'فاصله‌ها')}</h4>
    {phone ? <>
      <BoxField key="mm" label={L('Margin on phones (px)', 'فاصلهٔ بیرونی در موبایل (px)')} value={adv.marginM} min={-300} max={400} onChange={(marginM) => patch({ marginM })} L={L} />
      <BoxField key="pm" label={L('Padding on phones (px)', 'فاصلهٔ درونی در موبایل (px)')} value={adv.paddingM} min={0} max={400} onChange={(paddingM) => patch({ paddingM })} L={L} />
    </> : <>
      <BoxField key="md" label={L('Margin (px)', 'فاصلهٔ بیرونی (px)')} value={adv.margin} min={-300} max={400} onChange={(margin) => patch({ margin })} L={L} />
      <BoxField key="pd" label={L('Padding (px)', 'فاصلهٔ درونی (px)')} value={adv.padding} min={0} max={400} onChange={(padding) => patch({ padding })} L={L} />
    </>}

    <h4>{L('Typography', 'تایپوگرافی')}</h4>
    {phone
      ? <label className="bld-field"><span>{L('Font size on phones', 'اندازهٔ قلم در موبایل')} · {adv.fontSizeM ? `${adv.fontSizeM}px` : L('same', 'همان دسکتاپ')}</span><input type="range" min={0} max={96} step={1} value={adv.fontSizeM || 0} onChange={(event) => number('fontSizeM', event.target.value === '0' ? '' : event.target.value)} /></label>
      : <label className="bld-field"><span>{L('Font size', 'اندازهٔ قلم')} · {adv.fontSize ? `${adv.fontSize}px` : L('theme', 'قالب')}</span><input type="range" min={0} max={120} step={1} value={adv.fontSize || 0} onChange={(event) => number('fontSize', event.target.value === '0' ? '' : event.target.value)} /></label>}
    {phone
      ? choice('alignM', L('Alignment on phones', 'چیدمان در موبایل'), MOBILE_ALIGNS, { start: L('Start', 'ابتدا'), center: L('Centre', 'وسط'), end: L('End', 'انتها') })
      : <>
        <label className="bld-field"><span>{L('Weight', 'ضخامت قلم')}</span><select className="select" value={adv.fontWeight || ''} onChange={(event) => patch({ fontWeight: (Number(event.target.value) || undefined) as AdvancedStyle['fontWeight'] }, true)}><option value="">{L('Theme', 'قالب')}</option>{FONT_WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select></label>
        <label className="bld-field"><span>{L('Line height', 'ارتفاع سطر')} · {adv.lineHeight ? (adv.lineHeight / 100).toFixed(2) : L('theme', 'قالب')}</span><input type="range" min={70} max={320} step={5} value={adv.lineHeight || 70} onChange={(event) => number('lineHeight', event.target.value === '70' ? '' : event.target.value)} /></label>
        <label className="bld-field"><span>{L('Letter spacing', 'فاصلهٔ حروف')} · {adv.letterSpacing ? `${adv.letterSpacing / 10}px` : '0'}</span><input type="range" min={-30} max={120} step={1} value={adv.letterSpacing || 0} onChange={(event) => number('letterSpacing', event.target.value)} /></label>
      </>}

    {!phone && <>
      <h4>{L('Background', 'پس‌زمینه')}</h4>
      <Colour label={L('Colour', 'رنگ')} value={adv.bg} onChange={(bg) => patch(bg ? { bg } : { bg: undefined, bg2: undefined, bgAngle: undefined })} L={L} />
      {adv.bg && <>
        <Colour label={L('Second colour (gradient)', 'رنگ دوم (گرادیان)')} value={adv.bg2} onChange={(bg2) => patch({ bg2 })} L={L} />
        {adv.bg2 && <label className="bld-field"><span>{L('Angle', 'زاویه')} · {adv.bgAngle ?? 135}°</span><input type="range" min={0} max={360} step={5} value={adv.bgAngle ?? 135} onChange={(event) => number('bgAngle', event.target.value)} /></label>}
      </>}

      <h4>{L('Border and corners', 'حاشیه و گوشه‌ها')}</h4>
      <label className="bld-field"><span>{L('Border width', 'ضخامت حاشیه')} · {adv.borderWidth || 0}px</span><input type="range" min={0} max={12} step={1} value={adv.borderWidth || 0} onChange={(event) => number('borderWidth', event.target.value)} /></label>
      {!!adv.borderWidth && <>
        {choice('borderStyle', L('Line', 'نوع خط'), BORDER_STYLES, { solid: L('Solid', 'ممتد'), dashed: L('Dashed', 'خط‌چین'), dotted: L('Dotted', 'نقطه‌چین') })}
        <Colour label={L('Border colour', 'رنگ حاشیه')} value={adv.borderColor} onChange={(borderColor) => patch({ borderColor })} L={L} />
      </>}
      <BoxField label={L('Corner radius (px)', 'گردی گوشه‌ها (px)')} value={adv.radius} min={0} max={300} onChange={(radius) => patch({ radius })} L={L} />

      <h4>{L('Shadow and effects', 'سایه و جلوه‌ها')}</h4>
      {choice('shadow', L('Shadow', 'سایه'), SHADOWS, { sm: L('Soft', 'ملایم'), md: L('Medium', 'متوسط'), lg: L('Large', 'بزرگ'), xl: L('Deep', 'عمیق'), glow: L('Accent glow', 'درخشش رنگی') })}
      <label className="bld-field"><span>{L('Opacity', 'شفافیت')} · {adv.opacity ?? 100}%</span><input type="range" min={0} max={100} step={5} value={adv.opacity ?? 100} onChange={(event) => number('opacity', event.target.value)} /></label>
      {choice('hover', L('On hover', 'هنگام رفتن نشانگر روی آن'), HOVERS, { lift: L('Lift', 'بالا آمدن'), zoom: L('Zoom', 'بزرگ‌شدن'), glow: L('Glow', 'درخشش'), dim: L('Dim', 'تیره‌شدن') })}
      {choice('motion', L('Entrance motion', 'حرکت هنگام دیده‌شدن'), MOTIONS, { fade: L('Fade in', 'محوشدن'), up: L('From below', 'از پایین'), down: L('From above', 'از بالا'), start: L('From the start side', 'از ابتدا'), end: L('From the end side', 'از انتها'), zoom: L('Zoom in', 'بزرگ‌نمایی') })}

      <h4>{L('Layout', 'چیدمان')}</h4>
      <label className="bld-field"><span>{L('Max width (px)', 'حداکثر عرض (px)')}</span><input className="input num" dir="ltr" type="number" min={0} max={2400} step={10} value={adv.maxWidth || ''} placeholder={L('auto', 'خودکار')} onChange={(event) => number('maxWidth', event.target.value)} /></label>
      {section && <label className="bld-field"><span>{L('Min height (px)', 'حداقل ارتفاع (px)')}</span><input className="input num" dir="ltr" type="number" min={0} max={1600} step={10} value={adv.minHeight || ''} placeholder={L('auto', 'خودکار')} onChange={(event) => number('minHeight', event.target.value)} /></label>}
      <label className="bld-field"><span>{L('Stacking order (z-index)', 'ترتیب لایه (z-index)')}</span><input className="input num" dir="ltr" type="number" min={-1} max={100} value={adv.zIndex || ''} placeholder="0" onChange={(event) => number('zIndex', event.target.value)} /></label>
      <label className="bld-field"><span>{L('CSS classes', 'کلاس‌های CSS')}</span><input className="input mono" dir="ltr" defaultValue={(adv.classes || []).join(' ')} placeholder="my-card highlight" onBlur={(event) => patch({ classes: event.target.value.split(/\s+/).filter(Boolean) }, true)} /></label>
    </>}

    {set > 0 && <button type="button" className="btn btn-ghost btn-sm bld-adv-reset" onClick={() => onChange(undefined, true)}>{L('Reset advanced style', 'بازنشانی استایل پیشرفته')}</button>}
  </details>
}
