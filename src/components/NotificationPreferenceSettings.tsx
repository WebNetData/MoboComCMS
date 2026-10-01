'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'

type Channel = 'sms' | 'email' | 'push'
type Event = { kind: string; labelFa: string; labelEn: string; channels: Channel[] }
type PreferenceResponse = { catalog: Event[]; muted: { kind: string; channel: Channel }[] }

const channels: Channel[] = ['sms', 'email', 'push']
const keyOf = (kind: string, channel: Channel) => `${kind}:${channel}`

export default function NotificationPreferenceSettings() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [catalog, setCatalog] = useState<Event[]>([])
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'load' | 'save' | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch('/api/inbox/preferences', { cache: 'no-store' })
      if (!response.ok) throw new Error('preferences unavailable')
      const data = await response.json() as PreferenceResponse
      setCatalog(data.catalog)
      setMuted(new Set(data.muted.map((row) => keyOf(row.kind, row.channel))))
    } catch { setError('load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function change(kind: string, channel: Channel, enabled: boolean) {
    const key = keyOf(kind, channel)
    setPending(key)
    setError(null)
    setSaved(false)
    const response = await fetch('/api/inbox/preferences', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, channel, enabled }),
    }).catch(() => null)
    setPending(null)
    if (!response?.ok) { setError('save'); return }
    setMuted(previous => {
      const next = new Set(previous)
      if (enabled) next.delete(key)
      else next.add(key)
      return next
    })
    setSaved(true)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = catalog.filter((event) => `${event.kind} ${event.labelFa} ${event.labelEn}`.toLocaleLowerCase().includes(normalizedQuery))
  const channelLabel: Record<Channel, string> = fa
    ? { sms: 'پیامک', email: 'ایمیل', push: 'اعلان مرورگر' }
    : { sms: 'SMS', email: 'Email', push: 'Browser push' }
  const number = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')

  return <div className="dash-page np-page" dir={fa ? 'rtl' : 'ltr'}>
    <Link href="/dashboard/notifications" className="np-back"><Icon name="arrow" size={16} />{fa ? 'بازگشت به اعلان‌ها' : 'Back to notifications'}</Link>

    <header className="np-header">
      <span className="np-header-icon"><Icon name="bell" size={24} /></span>
      <div>
        <h1>{fa ? 'تنظیمات اعلان‌ها' : 'Notification preferences'}</h1>
        <p>{fa ? 'برای هر رویداد، راه دریافت اعلان را انتخاب کنید. تغییرات بلافاصله ذخیره می‌شوند.' : 'Choose how each event reaches you. Changes are saved immediately.'}</p>
      </div>
    </header>

    <aside className="np-inbox-note">
      <span className="np-inbox-icon"><Icon name="shield" size={20} /></span>
      <div><strong>{fa ? 'اعلان‌های داخل حساب همیشه در دسترس‌اند' : 'Your account inbox stays available'}</strong>
        <p>{fa ? 'خاموش کردن یک کانال فقط ارسال بیرون از حساب را برای همان رویداد متوقف می‌کند.' : 'Turning off a channel only stops external delivery for that event.'}</p>
      </div>
    </aside>

    <section className="np-panel" aria-labelledby="np-list-title">
      <div className="np-toolbar">
        <div className="np-toolbar-title">
          <h2 id="np-list-title">{fa ? 'رویدادها و کانال‌ها' : 'Events and channels'}</h2>
          <p>{loading ? (fa ? 'در حال دریافت تنظیمات…' : 'Loading preferences…') : (fa ? `${number(filtered.length)} رویداد` : `${number(filtered.length)} events`)}</p>
        </div>
        <label className="np-search">
          <span className="np-search-label">{fa ? 'جستجوی رویداد' : 'Find an event'}</span>
          <span className="np-search-field">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.3 4.3"/></svg>
            <input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? 'مثلاً سفارش یا پاسخ' : 'For example, order or reply'} />
          </span>
        </label>
      </div>

      {error && <div className="np-alert" role="alert">
        <span>{error === 'load' ? (fa ? 'دریافت تنظیمات انجام نشد.' : 'Could not load preferences.') : (fa ? 'ذخیره انجام نشد؛ دوباره تلاش کنید.' : 'Could not save. Please try again.')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>{fa ? 'بارگذاری دوباره' : 'Reload'}</button>
      </div>}
      <span className="np-save-status" role="status" aria-live="polite">{pending ? (fa ? 'در حال ذخیره…' : 'Saving…') : saved ? (fa ? 'تغییر ذخیره شد.' : 'Change saved.') : ''}</span>

      {loading && <div className="np-loading" role="status" aria-label={fa ? 'در حال دریافت رویدادها' : 'Loading events'}>
        {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
      </div>}
      {!loading && !error && filtered.length === 0 && <div className="np-empty">
        <Icon name="bell" size={24} />
        <strong>{query ? (fa ? 'رویدادی پیدا نشد' : 'No matching events') : (fa ? 'رویدادی در دسترس نیست' : 'No events available')}</strong>
        {query && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>{fa ? 'پاک کردن جست‌وجو' : 'Clear search'}</button>}
      </div>}
      {!loading && filtered.length > 0 && <table className="np-table">
        <thead><tr><th scope="col">{fa ? 'رویداد' : 'Event'}</th>{channels.map((channel) => <th scope="col" key={channel}>{channelLabel[channel]}</th>)}</tr></thead>
        <tbody>{filtered.map((event) => <tr key={event.kind}>
          <th scope="row">{fa ? event.labelFa : event.labelEn}</th>
          {channels.map((channel) => {
            const label = channelLabel[channel]
            const available = event.channels.includes(channel)
            return <td key={channel}>
              <span className="np-mobile-label">{label}</span>
              {available ? <label className="dash-switch np-switch">
                <input type="checkbox" role="switch" aria-label={`${fa ? event.labelFa : event.labelEn} — ${label}`} checked={!muted.has(keyOf(event.kind, channel))} disabled={pending !== null} onChange={(input) => void change(event.kind, channel, input.target.checked)} />
              </label> : <span className="np-unavailable" aria-label={fa ? 'در دسترس نیست' : 'Unavailable'}>—</span>}
            </td>
          })}
        </tr>)}</tbody>
      </table>}
    </section>
  </div>
}
