'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type Kind = 'product' | 'cinema' | 'game' | 'software'
type Candidate = { id: number; title: string; slug: string; version: string }
type Review = {
  kind: Kind
  source: Candidate & { path: string }
  target: Candidate & { path: string }
  blockers: { stock: number; physicalLocationStock: number; codes: number; reservations: number; pendingOrders: number } | null
  canCanonicalize: boolean
  retain: string[]
  effect: string
}

export default function CanonicalAliasPanel({ kind, sourceId }: { kind: Kind; sourceId: number }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [source, setSource] = useState<Candidate | null>(null)
  const [activeAlias, setActiveAlias] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [undo, setUndo] = useState<{ sourceVersion: string; targetVersion: string; targetId: number; sourcePath: string; targetPath: string; effect: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function read(path: string) {
    const response = await fetch(path, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || data.message || (fa ? 'دریافت اطلاعات انجام نشد' : 'Could not load review data'))
    return data
  }

  useEffect(() => {
    let alive = true
    setError(''); setNotice(''); setSelected(null); setReview(null); setUndo(null); setActiveAlias(false)
    read(`/api/admin/content/canonical-alias?kind=${kind}&sourceId=${sourceId}`).then(data => {
      if (alive) { setSource(data.source); setCandidates(data.candidates || []); setActiveAlias(Boolean(data.activeAlias)) }
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  // sourceId/kind identify a different candidate review.
  }, [kind, sourceId])

  async function selectTarget(id: number) {
    setSelected(id); setError(''); setNotice(''); setReview(null); setUndo(null); setBusy(true)
    try { setReview(await read(`/api/admin/content/canonical-alias?kind=${kind}&sourceId=${sourceId}&targetId=${id}`)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  async function loadUndo() {
    setError(''); setNotice(''); setReview(null); setBusy(true)
    try { setUndo(await read(`/api/admin/content/canonical-alias?kind=${kind}&sourceId=${sourceId}&undo=1`)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  async function submit(action: 'create' | 'undo') {
    if (busy || (action === 'create' && !review?.canCanonicalize)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const body = action === 'undo'
        ? { kind, action, sourceId, sourceVersion: undo?.sourceVersion, targetVersion: undo?.targetVersion }
        : { kind, sourceId, targetId: review?.target.id, sourceVersion: review?.source.version, targetVersion: review?.target.version, confirm: true }
      const response = await fetch('/api/admin/content/canonical-alias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || (fa ? 'ذخیره انجام نشد' : 'Could not save review'))
      setNotice(action === 'undo' ? (fa ? 'هم‌نشانی برگردانده شد.' : 'Canonical alias was reversed.') : (fa ? 'نشانی مبدأ به مقصد هم‌نشانی شد.' : 'Source path now points to the canonical record.'))
      setReview(null); setUndo(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const blockerLabels = review?.blockers ? [
    [review.blockers.stock !== 0, fa ? `موجودی قابل فروش: ${review.blockers.stock < 0 ? 'نامحدود' : review.blockers.stock}` : `Sellable stock: ${review.blockers.stock < 0 ? 'unlimited' : review.blockers.stock}`],
    [review.blockers.physicalLocationStock !== 0, fa ? `موجودی همهٔ محل‌ها، شامل قرنطینه: ${review.blockers.physicalLocationStock < 0 ? 'نیازمند تعیین تکلیف' : review.blockers.physicalLocationStock}` : `Stock across all locations, including quarantine: ${review.blockers.physicalLocationStock < 0 ? 'requires reconciliation' : review.blockers.physicalLocationStock}`],
    [review.blockers.codes > 0, fa ? `کدهای آماده: ${review.blockers.codes}` : `Available codes: ${review.blockers.codes}`],
    [review.blockers.reservations > 0, fa ? `رزرو/تحویل باز: ${review.blockers.reservations}` : `Open reservations: ${review.blockers.reservations}`],
    [review.blockers.pendingOrders > 0, fa ? `سفارش باز یا منتظر ارسال: ${review.blockers.pendingOrders}` : `Open or undispatched orders: ${review.blockers.pendingOrders}`],
  ].filter(([show]) => show).map(([, label]) => label as string) : []

  return <details className="sa-card" onToggle={event => { if (!(event.currentTarget as HTMLDetailsElement).open) { setReview(null); setUndo(null); setError(''); setNotice('') } }}>
    <summary className="sa-card-head" style={{ cursor: 'pointer' }}>{fa ? 'بررسی مورد تکراری' : 'Review a duplicate'} <small>{busy ? (fa ? 'در حال بررسی…' : 'Reviewing…') : ''}</small></summary>
    <p className="muted">{fa ? 'نام یکسان فقط یک پیشنهاد است؛ مقصد و نسخه‌های فعلی را بررسی کنید. هیچ سابقه یا رابطه‌ای منتقل یا حذف نمی‌شود.' : 'A matching name is only a suggestion. Review the target and current versions; history and relations are never moved or deleted.'}</p>
    {source && <p><b>{fa ? 'مبدأ:' : 'Source:'}</b> {source.title} <code dir="ltr">{source.slug}</code></p>}
    {error && <p role="alert" className="ga-issues">{error}</p>}
    {notice && <p role="status" className="muted">{notice}</p>}
    {!candidates.length && !error && !undo && <p className="muted">{fa ? 'همسانی دقیق دیگری در موارد منتشرشده پیدا نشد.' : 'No exact same-kind match among published records.'}</p>}
    {!!candidates.length && <ul className="sa-list">{candidates.map(candidate => <li key={candidate.id}>
      <div className="sa-card-head"><div className="sa-grow"><b>{candidate.title}</b><small dir="ltr">{candidate.slug}</small></div>
        <button type="button" className="btn btn-secondary" aria-pressed={selected === candidate.id} disabled={busy} onClick={() => void selectTarget(candidate.id)}>{fa ? 'پیش‌نمایش' : 'Preview'}</button>
      </div>
      {selected === candidate.id && <small className="muted">{fa ? `شناسه ${candidate.id}` : `ID ${candidate.id}`}</small>}
    </li>)}</ul>}
    {review && <section aria-label={fa ? 'پیش‌نمایش هم‌نشانی' : 'Canonical alias preview'} className="sa-stack">
      <h3>{fa ? 'پیش‌نمایش هم‌نشانی' : 'Canonical alias preview'}</h3>
      <p><b>{fa ? 'مبدأ:' : 'Source:'}</b> <code dir="ltr">{review.source.path}</code></p>
      <p><b>{fa ? 'مقصد زنده:' : 'Live target:'}</b> <code dir="ltr">{review.target.path}</code></p>
      <p>{review.effect}</p>
      <h4>{fa ? 'چه چیزی باقی می‌ماند' : 'What stays on the source record'}</h4>
      <ul>{review.retain.map(item => <li key={item}>{item}</li>)}</ul>
      {!!blockerLabels.length && <div role="alert"><b>{fa ? 'پیش از هم‌نشانی تعیین تکلیف کنید:' : 'Resolve before canonicalizing:'}</b><ul>{blockerLabels.map(label => <li key={label}>{label}</li>)}</ul><div className="sa-row"><Link className="sa-link" href={`/admin/store/products/${sourceId}`}>{fa ? 'بازبینی محصول' : 'Review product'}</Link><Link className="sa-link" href="/admin/orders">{fa ? 'بررسی سفارش‌ها' : 'Review orders'}</Link></div></div>}
      <button type="button" className="btn btn-primary" disabled={busy || !review.canCanonicalize} onClick={() => void submit('create')}>{fa ? 'تأیید و ثبت هم‌نشانی' : 'Confirm canonical path'}</button>
      {!review.canCanonicalize && <p role="alert" className="ga-issues">{kind === 'product' ? (fa ? 'برای حفظ فروش و تحویل باز، این محصول هنوز قابل هم‌نشانی نیست.' : 'This product cannot be canonicalized until the inventory blockers are resolved.') : (fa ? 'برای حفظ پیشنهاد پرداخت و دسترسی‌های خریداری‌شده، این دو رکورد هم‌نشانی نمی‌شوند. سوابق خرید در رکورد اصلی باقی می‌مانند.' : 'These records cannot be aliased while payment offers or purchase access history exist. Purchases stay with their original record.')}</p>}
    </section>}
    {undo && <section aria-label={fa ? 'پیش‌نمایش بازگردانی' : 'Reverse preview'} className="sa-stack">
      <h3>{fa ? 'بازگردانی هم‌نشانی' : 'Reverse canonical alias'}</h3><p><code dir="ltr">{undo.sourcePath}</code> → <code dir="ltr">{undo.targetPath}</code></p>
      <p>{undo.effect}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void submit('undo')}>{fa ? 'تأیید بازگردانی' : 'Confirm reversal'}</button>
    </section>}
    {activeAlias && !review && !undo && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void loadUndo()}>{fa ? 'پیش‌نمایش بازگردانی فعال' : 'Preview active reversal'}</button>}
  </details>
}
