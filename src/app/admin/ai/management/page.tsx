'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { ManagementAdvice, ManagementReport } from '@/modules/ai/domain/management'
import s from './page.module.css'

const endpoint = '/api/admin/ai/management'
const number = new Intl.NumberFormat('fa-IR')
const time = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tehran' })
type Analysis = { model: string; advice: ManagementAdvice[] }
const states = { attention: 'نیازمند بررسی', clear: 'بدون مورد در شاخص بررسی‌شده', unavailable: 'داده در دسترس نیست' }

async function request<T>(options: RequestInit): Promise<T> {
  const response = await fetch(endpoint, { cache: 'no-store', ...options })
  if (!response.ok) {
    const failure = await response.json().catch(() => null)
    throw new Error(failure?.error || 'گزارش در دسترس نیست')
  }
  return response.json()
}

export default function ManagementPage() {
  const [report, setReport] = useState<ManagementReport>()
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const sections = report?.sections ?? []
  const active = sections.some(section => section.id === selected) ? selected : ''
  const displayed = active ? sections.filter(section => section.id === active) : sections

  useEffect(() => {
    const controller = new AbortController()
    request<ManagementReport>({ signal: controller.signal }).then(setReport).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message)
    })
    return () => controller.abort()
  }, [revision])

  function refresh() {
    setReport(undefined)
    setError('')
    setRevision(value => value + 1)
  }

  return (
    <div className={s.page} dir="rtl">
      <header className={s.header}>
        <div>
          <h1>میز مدیریت هوشمند</h1>
          <p>وضعیت بخش‌های در دسترس و کارهایی که امروز به بررسی نیاز دارند.</p>
        </div>
        <button type="button" className="btn btn-ghost" disabled={!report && !error} onClick={refresh}>
          <Icon name="activity" size={18} /> تازه‌سازی
        </button>
      </header>
      {error && <p className={s.notice} role="alert">{error}</p>}
      {!report && !error && <p className={s.notice} role="status">در حال بررسی بخش‌ها…</p>}
      {report && <>
        <div className={s.scope}>
          <label htmlFor="management-section">بخش</label>
          <select id="management-section" value={active} onChange={event => setSelected(event.target.value)}>
            <option value="">همهٔ بخش‌های در دسترس</option>
            {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
          </select>
          <time dateTime={report.checkedAt}>آخرین بررسی {time.format(new Date(report.checkedAt))}</time>
        </div>
        <Recommendations report={{ ...report, sections: displayed }} section={active} key={`${revision}:${active}`} />
        <section className={s.panel} aria-labelledby="management-sections">
          <h2 id="management-sections">وضعیت بخش‌ها</h2>
          <ul className={s.sections}>
            {displayed.map(section => <li key={section.id}>
              <Link href={section.href}>{section.label}</Link>
              <span className={s.state} data-state={section.state}>{states[section.state]}</span>
            </li>)}
          </ul>
        </section>
      </>}
    </div>
  )
}

function Recommendations({ report, section }: { report: ManagementReport; section: string }) {
  const [analysis, setAnalysis] = useState<Analysis>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signals = report.sections.flatMap(owner => owner.signals.filter(signal => signal.count > 0).map(signal => ({ ...signal, owner })))
    .sort((a, b) => Number(b.tone === 'urgent') - Number(a.tone === 'urgent') || b.count - a.count)

  async function analyze() {
    setError('')
    setAnalysis(undefined)
    setBusy(true)
    try {
      const result = await request<Analysis>({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(section ? { section } : {}),
      })
      setAnalysis(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تحلیل در دسترس نیست')
    } finally {
      setBusy(false)
    }
  }

  return <section className={s.panel} aria-labelledby="management-priorities">
    <div className={s.panelHeader}>
      <h2 id="management-priorities">اولویت‌های پیگیری</h2>
      <button type="button" className="btn btn-primary" disabled={!signals.length || busy} onClick={() => void analyze()}>
        <Icon name="sparkles" size={18} /> {busy ? 'در حال تحلیل…' : 'تحلیل با هوش مصنوعی'}
      </button>
    </div>
    {error && <p role="alert" className={s.notice}>{error}</p>}
    <div role="status" className={s.status}>{analysis && <>تحلیل آماده است <bdi>{analysis.model}</bdi></>}</div>
    {!signals.length ? <p className={s.empty}>{report.sections.every(item => item.state === 'unavailable')
      ? 'داده‌ای برای ارزیابی این بخش‌ها در دسترس نیست.'
      : 'در شاخص‌های قابل بررسی، موردی برای پیگیری پیدا نشد.'}</p> :
      <ol className={s.priorities}>
        {signals.map(signal => {
          const advice = analysis?.advice.find(item => item.signalId === signal.id)
          return <li key={signal.id}>
            <div className={s.count} data-tone={signal.tone}>{number.format(signal.count)}</div>
            <div className={s.finding}>
              <Link href={signal.owner.href}>{signal.owner.label}</Link>
              <h3>{signal.label}</h3>
              <p>{signal.detail}</p>
              <p>{signal.recommendation}</p>
              {advice && <p className={s.advice}><strong>پیشنهاد مدل</strong> {advice.text}</p>}
            </div>
          </li>
        })}
      </ol>}
  </section>
}
