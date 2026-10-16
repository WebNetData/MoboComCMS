'use client'

import { useRef, useState } from 'react'

import { uploadFile, type Uploaded } from './upload-file'
export { uploadFile, type Uploaded } from './upload-file'
import LibraryPicker from '@/components/media/LibraryPicker'
import RemoteCopy from '@/components/media/RemoteCopy'

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

/**
 * "Upload from computer" button for a file field: the file is stored on this
 * server (download folder) and its address is handed back to fill the field.
 */
export default function FileUpload({ section, accept, onUploaded, label = 'بارگذاری فایل', compact = false }: { section: string; accept?: string; onUploaded: (file: Uploaded) => void; label?: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [state, setState] = useState<{ name: string; sent: number; total: number } | null>(null)
  const [error, setError] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')
    abort.current = new AbortController()
    setState({ name: file.name, sent: 0, total: file.size })
    try {
      const done = await uploadFile(file, section, (sent) => setState({ name: file.name, sent, total: file.size }), abort.current.signal)
      onUploaded(done)
      setState(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'بارگذاری انجام نشد')
      setState(null)
    } finally { if (input.current) input.current.value = '' }
  }

  const percent = state ? Math.floor((state.sent / Math.max(1, state.total)) * 100) : 0
  return <span className={`fu${compact ? ' is-compact' : ''}`}>
    {state ? <span className="fu-progress" role="status" aria-live="polite">
      <span className="fu-bar"><i style={{ inlineSize: `${percent}%` }} /></span>
      <small>{percent.toLocaleString('fa-IR')}٪ · {size(state.sent)} / {size(state.total)}</small>
      <button type="button" className="fu-cancel" onClick={() => abort.current?.abort()} aria-label="لغو بارگذاری">✕</button>
    </span> : <button type="button" className="btn btn-ghost btn-sm fu-btn" onClick={() => input.current?.click()} title="فایل روی سرور همین سایت ذخیره می‌شود">⤒ {label}</button>}
    <LibraryPicker kind={accept?.startsWith('image/') ? 'image' : accept?.startsWith('audio/') ? 'audio' : accept?.startsWith('video/') ? 'video' : undefined} onSelect={asset => onUploaded({ url: asset.url, name: asset.name, size: Number(asset.bytes), path: '' })} />
    {error && <small className="fu-error" role="alert">{error}</small>}
    <input ref={input} type="file" hidden accept={accept} onChange={(e) => void pick(e.target.files?.[0])} />
  </span>
}

export const CopyToServer = RemoteCopy
