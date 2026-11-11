'use client'
import { useEffect, useState } from 'react'
import { withRecommended, type ModelPrice, type PurposeUsage, type UsagePolicy } from '@/modules/ai/domain/usage'
import styles from './page.module.css'

type Cost = { total: number; unpricedTokens: number; approximate: boolean; byPurpose: { purpose: string; cost: number; tokens: number }[]; cachedAnswers: number; refusedByCeiling: number; models: { provider: string; model: string }[] }
type View = { policy: UsagePolicy; purposes: { id: string; label: string }[]; today: Record<string, { requests: number; tokens: number }>; days: number; cost: Cost }
const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
const num = (value: string) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0 }

/**
 * Ceilings, cache times and prices of the site's paid AI (ai/server/usage), next to what they cost in the chosen period.
 * The figures are the owner's own prices against the tokens each provider reported; nothing is fetched from a provider.
 */
export default function UsagePanel({ days }: { days: string }) {
  const [view, setView] = useState<View | null>(null), [form, setForm] = useState<UsagePolicy | null>(null)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/ai/usage?days=${days}`, { cache: 'no-store', signal: controller.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw Error(body?.error || 'گزارش مصرف دریافت نشد'); if (controller.signal.aborted) return; setView(body); setForm(body.policy) }).catch(e => { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : 'گزارش مصرف دریافت نشد') })
    return () => controller.abort()
  }, [days, revision])
  if (!view || !form) return <section className="sa-card" aria-busy={!message}><h2>مصرف، سقف و هزینه</h2><p role="status">{message || 'در حال دریافت…'}</p></section>
  const setPurpose = (id: string, patch: Partial<PurposeUsage>) => setForm({ ...form, purposes: { ...form.purposes, [id]: { ...form.purposes[id as keyof UsagePolicy['purposes']], ...patch } } })
  const setPrice = (index: number, patch: Partial<ModelPrice>) => setForm({ ...form, prices: form.prices.map((p, i) => i === index ? { ...p, ...patch } : p) })
  const recommend = () => setForm(withRecommended(form))
  const unpriced = view.cost.models.filter(m => !form.prices.some(p => p.provider === m.provider && p.model === m.model))
  async function save() {
    setBusy(true); setMessage('')
    try {
      const r = await fetch('/api/admin/ai/usage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await r.json(); if (!r.ok) throw Error(body?.error || 'ذخیره نشد')
      setForm(body.policy); setMessage('تنظیمات مصرف ذخیره شد'); setRevision(n => n + 1)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'ذخیره نشد') } finally { setBusy(false) }
  }
  const label = (id: string) => view.purposes.find(p => p.id === id)?.label || 'عمومی'
  return <section className={`sa-card ${styles.usage}`} aria-labelledby="ai-usage-title">
    <header className={styles.row}><h2 id="ai-usage-title">مصرف، سقف و هزینه</h2><small className="sa-sub">{fa(view.days)} روز گذشته</small></header>
    <dl className={styles.metrics}>
      <div><dt>هزینهٔ برآوردی</dt><dd><bdi>{usd(view.cost.total)}</bdi><small>{view.cost.unpricedTokens ? `${fa(view.cost.unpricedTokens)} توکن بدون قیمت ثبت‌شده` : 'همهٔ مدل‌های مصرفی قیمت دارند'}{view.cost.approximate ? ' · بخشی تقریبی' : ''}</small></dd></div>
      <div><dt>پاسخ از حافظه (بدون هزینه)</dt><dd>{fa(view.cost.cachedAnswers)}</dd></div>
      <div><dt>ردشده با سقف روزانه</dt><dd>{fa(view.cost.refusedByCeiling)}</dd></div>
      <div><dt>پرهزینه‌ترین کاربرد</dt><dd className={styles.small}>{view.cost.byPurpose[0] ? <>{label(view.cost.byPurpose[0].purpose)} · <bdi>{usd(view.cost.byPurpose[0].cost)}</bdi></> : '—'}</dd></div>
    </dl>
    <p className="sa-sub">سقف روزانه درخواست‌های API پولی همان کاربرد را از ابتدای امروز (به وقت سایت) می‌شمارد؛ پر که شد، تا فردا درخواستی فرستاده نمی‌شود. «حافظه» یعنی همان درخواستِ دقیقاً تکراری تا این چند ساعت بدون فراخوانی دوباره جواب می‌گیرد؛ برای کارهایی که «دوباره بنویس» در آن‌ها معمول است خاموش بماند. ۰ = بدون سقف / بدون حافظه.</p>
    <div className={styles.tableWrap}><table className="sa-table">
      <caption className="sr-only">سقف و حافظهٔ هر کاربرد</caption>
      <thead><tr><th scope="col">کاربرد</th><th scope="col">امروز</th><th scope="col">سقف درخواست در روز</th><th scope="col">سقف توکن در روز</th><th scope="col">حافظه (ساعت)</th></tr></thead>
      <tbody>{view.purposes.map(p => { const v = form.purposes[p.id as keyof UsagePolicy['purposes']], t = view.today[p.id] || { requests: 0, tokens: 0 }; return <tr key={p.id}>
        <th scope="row">{p.label}</th>
        <td>{fa(t.requests)} درخواست{t.tokens ? ` · ${fa(t.tokens)} توکن` : ''}</td>
        <td><input className="input num" type="number" min={0} aria-label={`سقف درخواست روزانهٔ ${p.label}`} value={v.dailyRequests} onChange={e => setPurpose(p.id, { dailyRequests: num(e.target.value) })} /></td>
        <td><input className="input num" type="number" min={0} aria-label={`سقف توکن روزانهٔ ${p.label}`} value={v.dailyTokens} onChange={e => setPurpose(p.id, { dailyTokens: num(e.target.value) })} /></td>
        <td><input className="input num" type="number" min={0} max={720} aria-label={`حافظهٔ پاسخ ${p.label} به ساعت`} value={v.cacheHours} onChange={e => setPurpose(p.id, { cacheHours: num(e.target.value) })} /></td>
      </tr> })}</tbody>
    </table></div>
    <h3>قیمت مدل‌ها (دلار به ازای یک میلیون توکن)</h3>
    <p className="sa-sub">قیمت را از صفحهٔ قیمت هر سرویس وارد کنید؛ سهمیهٔ رایگان را ۰ بگذارید. بدون قیمت، هزینهٔ آن مدل «بدون قیمت» شمرده می‌شود و حدس زده نمی‌شود.</p>
    <div className={styles.tableWrap}><table className="sa-table">
      <caption className="sr-only">قیمت مدل‌ها</caption>
      <thead><tr><th scope="col">سرویس</th><th scope="col">مدل</th><th scope="col">ورودی</th><th scope="col">خروجی</th><th scope="col"><span className="sr-only">حذف</span></th></tr></thead>
      <tbody>{form.prices.map((p, i) => <tr key={i}>
        <td><input className="input" dir="ltr" aria-label="سرویس" value={p.provider} onChange={e => setPrice(i, { provider: e.target.value })} /></td>
        <td><input className="input" dir="ltr" aria-label="مدل" value={p.model} onChange={e => setPrice(i, { model: e.target.value })} /></td>
        <td><input className="input num" type="number" min={0} step="0.001" aria-label={`قیمت ورودی ${p.model}`} value={p.inputPerMillion} onChange={e => setPrice(i, { inputPerMillion: num(e.target.value) })} /></td>
        <td><input className="input num" type="number" min={0} step="0.001" aria-label={`قیمت خروجی ${p.model}`} value={p.outputPerMillion} onChange={e => setPrice(i, { outputPerMillion: num(e.target.value) })} /></td>
        <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, prices: form.prices.filter((_, j) => j !== i) })}>حذف</button></td>
      </tr>)}</tbody>
    </table></div>
    <div className={styles.actions}>
      {unpriced.map(m => <button key={`${m.provider}/${m.model}`} type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, prices: [...form.prices, { ...m, inputPerMillion: 0, outputPerMillion: 0 }] })}>+ قیمت <bdi>{m.provider} · {m.model}</bdi></button>)}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, prices: [...form.prices, { provider: '', model: '', inputPerMillion: 0, outputPerMillion: 0 }] })}>+ مدل دیگر</button>
    </div>
    <div className={styles.actions}>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات مصرف'}</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={recommend}>پیشنهاد کم‌مصرف</button>
      <small className="sa-sub">«پیشنهاد کم‌مصرف» فقط جاهای خالی را پر می‌کند (برای ذخیره، دکمهٔ ذخیره را بزنید).</small>
    </div>
    <p role="status">{message}</p>
  </section>
}
