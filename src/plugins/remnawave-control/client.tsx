'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from '@/platform/routing/Link'
import { useExtensionI18n } from '@/extensions/sdk/client'
import type { PluginClientModule } from '../types'

type Panel = { id: number; name: string; active: boolean }
type Health = { ok: boolean; source: string; latencyMs: number; components: number; message: string }
type ScanItem = {
  id: number; username: string; status: string; issues: string[]; repaired: string[]
  local: { trafficUsedGB: number; trafficLimitGB: number; expiresAt: string; lastSyncAt: string | null }
  remote: { status: string; trafficUsedGB: number; trafficLimitGB: number; expiresAt: string | null; squads: number | null; lastOpenedAt: string | null; lastUserAgent: string | null; lifetimeUsedGB: number | null; deviceLimit: number | null } | null
}
type Scan = { health: Health; items: ScanItem[]; cursor: number; nextCursor: number; scanned: number; repaired: number; unavailable: boolean }
type QueueItem = { orderId: number; jobId: number | null; status: string; attempts: number; paidAt: string | null; nextAttemptAt: string | null; retryable: boolean; error: string }
type Detail = { overview: { health: Health; subscriptions: number; lastRun: { at?: string; panels?: { panelId: number; healthy: boolean; scanned: number; issues: number; repaired: number }[] } | null }; queue: QueueItem[]; scan: Scan | null }

const issueLabels: Record<string, [string, string]> = {
  REMOTE_MISSING: ['کاربر روی پنل پیدا نشد', 'Panel user missing'], PANEL_ERROR: ['خطا در خواندن پنل', 'Panel read failed'], SQUADS_MISSING: ['اسکواد خالی', 'No internal squad'], DISABLED_LEAK: ['محلی غیرفعال، روی پنل فعال', 'Disabled locally, active remotely'], REMOTE_DISABLED: ['روی پنل غیرفعال', 'Disabled remotely'], REMOTE_EXHAUSTED: ['سرویس روی پنل منقضی یا تمام‌شده', 'Expired or exhausted on panel'], EXPIRY_DRIFT: ['اختلاف تاریخ انقضا', 'Expiry mismatch'], TRAFFIC_DRIFT: ['اختلاف سقف حجم', 'Traffic limit mismatch'], SUB_URL_MISSING: ['لینک اشتراک محلی خالی', 'Local subscription URL missing'], STATUS_UNKNOWN: ['وضعیت نامشخص پنل', 'Unknown panel status'],
}

