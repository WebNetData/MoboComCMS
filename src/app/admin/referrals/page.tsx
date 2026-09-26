'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminReferralsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [enabled, setEnabled] = useState(false)
  const [percent, setPercent] = useState(5)
  const [total, setTotal] = useState(0)
  const [rewarded, setRewarded] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/admin/referrals').then(r => r.json()).then(data => { setEnabled(Boolean(data.policy?.enabled)); setPercent(Number(data.policy?.rewardBps || 500) / 100); setTotal(data.total || 0); setRewarded(data.rewarded || 0) }).catch(() => setMessage(L('Could not load settings.', 'دریافت تنظیمات ناموفق بود.'))) }, [])
  async function submit(method: 'PATCH' | 'POST') {
    if (busy) return
    setBusy(true); setMessage('')
    try { const response = await fetch('/api/admin/referrals', { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'PATCH' ? { body: JSON.stringify({ enabled, rewardPercent: percent }) } : {}) }); const result = await response.json(); if (!response.ok) throw Error(result.error || ''); setMessage(method === 'PATCH' ? L('Settings saved.', 'تنظیمات ذخیره شد.') : L('Pending rewards checked.', 'پاداش‌های معوق بررسی شد.')) } catch (error) { setMessage(error instanceof Error ? error.message : L('Operation failed.', 'عملیات ناموفق بود.')) } finally { setBusy(false) }
  }
  return <section className="ticket-ops"><header className="ticket-ops-header"><div><span className="ticket-eyebrow">MOBOCOMCMS / GROWTH</span><h1>{L('Referral programme', 'سامانهٔ معرفی')}</h1><p>{L('Reward a referrer only after the invited customer’s first paid order.', 'پاداش فقط پس از اولین سفارش پرداخت‌شدهٔ کاربر معرفی‌شده ثبت می‌شود.')}</p></div></header><div className="ticket-stats"><div><strong>{total}</strong><span>{L('Attributed accounts', 'حساب‌های معرفی‌شده')}</span></div><div><strong>{rewarded}</strong><span>{L('Rewards paid', 'پاداش پرداخت‌شده')}</span></div></div><div className="card" style={{ maxWidth: 720 }}><div className="ticket-form-grid"><label className="ticket-field">{L('Reward percentage (0–20%)', 'درصد پاداش (۰ تا ۲۰)')}<input className="input" type="number" min={0} max={20} step={0.1} value={percent} onChange={e => setPercent(Number(e.target.value))} /></label></div><label className="ticket-dept-check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {L('Enable referrals', 'فعال‌سازی معرفی')}</label><p className="muted text-sm mt-3">{L('The reward percentage is locked when the new account registers. Wallet credit is idempotent.', 'درصد پاداش هنگام ثبت‌نام حساب جدید ثبت می‌شود و شارژ کیف پول دوباره تکرار نمی‌شود.')}</p><div className="flex gap-3 mt-5"><button className="btn btn-primary" disabled={busy} onClick={() => submit('PATCH')}>{L('Save settings', 'ذخیرهٔ تنظیمات')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => submit('POST')}>{L('Retry pending rewards', 'بررسی پاداش‌های معوق')}</button></div>{message && <p className="mt-3" role="status">{message}</p>}</div></section>
}
