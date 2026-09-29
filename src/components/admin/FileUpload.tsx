'use client'

import { useRef, useState } from 'react'

const CHUNK = 8 * 1024 * 1024

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `خطا ${response.status}`)
  return body as T
}

export type Uploaded = { url: string; name: string; size: number; path: string }

/** Sends a file in 8 MB pieces; a dropped connection retries the piece where the server stopped. */
export async function uploadFile(file: File, section: string, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const start = await json<{ id: string }>('/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'start', name: file.name, size: file.size, section }) })
  let offset = 0
  let failures = 0
  while (offset < file.size) {
    if (signal?.aborted) { await json('/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'cancel', id: start.id }) }).catch(() => undefined); throw new Error('لغو شد') }
    try {
      const piece = file.slice(offset, offset + CHUNK)
      const result = await json<{ received: number }>(`/api/admin/uploads?id=${start.id}&offset=${offset}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: piece, signal })
      offset = result.received
      failures = 0
      onProgress(offset)
    } catch (error) {
      if (signal?.aborted || ++failures > 5) throw error
      await new Promise((resolve) => setTimeout(resolve, 1500 * failures))
    }
  }
  return json<Uploaded>('/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'finish', id: start.id }) })
}

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
    {error && <small className="fu-error" role="alert">{error}</small>}
    <input ref={input} type="file" hidden accept={accept} onChange={(e) => void pick(e.target.files?.[0])} />
  </span>
}

/** For an image address on another site: copies it to this server (WebP) and swaps the address. */
export function CopyToServer({ url, onCopied, kind = 'image' }: { url: string; onCopied: (url: string) => void; kind?: 'image' | 'file' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const external = /^https?:\/\//i.test(url) && typeof window !== 'undefined' && (() => { try { const host = new URL(url).hostname; const own = window.location.hostname.replace(/^www\./, ''); return host !== own && !host.endsWith(`.${own}`) } catch { return false } })()
  if (!external) return null
  async function copy() {
    setBusy(true); setError('')
    try {
      const result = await json<{ url: string }>('/api/admin/content/localize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, kind }) })
      onCopied(result.url)
    } catch (e) { setError(e instanceof Error ? e.message : 'انجام نشد') } finally { setBusy(false) }
  }
  return <span className="fu">
    <button type="button" className="btn btn-ghost btn-sm fu-btn" disabled={busy} onClick={() => void copy()} title="تصویر روی سرور همین سایت ذخیره و نشانی آن جایگزین می‌شود">{busy ? 'در حال انتقال…' : '⇩ انتقال به سرور سایت'}</button>
    {error && <small className="fu-error" role="alert">{error}</small>}
  </span>
}
