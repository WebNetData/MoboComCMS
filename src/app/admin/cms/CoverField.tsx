'use client'

import LibraryPicker from '@/components/media/LibraryPicker'
import RemoteCopy from '@/components/media/RemoteCopy'
import { useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export default function CoverField({ value, title, onChange, onBusy, mode = 'cover' }: {
  value: string; title: string; onChange: (value: string) => void; onBusy: (busy: boolean) => void; mode?: 'cover' | 'section' | 'logo' | 'poster'
}) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(file?: File) {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      setError(fa ? 'تصویر JPG، PNG یا WebP تا ۱۵ مگابایت انتخاب کنید (خودکار فشرده و به WebP تبدیل می‌شود).' : 'Choose a JPG, PNG or WebP image up to 15 MB (compressed to WebP automatically).')
      return
    }
    setBusy(true); onBusy(true)
    try {
      const bitmap = await createImageBitmap(file)
      const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(fa ? 'پردازش تصویر ممکن نیست.' : 'Image processing is unavailable.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .88))
      if (!blob) throw new Error(fa ? 'تصویر معتبر نیست.' : 'Invalid image.')
      const form = new FormData()
      form.append('file', blob, 'cover.webp')
      const response = await fetch('/api/admin/media', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || (fa ? 'بارگذاری ناموفق بود.' : 'Upload failed.'))
      onChange(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : (fa ? 'بارگذاری ناموفق بود.' : 'Upload failed.'))
    } finally { setBusy(false); onBusy(false) }
  }

  return <div className={`cms-cover-field${mode === 'logo' ? ' is-logo' : mode === 'poster' ? ' is-poster' : ''}`}>
    <p className="muted text-sm">{mode === 'poster' ? (fa ? 'تصویر عمودی با نسبت ۲ به ۳ (مثلاً ۸۰۰ × ۱۲۰۰ پیکسل)؛ JPG، PNG یا WebP تا ۱۵ مگابایت، خودکار فشرده می‌شود.' : 'A portrait 2:3 image (e.g. 800 × 1200 px); JPG, PNG or WebP up to 15 MB, compressed automatically.') : mode === 'logo' ? (fa ? 'تصویر مربع JPG، PNG یا WebP تا ۱۵ مگابایت بارگذاری کنید.' : 'Upload a square JPG, PNG or WebP image up to 15 MB.') : mode === 'section' ? (fa ? 'تصویر بخش را بارگذاری کنید (حداکثر ۱۵ مگابایت؛ خودکار فشرده می‌شود).' : 'Upload a section image (up to 5 MB).') : (fa ? 'اندازه پیشنهادی: ۱۹۲۰ × ۶۴۰ پیکسل. تصویر بدون کشیدگی، از مرکز برش می‌خورد؛ سوژه اصلی را وسط نگه دارید. حداکثر ۱۵ مگابایت؛ خودکار فشرده می‌شود.' : 'Recommended: 1920 × 640 px, up to 15 MB (compressed automatically). The cover crops from the center without stretching; keep the subject centered.')}</p>
    <div className="cms-cover-controls">
      <label className="label cms-cover-upload">{mode === 'logo' ? (fa ? 'بارگذاری نشان' : 'Upload logo') : mode === 'section' ? (fa ? 'بارگذاری تصویر بخش' : 'Upload section image') : (fa ? 'بارگذاری تصویر شاخص' : 'Upload featured image')}<span className="cms-cover-pick" aria-hidden="true">⤒ {fa ? 'انتخاب فایل از رایانه' : 'Choose a file'}</span><input className="cms-cover-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
      <label className="label">{fa ? 'یا نشانی تصویر' : 'Or image URL'}<input className="input" dir="ltr" value={value} disabled={busy} placeholder="https://…" onChange={e => onChange(e.target.value)} /></label>
      {value && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onChange('')}>{mode === 'logo' ? (fa ? 'حذف نشان' : 'Remove logo') : mode === 'section' ? (fa ? 'حذف تصویر بخش' : 'Remove section image') : (fa ? 'حذف تصویر شاخص' : 'Remove featured image')}</button>}
    </div>
    <div className="mcl-actions"><LibraryPicker kind="image" onSelect={asset => onChange(asset.url)} /><RemoteCopy url={value} onCopied={onChange} /></div>
    {busy && <p role="status">{fa ? 'در حال آماده‌سازی و بارگذاری تصویر…' : 'Preparing and uploading image…'}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {value && <div className="cms-cover-preview"><img src={value} alt={mode === 'poster' ? (fa ? 'پیش‌نمایش پوستر' : 'Poster preview') : mode === 'logo' ? (fa ? `پیش‌نمایش نشان ${title}` : `${title} logo preview`) : (fa ? 'پیش‌نمایش تصویر شاخص' : 'Featured image preview')} />{mode !== 'logo' && mode !== 'poster' && <strong>{title || (fa ? 'عنوان شما روی کاور' : 'Your title on the cover')}</strong>}</div>}
    <p className="muted text-sm">{mode === 'logo' ? (fa ? 'برای ثبت نشان، پروفایل را ذخیره کنید.' : 'Save the profile to apply the logo.') : mode === 'section' ? (fa ? 'برای ثبت تصویر، تغییرات صفحه را ذخیره کنید.' : 'Save the page to apply this image.') : (fa ? 'برای ثبت تصویر شاخص، فرم صفحه یا نوشته را ذخیره کنید.' : 'Save the page or article form to apply the featured image.')}</p>
  </div>
}
