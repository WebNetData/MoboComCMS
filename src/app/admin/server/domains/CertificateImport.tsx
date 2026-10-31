'use client'
import { useState, type FormEvent } from 'react'
import { Notice, useServerApi } from '../shared'

export default function CertificateImport({ reload }: { reload: () => void }) {
  const api = useServerApi(), [domain, setDomain] = useState(''), [name, setName] = useState('')
  const [certificate, setCertificate] = useState(''), [privateKey, setPrivateKey] = useState(''), [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function read(file: File | undefined, key: boolean) {
    if (key) setPrivateKey(''); else setCertificate('')
    if (!file) return
    if (file.size > (key ? 32768 : 131072)) { setNotice({ tone: 'error', text: 'حجم فایل بیشتر از حد مجاز است.' }); return }
    try { const value = await file.text(); if (key) setPrivateKey(value); else setCertificate(value) }
    catch { setNotice({ tone: 'error', text: 'فایل خوانده نشد؛ دوباره انتخاب کنید.' }) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setNotice(null)
    try {
      const result = await api<{ name: string }>('/api/admin/server/domains', { body: { op: 'cert-import', domain, name, certificate, privateKey } })
      if (result.ok) { setCertificate(''); setPrivateKey(''); form.reset(); setNotice({ tone: 'ok', text: `گواهی ${result.data.name} ذخیره شد؛ اکنون آن را برای دامنه انتخاب کنید. تمدید این گواهی دستی است.` }); reload() }
      else setNotice({ tone: 'error', text: result.error })
    } finally { setBusy(false) }
  }
  return <form className="sa-card sa-form" onSubmit={submit}>
    <header className="sa-card-head"><h2>بارگذاری گواهی خودتان</h2><span className="sa-state">PEM</span></header>
    <p className="sa-hint">فایل گواهی یا زنجیرهٔ کامل و کلید خصوصی متناظر را انتخاب کنید. تطابق کلید، دامنه و تاریخ اعتبار پیش از ذخیره بررسی می‌شود. فایل‌ها در مسیر خصوصی سرور قرار می‌گیرند. این روش تمدید خودکار ندارد.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <label className="sa-field"><span>دامنهٔ گواهی</span><input className="input" dir="ltr" value={domain} onChange={event => setDomain(event.target.value.trim())} placeholder="example.com" required /></label>
    <label className="sa-field"><span>نام کوتاه گواهی (اختیاری)</span><input className="input" dir="ltr" value={name} onChange={event => setName(event.target.value)} pattern="[a-z0-9][a-z0-9.\-]{0,85}" placeholder="example.com" /></label>
    <label className="sa-field"><span>گواهی / Full chain (حداکثر ۱۲۸ کیلوبایت)</span><input className="input" type="file" accept=".pem,.crt,.cer" onChange={event => void read(event.target.files?.[0], false)} required /></label>
    <label className="sa-field"><span>کلید خصوصی بدون رمز (حداکثر ۳۲ کیلوبایت)</span><input className="input" type="file" accept=".pem,.key" onChange={event => void read(event.target.files?.[0], true)} required /></label>
    <button type="submit" className="btn btn-primary" disabled={busy || !certificate || !privateKey || !domain}>{busy ? 'در حال بررسی و ذخیره…' : 'اعتبارسنجی و ذخیرهٔ امن'}</button>
  </form>
}
