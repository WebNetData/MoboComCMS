'use client'
import { useEffect, useRef } from 'react'
import Link from '@/components/AppLink'
import CoverField from '../cms/CoverField'
import { defaultSiteFonts, local, type SiteConfig, type ThemeColors, type ThemeManifest } from '@/modules/site/config/types'
import { TextEditor, LinkEditor } from './fields'

const COLOR_LABELS: Record<string, string> = { background: 'پس‌زمینه', surface: 'کارت‌ها', accent: 'رنگ اصلی', text: 'متن', muted: 'متن فرعی', border: 'خطوط' }
const COLOR_KEYS = ['background', 'surface', 'accent', 'text', 'muted', 'border'] as const
const LIGHT_FALLBACK: ThemeColors = { background: '#f6f8f3', surface: '#ffffff', accent: '#346522', text: '#18211b', muted: '#5f6e63', border: '#d9e1d5' }
const FONT_STACKS = [
  "'HappVazirmatn',Tahoma,sans-serif",
  "'HappInter',Arial,sans-serif",
  "'HappVazirmatn','HappInter',sans-serif",
  "system-ui,-apple-system,'Segoe UI',sans-serif",
  "Tahoma,Geneva,sans-serif",
  "Georgia,'Times New Roman',serif",
]

export default function DesignTab({ config, themes, change, setUploading, exportConfig }: {
  config: SiteConfig
  themes: ThemeManifest[]
  change: (value: SiteConfig) => void
  setUploading: (busy: boolean) => void
  exportConfig: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const all = [...themes, ...config.themes]
  const base = all.find(t => t.id === config.themeId) || all[0]
  const light = base.lightColors || LIGHT_FALLBACK
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'fa'
  const fonts = { ...defaultSiteFonts(lang?.startsWith('fa') ? 'fa' : 'en'), ...(config.fonts || {}) }

  function patchTheme(patch: Partial<ThemeManifest>) {
    const id = base.id.startsWith('custom-') ? base.id : `custom-${base.id}`
    const edited: ThemeManifest = { ...base, id, name: base.name.includes('Custom') ? base.name : `${base.name} Custom`, extends: base.extends || (base.id.startsWith('custom-') ? undefined : base.id), ...patch }
    change({ ...config, themeId: id, themes: [...config.themes.filter(t => t.id !== id), edited] })
  }

  useEffect(() => {
    const send = () => {
      const win = frameRef.current?.contentWindow
      if (!win) return
      win.postMessage({
        type: 'studio-preview',
        designId: config.themes.find(t => t.id === config.themeId)?.extends || config.themeId,
        tokens: {
          '--site-bg': base.colors.background, '--site-surface': base.colors.surface, '--site-accent': base.colors.accent,
          '--site-text': base.colors.text, '--site-muted': base.colors.muted, '--site-border': base.colors.border,
          '--site-radius': `${base.radius}px`,
          '--site-light-bg': light.background, '--site-light-surface': light.surface, '--site-light-accent': light.accent,
          '--site-light-text': light.text, '--site-light-muted': light.muted, '--site-light-border': light.border,
        },
        fonts,
        customCss: config.customCss || '',
      }, window.location.origin)
    }
    const timer = setTimeout(send, 150)
    // The preview iframe hydrates asynchronously; keep resending so late
    // listeners still pick up the current state.
    const interval = setInterval(send, 1200)
    return () => { clearTimeout(timer); clearInterval(interval) }
  })

  const colorGroup = (mode: 'dark' | 'light') => <div className="studio-color-group">{COLOR_KEYS.map(key => (
    <label className="studio-color-field" key={`${mode}-${key}`}>
      <span>{COLOR_LABELS[key]}</span>
      <input type="color" aria-label={`${mode === 'dark' ? 'تیره' : 'روشن'} ${COLOR_LABELS[key]}`} value={mode === 'dark' ? base.colors[key] : light[key]}
        onChange={e => patchTheme(mode === 'dark' ? { colors: { ...base.colors, [key]: e.target.value } } : { lightColors: { ...light, [key]: e.target.value } })} />
    </label>))}</div>

  return <div className="studio-design">
    <div className="studio-design-controls">
      <section className="card studio-editor">
        <div className="studio-item-head"><h2>رنگ‌ها</h2><span className="studio-help">{base.name}</span></div>
        <div className="studio-item"><h3 className="mb-4">حالت تیره</h3>{colorGroup('dark')}</div>
        <div className="studio-item"><h3 className="mb-4">حالت روشن</h3>{colorGroup('light')}</div>
        <div className="studio-item"><h3 className="mb-4">گِردی گوشه‌ها</h3><div className="studio-radius-row"><input type="range" min={0} max={32} step={1} aria-label="گِردی گوشه‌ها" value={base.radius} onChange={e => patchTheme({ radius: Number(e.target.value) })} /><span className="studio-radius-value num">{base.radius}px</span></div></div>
      </section>

      <section className="card studio-editor">
        <h2 className="mb-4">تایپوگرافی</h2>
        <div className="studio-font-row">
          <label className="studio-field"><span>فونت متن (بدنه)</span><input className="input" list="studio-font-stacks" dir="ltr" placeholder={fonts.body} value={config.fonts?.body || ''} onChange={e => change({ ...config, fonts: { body: e.target.value, heading: config.fonts?.heading || '' } })} /></label>
          <label className="studio-field"><span>فونت تیترها</span><input className="input" list="studio-font-stacks" dir="ltr" placeholder={fonts.heading} value={config.fonts?.heading || ''} onChange={e => change({ ...config, fonts: { body: config.fonts?.body || '', heading: e.target.value } })} /></label>
        </div>
        <datalist id="studio-font-stacks">{FONT_STACKS.map(stack => <option key={stack} value={stack} />)}</datalist>
        <p className="studio-help">خالی بگذار تا پیش‌فرض زبان سایت (وزیرمتن برای فارسی) استفاده شود. خروجی هم روی پیش‌نمایش زنده و هم بعد از انتشار اعمال می‌شود.</p>
      </section>

      <section className="card studio-editor">
        <h2 className="mb-4">هویت بصری</h2>
        <div className="studio-item"><h3 className="mb-4">لوگو (اختیاری)</h3><p className="studio-help mb-3">لوگوی افقی با نام، نسخهٔ حالت تاریک و حذف پس‌زمینه در <a href="/admin/branding" className="text-link">لوگو و هویت برند</a>.</p><CoverField value={config.logo || ''} title={config.brand} onChange={logo => change({ ...config, logo })} onBusy={setUploading} /></div>
        <label className="studio-field"><span>نام برند</span><input className="input" value={config.brand} onChange={e => change({ ...config, brand: e.target.value })} /></label>
        <TextEditor label="شعار برند" value={config.tagline} onChange={tagline => change({ ...config, tagline })} />
        <TextEditor label="متن پایین سایت" value={config.copyright} onChange={copyright => change({ ...config, copyright })} />
        <div className="studio-item"><h3 className="mb-4">نوار اطلاع‌رسانی</h3><label className="studio-switch mb-4"><input type="checkbox" checked={config.announcement.enabled} onChange={e => change({ ...config, announcement: { ...config.announcement, enabled: e.target.checked } })} />نمایش پیام (افزونه اطلاع‌رسانی باید فعال باشد)</label><TextEditor label="پیام" value={config.announcement.text} onChange={text => change({ ...config, announcement: { ...config.announcement, text } })} /><LinkEditor value={config.announcement.link} onChange={link => change({ ...config, announcement: { ...config.announcement, link } })} /></div>
      </section>

      <section className="card studio-editor">
        {(['navigation', 'footer'] as const).map(group => <div key={group}><h2 className="mb-4">{group === 'navigation' ? 'منوی اصلی (هِدِر)' : 'لینک‌های پشتیبانی در فوتر'}</h2>{config[group].map((link, i) => <div className="studio-item" key={i}><LinkEditor value={link} onChange={v => change({ ...config, [group]: config[group].map((old, j) => i === j ? v : old) })} /><div className="studio-actions"><button className="btn btn-ghost" disabled={i === 0} onClick={() => { const values = [...config[group]]; [values[i], values[i - 1]] = [values[i - 1], values[i]]; change({ ...config, [group]: values }) }}>انتقال به بالا ↑</button><button className="btn btn-ghost" onClick={() => change({ ...config, [group]: config[group].filter((_, j) => i !== j) })}>حذف لینک</button></div></div>)}<button className="btn btn-ghost mb-6" onClick={() => change({ ...config, [group]: [...config[group], { label: local('لینک جدید', 'New link'), href: '/' }] })}>+ افزودن لینک</button></div>)}
      </section>

      <section className="card studio-editor">
        <h2 className="mb-4">CSS سفارشی</h2>
        <p className="studio-help">CSS دستی برای کل سایت — مثل «Custom CSS» در وردپرس. تگ‌های style/script پذیرفته نمی‌شوند؛ حداکثر ۵۰ کیلوبایت.</p>
        <label className="studio-field"><span>کد CSS</span><textarea className="input studio-css" spellCheck={false} maxLength={50000} placeholder={'/* مثلاً */\n.site-header{backdrop-filter:blur(8px)}'} value={config.customCss || ''} onChange={e => change({ ...config, customCss: e.target.value })} /></label>
        <div className="studio-actions"><button className="btn btn-ghost" onClick={exportConfig}>دریافت نسخه تنظیمات JSON</button></div>
      </section>
    </div>

    <div className="studio-design-preview">
      <iframe ref={frameRef} title="پیش‌نمایش زنده" src="/?preview=studio" />
      <p>پیش‌نمایش زنده و بی‌درنگ؛ تغییرات تا زمان «انتشار تغییرات» فقط همین‌جا دیده می‌شوند. پس از انتشار، پیش‌نمایش از تنظیمات منتشرشده سایت پر می‌شود.</p>
      <Link href="/?preview=studio" target="_blank" className="text-link">باز کردن پیش‌نمایش در برگهٔ جدا ↗</Link>
    </div>
  </div>
}
