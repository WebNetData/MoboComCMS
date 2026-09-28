'use client'
import { useState } from 'react'
import Link from '@/components/AppLink'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

type Form = Record<string, any>
type Mode = 'polish' | 'source' | 'excerpt'

/** Writing help inside the post editor; results fill the form and are saved only when the admin saves the post. */
export default function AiWritingAssistant({ form, setForm }: { form: Form; setForm: React.Dispatch<React.SetStateAction<Form>> }) {
  const enabled = useModuleEnabled('ai-assistant')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('source')
  const [source, setSource] = useState('')
  const [url, setUrl] = useState('')
  const [keywords, setKeywords] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [undo, setUndo] = useState<Form | null>(null)
  if (!enabled) return null

  async function run() {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'editor.assist', mode, content: form.content || '', title: form.title || '', source, url, keywords }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); return }
    setUndo({ title: form.title, slug: form.slug, excerpt: form.excerpt, content: form.content })
    setForm((current) => mode === 'excerpt' ? { ...current, excerpt: data.excerpt } : mode === 'polish' ? { ...current, content: data.content } : {
      ...current,
      content: data.content,
      title: current.title || data.title,
      slug: current.slug || data.slug,
      excerpt: current.excerpt || data.excerpt,
    })
    setMessage({ text: mode === 'excerpt' ? 'خلاصه نوشته شد.' : 'متن در ویرایشگر قرار گرفت؛ قبل از ذخیره آن را بخوانید و در صورت نیاز ویرایش کنید.', error: false })
  }

  return <div className="grid-column-span-3 ai-assist">
    <button type="button" className="ai-assist-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>✦ دستیار نوشتن {open ? '▲' : '▼'}</button>
    {open && <div className="ai-assist-body">
      <div className="md-chips seo-filter" role="tablist" aria-label="حالت دستیار">
        {([['source', 'مقالهٔ تازه از روی منبع'], ['polish', 'روان و طبیعی کردن متن من'], ['excerpt', 'نوشتن خلاصه (متا)']] as [Mode, string][])
          .map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{label}</button>)}
      </div>
      {mode === 'source' && <>
        <p className="muted">متن منبع را بچسبانید. دستیار از آن فقط برای فهم موضوع استفاده می‌کند و مقاله‌ای تازه با ساختار، زاویهٔ دید و جمله‌بندی خودتان، به‌همراه نکته‌های کاربردی بیشتر، می‌نویسد. اگر نشانی منبع را بدهید، پایین مقاله «منبع» درج می‌شود.</p>
        <textarea className="textarea" rows={7} value={source} onChange={(e) => setSource(e.target.value)} placeholder="متن منبع…" aria-label="متن منبع"/>
        <div className="ai-assist-row">
          <input className="input" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (نشانی منبع، اختیاری)" aria-label="نشانی منبع"/>
          <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="کلمات کلیدی (اختیاری)" aria-label="کلمات کلیدی"/>
        </div>
      </>}
      {mode === 'polish' && <p className="muted">متن فعلی ویرایشگر را روان‌تر و طبیعی‌تر می‌کند؛ اطلاعات و تیترها حفظ می‌شوند و کلیشه‌ها حذف می‌شوند.</p>}
      {mode === 'excerpt' && <p className="muted">از روی متن فعلی یک خلاصهٔ ۱۲۰ تا ۱۵۵ حرفی برای نتایج گوگل می‌نویسد.</p>}
      <div className="seo-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run()}>{busy ? 'در حال نوشتن… (تا یک دقیقه)' : 'اجرا'}</button>
        {undo && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setForm((current) => ({ ...current, ...undo })); setUndo(null); setMessage({ text: 'به متن قبلی برگشت.', error: false }) }}>بازگشت به متن قبلی</button>}
        <Link className="btn btn-ghost btn-sm" href="/admin/ai" target="_blank">تنظیمات دستیار ↗</Link>
      </div>
      {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    </div>}
  </div>
}
