'use client'
import { useState } from 'react'
import type { FormDefinition } from '@/modules/site/config/forms'
import { useI18n } from '@/i18n/LocaleProvider'
export default function PublicForm({ form }: { form: FormDefinition }) {
  const { locale } = useI18n()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('')
    const data = new FormData(e.currentTarget)
    const values = Object.fromEntries(form.fields.map(f => [f.id, f.type === 'checkbox' ? data.get(f.id) === 'on' : data.get(f.id) || '']))
    try {
      const res = await fetch(`/api/forms/${form.slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values, website: data.get('website') }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setMessage(result.message); setSent(true)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'ارسال ناموفق؛ دوباره تلاش کنید') } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="public-form card"><h2>{form.title}</h2><p className="muted">{form.description}</p>
    {sent ? <div className="form-success" role="status">✓ {message}</div> : <>
      <div className="form-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      {form.fields.map(f => <label className="studio-field" key={f.id}><span>{f.label}{f.required ? ' *' : ''}</span>{f.type === 'textarea' ? <textarea className="input" name={f.id} required={f.required} maxLength={5000} rows={4}/> : f.type === 'select' ? <select className="input" name={f.id} required={f.required}><option value="">{locale === 'fa' ? 'انتخاب کنید' : 'Select an option'}</option>{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input className={f.type === 'checkbox' ? '' : 'input'} name={f.id} type={f.type} required={f.required} maxLength={500}/> }</label>)}
      {message && <p role="alert" className="error-text">{message}</p>}<button disabled={busy} className="btn btn-primary">{busy ? '…' : locale === 'fa' ? 'ارسال فرم' : 'Send message'} <span aria-hidden="true">↗</span></button>
    </>}
  </form>
}
