'use client'
import { useEffect, useRef, useState } from 'react'
import { useAssetOrganization } from './OrganizationScope'
import JalaliDateInput from '@/components/date/JalaliDateInput'
export default function ContentTransfer({ getHtml, apply, section = 'posts' }: { getHtml: () => string; apply: (map: Map<string, string>) => void; section?: string }) {
  const [mode, setMode] = useState('immediate'), [at, setAt] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const organization=useAssetOrganization()
  const current = useRef({ getHtml, apply, organization })
  useEffect(() => { current.current = { getHtml, apply, organization } }, [getHtml, apply, organization])
  async function copy() {
    if (mode === 'scheduled' && !at) { setMessage('زمان انتقال را مشخص کنید'); return }
    setBusy(true); setMessage('')
    const original=current.current.getHtml(), context=JSON.stringify(organization)
    try {
      const response = await fetch('/api/admin/content/localize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: original, section, organization, mode, ...(mode === 'scheduled' ? { runAt: new Date(at).toISOString() } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'انتقال انجام نشد')
      if(context!==JSON.stringify(current.current.organization))throw new Error('محتوا تغییر کرده؛ فایل‌ها در کتابخانه باقی می‌مانند و لینک این مطلب عوض نشد')
      const replacements=new Map<string,string>(result.replacements || [])
      current.current.apply(replacements)
      setMessage(`${result.copied || 0} مورد ${mode === 'immediate' ? 'منتقل شد' : 'برای انتقال ثبت شد'}${result.failed?.length ? `؛ ${result.failed.length} مورد منتقل نشد و لینک اصلی آن حفظ شد` : ''}. برای اعمال لینک‌ها، مطلب را ذخیره کنید.`)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'انتقال انجام نشد') } finally { setBusy(false) }
  }
  return <details className="mcl-content-copy"><summary>↓ انتقال رسانه‌های لینک‌شدهٔ متن به سرور</summary><div className="mcl-copy-panel"><label>زمان انتقال<select className="select" value={mode} onChange={e => setMode(e.target.value)}><option value="immediate">همین حالا</option><option value="queued">در پس‌زمینه</option><option value="scheduled">زمان‌بندی</option></select></label>{mode === 'scheduled' && <label>تاریخ و ساعت<JalaliDateInput withTime className="input" value={at} onChange={(value) => setAt(value)} /></label>}<small>بدون تأیید، لینک‌های بیرونی حفظ می‌شوند. در پس‌زمینه، لینک سایت تا پایان انتقال به منبع اصلی هدایت می‌شود.</small><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void copy()}>{busy ? 'در حال پردازش…' : 'تأیید انتقال رسانه‌های متن'}</button></div><p role="status">{message}</p></details>
}
