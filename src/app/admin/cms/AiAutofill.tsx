'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import type { AutofillField } from '@/modules/ai/domain/autofill'

type Values = Record<string, unknown>

const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)

/**
 * «تکمیل هوشمند»: paste raw material and the assistant fills this section's
 * own fields. Values only land in the form — nothing is saved until the editor
 * reviews them and confirms publishing.
 */
export default function AiAutofill({ section, fields, form, onApply }: { section: string; fields: AutofillField[]; form: Values; onApply: (values: Values, filled: string[]) => void }) {
  const enabled = useModuleEnabled('ai-assistant')
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string; notes?: string } | null>(null)
  const [undo, setUndo] = useState<Values | null>(null)
  if (!enabled || !fields.length) return null

  async function run() {
    setBusy(true); setMessage(null)
    const current = Object.fromEntries(fields.map((field) => [field.key, form[field.key]]))
    const response = await fetch('/api/admin/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'content.autofill', section, fields, source, current }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ error: true, text: data?.error || 'انجام نشد؛ دوباره تلاش کنید' }); return }
    const proposed = (data.values || {}) as Values
    const keys = Object.keys(proposed).filter((key) => !onlyEmpty || isEmpty(form[key]))
    if (!keys.length) { setMessage({ error: false, text: 'همهٔ فیلدهایی که هوش مصنوعی پیشنهاد داد از قبل پر بودند؛ برای بازنویسی، گزینهٔ «فقط فیلدهای خالی» را بردارید.', notes: data.notes }); return }
    setUndo(Object.fromEntries(keys.map((key) => [key, form[key]])))
    onApply(Object.fromEntries(keys.map((key) => [key, proposed[key]])), keys)
    setMessage({ error: false, text: `${keys.length.toLocaleString('fa-IR')} فیلد پر شد و با برچسب «پیشنهاد AI» مشخص است. همه را بازبینی و در صورت نیاز ویرایش کنید؛ انتشار فقط بعد از تأیید شما انجام می‌شود.`, notes: data.notes })
  }

  return <section className={`ai-fill${open ? ' is-open' : ''}`} aria-label="تکمیل هوشمند فرم">
    <button type="button" className="ai-fill-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="ai-fill-icon" aria-hidden="true">✦</span>
      <span><b>تکمیل هوشمند با هوش مصنوعی</b><small>متن خبر، توضیح سازنده یا مشخصات را بچسبانید تا فیلدهای همین بخش پر شوند.</small></span>
      <span className="ai-fill-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
    {open && <div className="ai-fill-body">
      <label className="ai-fill-field"><span>متن منبع</span><textarea className="textarea" rows={7} dir="auto" value={source} onChange={(e) => setSource(e.target.value)} placeholder="مثلاً: معرفی رسمی، خلاصهٔ داستان، لیست ترک‌ها، تغییرات نسخه، مشخصات فنی محصول…" /></label>
      <div className="ai-fill-actions">
        <label className="ai-fill-check"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />فقط فیلدهای خالی پر شوند</label>
        <span className="ai-fill-grow" />
        {undo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onApply(undo, []); setUndo(null); setMessage({ error: false, text: 'مقادیر قبلی برگردانده شد.' }) }}>برگرداندن</button>}
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || source.trim().length < 40} onClick={() => void run()}>{busy ? 'در حال تکمیل…' : 'تکمیل فرم'}</button>
      </div>
      {source.trim().length > 0 && source.trim().length < 40 && <small className="ai-fill-hint">دست‌کم چند جمله لازم است.</small>}
      {message && <div className={`ai-fill-msg${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}{message.notes && <p><b>یادداشت هوش مصنوعی:</b> {message.notes}</p>}{message.error && /کلید|API/.test(message.text) && <Link href="/admin/ai" className="text-link">تنظیمات دستیار ↗</Link>}</div>}
      <small className="ai-fill-hint">تصویرها، لینک‌های دانلود و دسته‌بندی را خودتان تکمیل کنید. هوش مصنوعی چیزی را منتشر نمی‌کند.</small>
    </div>}
  </section>
}
