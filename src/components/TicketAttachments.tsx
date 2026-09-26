'use client'

import { useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export type TicketAttachmentView = { id: number; name: string; mimeType: string; size: number; url: string }

export function TicketAttachmentPicker({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [error, setError] = useState('')
  return <div className="ticket-attachment-picker">
    <label className="ticket-attachment-trigger">
      <span>📎 {fa ? 'افزودن تصویر خطا' : 'Attach error screenshot'}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled} onChange={event => {
        const chosen = Array.from(event.target.files || [])
        event.currentTarget.value = ''
        if (files.length + chosen.length > 3) { setError(fa ? 'حداکثر سه تصویر می‌توانید پیوست کنید.' : 'You can attach up to three images.'); return }
        if (chosen.some(file => file.size > 5 * 1024 * 1024)) { setError(fa ? 'حجم هر تصویر باید حداکثر ۵ مگابایت باشد.' : 'Each image must be at most 5 MB.'); return }
        if (chosen.some(file => file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { setError(fa ? 'فقط تصویر PNG، JPEG یا WebP مجاز است.' : 'Only PNG, JPEG or WebP images are allowed.'); return }
        setError('')
        onChange([...files, ...chosen])
      }} />
    </label>
    <small>{fa ? 'تا ۳ تصویر؛ هرکدام حداکثر ۵ مگابایت. PNG، JPEG یا WebP.' : 'Up to 3 images, 5 MB each. PNG, JPEG or WebP.'}</small>
    {error && <span className="error-text" role="alert">{error}</span>}
    {files.length > 0 && <div className="ticket-attachment-selected">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" disabled={disabled} aria-label={fa ? `حذف ${file.name}` : `Remove ${file.name}`} onClick={() => onChange(files.filter((_, current) => current !== index))}>×</button></span>)}</div>}
  </div>
}

export function TicketAttachmentList({ files }: { files?: TicketAttachmentView[] }) {
  const { locale } = useI18n()
  if (!files?.length) return null
  return <div className="ticket-attachment-list" aria-label={locale === 'fa' ? 'پیوست‌های پیام' : 'Message attachments'}>{files.map(file => <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" title={file.name}><img src={file.url} alt={file.name} loading="lazy" /><span>{file.name}</span></a>)}</div>
}

export function ticketFormBody(payload: Record<string, unknown>, files: File[]) {
  if (!files.length) return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  const form = new FormData()
  form.set('payload', JSON.stringify(payload))
  files.forEach(file => form.append('files', file))
  return { body: form }
}
