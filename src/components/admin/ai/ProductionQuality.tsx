'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { productionQuality } from '@/modules/ai/client/production'
import { QUALITY_PROFILES, type QualityArea, type QualityReport } from '@/modules/ai/domain/production-quality'
import css from './ProductionQuality.module.css'

const AREAS: { id: QualityArea; label: string }[] = [
  { id: 'similar', label: 'مطالب مشابه' }, { id: 'links', label: 'لینک‌ها' }, { id: 'claims', label: 'ادعا و منبع' }, { id: 'images', label: 'تصویر و متن' }, { id: 'profile', label: 'قواعد بخش' },
]
const LEVEL = { pass: 'سالم', warn: 'نیاز به نگاه', block: 'مسدودکننده' } as const

/** The item's quality report; a blocking report needs an explicit, recorded acknowledgement before saving. */
export default function ProductionQuality({ batchId, itemId, version, busy, onSave }: { batchId: string; itemId: string; version: number; busy: boolean; onSave: (acknowledged: boolean) => void }) {
  const [report, setReport] = useState<QualityReport | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [ack, setAck] = useState(false)
  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError('')
    productionQuality(batchId, itemId, signal).then(setReport, e => { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'گزارش کیفیت دریافت نشد') }).finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [batchId, itemId])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load, version])
  useEffect(() => setAck(false), [report])

  const blocked = report?.level === 'block'
  return <section className={css.panel} data-level={report?.level || 'loading'} aria-labelledby={`quality-${itemId}`} aria-busy={loading}>
    <header className={css.head}>
      <div><h4 id={`quality-${itemId}`}>کنترل کیفیت پیش از ذخیره</h4><p>{report ? `قواعد «${QUALITY_PROFILES.find(p => p.id === report.profile)?.label}» · ${new Date(report.checkedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : 'بررسی مشابهت، لینک، ادعا و تصویر'}</p></div>
      {report && <span className={css.verdict} data-level={report.level}>{LEVEL[report.level]}</span>}
      <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => load()}>بررسی دوباره</button>
    </header>
    {loading && !report && <p role="status" className="muted">در حال بررسی…</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {report && <>
      <ul className={css.areas} aria-label="خلاصهٔ بررسی‌ها">{AREAS.map(area => <li key={area.id} data-level={report.areas[area.id]}><span aria-hidden="true" className={css.dot} />{area.label}<span className="sr-only">: {LEVEL[report.areas[area.id]]}</span></li>)}</ul>
      {report.findings.length ? <ol className={css.findings}>{report.findings.map((f, i) => <li key={i} data-level={f.level}>
        <b>{f.title}</b><span className={css.tag}>{LEVEL[f.level]}</span>
        <p>{f.detail}</p>{f.evidence && <q dir="auto">{f.evidence}</q>}
      </li>)}</ol> : <p className={css.clean}>موردی پیدا نشد. بازبینی انسانی همچنان لازم است.</p>}
      {report.matches.some(m => m.kind !== 'batch') && <p className={css.matches}>محتوای مشابه: {report.matches.filter(m => m.kind !== 'batch').map((m, i) => <span key={m.href}>{i ? '، ' : ''}<Link href={m.href} target="_blank">{m.title}</Link></span>)}</p>}
    </>}
    <div className={css.actions}>
      {blocked && <label className={css.ack}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />موارد مسدودکننده را دیدم و پیش‌نویس را با مسئولیت خودم ذخیره می‌کنم؛ این تأیید در گزارش فعالیت ثبت می‌شود.</label>}
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || loading || !report || blocked && !ack} onClick={() => onSave(blocked)}>بازبینی کردم؛ ذخیرهٔ پیش‌نویس</button>
    </div>
  </section>
}
