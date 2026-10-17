'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, bytes, fa, faDate, useServerApi, useServerJson } from '@/app/admin/server/shared'
import { EMPTY_STORAGE, KIND_LABEL, STATUS, PHASE, TEXT_EXT, type Entry, type Overview, type ArchiveListing, type Job, type Listing, type Tone } from './types'
import { seconds } from './common'
export default function StorageForm({ initial, onDone, onCancel }: { initial: typeof EMPTY_STORAGE; onDone: () => void; onCancel: () => void }) {
  const api = useServerApi()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editing = !!initial.id
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const result = await api('/api/admin/server/downloads', { body: { op: 'storage-save', item: form } })
    setBusy(false)
    if (result.ok) onDone(); else setError(result.error)
  }
  return <form className="sa-card sa-form dl-storage-form" onSubmit={submit}>
    <header className="sa-card-head"><h2>{editing ? `ویرایش «${initial.name}»` : 'اتصال سرور یا هاست دانلود'}</h2></header>
    <div className="dl-kinds" role="radiogroup" aria-label="نوع اتصال">
      {(['sftp', 'ftp'] as const).map((kind) => <label key={kind} className={`dl-kind${form.kind === kind ? ' is-active' : ''}`}>
        <input type="radio" name="kind" checked={form.kind === kind} disabled={editing} onChange={() => setForm({ ...form, kind, port: kind === 'sftp' ? 22 : 21 })} />
        <b>{KIND_LABEL[kind]}</b>
        <small>{kind === 'sftp' ? 'سرور مجازی/اختصاصی با دسترسی SSH — سریع و امن' : 'هاست دانلود با کنترل‌پنل (cPanel، DirectAdmin)'}</small>
      </label>)}
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>نام نمایشی</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="سرور دانلود آلمان" required /></label>
      <label className="sa-field"><span>نشانی عمومی فایل‌ها</span><input className="input" dir="ltr" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value.trim() })} placeholder="https://dl2.mobocom.net" /></label>
    </div>
    <div className="dl-host">
      <label className="sa-field"><span>Host</span><input className="input" dir="ltr" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value.trim() })} placeholder="dl.example.com یا 1.2.3.4" required /></label>
      <label className="sa-field"><span>پورت</span><input className="input" dir="ltr" type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>نام کاربری</span><input className="input" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} autoComplete="off" required /></label>
      <label className="sa-field"><span>پوشهٔ ریشه روی سرور</span><input className="input" dir="ltr" value={form.root} onChange={(e) => setForm({ ...form, root: e.target.value.trim() })} placeholder="/public_html" /></label>
    </div>
    {form.kind === 'sftp' && <div className="sa-toolbar">
      <label className="sa-check"><input type="radio" name="auth" checked={form.auth === 'password'} onChange={() => setForm({ ...form, auth: 'password' })} /> <span>ورود با رمز</span></label>
      <label className="sa-check"><input type="radio" name="auth" checked={form.auth === 'key'} onChange={() => setForm({ ...form, auth: 'key' })} /> <span>ورود با کلید SSH</span></label>
    </div>}
    {form.kind === 'ftp' && <label className="sa-check"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> <span>اتصال رمزنگاری‌شده (FTPS / TLS) — اگر هاست پشتیبانی می‌کند روشن کنید</span></label>}
    {form.kind === 'sftp' && form.auth === 'key'
      ? <label className="sa-field"><span>کلید خصوصی {editing && <small>(خالی = بدون تغییر)</small>}</span><textarea className="input dl-key" dir="ltr" rows={5} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></label>
      : <label className="sa-field"><span>رمز عبور {editing && <small>(خالی = بدون تغییر)</small>}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} /></label>}
    {error && <Notice tone="error">{error}</Notice>}
    <p className="sa-hint">پیش از ذخیره، اتصال آزمایش می‌شود. رمز و کلید رمزنگاری‌شده نگه‌داری می‌شوند و به مرورگر برنمی‌گردند.</p>
    <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال آزمایش اتصال…' : 'آزمایش و ذخیره'}</button><button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button></div>
  </form>
}

// ------------------------------------------------------------------ archive tools
