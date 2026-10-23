'use client'
import { useEffect, useState } from 'react'
import { libraryApi } from './api'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
type Config = { enabled: boolean; organize: boolean; maxFileMB: number; timeoutSeconds: number; compatibleAudio: boolean; audioTimeoutSeconds: number }
const numberOr = (input: HTMLInputElement, fallback: number) => Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : fallback
export default function LibrarySettings() {
  const [data, setData] = useState<{ value: Config; stamp: string | null } | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { const c = new AbortController(); fetch('/api/admin/media/library?view=settings', { signal: c.signal }).then(async r => { if (!r.ok) throw new Error('دسترسی به تنظیمات مجاز نیست'); setData(await r.json()) }).catch(e => { if (!c.signal.aborted) setMessage(e.message) }); return () => c.abort() }, [])
  if (!data) return <p role="status">{message || 'بارگیری تنظیمات…'}</p>
  return <form className="mcl-settings" onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await libraryApi({ action: 'settings.save', ...data }); const r = await fetch('/api/admin/media/library?view=settings'); if (r.ok) setData(await r.json()); setMessage('تنظیمات ذخیره شد') } catch (e) { setMessage(e instanceof Error ? e.message : 'ذخیره نشد') } finally { setBusy(false) } }}>
    <h3>تنظیمات انتقال فایل</h3>
    <SectionSettingsHistoryLink section="media" />
    <label className="mcl-check"><input type="checkbox" checked={data.value.enabled} onChange={e => setData({ ...data, value: { ...data.value, enabled: e.target.checked } })} /> دریافت از لینک خارجی فعال باشد</label>
    <label className="mcl-check"><input type="checkbox" checked={data.value.organize} onChange={e => setData({ ...data, value: { ...data.value, organize: e.target.checked } })} /> پوشه‌بندی خودکار فایل‌های جدید بر اساس اطلاعات محتوا</label>
    <label>حداکثر حجم فایل (مگابایت، تا ۴۰۹۶)<input className="input" type="number" min={1} max={4096} value={data.value.maxFileMB} onChange={e => setData({ ...data, value: { ...data.value, maxFileMB: numberOr(e.target, data.value.maxFileMB) } })} /></label>
    <label>مهلت انتقال فایل (ثانیه، تا ۴۸۰)<input className="input" type="number" min={10} max={480} value={data.value.timeoutSeconds} onChange={e => setData({ ...data, value: { ...data.value, timeoutSeconds: numberOr(e.target, data.value.timeoutSeconds) } })} /></label>
    <p>انتقال تصویر با سقف ۱۵ مگابایت و بررسی تصویر انجام می‌شود. بارگذاری مستقیم فایل از تنظیمات فعلی سرور پیروی می‌کند.</p>
    <h3>صدای سازگار با مرورگر</h3>
    <label className="mcl-check"><input type="checkbox" checked={data.value.compatibleAudio} onChange={e => setData({ ...data, value: { ...data.value, compatibleAudio: e.target.checked } })} /> مدیر کتابخانه بتواند از ویدئوی محلی، فایل صوتی AAC بسازد</label>
    <label>مهلت ساخت صدا (ثانیه، ۳۰ تا ۴۲۰)<input className="input" type="number" min={30} max={420} value={data.value.audioTimeoutSeconds} onChange={e => setData({ ...data, value: { ...data.value, audioTimeoutSeconds: numberOr(e.target, data.value.audioTimeoutSeconds) } })} /></label>
    <p>نیازمند ffmpeg و ffprobe است. پردازش انتخابی در صف انجام می‌شود و فایل اصلی حفظ می‌شود. خروجی را به‌عنوان صدای جداگانهٔ همان فیلم یا قسمت ثبت کنید؛ تبدیل تصویر انجام نمی‌شود.</p>
    <button type="submit" className="btn btn-primary" disabled={busy}>ذخیرهٔ تنظیمات</button><p role="status">{message}</p>
  </form>
}
