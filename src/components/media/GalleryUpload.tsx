'use client'

import { useState } from 'react'
import { useAssetOrganization } from './OrganizationScope'

/** Adds pictures to a gallery from the computer; inside an item's editor each one is filed as gallery-1.webp, gallery-2.webp … */
export default function GalleryUpload({ onAdded, fa }: { onAdded: (urls: string[]) => void; fa: boolean }) {
  const organization = useAssetOrganization()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function upload(files: FileList | null) {
    const list = Array.from(files || []).slice(0, 20)
    if (!list.length) return
    setBusy(true); setError('')
    const added: string[] = []
    try {
      for (const file of list) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error(fa ? 'فقط JPG، PNG یا WebP تا ۱۵ مگابایت' : 'JPG, PNG or WebP up to 15 MB only')
        const form = new FormData()
        form.append('file', file, file.name)
        if (organization) { form.append('organization', JSON.stringify(organization)); form.append('role', 'gallery') }
        const response = await fetch('/api/admin/media', { method: 'POST', body: form })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.url) throw new Error(data?.error || (fa ? 'بارگذاری انجام نشد' : 'Upload failed'))
        added.push(String(data.url))
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally {
      if (added.length) onAdded(added)
      setBusy(false)
    }
  }
  return <span className="gallery-upload">
    <label className="btn btn-ghost">{busy ? (fa ? 'در حال بارگذاری…' : 'Uploading…') : (fa ? '⤒ بارگذاری تصویر' : '⤒ Upload images')}<input className="cms-cover-file" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = '' }} /></label>
    {error && <small className="error-text" role="alert">{error}</small>}
  </span>
}
