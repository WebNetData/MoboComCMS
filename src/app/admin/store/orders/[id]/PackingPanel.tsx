'use client'

import { useEffect, useState } from 'react'
import { PACKING_CHECKS, type PackingChecks, type PackingView } from '@/modules/store/domain/packing'

export default function PackingPanel({ orderId, onChanged }: { orderId: number; onChanged?: () => void }) {
  const [data, setData] = useState<PackingView | null>(null)
  const [checks, setChecks] = useState<PackingChecks[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      setError('')
      try {
        const response = await fetch(`/api/admin/store/orders/${orderId}/packing`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw Error(body?.error || 'دریافت چک‌لیست ممکن نشد')
        if (!controller.signal.aborted) {
          setData(body); setNote(body.note || '')
          setChecks(body.completed?.current ? body.checks : body.lines.map((line: { line: number }) => ({ line: line.line, model: false, variant: false, quantity: false, devices: false, accessories: false })))
        }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'دریافت چک‌لیست ممکن نشد') }
    })()
    return () => controller.abort()
  }, [orderId, attempt])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!data || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/admin/store/orders/${orderId}/packing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: data.snapshot, revision: data.revision, checks, note }) })
      const body = await response.json()
      if (!response.ok) throw Error(body?.error || 'ثبت چک‌لیست ممکن نشد')
      setData(body); setChecks(body.checks); setMessage('کنترل کالاها و مسئول تحویل ثبت شد'); onChanged?.()
    } catch (error) { setError(error instanceof Error ? error.message : 'ثبت چک‌لیست ممکن نشد') }
    finally { setBusy(false) }
  }
  if (data && !data.required) return null
  return <section className="sa-card" aria-label="چک‌لیست بسته‌بندی و تحویل">
    <header className="sa-card-head"><h2>کنترل بسته‌بندی و تحویل</h2></header>
    {error && <p className="sa-notice is-error" role="alert">{error} <button type="button" className="sa-link" onClick={() => setAttempt(value => value + 1)}>دریافت دوباره</button></p>}
    {!data ? <p role="status">در حال دریافت چک‌لیست…</p> : <form onSubmit={save}>
      <p className="sa-hint">پیش از ارسال یا تحویل از فروشگاه، هر ردیف را با کالای واقعی تطبیق دهید. برای کالای بدون شناسه یا لوازم همراه نیز وضعیت واقعی را کنترل کنید.</p>
      {data.completed && <p className="sa-hint">آخرین کنترل: {data.completed.name} · <time dateTime={data.completed.at}>{new Date(data.completed.at).toLocaleString('fa-IR')}</time>{!data.completed.current && '؛ اطلاعات کالا تغییر کرده و بررسی تازه لازم است'}</p>}
      <fieldset disabled={busy || !data.editable} className="gateway-controls"><legend className="sr-only">تطبیق کالاها با سفارش</legend>
        {data.lines.map(line => <fieldset className="sa-repeat" key={line.line}>
          <legend>{line.name}{line.variant ? ` · ${line.variant}` : ''} · {line.quantity.toLocaleString('fa-IR')} عدد</legend>
          {line.devices.map((device, index) => <p dir="ltr" className="sa-hint" key={index}>{[device.serial && `Serial: ${device.serial}`, device.imei && `IMEI: ${device.imei}`].filter(Boolean).join(' · ')}</p>)}
          {PACKING_CHECKS.map(item => <label className="sa-check" key={item.key}><input type="checkbox" checked={checks.find(row => row.line === line.line)?.[item.key] === true} onChange={event => { setChecks(current => current.map(row => row.line === line.line ? { ...row, [item.key]: event.target.checked } : row)); setMessage('') }} />{item.label}</label>)}
        </fieldset>)}
        <label className="sa-field"><span>توضیح کنترل یا لوازم همراه</span><textarea className="input" value={note} maxLength={500} rows={2} onChange={event => setNote(event.target.value)} /></label>
        {data.editable && <button type="submit" className="btn" disabled={busy || !checks.length || !checks.every(row => PACKING_CHECKS.every(item => row[item.key]))}>{busy ? 'در حال ثبت…' : 'ثبت کنترل کالاها'}</button>}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>}
  </section>
}
