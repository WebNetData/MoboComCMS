'use client'

import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { Notice, fa as faNumber, faDate, useJson } from '../store/shared'
import { QUEUE_SOURCES, waitingTone, type QueueGroup, type QueueSourceKey } from '@/modules/moderation/domain/queue'

type Queue = { total: number; groups: QueueGroup[]; failed: QueueSourceKey[] }

const TONE = { none: '', ok: 'is-ok', warn: 'is-warn', late: 'is-bad' } as const

/** Everything that waits for a staff decision, in one place. Decisions are made on each section's own page. */
export default function ModerationPage() {
  const { locale } = useI18n()
  const isFa = locale === 'fa'
  const L = (faText: string, en: string) => isFa ? faText : en
  const { data, error, loading, reload } = useJson<Queue>('/api/admin/moderation')
  const now = new Date()
  const num = (value: number) => isFa ? faNumber(value) : value.toLocaleString('en-US')
  const waited = (iso: string) => {
    const hours = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000))
    if (hours < 1) return L('کمتر از یک ساعت', 'under an hour')
    if (hours < 24) return L(`${num(hours)} ساعت`, `${hours} h`)
    return L(`${num(Math.floor(hours / 24))} روز`, `${Math.floor(hours / 24)} d`)
  }
  const failedLabel = (key: QueueSourceKey) => { const source = QUEUE_SOURCES.find((item) => item.key === key); return source ? (isFa ? source.label : source.labelEn) : key }

  return <div className="sa" dir={isFa ? 'rtl' : 'ltr'}>
    <header className="sa-head">
      <h1>{L('صف بررسی', 'Moderation queue')}</h1>
      <div className="sa-head-actions">
        {data && <span className={`sa-state ${data.total ? 'is-warn' : 'is-ok'}`}>{data.total ? L(`${num(data.total)} مورد منتظر بررسی`, `${data.total} waiting`) : L('چیزی منتظر بررسی نیست', 'Nothing is waiting')}</span>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>{L('تازه‌سازی', 'Refresh')}</button>
      </div>
    </header>
    <p className="sa-sub">{L('هر مورد در بخش خودش بررسی می‌شود؛ این صفحه فقط نشان می‌دهد کجا و از چه زمانی کاری منتظر شماست. قدیمی‌ترین انتظار بالاتر است.', 'Each item is decided in its own section; this page shows where work is waiting and for how long. The longest wait comes first.')}</p>
    {error && <Notice tone="error">{error}</Notice>}
    {data && data.failed.length > 0 && <Notice tone="error">{L('خواندن این بخش‌ها ممکن نشد: ', 'These sources could not be read: ')}{data.failed.map(failedLabel).join(isFa ? '، ' : ', ')}</Notice>}
    {!data && loading && <p className="sa-empty">{L('در حال دریافت…', 'Loading…')}</p>}
    {data && <div className="sa-stack">
      {data.groups.filter((group) => group.count > 0).map((group) => {
        const tone = waitingTone(group.oldestAt, now)
        return <section key={group.key} className="sa-card" aria-label={isFa ? group.label : group.labelEn}>
          <header className="sa-card-head">
            <h2>{isFa ? group.label : group.labelEn}</h2>
            <div className="sa-head-actions">
              {group.count > 0 && group.oldestAt && <span className={`sa-state ${TONE[tone]}`}>{L(`قدیمی‌ترین: ${waited(group.oldestAt)}`, `Oldest: ${waited(group.oldestAt)}`)}</span>}
              <span className="sa-tag">{num(group.count)}</span>
              <Link href={group.href} className="sa-link">{L('بررسی', 'Review')}</Link>
            </div>
          </header>
          <ul className="sa-rows">
              {group.items.map((item) => <li key={item.id}><Link href={group.href}>
                <span className="sa-grow"><b>{item.text || '—'}</b><small>{[item.by, item.about].filter(Boolean).join(' · ') || '—'}</small></span>
                <small className="sa-sub"><time dateTime={item.at}>{isFa ? faDate(item.at, true) : new Date(item.at).toLocaleString('en-US', { timeZone: 'Asia/Tehran' })}</time></small>
              </Link></li>)}
              {group.count > group.items.length && <li><Link href={group.href}><span className="sa-grow"><small>{L(`و ${num(group.count - group.items.length)} مورد دیگر`, `and ${group.count - group.items.length} more`)}</small></span></Link></li>}
          </ul>
        </section>
      })}
      {/* Sources with nothing waiting share one compact card. */}
      {data.groups.some((group) => group.count === 0) && <section className="sa-card" aria-label={L('بخش‌های بدون مورد', 'Sources with nothing waiting')}>
        <header className="sa-card-head"><h2>{L('بدون مورد منتظر', 'Nothing waiting')}</h2></header>
        <ul className="sa-rows">{data.groups.filter((group) => group.count === 0).map((group) => <li key={group.key}><Link href={group.href}><span className="sa-grow"><b>{isFa ? group.label : group.labelEn}</b></span><small className="sa-sub">{L('باز کردن', 'Open')}</small></Link></li>)}</ul>
      </section>}
    </div>}
  </div>
}
