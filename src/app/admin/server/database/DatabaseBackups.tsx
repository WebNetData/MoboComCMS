'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, faDate, useServerApi, useServerJson } from '../shared'

type State = { busy: boolean; postgres: boolean; hasKey: boolean; config: { enabled: boolean }; backups: { id: string; createdAt?: string }[] }
export default function DatabaseBackups() {
  const api = useServerApi(), { data, error, reload } = useServerJson<State>('/api/admin/server/backups')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { if (!data?.busy) return; const timer = setInterval(() => void reload(), 2000); return () => clearInterval(timer) }, [data?.busy, reload])
  async function backup() {
    setBusy(true); setMessage('')
    try {
      const result = await api('/api/admin/server/backups', { body: { action: 'run' } })
      setMessage(result.ok ? 'بکاپ در صف اجرا قرار گرفت؛ پس از پایان، تعداد فایل‌ها به‌روز می‌شود.' : result.error)
      await reload()
    } finally { setBusy(false) }
  }
  const ready = data?.postgres && data.hasKey && data.config.enabled
  return <section className="sa-card">
    <header className="sa-card-head"><h2>بکاپ دستی و بازیابی</h2><span className={`sa-state ${data?.busy ? 'is-warn' : ready ? 'is-ok' : ''}`}>{data?.busy ? 'در حال بکاپ' : ready ? 'آماده' : 'نیاز به تنظیم'}</span></header>
    <div className="sp-pad">
      <p className="sa-hint">همان سامانهٔ بکاپ رمزگذاری‌شدهٔ سایت؛ فایل‌ها و تاریخچه از این بخش جدا نیستند. بازیابی روی سایت زنده فقط از مسیر تأییددار مدیریت بکاپ انجام می‌شود.</p>
      {error && <Notice tone="error">{error}</Notice>}{message && <Notice>{message}</Notice>}
      {data && !ready && <Notice tone="error">برای شروع، بکاپ را در تنظیمات فعال و کلید BACKUP_ENCRYPTION_KEY سرور را آماده کنید.</Notice>}
      {data && <p>بکاپ‌های موجود: {data.backups.length.toLocaleString('fa-IR')}{data.backups[0]?.createdAt ? ` — آخرین بکاپ: ${faDate(data.backups[0].createdAt)}` : ''}</p>}
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!ready || busy || data?.busy} onClick={() => void backup()}>{busy ? 'در حال ارسال…' : 'گرفتن بکاپ اکنون'}</button><button type="button" className="btn btn-ghost" onClick={() => void reload()}>تازه‌سازی وضعیت</button><Link className="btn btn-ghost" href="/admin/telegram">فایل‌ها، زمان‌بندی و بازیابی</Link></div>
    </div>
  </section>
}
