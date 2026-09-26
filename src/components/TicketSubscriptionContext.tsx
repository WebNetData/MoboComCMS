'use client'

import { useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export default function TicketSubscriptionContext({ id, username, link }: { id: number | null; username?: string | null; link?: string | null }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [copied, setCopied] = useState(false)
  if (!id && !username && !link) return null

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }

  return <section className="ticket-subscription-context" aria-label={fa ? 'اشتراک گزارش‌شده' : 'Reported subscription'}>
    <strong>{fa ? 'اشتراک گزارش‌شده' : 'Reported subscription'}{id ? ` #${id}` : ''}</strong>
    {username && <div><span>{fa ? 'نام کاربری' : 'Username'}</span><code dir="ltr">{username}</code></div>}
    <div><span>{fa ? 'لینک اشتراک' : 'Subscription link'}</span>{link ? <div className="ticket-subscription-link"><input readOnly aria-label={fa ? 'لینک اشتراک' : 'Subscription link'} value={link} dir="ltr" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={copy}>{copied ? (fa ? 'کپی شد' : 'Copied') : (fa ? 'کپی لینک' : 'Copy link')}</button></div> : <small>{fa ? 'لینک فعلاً در دسترس نیست؛ وضعیت اتصال پنل را بررسی کنید.' : 'The link is unavailable. Check the panel connection.'}</small>}</div>
  </section>
}
