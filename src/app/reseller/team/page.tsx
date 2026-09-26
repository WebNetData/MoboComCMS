'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

type Permission = 'accounts.view' | 'accounts.manage' | 'offers.view' | 'offers.manage' | 'sales.view' | 'sales.review'
type Member = { id: number; email: string; name: string; accountStatus: string; active: boolean; permissions: Permission[]; createdAt: string }
const choices: { id: Permission; en: string; fa: string }[] = [
  { id: 'accounts.view', en: 'View customer services', fa: 'مشاهده سرویس‌های مشتریان' },
  { id: 'accounts.manage', en: 'Create and manage services', fa: 'ایجاد و مدیریت سرویس‌ها' },
  { id: 'offers.view', en: 'View retail offers', fa: 'مشاهده پلن‌های فروش' },
  { id: 'offers.manage', en: 'Set retail offers and prices', fa: 'تنظیم پلن و قیمت فروش' },
  { id: 'sales.view', en: 'View orders and receipts', fa: 'مشاهده سفارش‌ها و رسیدها' },
  { id: 'sales.review', en: 'Approve and reject receipts', fa: 'تأیید و رد رسیدها' },
]

export default function ResellerTeamPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const l = (en: string, faText: string) => fa ? faText : en
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState<Permission[]>(['accounts.view'])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    const response = await fetch('/api/reseller/team', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) { setError(true); setMessage(data?.error || l('Could not load team.', 'دریافت تیم ناموفق بود.')); return }
    setMembers(data.members || [])
  }, [fa])
  useEffect(() => { void load() }, [load])
  const change = (current: Permission[], permission: Permission) => current.includes(permission) ? current.filter(p => p !== permission) : [...current, permission]
  async function submit(method: 'POST' | 'PATCH' | 'DELETE', body: object, success: string) {
    setBusy(true); setMessage(''); setError(false)
    const response = await fetch('/api/reseller/team', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(true); setMessage(data?.error || l('Could not save changes.', 'ذخیره تغییرات ناموفق بود.')); return false }
    setMessage(success); await load(); return true
  }
  return <div className="space-y-6" dir={fa ? 'rtl' : 'ltr'}>
    <header className="card p-6"><span className="text-xs uppercase tracking-wide muted">{l('AGENCY / ACCESS', 'نمایندگی / دسترسی')}</span><h1 className="text-3xl font-bold mt-2">{l('Agency team', 'تیم نمایندگی')}</h1><p className="muted mt-2">{l('Give each teammate only the permissions they need. Wallet and bot connection stay with the owner.', 'برای هر همکار فقط دسترسی‌های لازم را تعیین کنید. کیف پول و اتصال ربات فقط در اختیار مالک می‌ماند.')}</p></header>
    {message && <div role="status" className={`card p-4 ${error ? 'text-red-400' : 'text-green-400'}`}>{message}</div>}
    <section className="card p-6"><h2 className="h3 mb-2">{l('Add a teammate', 'افزودن همکار')}</h2><p className="muted text-sm mb-4">{l('The person must already have an active customer account on this site.', 'شخص باید از قبل حساب کاربری فعال در سایت داشته باشد.')}</p><label className="block">{l('Account email', 'ایمیل حساب')}<input className="input mt-2 w-full" type="email" dir="ltr" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@example.com" /></label><div className="grid md:grid-cols-2 gap-3 mt-5">{choices.map(choice => <label key={choice.id} className="rounded-xl border border-slate-700/70 p-3 flex items-center gap-3"><input type="checkbox" checked={permissions.includes(choice.id)} onChange={() => setPermissions(change(permissions, choice.id))} />{fa ? choice.fa : choice.en}</label>)}</div><button className="btn btn-primary mt-5" disabled={busy || !email || !permissions.length} onClick={async () => { if (await submit('POST', { email, permissions }, l('Teammate added.', 'همکار افزوده شد.'))) setEmail('') }}>{l('Add teammate', 'افزودن همکار')}</button></section>
    <section className="card p-6"><h2 className="h3 mb-4">{l('Current team', 'همکاران فعلی')}</h2><div className="space-y-4">{members.length ? members.map(member => <MemberEditor key={member.id} member={member} choices={choices} fa={fa} busy={busy} onSave={(settings) => submit('PATCH', { id: member.id, ...settings }, l('Access updated.', 'دسترسی به‌روز شد.'))} onRemove={() => submit('DELETE', { id: member.id }, l('Teammate removed.', 'همکار حذف شد.'))} />) : <p className="muted">{l('No teammates yet.', 'هنوز همکاری اضافه نشده است.')}</p>}</div></section>
  </div>
}

function MemberEditor({ member, choices, fa, busy, onSave, onRemove }: { member: Member; choices: { id: Permission; en: string; fa: string }[]; fa: boolean; busy: boolean; onSave: (settings: { active: boolean; permissions: Permission[] }) => Promise<boolean>; onRemove: () => Promise<boolean> }) {
  const [active, setActive] = useState(member.active)
  const [permissions, setPermissions] = useState(member.permissions)
  const l = (en: string, faText: string) => fa ? faText : en
  return <div className="rounded-xl border border-slate-700/70 p-5"><div className="flex justify-between gap-3 flex-wrap"><div><strong>{member.name || member.email}</strong><p className="muted text-sm" dir="ltr">{member.email}</p></div><span className={`badge ${active && member.accountStatus === 'ACTIVE' ? 'badge-green' : 'badge-red'}`}>{active ? l('Active', 'فعال') : l('Paused', 'غیرفعال')}</span></div><div className="grid md:grid-cols-2 gap-2 mt-4">{choices.map(choice => <label key={choice.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={permissions.includes(choice.id)} onChange={() => setPermissions(list => list.includes(choice.id) ? list.filter(p => p !== choice.id) : [...list, choice.id])} />{fa ? choice.fa : choice.en}</label>)}</div><div className="flex items-center gap-3 flex-wrap mt-5"><label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />{l('Access enabled', 'دسترسی فعال')}</label><button className="btn btn-primary" disabled={busy || !permissions.length} onClick={() => void onSave({ active, permissions })}>{l('Save access', 'ذخیره دسترسی')}</button><button className="btn btn-secondary" disabled={busy} onClick={() => { if (window.confirm(l('Remove this teammate?', 'این همکار حذف شود؟'))) void onRemove() }}>{l('Remove', 'حذف')}</button></div></div>
}
