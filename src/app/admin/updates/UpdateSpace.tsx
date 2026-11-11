'use client'

import { useState } from 'react'
import { Notice, faDate } from '../store/shared'
import { bytes, useServerApi } from '../server/shared'

type Entry = { name: string; kind: 'git' | 'package' | 'trash'; status: string; startedAt: string; bytes: number; restorable: boolean; protected: string; removable: boolean }
type Report = { supported: boolean; locked: boolean; keep: number; freeBytes: number; needBytes: number; totalBytes: number; removableBytes: number; entries: Entry[] }

const STATUS: Record<string, string> = {
  building: 'در حال ساخت یا قطع‌شده', adopted: 'قطع‌شده پس از جابه‌جایی', healthy: 'به‌روزرسانی موفق', 'rolled-back': 'برگشت‌خورده',
  failed: 'ساخت ناموفق', legacy: 'از نسخه‌های قبلی (بدون وضعیت)', deleting: 'حذف نیمه‌تمام',
}
const KEPT: Record<string, string> = {
  'latest-restorable': 'آخرین نسخهٔ سالم قابل بازیابی', 'current-update': 'به‌روزرسانی جاری', interrupted: 'نیمه‌کاره؛ اپراتور باید بررسی کند',
  'update-running': 'به‌روزرسانی در حال اجراست', 'installation-incomplete': 'بیلد نصب‌شده کامل نیست',
}

/** Disk use of the update snapshots beside the app, and a cleanup that follows the updater's own retention policy. */
export default function UpdateSpace({ running }: { running: boolean }) {
  const api = useServerApi()
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setBusy('load'); setNotice(null)
    const result = await api<Report>('/api/admin/server/updates?view=space')
    setBusy('')
    if (result.ok) setReport(result.data); else setNotice({ tone: 'error', text: result.error })
  }
  async function prune() {
    if (!report || !window.confirm(`${bytes(report.removableBytes)} از پوشه‌های قدیمی به‌روزرسانی حذف شود؟ آخرین نسخهٔ سالم قابل بازیابی و هر پوشهٔ در حال استفاده حفظ می‌شود.`)) return
    setBusy('prune'); setNotice(null)
    const result = await api<{ removed: number; freedBytes: number }>('/api/admin/server/updates', { body: { op: 'space-prune' } })
    setBusy('')
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setNotice({ tone: 'ok', text: result.data.removed ? `${result.data.removed.toLocaleString('fa-IR')} پوشه حذف شد و ${bytes(result.data.freedBytes)} آزاد شد.` : 'پوشه‌ای برای حذف نبود.' })
    await load()
  }

  return <section className="sa-card" aria-busy={busy === 'load'}>
    <header className="sa-card-head"><h2>فضای نسخه‌های قبلی</h2></header>
    <p className="sa-hint">هر به‌روزرسانی نسخهٔ تازه را در پوشه‌ای جدا کنار سایت می‌سازد و بیلد قبلی را برای بازگشت فوری نگه می‌دارد. به‌طور خودکار فقط آخرین نسخهٔ سالم نگه داشته می‌شود؛ پوشهٔ به‌روزرسانی جاری یا نیمه‌کاره هرگز حذف نمی‌شود.</p>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {report && !report.supported && <p className="sa-hint">این نصب پوشهٔ به‌روزرسانی کنار سایت ندارد (Docker یا محیط توسعه).</p>}
    {report?.supported && <>
      {report.locked && <Notice tone="error">به‌روزرسانی یا بازیابی در حال اجراست یا نیمه‌کاره مانده است؛ تا پایان آن چیزی حذف نمی‌شود.</Notice>}
      {report.freeBytes < report.needBytes && <Notice tone="error">فضای آزاد ({bytes(report.freeBytes)}) برای ساخت نسخهٔ بعدی (حدود {bytes(report.needBytes)}) کافی نیست. به‌روزرسانی پیش از هر تغییری متوقف می‌شود.</Notice>}
      <div className="upd-versions">
        <div><small>حجم پوشه‌های به‌روزرسانی</small><b>{bytes(report.totalBytes)}</b><span className="sa-sub">{report.entries.length.toLocaleString('fa-IR')} پوشه</span></div>
        <div><small>قابل پاکسازی</small><b>{bytes(report.removableBytes)}</b><span className="sa-sub">نگه‌داری: {report.keep.toLocaleString('fa-IR')} نسخهٔ سالم</span></div>
        <div><small>فضای آزاد / لازم برای به‌روزرسانی</small><b>{bytes(report.freeBytes)}</b><span className="sa-sub">حدود {bytes(report.needBytes)} لازم است</span></div>
      </div>
      {report.entries.length > 0 && <div className="sa-table-wrap"><table className="data sa-table">
        <thead><tr><th>پوشه</th><th>نوع</th><th>زمان</th><th>وضعیت</th><th>حجم</th><th>نتیجه</th></tr></thead>
        <tbody>{report.entries.map((e) => <tr key={e.name}>
          <td dir="ltr">{e.name}</td>
          <td>{e.kind === 'git' ? 'Git' : e.kind === 'package' ? 'بستهٔ امضاشده' : 'در حال حذف'}</td>
          <td>{e.startedAt ? faDate(e.startedAt, true) : '—'}</td>
          <td>{STATUS[e.status] || e.status}</td>
          <td className="num">{bytes(e.bytes)}</td>
          <td>{e.removable ? <span className="sa-state is-warn">قابل حذف</span> : <span className="sa-state is-ok">{KEPT[e.protected] || 'حفظ می‌شود'}</span>}</td>
        </tr>)}</tbody>
      </table></div>}
    </>}
    <div className="sa-row-actions">
      <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void load()}>{busy === 'load' ? 'در حال محاسبه…' : report ? 'محاسبهٔ دوباره' : 'محاسبهٔ فضا'}</button>
      {report?.supported && <button type="button" className="btn btn-primary" disabled={!!busy || running || report.locked || report.removableBytes === 0} onClick={() => void prune()}>{busy === 'prune' ? 'در حال پاکسازی…' : 'پاکسازی امن'}</button>}
    </div>
  </section>
}
