'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import GroupPicker from '@/components/admin/GroupPicker'

type Snapshot = { revision: string; groups: { id: number; name: string; active: boolean }[]; memberships: { groupId: number; expiresAt: string | null }[] }
const API = '/api/admin/user-groups'

/** Edits the existing many-to-many memberships, separately from the user's staff Role. */
export default function UserGroupsEditor({ userId }: { userId: number }) {
  const [data, setData] = useState<Snapshot | null>(null), [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError(''); setNotice('')
    fetch(`${API}?userId=${userId}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('دریافت گروه‌های کاربر انجام نشد')
      const snapshot = await response.json() as Snapshot
      if (!controller.signal.aborted) { setData(snapshot); setChosen(snapshot.memberships.map(row => `group:${row.groupId}`)) }
    }).catch(() => { if (!controller.signal.aborted) setError('دریافت گروه‌های کاربر انجام نشد') })
    return () => controller.abort()
  }, [userId, reload])
  async function save() {
    if (!data || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'members.set', userId, revision: data.revision, groupIds: chosen.map(key => Number(key.slice(6))) }) })
      const result = await response.json().catch(() => null)
      if (!response.ok) { setError(result?.error || 'ذخیره انجام نشد؛ انتخاب‌ها حفظ شده‌اند'); return }
      const current = await fetch(`${API}?userId=${userId}`, { cache: 'no-store' })
      if (!current.ok) { setError('ذخیره شد؛ برای دریافت نسخهٔ تازه دوباره بارگذاری کنید'); return }
      const snapshot = await current.json() as Snapshot
      setData(snapshot); setChosen(snapshot.memberships.map(row => `group:${row.groupId}`)); setNotice('گروه‌های کاربر ذخیره شدند')
    } catch { setError('ارتباط برقرار نشد؛ انتخاب‌ها حفظ شده‌اند') } finally { setBusy(false) }
  }
  return <section className="card mb-4" dir="rtl" aria-labelledby="user-groups-editor-title">
    <h2 id="user-groups-editor-title" className="h3">گروه‌های این کاربر</h2>
    <p className="muted text-sm mt-2 mb-4">می‌توانید چند گروه را هم‌زمان انتخاب کنید. نقش مدیریتی کاربر تغییر نمی‌کند. تاریخ پایان و توضیحات عضویت‌های باقی‌مانده حفظ می‌شوند؛ برای تمدید هر عضویت از صفحهٔ گروه‌ها استفاده کنید.</p>
    {error && <p className="error-text mb-3" role="alert">{error}</p>}{notice && <p role="status" className="success-text mb-3">{notice}</p>}
    {!data && !error && <p role="status">در حال دریافت گروه‌ها…</p>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}><legend className="sr-only">انتخاب چند گروه برای کاربر</legend>
      {data && <GroupPicker legend="عضویت‌های هم‌زمان کاربر" showCounts={false} value={chosen} onChange={setChosen} groups={data.groups.map(group => ({ key: `group:${group.id}`, family: 'group', count: 0, label: `${group.name}${group.active ? '' : ' (غیرفعال)'}${data.memberships.find(row => row.groupId === group.id)?.expiresAt ? ' (دارای تاریخ پایان)' : ''}` }))} />}
      <div className="flex gap-2 flex-wrap mt-4"><button type="button" className="btn btn-primary" disabled={!data || busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ گروه‌های کاربر'}</button><button type="button" className="btn btn-ghost" onClick={() => setReload(value => value + 1)}>بارگذاری دوباره</button><Link href="/admin/user-groups" className="btn btn-ghost">مدیریت گروه‌ها و تاریخ عضویت</Link></div>
    </fieldset>
  </section>
}