function RemnaControlPage() {
  const { locale } = useExtensionI18n()
  const fa = locale === 'fa'
  const L = (a: string, b: string) => fa ? a : b
  const [panels, setPanels] = useState<Panel[]>([])
  const [panelId, setPanelId] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPanels = useCallback(async () => {
    const response = await fetch('/api/admin/remnawave', { cache: 'no-store' })
    if (!response.ok) throw new Error(L('دریافت پنل‌ها ناموفق بود.', 'Could not load panels.'))
    const data = await response.json()
    const rows = data.panels || []
    setPanels(rows)
    setPanelId(current => current || rows[0]?.id || 0)
    setLoading(false)
  }, [fa])
  useEffect(() => { void loadPanels().catch(cause => { setMessage(cause.message); setError(true); setLoading(false) }) }, [loadPanels])

  const load = useCallback(async (id: number, scan = false, cursor = 0) => {
    if (!id) return
    setBusy(scan ? 'scan' : 'load'); setMessage(''); setError(false)
    try {
      const query = new URLSearchParams({ panelId: String(id) })
      if (scan) { query.set('scan', '1'); query.set('cursor', String(cursor)); query.set('limit', '10') }
      const response = await fetch(`/api/admin/remnawave?${query}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Diagnostics unavailable')
      setDetail(data)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Diagnostics unavailable'); setError(true) }
    finally { setBusy('') }
  }, [])
  useEffect(() => { if (panelId) void load(panelId) }, [panelId, load])

  async function act(action: 'repair' | 'sync' | 'retry' | 'run', id?: number) {
    setBusy(`${action}:${id || 0}`); setMessage(''); setError(false)
    try {
      const response = await fetch('/api/admin/remnawave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(action === 'retry' ? { orderId: id } : { subscriptionId: id }) }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Action failed')
      setMessage(action === 'repair' ? L(`تعمیر ایمن انجام شد؛ ${data.repaired?.length || 0} مورد اصلاح شد.`, `Safe repair completed; ${data.repaired?.length || 0} issue(s) fixed.`) : action === 'sync' ? L('مصرف و زمان آخرین همگام‌سازی به‌روزرسانی شد؛ حجم خریداری‌شده و انقضا تغییر نکرد.', 'Usage telemetry refreshed; purchased limit and expiry were preserved.') : action === 'retry' ? L('تلاش مجدد فعال‌سازی انجام شد.', 'Provisioning retry completed.') : L('پایش خودکار اجرا شد.', 'Control scan completed.'))
      await load(panelId, true)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Action failed'); setError(true) }
    finally { setBusy('') }
  }
  const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US') : '—'
  const lastPanel = detail?.overview.lastRun?.panels?.find(panel => panel.panelId === panelId)
  return <div dir={fa ? 'rtl' : 'ltr'}>
    <div className="appbar"><div><span className="section-kicker">HAPP / REMNAWAVE</span><h1 className="h2">{L('مرکز کنترل RemnaWave', 'RemnaWave Control Center')}</h1><p className="muted">{L('سلامت پنل، تطبیق سرویس‌ها، تعمیر ایمن و تلاش مجدد فعال‌سازی', 'Panel health, service reconciliation, safe repair and provisioning retries')}</p></div><div className="flex gap-2 flex-wrap"><button className="btn btn-ghost" disabled={!!busy || !panelId} onClick={() => void act('run')}>{L('اجرای پایش دوره‌ای', 'Run scheduled scan')}</button><button className="btn btn-primary" disabled={!!busy || !panelId} onClick={() => void load(panelId, true)}>{busy === 'scan' ? L('در حال بررسی…', 'Scanning…') : L('تطبیق دستی', 'Manual scan')}</button></div></div>
    {message && <div className={`studio-notice mb-4 ${error ? 'studio-error' : ''}`} role="status">{message}</div>}
    {loading && <div className="studio-notice">{L('در حال دریافت پنل‌ها…', 'Loading panels…')}</div>}
    {!loading && !panels.length && <div className="studio-notice">{L('هنوز پنل RemnaWave تعریف نشده است.', 'No RemnaWave panel has been configured.')}</div>}
    {!!panels.length && <label className="studio-field mb-5" style={{ maxWidth: 420 }}><span>{L('پنل RemnaWave', 'RemnaWave panel')}</span><select className="input" value={panelId} onChange={event => { setPanelId(Number(event.target.value)); setDetail(null) }}>{panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}{panel.active ? '' : L(' · غیرفعال', ' · inactive')}</option>)}</select></label>}
    {detail && <><div className="grid-3 mb-6"><div className="card kpi"><div className="muted text-xs">{L('سلامت پنل', 'Panel health')}</div><div className={`mt-2 badge ${detail.overview.health.ok ? 'badge-green' : 'badge-red'}`}>{detail.overview.health.ok ? L('در دسترس', 'Online') : L('در دسترس نیست', 'Unavailable')}</div><div className="muted text-xs mt-2">{detail.overview.health.source} · {detail.overview.health.latencyMs} ms{detail.overview.health.components > 0 ? ` · ${detail.overview.health.components} ${L('جزء', 'components')}` : ''}</div></div><div className="card kpi"><div className="muted text-xs">{L('اشتراک‌های محلی', 'Local subscriptions')}</div><div className="num text-2xl font-extrabold">{detail.overview.subscriptions}</div>{lastPanel && <div className="muted text-xs mt-2">{L('آخرین نوبت', 'Last batch')}: {lastPanel.scanned} {L('بررسی', 'checked')} · {lastPanel.issues} {L('اختلاف', 'issues')} · {lastPanel.repaired} {L('اصلاح', 'fixed')}</div>}</div><div className="card kpi"><div className="muted text-xs">{L('تلاش‌های تحویل نیازمند رسیدگی', 'Provisioning needing attention')}</div><div className="num text-2xl font-extrabold">{detail.queue.length}</div></div></div>
      <div className="studio-notice mb-6">{L('تعمیر ایمن فقط اسکواد خالی و حسابی را که محلی غیرفعال اما روی پنل فعال است اصلاح می‌کند. اختلاف حجم و تاریخ انقضا فقط گزارش می‌شود.', 'Safe repair only restores missing squads and disables accounts that are inactive locally but active on the panel. Traffic and expiry mismatches are reported without automatic changes.')} {detail.overview.lastRun?.at && <span>{L('آخرین اجرای خودکار:', 'Last automatic run:')} {date(detail.overview.lastRun.at)}</span>}</div>
      {detail.scan && <div className="card overflow-x-auto mb-6"><div className="flex items-center justify-between gap-3 flex-wrap mb-4"><h2 className="font-bold">{L('تطبیق اشتراک‌ها', 'Subscription reconciliation')}</h2><span className="muted text-xs">{detail.scan.scanned} {L('اشتراک بررسی شد', 'checked')} · {detail.scan.repaired} {L('اصلاح ایمن', 'safe fixes')}</span></div>{detail.scan.unavailable ? <p className="error-text">{L('پنل در دسترس نیست؛ برای جلوگیری از تشخیص اشتباه، تطبیق انجام نشد.', 'The panel is unavailable, so reconciliation was skipped to avoid false missing-user reports.')}</p> : <><table className="data"><thead><tr><th>{L('اشتراک', 'Subscription')}</th><th>{L('وضعیت / آخرین اتصال', 'Status / last access')}</th><th>{L('حجم محلی / پنل', 'Local / panel traffic')}</th><th>{L('انقضای محلی / پنل', 'Local / panel expiry')}</th><th>{L('تشخیص', 'Findings')}</th><th>{L('اقدام', 'Action')}</th></tr></thead><tbody>{detail.scan.items.map(item => <tr key={item.id}><td><b className="num">#{item.id}</b><div dir="ltr" className="text-xs">{item.username}</div></td><td><span className="badge badge-gray">{item.status} / {item.remote?.status || '—'}</span><div className="muted text-xs mt-1">{date(item.remote?.lastOpenedAt)}</div>{item.remote && <div className="muted text-xs mt-1">{L('اسکواد', 'Squads')}: {item.remote.squads ?? '—'} · {L('دستگاه', 'Devices')}: {item.remote.deviceLimit ?? '—'}</div>}{item.remote?.lastUserAgent && <div className="muted text-xs" dir="ltr">{item.remote.lastUserAgent}</div>}</td><td className="num text-xs">{item.local.trafficUsedGB} / {item.local.trafficLimitGB} GB<br/>{item.remote ? `${item.remote.trafficUsedGB} / ${item.remote.trafficLimitGB} GB` : '—'}{item.remote?.lifetimeUsedGB != null && <div className="muted text-xs">{L('مصرف کل', 'Lifetime used')}: {item.remote.lifetimeUsedGB} GB</div>}</td><td className="text-xs">{date(item.local.expiresAt)}<br/>{date(item.remote?.expiresAt)}</td><td>{item.issues.length ? item.issues.map(issue => <div key={issue} className="badge badge-amber mb-1">{issueLabels[issue]?.[fa ? 0 : 1] || issue}</div>) : <span className="badge badge-green">{L('هماهنگ', 'In sync')}</span>}{item.repaired.length > 0 && <div className="muted text-xs">{L('اصلاح شد', 'Repaired')}: {item.repaired.length}</div>}</td><td><div className="flex gap-1 flex-wrap"><button className="badge badge-gray" disabled={!!busy} onClick={() => void act('sync', item.id)}>{L('همگام‌سازی مصرف', 'Sync usage')}</button>{item.issues.some(issue => issue === 'SQUADS_MISSING' || issue === 'DISABLED_LEAK') && <button className="badge badge-green" disabled={!!busy} onClick={() => void act('repair', item.id)}>{L('تعمیر ایمن', 'Safe repair')}</button>}</div></td></tr>)}{!detail.scan.items.length && <tr><td colSpan={6} className="muted text-center py-8">{L('در این بخش اشتراکی نیست.', 'No subscriptions in this batch.')}</td></tr>}</tbody></table><div className="flex gap-2 mt-4"><button className="btn btn-ghost" disabled={!!busy || detail.scan.scanned < 10} onClick={() => void load(panelId, true, detail.scan!.nextCursor)}>{L('۱۰ اشتراک بعدی', 'Next 10 subscriptions')}</button>{detail.scan.cursor > 0 && <button className="btn btn-ghost" disabled={!!busy} onClick={() => void load(panelId, true, 0)}>{L('بازگشت به ابتدا', 'Start over')}</button>}</div></>}</div>}
      <div className="card overflow-x-auto"><div className="flex items-center justify-between gap-3 flex-wrap mb-4"><h2 className="font-bold">{L('صف تلاش مجدد فعال‌سازی', 'Provisioning retry queue')}</h2><Link href="/admin/operations" className="text-link">{L('مرکز عملیات سفارش', 'Order operations')} ↗</Link></div><table className="data"><thead><tr><th>{L('سفارش', 'Order')}</th><th>{L('وضعیت', 'Status')}</th><th>{L('تلاش', 'Attempts')}</th><th>{L('تلاش بعدی', 'Next attempt')}</th><th>{L('خطا', 'Error')}</th><th>{L('اقدام', 'Action')}</th></tr></thead><tbody>{detail.queue.map(item => <tr key={item.orderId}><td className="num">#{item.orderId}</td><td><span className="badge badge-amber">{item.status}</span></td><td className="num">{item.attempts}</td><td className="text-xs">{date(item.nextAttemptAt)}</td><td className="text-xs" style={{ maxWidth: 300, overflowWrap: 'anywhere' }}>{item.error || '—'}</td><td>{item.retryable && <button className="badge badge-green" disabled={!!busy} onClick={() => void act('retry', item.orderId)}>{L('تلاش مجدد', 'Retry')}</button>}</td></tr>)}{!detail.queue.length && <tr><td colSpan={6} className="muted text-center py-8">{L('سفارش معطلی برای این پنل نیست.', 'No pending paid orders for this panel.')}</td></tr>}</tbody></table></div>
    </>}
  </div>
}

export const plugin: PluginClientModule = { AdminPage: RemnaControlPage }
