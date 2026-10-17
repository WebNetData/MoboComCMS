'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, bytes, fa, faDate, useServerApi, useServerJson } from '@/app/admin/server/shared'
import { EMPTY_STORAGE, KIND_LABEL, STATUS, PHASE, TEXT_EXT, type Entry, type Overview, type ArchiveListing, type Job, type Listing, type Tone } from './types'
import { seconds } from './common'
export default function Editor({ storage, entry, onClose, onSaved }: { storage: string; entry: Entry; onClose: () => void; onSaved: () => void }) {
  const api = useServerApi()
  const { data, error } = useServerJson<{ content: string; etag: string }>(`/api/admin/server/downloads?view=read&storage=${encodeURIComponent(storage)}&path=${encodeURIComponent(entry.path)}`)
  const [content, setContent] = useState<string | null>(null)
  const [notice, setNotice] = useState<Tone>(null)
  const [etag, setEtag] = useState('')
  useEffect(() => { if (data) { setContent(data.content); setEtag(data.etag) } }, [data])
  async function save() {
    const result = await api<{ etag: string }>('/api/admin/server/downloads', { body: { op: 'write', storage, path: entry.path, content, etag } })
    if (result.ok) { setEtag(result.data.etag); setNotice({ tone: 'ok', text: 'ذخیره شد.' }); onSaved() } else setNotice({ tone: 'error', text: result.error })
  }
  return <section className="sa-card sa-form">
    <header className="sa-card-head"><h2>ویرایش <bdi dir="auto">{entry.name}</bdi></h2><div className="sa-head-actions"><button type="button" className="btn btn-primary btn-sm" disabled={content === null} onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div></header>
    {(error || notice) && <Notice tone={error ? 'error' : notice!.tone}>{error || notice!.text}</Notice>}
    {content === null ? !error && <div className="sa-skeleton" style={{ height: 260 }} /> : <textarea className="input dl-editor" dir="auto" spellCheck={false} value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save() } }} aria-label="محتوای فایل" />}
  </section>
}

// ------------------------------------------------------------------ jobs
