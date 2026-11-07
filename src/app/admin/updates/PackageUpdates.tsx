'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Notice, usePanel, useServerApi, useServerJson } from '../server/shared'

type PackageInfo = { id: string; version: string; bytes: number; sha256: string; keyFingerprint: string }
const endpoint = '/api/admin/server/updates/package'
export default function PackageUpdates({ running, onApply }: { running: boolean; onApply: (item: PackageInfo) => Promise<void> }) {
  const api = useServerApi(), { relock } = usePanel()
  const { data, error, reload } = useServerJson<PackageInfo[]>(endpoint)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<'' | 'upload' | 'delete'>('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const control = useRef<AbortController | null>(null), input = useRef<HTMLInputElement | null>(null), id = useId()
  useEffect(() => () => control.current?.abort(), [])
  async function upload() {
    if (!file) return
    if (file.size > 512 * 1024 * 1024) { setNotice({ tone: 'error', text: 'حداکثر حجم بسته ۵۱۲ مگابایت است.' }); return }
    setBusy('upload'); setNotice(null)
    control.current = new AbortController()
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal: control.current.signal })
      const result = await response.json().catch(() => null)
      if (response.status === 401 && result?.code === 'locked') { relock(); return }
      if (!response.ok) throw new Error(result?.error || 'بسته پذیرفته نشد')
      setFile(null); if (input.current) input.current.value = ''
      setNotice({ tone: 'ok', text: `امضای بستهٔ نسخهٔ ${result.version} تأیید شد. هنوز تغییری در سایت انجام نشده است.` })
      await reload()
    } catch (cause) { if (!(cause instanceof Error && cause.name === 'AbortError')) setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : 'دریافت بسته انجام نشد' }) }
    finally { setBusy(''); control.current = null }
  }
  async function remove(item: PackageInfo) {
    setBusy('delete'); setNotice(null)
    try {
      const result = await api('/api/admin/server/updates', { body: { op: 'package-delete', id: item.id } })
      if (!result.ok) setNotice({ tone: 'error', text: result.error })
      else await reload()
    } finally { setBusy('') }
  }
  const disabled = !!busy || running
  return <section className="sa-card upd-package" aria-busy={!!busy} aria-labelledby={`${id}-title`}>
<header className="sa-card-head"><div><h2 id={`${id}-title`}>نصب بستهٔ به‌روزرسانی</h2><p className="sa-hint">فایل انتشار را مستقیم بارگذاری کنید یا از بخش دریافت امن GitHub بگیرید؛ هر دو با امضای ناشر بررسی می‌شوند.</p></div><span className="sa-state is-ok">بستهٔ امضاشده</span></header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {error && <Notice tone="error">{error} <button type="button" className="btn btn-ghost" onClick={() => void reload()}>تلاش دوباره</button></Notice>}
    <form onSubmit={event => { event.preventDefault(); void upload() }}>
      <label className="sa-field" htmlFor={id}><span>فایل انتشار موبوکام</span><input ref={input} id={id} type="file" accept=".mbrelease" disabled={disabled} aria-describedby={`${id}-help`} onChange={event => { setFile(event.target.files?.[0] || null); setNotice(null) }} /></label>
      <p id={`${id}-help`} className="sa-hint">فرمت mbrelease، حداکثر ۵۱۲ مگابایت. امضای ناشر و سلامت فایل پیش از نصب بررسی می‌شوند. کلید خصوصی ناشر را هرگز بارگذاری نکنید.</p>
      <div className="sa-row-actions"><button type="submit" className="btn btn-primary" disabled={!file || disabled}>{busy === 'upload' ? 'در حال دریافت و بررسی…' : 'بارگذاری و بررسی بسته'}</button>{busy === 'upload' && <button type="button" className="btn btn-ghost" onClick={() => control.current?.abort()}>لغو دریافت</button>}</div>
      {busy === 'upload' && <progress aria-label="دریافت و بررسی بسته" />}
    </form>
    {data && data.length === 0 && <p className="sa-hint">بسته‌ای آمادهٔ نصب نیست. انتخاب فایل، به‌تنهایی سایت را تغییر نمی‌دهد.</p>}
    {!!data?.length && <>
      <label className="sa-check"><input type="checkbox" disabled={disabled} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> تأیید می‌کنم پشتیبان اجباری گرفته شود و سایت برای نصب دوباره راه‌اندازی شود.</label>
      <ul className="upd-package-list">{data.map(item => <li key={item.id}>
        <div><strong>{item.version ? <>نسخهٔ <bdi>{item.version}</bdi></> : 'بستهٔ ناقص؛ آن را حذف کنید'}</strong><p className="sa-hint">{(item.bytes / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت</p></div>
        {item.sha256 && <details><summary>مشخصات صحت و ناشر</summary><dl><dt>SHA-256</dt><dd><code dir="ltr">{item.sha256}</code></dd><dt>اثر انگشت کلید ناشر</dt><dd><code dir="ltr">{item.keyFingerprint}</code></dd></dl></details>}
        <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!confirmed || disabled || !item.version} onClick={() => void onApply(item)}>نصب نسخهٔ {item.version}</button><button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => void remove(item)}>حذف بسته</button></div>
      </li>)}</ul>
    </>}
  </section>
}
