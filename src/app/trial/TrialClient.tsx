'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

export default function TrialClient() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const { status } = useSession()
  const [policy, setPolicy] = useState<{ enabled: boolean; days: number; trafficGB: number; deviceLimit: number; claimed: boolean; claim?: { status: string; subscriptionId: number | null } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { fetch('/api/trial').then(r => r.json()).then(setPolicy).catch(() => setError(L('Could not load the trial.', 'اطلاعات تریال دریافت نشد.'))) }, [])
  async function claim() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/trial', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || '')
      setPolicy(current => current ? { ...current, claimed: true, claim: { status: data.status, subscriptionId: data.subscriptionId } } : current)
    } catch { setError(L('Trial could not be started. Please contact support.', 'شروع تریال ناموفق بود؛ با پشتیبانی تماس بگیرید.')) }
    finally { setBusy(false) }
  }
  return <div className="content-reading" style={{ maxWidth: 760, margin: '40px auto' }}><span className="content-eyebrow">MOBOCOMCMS / TRIAL</span><h1 className="display-sm mt-4">{L('Try the connection', 'اتصال را امتحان کنید')}</h1>{policy?.enabled ? <><p className="lead mt-4">{policy.trafficGB} GB · {policy.days * 24} {L('hours', 'ساعت')} · {policy.deviceLimit} {L('device', 'دستگاه')}</p><p className="muted mt-3">{L('One trial per account. Your plan starts after activation.', 'برای هر حساب یک‌بار؛ زمان پس از فعال‌سازی شروع می‌شود.')}</p>{policy.claimed ? <div className="card mt-5"><strong>{policy.claim?.status === 'ACTIVE' ? L('Your trial is active.', 'تریال شما فعال است.') : L('Activation is in progress.', 'فعال‌سازی در حال انجام است.')}</strong><div className="mt-4"><Link className="btn btn-primary" href="/dashboard">{L('View my services', 'مشاهدهٔ سرویس‌ها')}</Link></div></div> : status === 'authenticated' ? <button className="btn btn-primary mt-6" disabled={busy} onClick={claim}>{busy ? L('Starting…', 'در حال شروع…') : L('Start free trial', 'شروع تریال رایگان')}</button> : <Link className="btn btn-primary mt-6" href="/login?next=/trial">{L('Sign in to start', 'برای شروع وارد شوید')}</Link>}</> : <p className="muted mt-5">{L('Trials are currently unavailable.', 'تریال در حال حاضر فعال نیست.')}</p>}{error && <p className="error-text mt-4" role="alert">{error}</p>}</div>
}
