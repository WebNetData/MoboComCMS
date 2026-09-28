'use client'

import { Fragment, useEffect, useState } from 'react'
import { Meter, Notice, ServerShell, bytes, duration, fa, useServerApi, useServerJson } from './shared'

type Status = {
  host: { hostname: string; os: string; kernel: string; arch: string; uptime: number; node: string; appUptime: number; appMemory: number; cwd: string; user: string }
  cpu: { percent: number; cores: number; model: string; load: number[] }
  memory: { total: number; used: number; swapTotal: number; swapUsed: number }
  disks: { mount: string; fs: string; total: number; used: number; free: number }[]
  network: { iface: string; address: string; family: string }[]
  systemd: boolean
  services: { id: string; label: string; state: string; enabled: string }[]
  processes: { pid: number; user: string; cpu: number; mem: number; elapsed: string; name: string }[]
}

const STATE: Record<string, [string, string]> = {
  active: ['فعال', 'is-ok'], activating: ['در حال شروع', 'is-info'], reloading: ['بارگذاری دوباره', 'is-info'],
  inactive: ['خاموش', 'is-warn'], failed: ['خطا', 'is-bad'], missing: ['نصب نیست', ''], unknown: ['نامشخص', ''],
}

function Dashboard() {
  const { data, error, reload } = useServerJson<Status>('/api/admin/server/status')
  const api = useServerApi()
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 15_000)
    return () => clearInterval(timer)
  }, [reload])

  async function act(id: string, action: string, label: string) {
    if (action === 'stop' && !window.confirm(`سرویس «${label}» متوقف شود؟`)) return
    setBusy(`${id}:${action}`); setMessage(null)
    const result = await api('/api/admin/server/services', { body: { id, action } })
    setBusy('')
    setMessage(result.ok ? { tone: 'ok', text: `«${label}» ${action === 'restart' ? 'ری‌استارت شد' : action === 'reload' ? 'دوباره بارگذاری شد' : action === 'start' ? 'روشن شد' : 'متوقف شد'}.` } : { tone: 'error', text: result.error })
    void reload()
  }

  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <div className="sa-skeleton" aria-busy="true" />
  const root = data.disks.find((disk) => disk.mount === '/') || data.disks[0]
  return <>
    <div className="sa-kpis sp-kpis">
      <div className="sa-kpi"><Meter value={data.cpu.percent} label="پردازنده" detail={`${fa(data.cpu.cores)} هسته · بار ${data.cpu.load.map((n) => n.toFixed(2)).join(' / ')}`} /></div>
      <div className="sa-kpi"><Meter value={(data.memory.used / data.memory.total) * 100} label="حافظه (RAM)" detail={`${bytes(data.memory.used)} از ${bytes(data.memory.total)}${data.memory.swapTotal ? ` · Swap ${bytes(data.memory.swapUsed)}` : ''}`} /></div>
      {root && <div className="sa-kpi"><Meter value={(root.used / root.total) * 100} label={`دیسک ${root.mount}`} detail={`${bytes(root.free)} آزاد از ${bytes(root.total)}`} /></div>}
      <div className="sa-kpi"><span>روشن بودن سرور</span><b>{duration(data.host.uptime)}</b><small className="sa-sub">سایت: {duration(data.host.appUptime)} · {bytes(data.host.appMemory)} حافظه</small></div>
    </div>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-cols">
      <section className="sa-card sa-table-wrap sp-tc">
        <header className="sa-card-head"><h2>سرویس‌ها</h2><small>هر ۱۵ ثانیه تازه می‌شود</small></header>
        {!data.systemd && <p className="sa-hint sp-pad">systemd روی این محیط در دسترس نیست (مثلاً داخل کانتینر)؛ وضعیت سرویس‌ها روی سرور اوبونتو نمایش داده می‌شود.</p>}
        <table className="data sa-table sp-services"><thead><tr><th>سرویس</th><th>وضعیت</th><th>راه‌اندازی خودکار</th><th /></tr></thead><tbody>
          {data.services.map((service) => {
            const [label, tone] = STATE[service.state] || [service.state, '']
            const present = service.state !== 'missing' && service.state !== 'unknown'
            return <tr key={service.id}>
              <td><b>{service.label}</b><small className="sa-sub" dir="ltr">{service.id}</small></td>
              <td><span className={`sa-state ${tone}`}>{label}</span></td>
              <td>{service.enabled === 'enabled' ? 'بله' : service.enabled === 'disabled' ? 'خیر' : '—'}</td>
              <td className="sp-actions">{present && <>
                {service.state === 'active'
                  ? <><button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void act(service.id, 'restart', service.label)}>{busy === `${service.id}:restart` ? '…' : 'ری‌استارت'}</button>
                    {service.id !== 'mobocom' && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void act(service.id, 'stop', service.label)}>توقف</button>}</>
                  : <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void act(service.id, 'start', service.label)}>{busy === `${service.id}:start` ? '…' : 'روشن کن'}</button>}
              </>}</td>
            </tr>
          })}
        </tbody></table>
      </section>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>سرور</h2></header>
          <dl className="sa-mini sp-facts">
            <span>نام میزبان</span><b dir="ltr">{data.host.hostname}</b>
            <span>سیستم‌عامل</span><b dir="ltr">{data.host.os}</b>
            <span>کرنل</span><b dir="ltr">{data.host.kernel} · {data.host.arch}</b>
            <span>پردازنده</span><b dir="ltr" title={data.cpu.model}>{data.cpu.model || '—'}</b>
            <span>Node.js</span><b dir="ltr">{data.host.node}</b>
            <span>کاربر سرویس</span><b dir="ltr">{data.host.user}</b>
            <span>مسیر برنامه</span><b dir="ltr">{data.host.cwd}</b>
            {data.network.slice(0, 4).map((net) => <Fragment key={`${net.iface}-${net.address}`}><span>{net.iface}</span><b dir="ltr">{net.address}</b></Fragment>)}
          </dl>
        </section>
        {data.disks.length > 1 && <section className="sa-card">
          <header className="sa-card-head"><h2>دیسک‌ها</h2></header>
          <div className="sp-disks">{data.disks.map((disk) => <Meter key={disk.mount} value={(disk.used / disk.total) * 100} label={disk.mount} detail={`${bytes(disk.free)} آزاد از ${bytes(disk.total)}`} />)}</div>
        </section>}
      </div>
    </div>
    <section className="sa-card sa-table-wrap sp-tc">
      <header className="sa-card-head"><h2>پرمصرف‌ترین پردازش‌ها</h2></header>
      {data.processes.length ? <table className="data sa-table"><thead><tr><th>PID</th><th>برنامه</th><th>کاربر</th><th>CPU</th><th>حافظه</th><th>مدت اجرا</th></tr></thead><tbody>
        {data.processes.map((row) => <tr key={row.pid}><td className="num" dir="ltr">{row.pid}</td><td dir="ltr"><code>{row.name}</code></td><td dir="ltr">{row.user}</td><td className="num">{fa(row.cpu)}٪</td><td className="num">{fa(row.mem)}٪</td><td dir="ltr">{row.elapsed}</td></tr>)}
      </tbody></table> : <p className="sa-empty">فهرست پردازش‌ها در دسترس نیست.</p>}
    </section>
  </>
}

export default function ServerPage() {
  return <ServerShell title="پنل سرور"><Dashboard /></ServerShell>
}
