'use client'

import { useState, type FormEvent } from 'react'

type Result = { recorded: boolean; status: 'COMPATIBLE' | 'INCOMPATIBLE' | 'CONDITIONAL' | null; note: string; deviceModel?: string }

export default function DeviceCompatibilityLookup({ slug, isFa }: { slug: string; isFa: boolean }) {
  const [model, setModel] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !model.trim()) return
    setBusy(true); setError(false); setResult(null)
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(slug)}/tabs?tab=device-compatibility&model=${encodeURIComponent(model)}`)
      if (!response.ok) throw new Error('lookup failed')
      setResult(await response.json())
    } catch { setError(true) } finally { setBusy(false) }
  }
  const fa = isFa
  return <section className="sx-pinfo-specs" aria-labelledby="device-compatibility-title">
    <h2 id="device-compatibility-title">{fa ? 'بررسی سازگاری دستگاه' : 'Check device compatibility'}</h2>
    <form onSubmit={lookup} className="device-compatibility-form">
      <label className="sr-only" htmlFor="device-compatibility-model">{fa ? 'مدل دقیق دستگاه' : 'Exact device model'}</label>
      <input id="device-compatibility-model" className="input" value={model} disabled={busy} maxLength={120} dir="auto" onChange={event => { setModel(event.target.value); setResult(null); setError(false) }} placeholder={fa ? 'مدل دقیق را وارد کنید' : 'Enter an exact model'} />
      <button className="btn btn-secondary" type="submit" disabled={busy || !model.trim()}>{busy ? (fa ? 'در حال بررسی…' : 'Checking…') : (fa ? 'بررسی' : 'Check')}</button>
    </form>
    {busy && <p role="status" className="muted">{fa ? 'در حال بررسی مدل…' : 'Checking model…'}</p>}
    {error && <p role="alert" className="muted">{fa ? 'بررسی مدل انجام نشد. دوباره تلاش کنید.' : 'The model check failed. Try again.'}</p>}
    {result && !result.recorded && <p role="status" className="muted">{fa ? 'سازگاری این مدل ثبت نشده است.' : 'No compatibility record for this model.'}</p>}
    {result?.recorded && <div role="status">
      <p><b>{result.status === 'COMPATIBLE' ? (fa ? 'سازگار' : 'Compatible') : result.status === 'INCOMPATIBLE' ? (fa ? 'ناسازگار' : 'Incompatible') : (fa ? 'سازگار با شرط' : 'Conditional')}</b>{result.deviceModel && ` · ${result.deviceModel}`}</p>
      {result.note && <p>{result.note}</p>}
    </div>}
  </section>
}
