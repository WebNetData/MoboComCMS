'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/components/admin/ProfileManager.module.css'

type Preview = { source: { id: number; name: string; _count: Record<string, number> }; target: { id: number; name: string }; sourceVersion: string | number; targetVersion: string | number }
/** Explicit two-step owner command; both profiles and old addresses are retained. */
export default function ProfileMergePanel({ sourceId, endpoint, editor }: { sourceId: number; endpoint: string; editor: string }) {
  const id = useId(), router = useRouter()
  const [query, setQuery] = useState(''), [targetId, setTargetId] = useState(''), [options, setOptions] = useState<{ id: number; name: string }[]>([])
  const [preview, setPreview] = useState<Preview | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [searching, setSearching] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (query.trim().length < 2) { setOptions([]); setSearching(false); return }
    const abort = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true); setError('')
      try {
        const response = await fetch(`${endpoint}?sourceId=${sourceId}&q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: abort.signal }), body = await response.json()
        if (!response.ok) throw Error(body.error || 'جست‌وجوی مقصد ممکن نشد')
        if (!abort.signal.aborted) setOptions(body.options)
      } catch (e) { if (!abort.signal.aborted) { setOptions([]); setError(e instanceof Error ? e.message : 'جست‌وجو ناموفق بود') } }
      finally { if (!abort.signal.aborted) setSearching(false) }
    }, 250)
    return () => { abort.abort(); window.clearTimeout(timer) }
  }, [endpoint, query, sourceId])
  async function request(apply: boolean) {
    setBusy(true); setError('')
    try {
      const response = await fetch(apply ? endpoint : `${endpoint}?sourceId=${sourceId}&targetId=${targetId}`, apply ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId, targetId: Number(targetId), sourceVersion: preview?.sourceVersion, targetVersion: preview?.targetVersion }) } : { cache: 'no-store' }), body = await response.json()
      if (!response.ok) throw Error(body.error || 'ادغام ممکن نشد')
      if (apply) router.push(`${editor}?edit=${body.id}`)
      else { setPreview(body); setConfirmed(false) }
    } catch (e) { setError(e instanceof Error ? e.message : 'عملیات ناموفق بود'); if (apply) { setPreview(null); setConfirmed(false) } }
    finally { setBusy(false) }
  }
  return <details className={`sa-card ${styles.merge}`}><summary>ادغام پروفایل تکراری</summary><p className="sa-hint">آثار و دنبال‌کنندگان به مقصد منتقل می‌شوند. اطلاعات مقصد اولویت دارد و آدرس قبلی به پروفایل اصلی هدایت می‌شود. این عملیات بازگشت خودکار ندارد.</p>
    {error && <p className="sa-notice is-error" role="alert">{error}</p>}
    <fieldset disabled={busy} className={styles.mergeFields}><legend className="sr-only">انتخاب مقصد ادغام</legend>
      <label className="sa-field" htmlFor={id}>جست‌وجوی پروفایل مقصد<input id={id} className="input" value={query} minLength={2} onChange={e => { setQuery(e.target.value); setTargetId(''); setPreview(null) }} /></label>
      <label className="sa-field">مقصد<select className="select" value={targetId} onChange={e => { setTargetId(e.target.value); setPreview(null) }}><option value="">انتخاب کنید</option>{options.map(option => <option key={option.id} value={option.id}>{option.name} · #{option.id}</option>)}</select></label>
      <span role="status" aria-live="polite">{searching ? 'در حال جست‌وجو…' : query.length >= 2 && !options.length && !error ? 'پروفایلی پیدا نشد' : ''}</span>
      <button type="button" className="btn btn-ghost" disabled={!targetId || busy || searching} onClick={() => void request(false)}>پیش‌نمایش ادغام</button>
      {preview && <div className="sa-notice"><p><b>{preview.source.name}</b> ← <b>{preview.target.name}</b></p><p>{Object.entries(preview.source._count).map(([key, count]) => `${key === 'credits' ? 'همکاری' : key === 'tracks' ? 'آهنگ' : 'آلبوم'}: ${count.toLocaleString('fa-IR')}`).join(' · ')}</p><label className="sa-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />مقصد و انتقال آثار را بررسی و تأیید کرده‌ام</label><button className="btn btn-primary" type="button" disabled={!confirmed || busy} onClick={() => void request(true)}>{busy ? 'در حال ادغام…' : 'تأیید و ادغام'}</button></div>}
    </fieldset>
  </details>
}
