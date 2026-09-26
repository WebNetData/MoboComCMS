'use client'

import { useCallback, useEffect, useState } from 'react'
import MediaCrud, { type MediaField } from '../cms/MediaCrud'
import { useI18n } from '@/i18n/LocaleProvider'

type Member = { user: { id: number; email: string; name: string | null; telegramUsername: string | null }; active: boolean; endsAt: string | null; periods: { id: number; source: string; startsAt: string; endsAt: string; revokedAt: string | null; note: string; orderId: number | null }[] }

export default function AdminVipPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [tab, setTab] = useState<'members' | 'plans'>('members')
  const planFields: MediaField[] = [
    { key: 'name', label: fa ? 'نام پلن' : 'Plan name', required: true, table: true },
    { key: 'nameEn', label: fa ? 'نام انگلیسی' : 'English name', dir: 'ltr' },
    { key: 'days', label: fa ? 'مدت (روز)' : 'Duration (days)', type: 'number', required: true, table: true },
    { key: 'price', label: fa ? 'قیمت' : 'Price', type: 'number', required: true, table: true },
    { key: 'currency', label: fa ? 'واحد پول' : 'Currency', type: 'select', options: [{ value: 'IRR', label: fa ? 'ریال (IRR)' : 'Rial (IRR)' }, { value: 'IRT', label: fa ? 'تومان (IRT)' : 'Toman (IRT)' }, { value: 'USD', label: fa ? 'دلار (USD)' : 'US dollar (USD)' }], table: true },
    { key: 'description', label: fa ? 'توضیح کوتاه' : 'Short description', type: 'textarea' },
    { key: 'descriptionEn', label: fa ? 'توضیح انگلیسی' : 'English description', type: 'textarea', dir: 'ltr' },
    { key: 'perks', label: fa ? 'مزایا' : 'Perks', type: 'records', recordKeys: [{ key: 'icon', label: fa ? 'آیکون/ایموجی' : 'Icon' }, { key: 'fa', label: fa ? 'متن فارسی' : 'Persian text', wide: true }, { key: 'en', label: fa ? 'متن انگلیسی' : 'English text', dir: 'ltr', wide: true }] },
    { key: 'highlight', label: fa ? 'پیشنهاد ویژه (برجسته)' : 'Highlight as best value', type: 'checkbox', table: true },
    { key: 'active', label: fa ? 'فعال و قابل خرید' : 'Active & purchasable', type: 'checkbox', table: true },
    { key: 'sortOrder', label: fa ? 'ترتیب' : 'Order', type: 'number' },
    { key: 'slug', label: fa ? 'نشانی (slug)' : 'Slug', dir: 'ltr' },
  ]
  return (
    <div>
      <nav className="mx-tabs">
        <button type="button" className={tab === 'members' ? 'is-active' : ''} onClick={() => setTab('members')}>{fa ? 'اعضای VIP' : 'VIP members'}</button>
        <button type="button" className={tab === 'plans' ? 'is-active' : ''} onClick={() => setTab('plans')}>{fa ? 'پلن‌های اشتراک' : 'Membership plans'}</button>
        <a className="mx-tabs-link" href="/vip" target="_blank" rel="noopener noreferrer">{fa ? 'صفحه VIP ↗' : 'VIP page ↗'}</a>
      </nav>
      {tab === 'plans'
        ? <MediaCrud type="vip-plans" title={fa ? 'پلن‌های اشتراک ویژه' : 'VIP plans'} titleKey="name" subtitle={fa ? 'کاربر با کیف پول یا درگاه می‌خرد؛ روزهای جدید روی اشتراک فعلی اضافه می‌شود. هدیه VIP برای پلن‌های VPN و محصولات را در فرم همان پلن/محصول تنظیم کنید.' : 'Bought with wallet or gateway; new days stack on the current membership. VIP gift days for VPN plans and products are set on those items.'} fields={planFields} />
        : <Members fa={fa} />}
    </div>
  )
}

function Members({ fa }: { fa: boolean }) {
  const [data, setData] = useState<{ members: Member[]; stats: { active: number; plans: number } } | null>(null)
  const [scope, setScope] = useState<'active' | 'all'>('active')
  const [q, setQ] = useState('')
  const [grant, setGrant] = useState({ user: '', days: '30', note: '' })
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
  const sourceLabel = (s: string) => ({ PURCHASE: fa ? 'خرید' : 'Purchase', GIFT: fa ? 'هدیه خرید' : 'Gift', ADMIN: fa ? 'مدیر' : 'Admin' }[s] || s)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/membership/members?scope=${scope}&q=${encodeURIComponent(q)}`)
    const body = await res.json().catch(() => null)
    if (res.ok) setData(body)
    else setMsg({ tone: 'err', text: body?.error || 'Error' })
  }, [scope, q])
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer) }, [load])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMsg(null)
    const res = await fetch('/api/admin/membership/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(grant) })
    const body = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setMsg({ tone: 'err', text: body?.error || 'Error' }); return }
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
      <div className="mb-6"><span className="content-eyebrow">VIP</span><h1 className="h2 mt-3">{fa ? 'اعضای اشتراک ویژه' : 'VIP members'}</h1></div>
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
        <button className="btn btn-primary" disabled={busy}>{fa ? 'افزودن روز' : 'Add days'}</button>
        {msg && <span className={msg.tone === 'err' ? 'error-text' : 'badge badge-green'}>{msg.text}</span>}
      </form>
      <div className="flex gap-2 mb-3">
        <button type="button" className={`badge ${scope === 'active' ? 'badge-purple' : 'badge-gray'}`} onClick={() => setScope('active')}>{fa ? 'فعال' : 'Active'}</button>
        <button type="button" className={`badge ${scope === 'all' ? 'badge-purple' : 'badge-gray'}`} onClick={() => setScope('all')}>{fa ? 'همه (با سابقه)' : 'All (history)'}</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>{fa ? 'کاربر' : 'User'}</th><th>{fa ? 'وضعیت' : 'Status'}</th><th>{fa ? 'اعتبار تا' : 'Valid until'}</th><th>{fa ? 'سابقه' : 'History'}</th><th /></tr></thead>
          <tbody>
            {(data?.members || []).map((member) => (
              <tr key={member.user.id}>
                <td><b>{member.user.name || member.user.email}</b><div className="muted text-sm" dir="ltr">{member.user.email}{member.user.telegramUsername ? ` · @${member.user.telegramUsername}` : ''}</div></td>
                <td>{member.active ? <span className="badge vip-badge-sm">VIP</span> : <span className="badge badge-gray">{fa ? 'منقضی' : 'Expired'}</span>}</td>
                <td>{date(member.endsAt)}</td>
                <td className="text-sm">{member.periods.slice(0, 4).map((p) => <div key={p.id} className={p.revokedAt ? 'muted' : ''}>{sourceLabel(p.source)} · {date(p.startsAt)} → {date(p.endsAt)}{p.orderId ? ` · #${p.orderId}` : ''}{p.revokedAt ? (fa ? ' (لغو شده)' : ' (revoked)') : ''}</div>)}</td>
                <td>{member.active && <button type="button" className="badge badge-red" onClick={() => revoke(member)}>{fa ? 'لغو' : 'Revoke'}</button>}</td>
              </tr>
            ))}
            {!data?.members.length && <tr><td colSpan={5} className="muted text-center py-8">{fa ? 'عضوی پیدا نشد.' : 'No members found.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
