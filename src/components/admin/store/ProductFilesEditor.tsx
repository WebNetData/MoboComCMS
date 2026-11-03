'use client'

import { useState } from 'react'
import { send, useJson } from '@/app/admin/store/shared'
import Icon from '@/components/site/Icon'
import LibraryPicker from '@/components/media/LibraryPicker'
import { formatBytes } from '@/components/media/api'
import s from '@/components/store/ProductFiles.module.css'

type FileRow = { id: number; label: string; filename: string; sizeBytes: string; active: boolean }
type Data = { product: { kind: string; digitalMode: string }; files: FileRow[]; revision: string; maxFileMB: number }
type Props = { productId: number; onMode?: (mode: string) => void }

function Editor({ productId, initial, reload, onMode }: Props & { initial: Data; reload: () => void | Promise<void> }) {
  const [file, setFile] = useState<File | null>(null), [label, setLabel] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const url = `/api/admin/store/products/${productId}/files`
  async function action(body: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('')
    const result = await send<Data>(url, 'POST', { ...body, revision: initial.revision })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setNotice('تنظیمات فایل ذخیره شد'); onMode?.(result.data.product.digitalMode); await reload()
  }
  async function upload() {
    if (!file || busy) return
    if (file.size > initial.maxFileMB * 1024 ** 2) { setError(`حداکثر اندازهٔ فایل ${initial.maxFileMB.toLocaleString('fa-IR')} مگابایت است`); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`${url}?${new URLSearchParams({ revision: initial.revision, label: label || file.name })}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'بارگذاری انجام نشد'); return }
      setFile(null); setLabel(''); setNotice('نسخهٔ خصوصی فایل ذخیره شد'); await reload()
    } catch { setError('ارتباط برقرار نشد؛ بارگذاری را دوباره انجام دهید') } finally { setBusy(false) }
  }
  const on = initial.product.digitalMode === 'FILES'
  return <section className={s.admin} aria-label="فایل‌های فروشی محصول" dir="rtl">
    <header className={s.header}><div><span className={s.eyebrow}><Icon name="lock" size={16} />فایل‌های خصوصی فروشگاه</span><h2>فروش و تحویل فایل</h2><p>فایل را مستقیم بارگذاری کنید یا یک نسخهٔ خصوصی از کتابخانه بسازید. دانلود با حساب خریدار یا عضویت مجاز انجام می‌شود.</p></div><span className={s.status}>{on ? 'تحویل فایل فعال' : 'تحویل فایل خاموش'}</span></header>
    {error && <p className={s.error} role="alert">{error}</p>}{notice && <p className={s.success} role="status">{notice}</p>}
    <fieldset disabled={busy}><legend className="sr-only">مدیریت فایل‌های محصول</legend>
      <div className={s.mode}><div><strong>{on ? 'خریدار پس از پرداخت به فایل‌ها دسترسی دارد' : 'فایل‌ها را آماده کنید و سپس تحویل فایل را فعال کنید'}</strong><small>کدها و فایل‌های قبلی حذف نمی‌شوند. با فعال‌کردن تحویل فایل، موجودی مجازی نامحدود می‌شود.</small></div><button type="button" className="btn btn-primary" onClick={() => void action({ action: 'delivery', mode: on ? 'MANUAL' : 'FILES' })}>{on ? 'خاموش کردن تحویل فایل' : 'فعال‌کردن تحویل فایل'}</button></div>
      <div className={s.upload}><label><span>فایل برای بارگذاری خصوصی</span><input type="file" onChange={event => setFile(event.target.files?.[0] || null)} /><small className={s.note}>سقف هر فایل: {initial.maxFileMB.toLocaleString('fa-IR')} مگابایت؛ قابل تنظیم در کتابخانه</small></label><label><span>عنوان نمایشی فایل</span><input className="input" value={label} maxLength={180} onChange={event => setLabel(event.target.value)} placeholder="مثلاً نسخهٔ کامل فایل به همراه راهنما" /></label><div className={s.actions}><button type="button" className="btn btn-primary" disabled={!file} onClick={() => void upload()}><Icon name="upload" size={16} />بارگذاری خصوصی</button><LibraryPicker onSelect={asset => { if (window.confirm('یک نسخهٔ خصوصی از این فایل ساخته شود؟ فایل اصلی کتابخانه عمومی باقی می‌ماند.')) void action({ assetId: asset.id, label: label || asset.name }) }} /></div></div>
      {initial.files.length ? <ul className={s.list}>{initial.files.map(row => <FileEditor key={`${row.id}:${row.label}:${row.active}`} row={row} save={(value) => void action({ action: 'save', fileId: row.id, ...value })} />)}</ul> : <p className={s.note}>هنوز فایلی اضافه نشده؛ با بارگذاری خصوصی شروع کنید.</p>}
      <div className={s.actions}><button type="button" className="btn btn-ghost" onClick={() => void reload()}>بارگذاری دوبارهٔ فهرست</button>{busy && <span role="status">در حال ذخیره یا انتقال فایل…</span>}</div>
    </fieldset>
  </section>
}
function FileEditor({ row, save }: { row: FileRow; save: (value: { label: string; active: boolean }) => void }) {
  const [label, setLabel] = useState(row.label)
  return <li className={row.active ? '' : s.disabled}><span className={s.fileIcon}><Icon name="file" size={23} /></span><div className={s.fileName}><label><span className="sr-only">عنوان {row.filename}</span><input className="input" value={label} onChange={event => setLabel(event.target.value)} maxLength={180} /></label><span dir="auto">{row.filename}</span><small><bdi dir="ltr">{formatBytes(Number(row.sizeBytes))}</bdi> · {row.active ? 'فعال' : 'از دسترس خارج شده'}</small></div><div className={s.actions}><button type="button" className="btn btn-ghost" disabled={!label.trim() || label === row.label} onClick={() => save({ label, active: row.active })}>ذخیرهٔ عنوان</button><button type="button" className="btn btn-ghost" onClick={() => { if (!row.active || window.confirm('این فایل از دسترس خریداران خارج شود؟ نسخهٔ ذخیره‌شده حذف نمی‌شود.')) save({ label: label || row.label, active: !row.active }) }}>{row.active ? 'خارج‌کردن از دسترس' : 'بازگردانی فایل'}</button></div></li>
}
export default function ProductFilesEditor({ productId, onMode }: Props) {
  const { data, error, reload } = useJson<Data>(`/api/admin/store/products/${productId}/files`)
  if (error) return <section className={s.admin}><p role="alert">{error}</p><button type="button" className="btn btn-ghost" onClick={() => void reload()}>تلاش دوباره</button></section>
  if (!data) return <section className={s.admin} role="status">در حال دریافت فایل‌های محصول…</section>
  if (data.product.kind !== 'VIRTUAL') return null
  return <Editor key={productId} {...{ productId, onMode, reload }} initial={data} />
}
