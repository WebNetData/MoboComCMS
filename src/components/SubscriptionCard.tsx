'use client'

// One subscription, everywhere it is shown: the customer dashboard and the
// Telegram mini app. It owns its own connect kit (live link + liveness), runs
// its own actions through `/api/subscriptions/<id>` and reports back so the
// host page can refresh its list.
import RenewalPreview from '@/components/RenewalPreview'
import SubscriptionSupport from '@/components/SubscriptionSupport'
import { useEffect, useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import ConnectPanel from '@/components/ConnectPanel'
import { useSubKit } from '@/components/useSubKit'
import { useI18n } from '@/i18n/LocaleProvider'
import { newIdempotencyKey } from '@/shared/security/idempotency'
import { subscriptionState } from '@/modules/subscriptions/domain/customer-overview'
import Link from '@/components/AppLink'

export interface SubSummary {
  id: number
  planName: string
  panelName?: string | null
  panelType?: string
  status: string
  username: string
  trafficUsedGB: number
  trafficLimitGB: number
  deviceLimit: number
  expiresAt: string
  daysLeft: number
  subToken: string
  subUrl: string
}

interface Device {
  hwid: string
  platform?: string
  deviceModel?: string
  lastOnline?: string
}

export default function SubscriptionCard({
  sub,
  onChanged,
  compact,
  initialRenewalOpen = false,
  showDetailsLink = true,
}: {
  sub: SubSummary
  onChanged?: () => void
  compact?: boolean
  initialRenewalOpen?: boolean
  showDetailsLink?: boolean
}) {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const { kit, loading, reload } = useSubKit(sub.subToken)
  const [renewalOpen, setRenewalOpen] = useState(initialRenewalOpen)
  useEffect(() => { if (initialRenewalOpen) setRenewalOpen(true) }, [initialRenewalOpen])
  const [renewalNotice, setRenewalNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [copied, setCopied] = useState('')
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [devicesBusy, setDevicesBusy] = useState(false)

  const status = kit?.status || sub.status
  const disabled = status === 'DISABLED'
  const used = kit?.trafficUsedGB ?? sub.trafficUsedGB
  const limit = kit?.trafficLimitGB ?? sub.trafficLimitGB
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const expiresAt = kit?.expiresAt || sub.expiresAt
  const daysLeft = kit?.daysLeft ?? sub.daysLeft
  const state = subscriptionState({ status, trafficUsedGB: used, trafficLimitGB: limit, expiresAt, daysLeft })
  const remainingGB = limit > 0 ? Math.max(0, Number((limit - used).toFixed(2))) : null
  const exhausted = limit > 0 && used >= limit
  const primary = kit?.primary?.url || sub.subUrl
  const health = kit?.primary ? kit.primary.healthy : null

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500) }
    catch { setMsg(isFa ? 'کپی انجام نشد؛ دسترسی کلیپ‌بورد را بررسی کنید.' : 'Clipboard access was denied.') }
  }

  /** Every action goes through the same endpoint the public REST API uses. */
  async function call(action: string, extra: object = {}) {
    setBusy(true)
    setMsg('')
    let renewKey = ''
    const storageKey = `happ.renew.idempotency.${sub.id}`
    if (action === 'renew') {
      try {
        renewKey = sessionStorage.getItem(storageKey) || newIdempotencyKey('renew')
        sessionStorage.setItem(storageKey, renewKey)
      } catch { renewKey = newIdempotencyKey('renew') }
    }
    let res: Response
    try {
      res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(renewKey ? { 'Idempotency-Key': renewKey } : {}) },
        body: JSON.stringify({ action, ...extra }),
      })
    } catch {
      setBusy(false)
      setMsg(t.errGeneric)
      return { ok: false, data: null }
    }
    const data = await res.json().catch(() => null)
    if (renewKey && (res.ok || res.status === 402 || res.status === 400 || res.status === 403 || res.status === 409)) { try { sessionStorage.removeItem(storageKey) } catch {} }
    setBusy(false)
    if (!res.ok) {
      if (data?.code === 'RENEWAL_CHANGED') { setMsg(isFa ? 'شرایط تمدید تغییر کرده است؛ پیش‌نمایش را تازه‌سازی کنید.' : 'Renewal terms changed. Refresh the preview.'); return { ok: false, data } }
      setMsg(data?.code === 'INSUFFICIENT_FUNDS' ? t.walletInsufficient : t.errGeneric)
      return { ok: false, data }
    }
    return { ok: true, data }
  }

  async function act(action: string, extra: object = {}) {
    if (action === 'renew') { setRenewalNotice(''); setMsg(''); setRenewalOpen(true); return }
    setActionNotice('')
    const res = await call(action, extra)
    if (!res.ok) return
    await reload({ sync: false })
    onChanged?.()
    if (action === 'sync') setActionNotice(isFa ? 'اطلاعات اشتراک به‌روز شد.' : 'Subscription details updated.')
    if (action === 'enable' || action === 'disable') setActionNotice(isFa ? 'وضعیت اشتراک تغییر کرد.' : 'Subscription status updated.')
  }

  async function showDevices() {
    if (devices) {
      setDevices(null)
      return
    }
    setDevicesBusy(true)
    setMsg('')
    try {
    const res = await fetch(`/api/subscriptions/${sub.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'devices' }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(data?.devices)) throw new Error(isFa ? 'دریافت دستگاه‌ها ممکن نشد؛ دوباره تلاش کنید.' : 'Could not load devices. Please retry.')
    setDevices(data.devices)
    } catch (error) {
      setDevices(null)
      setMsg(error instanceof Error ? error.message : t.errGeneric)
    } finally { setDevicesBusy(false) }
  }

  return (
    <div className="card sub-card">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-lg">{sub.planName}</h3>
          <div className="muted text-xs num">
            #{sub.id} · {sub.username}
            {kit?.panelName ? ` · ${kit.panelName}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={state === 'expired' ? 'EXPIRED' : status} />
          <span className={`badge ${daysLeft <= 3 ? 'badge-red' : daysLeft <= 7 ? 'badge-amber' : 'badge-gray'} num`}>
            {state === 'expired' ? (isFa ? 'منقضی‌شده' : 'Expired') : <>⏳ {daysLeft} {t.daysLeft}</>}
          </span>
        </div>
      </div>

      <div className="stat-strip mb-4">
        <div className="mini-stat">
          <div className="muted text-xs">{t.trafficUsed}</div>
          <div className="mini-stat-value num">
            {used} / {limit || '∞'} GB
          </div>
          <div className="muted text-xs mt-1">{remainingGB === null ? (isFa ? 'حجم نامحدود' : 'Unlimited data') : `${isFa ? 'باقی‌مانده' : 'Remaining'}: ${remainingGB} GB`}</div>
          <div className="meter mt-2">
            <div className={pct > 85 ? 'meter-fill meter-danger' : 'meter-fill'} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="mini-stat">
          <div className="muted text-xs">{t.expires}</div>
          <div className="mini-stat-value num">{fmtDate(expiresAt)}</div>
        </div>
        <div className="mini-stat">
          <div className="muted text-xs">{t.devicesLabel}</div>
          <div className="mini-stat-value num">{sub.deviceLimit || '∞'}</div>
        </div>
      </div>

      {(state === 'attention' || state === 'expired') && <p className={`text-sm mb-4 ${state === 'expired' || exhausted ? 'error-text' : 'muted'}`} role="status">{state === 'expired' ? (isFa ? 'اشتراک منقضی شده است؛ برای ادامه آن را تمدید کنید.' : 'This subscription has expired. Renew it to continue.') : exhausted ? (isFa ? 'حجم اشتراک به پایان رسیده است؛ برای ادامه آن را تمدید کنید.' : 'This subscription has run out of data. Renew it to continue.') : (isFa ? 'زمان یا حجم اشتراک رو به پایان است.' : 'This subscription is running low on time or data.')}</p>}

      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <label className="label mb-0">{t.subLink}</label>
          <div className="flex items-center gap-2">
            {loading && !kit && <span className="badge badge-gray">{t.linkChecking}</span>}
            {!loading && kit && health === true && <span className="badge badge-green">● {t.linkHealthy}</span>}
            {!loading && kit && health === false && <span className="badge badge-amber">● {t.linkDown}</span>}
          </div>
        </div>
        {primary ? <div className="flex gap-2">
          <input className="input" dir="ltr" readOnly value={primary} />
          <button className="btn btn-ghost imp-px-3" onClick={() => copy(primary, 'link')} title={t.copy}>
            {copied === 'link' ? '✓' : t.copy}
          </button>
          {kit?.happUrl && <a className="btn btn-ghost imp-px-3" href={kit.happUrl} title={t.openConnectPage}>
            ↗
          </a>}
        </div> : <p className="muted text-sm">{kit?.linksError || (isFa ? 'لینک Happ در حال آماده‌سازی است.' : 'Preparing your Happ link.')}</p>}
      </div>

      <p className="muted text-sm mb-3">{isFa ? 'با تمدید، حجم و زمان پلن به باقیماندهٔ همین اشتراک اضافه می‌شود؛ مصرف قبلی صفر نمی‌شود.' : 'Renewal adds the plan’s traffic and duration to this subscription. Existing usage is kept.'}</p>
      <div className="flex flex-wrap gap-2">
        {showDetailsLink && <Link className="btn btn-ghost" href={`${compact ? '/miniapp' : '/dashboard'}/subscriptions/${sub.id}`}>{isFa ? 'جزئیات و تاریخچه' : 'Details & history'}</Link>}
        <button className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
          🔌 {open ? t.closePanel : t.connect}
        </button>
        {state !== 'expired' && status !== 'EXPIRED' && (status === 'ACTIVE' || disabled) && <button
          className={`btn ${disabled ? 'btn-primary' : 'btn-ghost'}`}
          disabled={busy}
          onClick={() => act(disabled ? 'enable' : 'disable')}
        >
          {disabled ? `▶ ${t.enableSub}` : `⏸ ${t.disableSub}`}
        </button>}
        <button className="btn btn-ghost" disabled={busy} onClick={() => act('renew')}>
          ♻ {t.renewNow}
        </button>
        <button className="btn btn-ghost" disabled={devicesBusy} onClick={showDevices}>
          📱 {t.manageDevices}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => act('sync')}>
          ↻ {t.syncNow}
        </button>
        {kit?.lastSyncAt && (
          <span className="muted text-xs self-center">
            {t.lastSynced}: {new Date(kit.lastSyncAt).toLocaleTimeString(isFa ? 'fa-IR' : 'en-US')}
          </span>
        )}
      </div>

      {renewalOpen && <RenewalPreview subscriptionId={sub.id} busy={busy} onClose={() => setRenewalOpen(false)} onConfirm={async expectedTerms => {
        const result = await call('renew', { expectedTerms })
        if (result.ok) {
          setRenewalNotice(result.data?.fulfillmentPending ? (isFa ? 'پرداخت ثبت شد؛ تمدید در حال پردازش است.' : 'Payment recorded. Renewal is processing.') : (isFa ? 'اشتراک با موفقیت تمدید شد.' : 'Subscription renewed successfully.'))
          await reload({ sync: false }); onChanged?.()
        }
        return result
      }} />}
      {renewalNotice && <p role="status" className="success-text mt-3">{renewalNotice}</p>}
      {actionNotice && <p role="status" className="success-text mt-3">{actionNotice}</p>}
      <SubscriptionSupport subscriptionId={sub.id} username={sub.username} />
      {msg && <p role="alert" className="error-text mt-3">{msg}</p>}

      {open && (
        <div className="mt-4">
          {kit ? (
            <ConnectPanel
              kit={kit}
              loading={loading}
              compact={compact}
              onReload={() => reload()}
              onClose={() => setOpen(false)}
              onAction={(action) => act(action)}
            />
          ) : (
            <p className="muted text-sm">{loading ? t.loading : t.errGeneric}</p>
          )}
        </div>
      )}

      {devices && (
        <div className="card mt-4 bg-soft-var">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-sm">{t.devicesLabel}</h4>
            <button className="btn btn-ghost imp-px-3" onClick={() => setDevices(null)}>✕</button>
          </div>
          {devices.length === 0 && <p className="muted text-sm">{t.noDevices}</p>}
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.hwid} className="credential-row">
                <div className="min-w-0">
                  <div className="text-sm font-semibold" dir="ltr">
                    {d.deviceModel || d.platform || t.unknownDevice}
                  </div>
                  <div className="muted text-xs" dir="ltr">
                    {d.hwid.slice(0, 24)}…
                  </div>
                </div>
                <button
                  className="badge badge-red"
                  onClick={async () => {
                    if (!confirm(t.confirmDelete)) return
                    const result = await call('delete-device', { hwid: d.hwid })
                    if (!result.ok) return
                    setDevices((list) => (list ? list.filter((x) => x.hwid !== d.hwid) : list))
                  }}
                >
                  {t.removeDevice}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
