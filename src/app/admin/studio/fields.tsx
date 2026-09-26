import type { LocalText, SiteLink } from '@/modules/site/config/types'

export function TextEditor({ label, value, onChange, multiline = false }: { label: string; value: LocalText; onChange: (v: LocalText) => void; multiline?: boolean }) {
  return <div className="studio-languages">{(['fa', 'en'] as const).map(lang => <label key={lang} className="studio-field"><span>{label} · {lang === 'fa' ? 'فارسی' : 'English'}</span>{multiline ? <textarea className="input" rows={3} dir={lang === 'fa' ? 'rtl' : 'ltr'} value={value[lang]} onChange={e => onChange({ ...value, [lang]: e.target.value })} /> : <input className="input" dir={lang === 'fa' ? 'rtl' : 'ltr'} value={value[lang]} onChange={e => onChange({ ...value, [lang]: e.target.value })} />}</label>)}</div>
}

export function LinkEditor({ value, onChange }: { value: SiteLink; onChange: (v: SiteLink) => void }) {
  return <><TextEditor label="متن لینک" value={value.label} onChange={label => onChange({ ...value, label })} /><label className="studio-field"><span>نشانی مقصد</span><input className="input" dir="ltr" value={value.href} onChange={e => onChange({ ...value, href: e.target.value })} /></label></>
}
