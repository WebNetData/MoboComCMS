'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'

export type HourlyUsage = {
  rate: number; runningRate: number; stoppedRate: number; powerState: string; balance: number; runwayHours: number | null; chargedUntil: string | null
  monthTotal: number; monthHours: number; dayTotal: number; allTotal: number; allHours: number
  hours: { at: string; amount: number; stopped: boolean }[]
}

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')
const clock = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })
const WEEK = 168

/** The current hour's cost so far: rate times the part of the hour that has passed. An estimate; hours are charged whole. */
function useThisHour(rate: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!running) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [running])
  const elapsed = (now % 3_600_000) / 3_600_000
  return { cost: rate * elapsed, minutes: Math.floor(elapsed * 60), seconds: Math.floor((elapsed * 3600) % 60) }
}

function Chart({ hours }: { hours: HourlyUsage['hours'] }) {
  const max = Math.max(1, ...hours.map((hour) => hour.amount))
  const total = hours.reduce((sum, hour) => sum + hour.amount, 0)
  const charged = hours.filter((hour) => hour.amount > 0).length
  const w = 480, h = 120, gap = 2, bar = w / hours.length - gap
  return <figure className="hs-chart">
    <svg viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={`هزینهٔ ۴۸ ساعت گذشته: ${nf(total)} تومان در ${nf(charged)} ساعت`} preserveAspectRatio="none">
      <line x1="0" x2={w} y1={h} y2={h} className="hs-chart-axis" />
      {hours.map((hour, i) => {
        const height = hour.amount ? Math.max(3, (hour.amount / max) * (h - 8)) : 2
        return <rect key={hour.at} x={i * (bar + gap)} y={h - height} width={bar} height={height} rx="2" className={hour.amount ? (hour.stopped ? 'is-stopped' : 'is-on') : 'is-none'} style={{ ['--d' as string]: `${i * 12}ms` }}>
          <title>{`${clock.format(new Date(hour.at))} — ${hour.amount ? `${nf(hour.amount)} تومان${hour.stopped ? ' (خاموش)' : ''}` : 'بدون هزینه'}`}</title>
        </rect>
      })}
      {[0, 12, 24, 36, 47].map((i) => <text key={i} x={i * (bar + gap) + bar / 2} y={h + 14} className="hs-chart-label" textAnchor="middle">{clock.format(new Date(hours[i].at))}</text>)}
    </svg>
    <figcaption><span className="hs-chart-key is-on" />روشن <span className="hs-chart-key is-stopped" />خاموش (دیسک و آی‌پی)</figcaption>
  </figure>
}

/** Usage and cost of an hourly service: live meter, totals, wallet runway, 48 hours, and deletion. */
export default function HourlyPanel({ usage, serviceId, confirmName, active, deletable, onTerminated }: { usage: HourlyUsage; serviceId: number; confirmName: string; active: boolean; deletable: boolean; onTerminated: () => void }) {
  const running = active && usage.powerState === 'RUNNING'
  const thisHour = useThisHour(usage.rate, active)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const runway = usage.runwayHours
  const level = runway === null ? 'is-ok' : runway < 3 ? 'is-bad' : runway < 24 ? 'is-warn' : 'is-ok'
  const fill = runway === null ? 100 : Math.min(100, Math.round((runway / WEEK) * 100))

  async function terminate() {
    setBusy(true); setError('')
    const response = await fetch(`/api/hosting/services/${serviceId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'terminate', confirm }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) onTerminated()
    else setError(String(data?.error || 'حذف انجام نشد'))
  }

  return <>
    <section className="hs-panel hs-meter" aria-labelledby="hs-meter-title">
      <h2 id="hs-meter-title"><Icon name="activity" size={18} />مصرف و هزینه<span className={`hs-live${active ? '' : ' is-off'}`}>{active ? (running ? 'در حال محاسبه' : 'خاموش؛ فقط دیسک و آی‌پی') : 'متوقف'}</span></h2>
      <div className="hs-now">
        <div><span>این ساعت تا الان</span><b className="num" aria-live="off">{active ? (thisHour.cost < 10 ? thisHour.cost.toFixed(1) : nf(thisHour.cost)) : '۰'}</b><small>تومان · {nf(thisHour.minutes)} دقیقه</small></div>
        <div><span>نرخ فعلی</span><b className="num">{nf(usage.rate)}</b><small>تومان در ساعت</small></div>
      </div>
      <div className="hs-kpis">
        <div><span>۲۴ ساعت گذشته</span><b className="num">{nf(usage.dayTotal)}</b></div>
        <div><span>این ماه</span><b className="num">{nf(usage.monthTotal)}</b><small>{nf(usage.monthHours)} ساعت</small></div>
        <div><span>از ابتدا</span><b className="num">{nf(usage.allTotal)}</b><small>{nf(usage.allHours)} ساعت</small></div>
      </div>
      <Chart hours={usage.hours} />
      <p className="hs-rates">روشن {nf(usage.runningRate)} · خاموش {nf(usage.stoppedRate)} تومان در ساعت. هر ساعت پس از اجرا کامل محاسبه می‌شود.</p>
    </section>

    <section className={`hs-panel hs-runway ${level}`} aria-labelledby="hs-runway-title">
      <h2 id="hs-runway-title"><Icon name="wallet" size={18} />موجودی کیف پول</h2>
      <b className="num hs-runway-balance">{nf(usage.balance)} <small>تومان</small></b>
      <div className="hs-runway-bar" role="meter" aria-valuemin={0} aria-valuemax={WEEK} aria-valuenow={Math.min(WEEK, runway ?? WEEK)} aria-label="ساعت‌های باقی‌مانده با موجودی فعلی"><span style={{ ['--w' as string]: `${fill}%` }} /></div>
      <p>{runway === null ? 'سرویس ساعتی فعالی هزینه ندارد.' : runway < 1 ? 'موجودی برای یک ساعت دیگر هم کافی نیست؛ سرویس به‌زودی متوقف می‌شود.' : `با مصرف فعلی همهٔ سرویس‌های ساعتی، حدود ${nf(runway)} ساعت${runway >= 48 ? ` (${nf(runway / 24)} روز)` : ''} کافی است.`}</p>
      <Link className="btn btn-primary" href="/dashboard/wallet"><Icon name="plus" size={16} />شارژ کیف پول</Link>
    </section>

    {deletable ? <section className="hs-panel hs-danger" aria-labelledby="hs-danger-title">
      <h2 id="hs-danger-title"><Icon name="lock" size={18} />حذف سرویس</h2>
      <p>هزینه با حذف متوقف می‌شود؛ ساعت جاری کامل حساب می‌شود و اطلاعات سرویس برنمی‌گردد.</p>
      <label className="hs-field"><span className="hs-field-label">برای تأیید بنویسید: <b dir="ltr">{confirmName}</b></span><input className="input" dir="ltr" autoComplete="off" spellCheck={false} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      {error && <p className="hs-error" role="alert">{error}</p>}
      <button type="button" className="btn hs-danger-btn" disabled={busy || confirm.trim().toLowerCase() !== confirmName.toLowerCase()} onClick={() => void terminate()}>حذف همیشگی سرویس</button>
    </section> : null}
  </>
}
