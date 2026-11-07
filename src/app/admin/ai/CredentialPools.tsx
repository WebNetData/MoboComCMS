'use client'
import { useEffect, useRef, useState } from 'react'
import { AI_PROVIDERS } from '@/modules/ai/domain/ai'

type Key = { id: string; label: string; enabled: boolean; status: string; reason: string; retryAt: number; lastSuccess: number }
type Pool = { provider: string; baseUrl: string; enabled: boolean; keys: Key[] }
type Data = { revision: number; pools: Pool[] }
type DraftKey = Key & { apiKey: string; reset: boolean; localId: string }
const endpoint = '/api/admin/ai/credentials'
export default function CredentialPools() {
  const [data, setData] = useState<Data | null>(null), [provider, setProvider] = useState('gemini'), [notice, setNotice] = useState(''), [failed, setFailed] = useState(false), [forbidden, setForbidden] = useState(false)
  const [version, setVersion] = useState(0), [snapshot, setSnapshot] = useState(0), [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 403 || response.status === 423) { setForbidden(true); return }
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'دریافت کلیدها انجام نشد')
      if (controller.signal.aborted) return
      setData(body); setSnapshot(value => value + 1); setFailed(false); setNotice('')
    }).catch(error => { if (!controller.signal.aborted) { setNotice(error.message); setFailed(true) } })
    return () => controller.abort()
  }, [version])
  if (forbidden) return null
  return <section className="card seo-form" aria-label="کلیدهای چندگانهٔ هوش مصنوعی">
    <header className="seo-wide"><h2>کلیدهای پشتیبان هر سرویس</h2><p className="muted">تا شش کلید با ترتیب دلخواه؛ فقط در همان سرویس، مدل و مقصد. با فعال‌کردن مجموعه، جای کلید تکیِ کاربردها را می‌گیرد. اتصال شخصی ChatGPT مستقل می‌ماند.</p></header>
    {notice && <p className={`xm-notice seo-wide${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{notice}</p>}
    {!data ? <div className="seo-wide">{failed ? <button className="btn btn-ghost" type="button" onClick={() => setVersion(v => v + 1)}>دریافت دوبارهٔ کلیدها</button> : <p role="status">در حال دریافت وضعیت کلیدها…</p>}</div> : <>
      <label className="studio-field seo-wide"><span>سرویس کلیدها</span><select className="input" value={provider} disabled={busy} onChange={event => setProvider(event.target.value)}>{AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <div className="seo-actions seo-wide"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setVersion(v => v + 1)}>تازه‌کردن وضعیت ذخیره‌شده</button><small className="muted">تازه‌کردن، تغییرات ذخیره‌نشدهٔ این فرم را کنار می‌گذارد و درخواست مدل نمی‌فرستد.</small></div>
      <PoolEditor key={`${provider}:${data.revision}:${snapshot}`} pool={data.pools.find(p => p.provider === provider) || { provider, baseUrl: '', enabled: false, keys: [] }} revision={data.revision} onBusy={setBusy} onSaved={next => { setData(next); setNotice('مجموعهٔ کلیدها ذخیره شد؛ کلیدها در مرورگر بازگردانده نمی‌شوند'); setFailed(false) }} />
      <p className="muted seo-wide">وضعیت بر اساس آخرین پاسخ واقعی سرویس است؛ موجودی حساب را استعلام نمی‌کند. کلید ردشده تا زمان تلاش بعدی کنار گذاشته و اعلان داخل پنل مدیر ثبت می‌شود. ایمیل، پیامک و push خودکار ارسال نمی‌شود. timeout، پاسخ ناقص یا رد محتوایی باعث ارسال دوباره نمی‌شوند.</p>
    </>}
  </section>
}
function PoolEditor({ pool, revision, onSaved, onBusy }: { pool: Pool; revision: number; onSaved: (data: Data) => void; onBusy: (busy: boolean) => void }) {
  const [keys, setKeys] = useState<DraftKey[]>(() => pool.keys.map(k => ({ ...k, apiKey: '', reset: false, localId: k.id }))), [enabled, setEnabled] = useState(pool.enabled), [baseUrl, setBaseUrl] = useState(pool.baseUrl), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const running = useRef(false)
  const change = (index: number, patch: Partial<DraftKey>) => setKeys(old => old.map((key, i) => i === index ? { ...key, ...patch } : key))
  function move(index: number, by: number) { setKeys(old => { const next = [...old]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next }) }
  async function save() {
    if (running.current) return
    running.current = true; setBusy(true); onBusy(true); setError('')
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, provider: pool.provider, enabled, baseUrl, keys: keys.map(({ id, label, enabled, apiKey, reset }) => ({ id, label, enabled, apiKey, reset })) }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'کلیدها ذخیره نشدند')
      onSaved(body)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ذخیره انجام نشد') }
    finally { running.current = false; setBusy(false); onBusy(false) }
  }
  return <form className="seo-wide seo-form" onSubmit={event => { event.preventDefault(); void save() }}>
    <label className="studio-switch seo-wide"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />استفاده از مجموعهٔ کلیدها برای این سرویس</label>
    {pool.provider === 'custom' && <label className="studio-field seo-wide"><span>نشانی دقیق مقصد کلیدها</span><input className="input" type="url" dir="ltr" required value={baseUrl} maxLength={300} disabled={busy} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /><small>باید با مقصد کاربرد یکسان باشد؛ با تغییر مقصد همهٔ کلیدها را دوباره وارد کنید.</small></label>}
    {keys.map((key, index) => <fieldset className="seo-wide seo-form" key={key.localId}><legend>کلید {index + 1} · {key.label || 'تازه'}</legend>
      <label className="studio-field"><span>نام کلید {index + 1}</span><input className="input" value={key.label} maxLength={60} required disabled={busy} onChange={event => change(index, { label: event.target.value })} /></label>
      <label className="studio-field"><span>API کلید {index + 1}</span><input className="input" type="password" dir="ltr" autoComplete="new-password" maxLength={400} value={key.apiKey} required={!key.id} disabled={busy} placeholder={key.id ? 'ذخیره شده؛ خالی یعنی حفظ' : 'API key'} onChange={event => change(index, { apiKey: event.target.value })} /></label>
      <label className="studio-switch"><input type="checkbox" checked={key.enabled} disabled={busy} onChange={event => change(index, { enabled: event.target.checked })} />کلید {index + 1} فعال باشد</label>
      {key.id && <label className="studio-switch"><input type="checkbox" checked={key.reset} disabled={busy} onChange={event => change(index, { reset: event.target.checked })} />پس از ذخیره، کلید {index + 1} دوباره قابل تلاش باشد</label>}
      <p className="muted seo-wide">{!key.id || key.status === 'unknown' ? 'هنوز آزمایش نشده' : key.status === 'healthy' ? 'آخرین درخواست موفق بود' : key.status === 'disabled' ? 'غیرفعال' : key.reason}{key.retryAt > 0 && ` · تلاش دوباره از ${new Date(key.retryAt).toLocaleString('fa-IR')}`}</p>
      <div className="seo-actions seo-wide"><button className="btn btn-ghost btn-sm" type="button" disabled={busy || index === 0} onClick={() => move(index, -1)}>اولویت بیشتر کلید {index + 1}</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || index === keys.length - 1} onClick={() => move(index, 1)}>اولویت کمتر کلید {index + 1}</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => setKeys(old => old.filter((_, i) => i !== index))}>حذف کلید {index + 1}</button></div>
    </fieldset>)}
    {error && <p className="xm-notice is-error seo-wide" role="alert">{error}</p>}
    <div className="seo-actions seo-wide"><button type="button" className="btn btn-ghost" disabled={busy || keys.length >= 6} onClick={() => setKeys(old => [...old, { id: '', localId: crypto.randomUUID(), label: '', apiKey: '', enabled: true, reset: false, status: 'unknown', reason: '', retryAt: 0, lastSuccess: 0 }])}>افزودن کلید</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ مجموعهٔ کلیدها'}</button></div>
  </form>
}
