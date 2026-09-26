'use client'

// Compact list row for the subscription index (dashboard home + mini app).
// It only names the subscription and its health; every action lives on the
// detail page at `/dashboard/subscriptions/<id>` (or `/miniapp/...`).
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { subscriptionState } from '@/modules/subscriptions/domain/customer-overview'
import type { SubSummary } from '@/components/SubscriptionCard'

export default function SubscriptionRow({ sub, compact = false, renew = false }: { sub: SubSummary; compact?: boolean; renew?: boolean }) {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const state = subscriptionState(sub)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')
  const limited = sub.trafficLimitGB > 0
  const pct = limited ? Math.min(100, Math.round((sub.trafficUsedGB / sub.trafficLimitGB) * 100)) : 0
  const daysLabel = state === 'expired' ? (isFa ? 'منقضی‌شده' : 'Expired') : `⏳ ${sub.daysLeft} ${t.daysLeft}`
  const href = `${compact ? '/miniapp' : '/dashboard'}/subscriptions/${sub.id}${renew ? '?renew=1' : ''}`
  const label = `${sub.planName} · ${sub.username}`

  return (
    <Link className={`sub-row sub-row-${state}`} href={href} aria-label={isFa ? `مدیریت اشتراک ${label}` : `Manage subscription ${label}`}>
      <span className="sub-row-body">
        <span className="sub-row-title">
          <span className="sub-row-name">{sub.planName}</span>
          <StatusBadge value={state === 'expired' ? 'EXPIRED' : sub.status} />
        </span>
        <span className="sub-row-meta num">
          #{sub.id} · {sub.username}
          {sub.panelName ? ` · ${sub.panelName}` : ''}
          <span className="sub-row-expiry">{isFa ? 'پایان' : 'Expires'} {fmtDate(sub.expiresAt)}</span>
        </span>
      </span>

      <span className="sub-row-stats">
        <span className="sub-row-traffic num">
          {sub.trafficUsedGB} / {limited ? sub.trafficLimitGB : '∞'} GB
        </span>
        {limited && (
          <span className="meter sub-row-meter" aria-hidden="true">
            <span className={`meter-fill ${pct > 85 ? 'meter-danger' : ''}`} style={{ width: `${pct}%` }} />
          </span>
        )}
        <span className={`sub-row-days badge ${state === 'expired' ? 'badge-red' : sub.daysLeft <= 3 ? 'badge-red' : sub.daysLeft <= 7 ? 'badge-amber' : 'badge-gray'} num`}>{daysLabel}</span>
      </span>

      <span className="sub-row-arrow" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </span>
    </Link>
  )
}
