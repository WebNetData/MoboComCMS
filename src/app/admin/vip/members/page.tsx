'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { VipShell } from '../shared'
import './members.css'

type Member = { state: string; tier: { name: string; color: string } | null; note: string; autoRenew: boolean; cancelReason: string; user: { id: number; email: string; name: string | null; telegramUsername: string | null }; active: boolean; endsAt: string | null; periods: { id: number; source: string; startsAt: string; endsAt: string; revokedAt: string | null; note: string; orderId: number | null }[] }


/** VIP members: search, grant or extend by hand, revoke. */
export default function VipMembersPage() {
  const { locale } = useI18n()
  return <VipShell><Members fa={locale === 'fa'} /></VipShell>
}

const STATES = [['', 'همه'], ['ACTIVE', 'فعال'], ['EXPIRING', 'رو به پایان'], ['TRIAL', 'آزمایشی'], ['CANCELLED', 'لغوشده'], ['LAPSED', 'پایان‌یافته']] as const
const STATE_LABEL: Record<string, string> = Object.fromEntries(STATES)

function MemberNote({ member, fa }: { member: Member; fa: boolean }) {
  const [note, setNote] = useState(member.note)
  const [saved, setSaved] = useState(false)
  async function save() {
    if (note === member.note) return
    const res = await fetch('/api/admin/membership/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: member.user.id, note }) }).catch(() => null)
    setSaved(!!res?.ok)
  }
  return <label className="vm-note"><span className="sr-only">{fa ? 'یادداشت تیم' : 'Team note'}</span><input className="input" maxLength={500} placeholder={fa ? 'یادداشت تیم' : 'Team note'} value={note} onChange={(event) => { setNote(event.target.value); setSaved(false) }} onBlur={() => void save()} />{saved && <small>{fa ? 'ذخیره شد' : 'Saved'}</small>}</label>
}

function Members({ fa }: { fa: boolean }) {
  const [data, setData] = useState<{ members: Member[]; stats: { active: number; plans: number } } | null>(null)
  const [state, setState] = useState('')
  const [q, setQ] = useState('')
  const [grant, setGrant] = useState({ user: '', days: '30', note: '' })
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
  const sourceLabel = (s: string) => ({ PURCHASE: fa ? 'خرید' : 'Purchase', GIFT: fa ? 'هدیه خرید' : 'Gift', ADMIN: fa ? 'مدیر' : 'Admin' }[s] || s)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/membership/members?scope=all&state=${state}&q=${encodeURIComponent(q)}`)
    const body = await res.json().catch(() => null)
    if (res.ok) setData(body)
    else setMsg({ tone: 'err', text: body?.error || 'Error' })
  }, [state, q])
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer) }, [load])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMsg(null)
    const res = await fetch('/api/admin/membership/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(grant) }).catch(() => null)
    const body = await res?.json().catch(() => null)
    setBusy(false)
    if (!res?.ok) { setMsg({ tone: 'err', text: body?.error || 'Error' }); return }
    setMsg({ tone: 'ok', text: fa ? `فعال شد تا ${date(body.endsAt)}` : `Active until ${date(body.endsAt)}` })
    setGrant({ user: '', days: grant.days, note: '' })
    load()
  }

  async function revoke(member: Member) {
    if (!confirm(fa ? `اشتراک ویژه ${member.user.email} همین حالا پایان یابد؟` : `End VIP for ${member.user.email} now?`)) return
    const res = await fetch(`/api/admin/membership/members?userId=${member.user.id}`, { method: 'DELETE' })
    if (!res.ok) setMsg({ tone: 'err', text: (await res.json().catch(() => null))?.error || 'Error' })
    load()
  }

  return (
    <div className="cms-workspace">
      <div className="mb-6"><span className="content-eyebrow">اشتراک ویژه</span><h1 className="h2 mt-3">{fa ? 'اعضای اشتراک ویژه' : 'VIP members'}</h1></div>
      <div className="cms-summary">
        <div><span>{fa ? 'اعضای فعال' : 'Active members'}</span><b>{(data?.stats.active ?? 0).toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>
        <div><span>{fa ? 'پلن‌های فعال' : 'Active plans'}</span><b>{(data?.stats.plans ?? 0).toLocaleString(fa ? 'fa-IR' : 'en-US')}</b></div>
        <label className="cms-search"><span>{fa ? 'جست‌وجو' : 'Search'}</span><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={fa ? 'ایمیل یا نام…' : 'Email or name…'} /></label>
      </div>
      <form className="card mb-6 mx-grant" onSubmit={submit}>
        <strong>{fa ? 'اعطا یا تمدید دستی' : 'Grant or extend by hand'}</strong>
        <input className="input" dir="ltr" required placeholder={fa ? 'ایمیل، @تلگرام یا شناسه کاربر' : 'Email, @telegram or user id'} value={grant.user} onChange={(e) => setGrant({ ...grant, user: e.target.value })} />
        <input className="input" type="number" min={1} max={3650} required value={grant.days} onChange={(e) => setGrant({ ...grant, days: e.target.value })} aria-label={fa ? 'روز' : 'days'} />
        <input className="input" placeholder={fa ? 'یادداشت (اختیاری)' : 'Note (optional)'} value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{fa ? 'افزودن روز' : 'Add days'}</button>
        {msg && <span className={msg.tone === 'err' ? 'error-text' : 'badge badge-green'}>{msg.text}</span>}
      </form>
      <div className="vm-bar">
        <div className="sa-tabs vm-states" role="group" aria-label={fa ? 'وضعیت اعضا' : 'Member state'}>{STATES.map(([id, label]) => <button key={id} type="button" className={state === id ? 'is-active' : ''} aria-pressed={state === id} onClick={() => setState(id)}>{label}</button>)}</div>
        <a className="btn btn-ghost" href={`/api/admin/membership/members?scope=all&state=${state}&q=${encodeURIComponent(q)}&format=csv`}>{fa ? 'خروجی CSV' : 'Export CSV'}</a>
      </div>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>{fa ? 'کاربر' : 'User'}</th><th>{fa ? 'وضعیت' : 'Status'}</th><th>{fa ? 'سطح' : 'Tier'}</th><th>{fa ? 'اعتبار تا' : 'Valid until'}</th><th>{fa ? 'سابقه' : 'History'}</th><th /></tr></thead>
          <tbody>
            {(data?.members || []).map((member) => (
              <tr key={member.user.id}>
                <td><b>{member.user.name || member.user.email}</b><div className="muted text-sm" dir="ltr">{member.user.email}{member.user.telegramUsername ? ` · @${member.user.telegramUsername}` : ''}</div></td>
                <td><span className={`badge ${member.active ? 'vip-badge-sm' : 'badge-gray'}`}>{STATE_LABEL[member.state] || member.state}</span>{member.autoRenew && <div className="muted text-sm">{fa ? 'تمدید خودکار' : 'Auto-renew'}</div>}{member.cancelReason && <div className="muted text-sm">{member.cancelReason}</div>}</td>
                <td>{member.tier ? <span className="vm-tier"><i style={{ background: member.tier.color }} aria-hidden="true" />{member.tier.name}</span> : '—'}</td>
                <td>{date(member.endsAt)}<MemberNote key={member.note} member={member} fa={fa} /></td>
                <td className="text-sm">{member.periods.slice(0, 4).map((p) => <div key={p.id} className={p.revokedAt ? 'muted' : ''}>{sourceLabel(p.source)} · {date(p.startsAt)} → {date(p.endsAt)}{p.orderId ? ` · #${p.orderId}` : ''}{p.revokedAt ? (fa ? ' (لغو شده)' : ' (revoked)') : ''}</div>)}</td>
                <td>{member.active && <button type="button" className="badge badge-red" onClick={() => revoke(member)}>{fa ? 'لغو' : 'Revoke'}</button>}</td>
              </tr>
            ))}
            {!data?.members.length && <tr><td colSpan={6} className="muted text-center py-8">{fa ? 'عضوی پیدا نشد.' : 'No members found.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
