'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'

type Status = { enabled: boolean; member: boolean; endsAt: string | null; daysLeft: number }

/** Dashboard card: VIP status with renew / join call to action. */
export default function VipAccountCard() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/me/membership').then((r) => (r.ok ? r.json() : null)).then((data) => { if (alive) setStatus(data) }).catch(() => undefined)
    return () => { alive = false }
  }, [])
  if (!status?.enabled) return null
  const until = status.endsAt ? new Date(status.endsAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
  return (
    <div className="vip-account-card mb-6">
      <span className="vip-chip">♛ VIP</span>
      {status.member ? (
        <div><b>{fa ? 'اشتراک ویژه شما فعال است' : 'Your VIP membership is active'}</b><small>{fa ? `${status.daysLeft.toLocaleString('fa-IR')} روز باقی‌مانده · تا ${until}` : `${status.daysLeft} days left · until ${until}`}</small></div>
      ) : (
        <div><b>{fa ? 'هنوز عضو ویژه نیستید' : 'You are not a VIP member yet'}</b><small>{fa ? 'فیلم، موزیک، بازی و مطالب ویژه + قیمت مخصوص اعضا' : 'Exclusive films, music, games, articles and member prices'}</small></div>
      )}
      <Link href="/vip" className="btn vip-btn">{status.member ? (fa ? 'تمدید' : 'Extend') : (fa ? 'عضویت VIP' : 'Go VIP')}</Link>
    </div>
  )
}
