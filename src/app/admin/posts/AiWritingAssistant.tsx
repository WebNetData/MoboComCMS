'use client'
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { requestChatWeb } from '@/modules/ai/client/chat-web'

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
  const [transport, setTransport] = useState<'configured' | 'chat-web'>('configured')
  const [pending, setPending] = useState<{ data: Form; mode: Mode } | null>(null)
  const latestForm = useRef(form)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => { latestForm.current = form }, [form])
  useEffect(() => () => controller.current?.abort(), [])
  if (!enabled) return null

  function apply(data: Form, selected: Mode) {
    const current = latestForm.current
    setUndo({ title: current.title, slug: current.slug, excerpt: current.excerpt, content: current.content })
    setForm((value) => selected === 'excerpt' ? { ...value, excerpt: data.excerpt } : selected === 'polish' ? { ...value, content: data.content } : {
      ...value, content: data.content, title: value.title || data.title, slug: value.slug || data.slug, excerpt: value.excerpt || data.excerpt,
    })
    setPending(null)
    setMessage({ text: selected === 'excerpt' ? 'خلاصه نوشته شد.' : 'متن در ویرایشگر قرار گرفت؛ قبل از ذخیره آن را بخوانید و در صورت نیاز ویرایش کنید.', error: false })
  }

  async function run() {
    if (busy) return
    const abort = new AbortController(); controller.current = abort
    const initial = { ...latestForm.current }, selected = mode
    const input = { mode: selected, content: initial.content || '', title: initial.title || '', source, url, keywords }
    setBusy(true); setMessage(null); setPending(null)
    const post = async (endpoint: string, body: object) => {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) throw new Error(data?.error || 'انجام نشد')
      return data
    }
    try {
      let data
      if (transport === 'chat-web') {
        const prepared = await post('/api/admin/ai/chat-web', { version: 1, phase: 'prepare', input })
        const text = await requestChatWeb(prepared.prompt, abort.signal)
        data = await post('/api/admin/ai/chat-web', { version: 1, phase: 'complete', input, text })
      } else data = await post('/api/admin/ai', { action: 'editor.assist', ...input })
      if (abort.signal.aborted) return
      if (['title', 'slug', 'excerpt', 'content'].some(key => latestForm.current[key] !== initial[key])) {
        setPending({ data, mode: selected }); setMessage({ text: 'پاسخ آماده است؛ چون فرم تغییر کرده، متن شما جایگزین نشد. نتیجه را بررسی و در صورت تمایل اعمال کنید.', error: false })
      } else apply(data, selected)
    } catch (error) { if (!abort.signal.aborted) setMessage({ text: error instanceof Error ? error.message : 'انجام نشد', error: true }) }
    finally { if (controller.current === abort) { controller.current = null; setBusy(false) } }
  }

  return <div className="grid-column-span-3 ai-assist">
    <button type="button" className="ai-assist-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>✦ دستیار نوشتن {open ? '▲' : '▼'}</button>
    {open && <div className="ai-assist-body">
      <label className="label">روش نوشتن<select className="select" value={transport} disabled={busy} onChange={e => setTransport(e.target.value as 'configured' | 'chat-web')}>
        <option value="configured">سرویس تنظیم‌شدهٔ مدیریت</option><option value="chat-web">Chat وب · پل مرورگر شخصی (آزمایشی)</option>
      </select></label>
      {transport === 'chat-web' && <div className="xm-notice"><p>درخواست از همین پنل با Chat وبِ حساب شخصی شما اجرا می‌شود. کوکی حساب خارج نمی‌شود؛ این مسیر غیررسمی است و رایگان یا نامحدود بودن آن تضمین نمی‌شود. متن درخواست به حساب ChatGPT می‌رود و ممکن است در تاریخچهٔ آن بماند.</p><a className="btn btn-ghost btn-sm" href="/downloads/mobocom-chat-web-bridge.zip" download>دریافت افزونه و راهنمای نصب</a><p>فایل را استخراج کنید؛ در بخش Extensions مرورگر، Developer mode و Load unpacked را بزنید. پس از ورود به ChatGPT و انتخاب Chat، روی همین صفحه افزونه را باز و «اتصال همین سایت موبوکام» را بزنید؛ صفحه را تازه کنید.</p></div>}
      <div className="md-chips seo-filter" role="tablist" aria-label="حالت دستیار">
        {([['source', 'مقالهٔ تازه از روی منبع'], ['polish', 'روان و طبیعی کردن متن من'], ['excerpt', 'نوشتن خلاصه (متا)']] as [Mode, string][])
          .map(([id, label]) => <button key={id} type="button" role="tab" disabled={busy} aria-selected={mode === id} className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{label}</button>)}
      </div>
      {mode === 'source' && <>
        <p className="muted">متن منبع را بچسبانید. دستیار از آن فقط برای فهم موضوع استفاده می‌کند و مقاله‌ای تازه با ساختار، زاویهٔ دید و جمله‌بندی خودتان، به‌همراه نکته‌های کاربردی بیشتر، می‌نویسد. اگر نشانی منبع را بدهید، پایین مقاله «منبع» درج می‌شود.</p>
        <textarea className="textarea" rows={7} maxLength={40000} disabled={busy} value={source} onChange={(e) => setSource(e.target.value)} placeholder="متن منبع…" aria-label="متن منبع"/>
        <div className="ai-assist-row">
          <input className="input" dir="ltr" maxLength={2000} disabled={busy} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (نشانی منبع، اختیاری)" aria-label="نشانی منبع"/>
          <input className="input" maxLength={300} disabled={busy} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="کلمات کلیدی (اختیاری)" aria-label="کلمات کلیدی"/>
        </div>
      </>}
      {mode === 'polish' && <p className="muted">متن فعلی ویرایشگر را روان‌تر و طبیعی‌تر می‌کند؛ اطلاعات و تیترها حفظ می‌شوند و کلیشه‌ها حذف می‌شوند.</p>}
      {mode === 'excerpt' && <p className="muted">از روی متن فعلی یک خلاصهٔ ۱۲۰ تا ۱۵۵ حرفی برای نتایج گوگل می‌نویسد.</p>}
      <div className="seo-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run()}>{busy ? transport === 'chat-web' ? 'در انتظار Chat وب…' : 'در حال نوشتن…' : 'اجرا'}</button>
        {busy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { controller.current?.abort(); setMessage({ text: 'درخواست لغو شد؛ خودکار تکرار نمی‌شود.', error: false }) }}>لغو درخواست</button>}
        {undo && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setForm((current) => ({ ...current, ...undo })); setUndo(null); setMessage({ text: 'به متن قبلی برگشت.', error: false }) }}>بازگشت به متن قبلی</button>}
        <Link className="btn btn-ghost btn-sm" href="/admin/ai" target="_blank">تنظیمات دستیار ↗</Link>
      </div>
      {pending && <div className="xm-notice"><p>نتیجهٔ پیشنهادی (هنوز ذخیره نشده)</p><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{pending.data.content || pending.data.excerpt}</pre><button type="button" className="btn btn-primary btn-sm" onClick={() => apply(pending.data, pending.mode)}>اعمال نتیجه به‌جای متن فعلی</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>کنار گذاشتن نتیجه</button></div>}
      {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    </div>}
  </div>
}
