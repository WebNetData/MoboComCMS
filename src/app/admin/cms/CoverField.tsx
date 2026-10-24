'use client'

import LibraryPicker from '@/components/media/LibraryPicker'
import RemoteCopy from '@/components/media/RemoteCopy'
import { useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

type Mode = 'cover' | 'section' | 'logo' | 'poster' | 'media'
type Words = { hint: [string, string]; upload: [string, string]; remove: [string, string]; alt: [string, string]; save: [string, string]; empty?: [string, string] }
const FORMATS: [string, string] = ['JPG، PNG یا WebP تا ۱۵ مگابایت؛ خودکار فشرده و به WebP تبدیل می‌شود.', 'JPG, PNG or WebP up to 15 MB, compressed to WebP automatically.']
/** What the field says in each place it is used: [Persian, English]. */
const WORDS: Record<Mode, Words> = {
  cover: { hint: ['اندازه پیشنهادی: ۱۹۲۰ × ۶۴۰ پیکسل. تصویر بدون کشیدگی، از مرکز برش می‌خورد؛ سوژه اصلی را وسط نگه دارید. حداکثر ۱۵ مگابایت؛ خودکار فشرده می‌شود.', 'Recommended: 1920 × 640 px, up to 15 MB (compressed automatically). The cover crops from the center without stretching; keep the subject centered.'], upload: ['بارگذاری تصویر شاخص', 'Upload featured image'], remove: ['حذف تصویر شاخص', 'Remove featured image'], alt: ['پیش‌نمایش تصویر شاخص', 'Featured image preview'], save: ['برای ثبت تصویر شاخص، فرم صفحه یا نوشته را ذخیره کنید.', 'Save the page or article form to apply the featured image.'] },
  section: { hint: ['تصویر بخش را بارگذاری کنید (حداکثر ۱۵ مگابایت؛ خودکار فشرده می‌شود).', 'Upload a section image (up to 5 MB).'], upload: ['بارگذاری تصویر بخش', 'Upload section image'], remove: ['حذف تصویر بخش', 'Remove section image'], alt: ['پیش‌نمایش تصویر شاخص', 'Featured image preview'], save: ['برای ثبت تصویر، تغییرات صفحه را ذخیره کنید.', 'Save the page to apply this image.'] },
  logo: { hint: ['تصویر مربع JPG، PNG یا WebP تا ۱۵ مگابایت بارگذاری کنید.', 'Upload a square JPG, PNG or WebP image up to 15 MB.'], upload: ['بارگذاری نشان', 'Upload logo'], remove: ['حذف نشان', 'Remove logo'], alt: ['پیش‌نمایش نشان', 'Logo preview'], save: ['برای ثبت نشان، پروفایل را ذخیره کنید.', 'Save the profile to apply the logo.'] },
  poster: { hint: ['تصویر عمودی با نسبت ۲ به ۳ (مثلاً ۸۰۰ × ۱۲۰۰ پیکسل)؛ ' + FORMATS[0], 'A portrait 2:3 image (e.g. 800 × 1200 px); ' + FORMATS[1]], upload: ['بارگذاری پوستر', 'Upload poster'], remove: ['حذف پوستر', 'Remove poster'], alt: ['پیش‌نمایش پوستر', 'Poster preview'], save: ['پوستر با ذخیرهٔ فرم ثبت می‌شود.', 'The poster is kept when the form is saved.'], empty: ['پوستری انتخاب نشده', 'No poster yet'] },
  media: { hint: FORMATS, upload: ['بارگذاری تصویر', 'Upload image'], remove: ['حذف تصویر', 'Remove image'], alt: ['پیش‌نمایش تصویر', 'Image preview'], save: ['تصویر با ذخیرهٔ فرم ثبت می‌شود.', 'The image is kept when the form is saved.'], empty: ['تصویری انتخاب نشده', 'No image yet'] },
}

export default function CoverField({ value, title, onChange, onBusy, mode = 'cover' }: {
  value: string; title: string; onChange: (value: string) => void; onBusy: (busy: boolean) => void; mode?: Mode
}) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const say = ([persian, english]: [string, string]) => (fa ? persian : english)
  const words = WORDS[mode]

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

  const pick = <label className="label cms-cover-upload">{say(words.upload)}<span className="cms-cover-pick" aria-hidden="true">⤒ {fa ? 'انتخاب فایل از رایانه' : 'Choose a file'}</span><input className="cms-cover-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
  const framedPick = <label className="cms-cover-upload"><span className="cms-cover-pick"><span aria-hidden="true">⤒</span> {say(words.upload)}</span><input className="cms-cover-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
  const address = <label className="label cms-cover-url">{fa ? 'یا نشانی تصویر' : 'Or image URL'}<input className="input" dir="ltr" value={value} disabled={busy} placeholder="https://…" onChange={e => onChange(e.target.value)} /></label>
  const remove = value ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onChange('')}>{say(words.remove)}</button> : null
  const status = <>{busy && <p role="status">{fa ? 'در حال آماده‌سازی و بارگذاری تصویر…' : 'Preparing and uploading image…'}</p>}{error && <p className="error-text" role="alert">{error}</p>}</>

  // Media forms: the picture (or an empty frame) beside its controls.
  if (words.empty) return <div className={`cms-cover-field is-framed is-${mode}`}>
    <div className="cms-cover-frame">{value ? <img src={value} alt={say(words.alt)} /> : <span className="cms-cover-empty"><svg aria-hidden="true" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></svg><small>{say(words.empty)}</small></span>}</div>
    <div className="cms-cover-side">
      <p className="muted text-sm">{say(words.hint)}</p>
      <div className="cms-cover-buttons">{framedPick}<LibraryPicker kind="image" onSelect={asset => onChange(asset.url)} /><RemoteCopy url={value} onCopied={onChange} />{remove}</div>
      {address}
      {status}
      <small className="muted">{say(words.save)}</small>
    </div>
  </div>

  return <div className={`cms-cover-field${mode === 'logo' ? ' is-logo' : ''}`}>
    <p className="muted text-sm">{say(words.hint)}</p>
    <div className="cms-cover-controls">{pick}{address}{remove}</div>
    <div className="mcl-actions"><LibraryPicker kind="image" onSelect={asset => onChange(asset.url)} /><RemoteCopy url={value} onCopied={onChange} /></div>
    {status}
    {value && <div className="cms-cover-preview"><img src={value} alt={mode === 'logo' ? (fa ? `پیش‌نمایش نشان ${title}` : `${title} logo preview`) : say(words.alt)} />{mode !== 'logo' && <strong>{title || (fa ? 'عنوان شما روی کاور' : 'Your title on the cover')}</strong>}</div>}
    <p className="muted text-sm">{say(words.save)}</p>
  </div>
}
