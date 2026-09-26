'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

type Policy = { enabled: boolean; planId: number; days: number; trafficGB: number; deviceLimit: number }
type Plan = { id: number; name: string; nameEn: string; days: number; trafficGB: number; deviceLimit: number; panel: { active: boolean } | null }

export default function AdminTrialPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [claims, setClaims] = useState<{ status: string; _count: { _all: number } }[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/admin/trial').then(r => r.json()).then(data => { setPolicy(data.policy); setPlans(data.plans || []); setClaims(data.claims || []) }).catch(() => setMessage(L('Could not load trial settings.', 'تنظیمات تریال دریافت نشد.'))) }, [])
  async function save() {
    if (!policy || busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/trial', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policy) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || '')
      setMessage(L('Trial policy saved.', 'تنظیمات تریال ذخیره شد.'))
    } catch (error) { setMessage(error instanceof Error && error.message ? error.message : L('Could not save settings.', 'ذخیرهٔ تنظیمات ناموفق بود.')) }
    finally { setBusy(false) }
  }
  return <section className="ticket-ops"><header className="ticket-ops-header"><div><span className="ticket-eyebrow">MOBOCOMCMS / GROWTH</span><h1>{L('Trial accounts', 'اکانت آزمایشی')}</h1><p>{L('Offer one trial per customer. Choose a service and set safe limits.', 'برای هر کاربر یک دورهٔ آزمایشی با محدودیت مشخص ارائه کنید.')}</p></div></header>{policy ? <div className="card" style={{ maxWidth: 760 }}><div className="ticket-form-grid"><label className="ticket-field">{L('Trial service', 'سرویس آزمایشی')}<select className="input" value={policy.planId || ''} onChange={e => setPolicy({ ...policy, planId: Number(e.target.value) })}><option value="">{L('Choose a plan', 'پلن را انتخاب کنید')}</option>{plans.filter(plan => plan.panel?.active).map(plan => <option key={plan.id} value={plan.id}>{fa ? plan.name : plan.nameEn || plan.name} · {plan.trafficGB || '∞'} GB · {plan.days || '∞'} d</option>)}</select></label><label className="ticket-field">{L('Duration in days', 'مدت به روز')}<input className="input" type="number" min={1} max={30} value={policy.days} onChange={e => setPolicy({ ...policy, days: Number(e.target.value) })} /></label><label className="ticket-field">{L('Traffic in GB', 'حجم به گیگابایت')}<input className="input" type="number" min={0.1} max={100} step={0.1} value={policy.trafficGB} onChange={e => setPolicy({ ...policy, trafficGB: Number(e.target.value) })} /></label><label className="ticket-field">{L('Device limit', 'تعداد دستگاه')}<input className="input" type="number" min={1} max={10} value={policy.deviceLimit} onChange={e => setPolicy({ ...policy, deviceLimit: Number(e.target.value) })} /></label></div><label className="ticket-dept-check"><input type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })} /> {L('Enable trials', 'فعال‌سازی تریال')}</label><p className="muted text-sm mt-3">{L('Each account can claim once. Provisioning failures retry without granting another trial.', 'هر حساب فقط یک‌بار می‌تواند تریال بگیرد؛ خطای تحویل با همان درخواست دوباره پردازش می‌شود.')}</p><button className="btn btn-primary mt-5" disabled={busy || !policy.planId} onClick={save}>{busy ? L('Saving…', 'در حال ذخیره…') : L('Save policy', 'ذخیرهٔ تنظیمات')}</button>{message && <p className="mt-3" role="status">{message}</p>}</div> : <p className="muted">{L('Loading…', 'در حال دریافت…')}</p>}<div className="ticket-stats">{claims.map(item => <div key={item.status}><strong>{item._count._all}</strong><span>{item.status}</span></div>)}</div></section>
}
