'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import s from './MemberPromptShelf.module.css'

type Summary = { counts: Record<string, number>; mine: boolean; canManage: boolean }

export default function AdminPromptOverview() {
  const on = useModuleEnabled('prompt-master')
  const [data, setData] = useState<Summary | null>(null), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!on) return
    const controller = new AbortController()
    fetch('/api/admin/prompts?status=PENDING', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if ([401, 403, 404].includes(response.status)) return
      if (!response.ok) throw Error('Unavailable')
      const body = await response.json()
      if (!controller.signal.aborted) { setData(body); setFailed(false) }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [on, revision])
  if (!on || (!data && !failed)) return null
  return <section className="card mb-8" aria-label="پیشخوان پرامپت مستر">
    <header className="ud-card-head"><h2><Icon name="sparkles" size={20} /> پرامپت مستر</h2><Link href="/admin/prompts">{data?.mine ? 'الگوهای من' : 'مدیریت الگوها'}</Link></header>
    {failed ? <div role="alert"><p>دریافت وضعیت پرامپت مستر انجام نشد.</p><button type="button" className="btn btn-ghost" onClick={() => setRevision(value => value + 1)}>تلاش دوباره</button></div> : data && <><p className="muted">{data.mine ? 'وضعیت الگوهای خودتان و درخواست‌های بازبینی' : 'انتشار الگوها و بررسی نوشته‌های تیم پرامپت مستر'}</p><nav className={s.stats} aria-label="وضعیت الگوها">{([['DRAFT', 'پیش‌نویس'], ['PENDING', 'در انتظار بازبینی'], ['PUBLISHED', 'منتشرشده'], ['TRASHED', 'زباله‌دان']] as const).map(([status, label]) => <Link key={status} href={`/admin/prompts?status=${status}`}><span>{label}<b>{(data.counts[status] || 0).toLocaleString('fa-IR')}</b></span></Link>)}</nav></>}
  </section>
}
