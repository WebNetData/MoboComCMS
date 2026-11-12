'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { formatBytes } from '@/components/media/api'
import styles from './DeliveryDetailsEditor.module.css'

type FileRow = { id: number; label: string; filename: string; sizeBytes: string }
type Upload = { key: string; name: string; size: number; progress: number; error?: string }

/** One file sent to the order's private store; resolves with the order's files, reports progress as it goes. */
function send(url: string, file: File, onProgress: (share: number) => void) {
  return new Promise<FileRow[]>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.setRequestHeader('Content-Type', 'application/octet-stream')
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total) }
    request.onload = () => {
      let body: { files?: FileRow[]; error?: string } = {}
      try { body = JSON.parse(request.responseText) } catch { /* not JSON: a proxy refused it */ }
      if (request.status >= 200 && request.status < 300 && body.files) resolve(body.files)
      else reject(new Error(body.error || (request.status === 413 ? 'فایل از سقف حجم سرور بزرگ‌تر است' : 'ارسال فایل انجام نشد')))
    }
    request.onerror = () => reject(new Error('اتصال قطع شد؛ دوباره تلاش کنید'))
    request.send(file)
  })
}

/**
 * Files the specialist hands over with a virtual order (store/server/delivery-files): a text file, an archive, anything
 * within the media size limit. They are kept on the order right away; the buyer can download them once it is delivered.
 */
export default function DeliveryFiles({ orderId }: { orderId: number }) {
  const url = `/api/admin/store/orders/${orderId}/files`
  const [files, setFiles] = useState<FileRow[]>([])
  const [maxMB, setMaxMB] = useState<number | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [message, setMessage] = useState('')
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const hintId = useId()

  useEffect(() => {
    let live = true
    fetch(url).then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json() }).then((body) => { if (live && body.files) { setFiles(body.files); setMaxMB(body.maxFileMB ?? null) } }).catch(() => { if (live) setMessage('فهرست فایل‌ها خوانده نشد') })
    return () => { live = false }
  }, [url])

  async function add(list: FileList | null) {
    if (!list?.length) return
    setMessage('')
    const queue = [...list].map((file, index) => ({ file, key: `${Date.now()}-${index}` }))
    setUploads((current) => [...current, ...queue.map(({ file, key }) => ({ key, name: file.name, size: file.size, progress: 0 }))])
    // One at a time: a slow line finishes each file instead of starving all of them.
    for (const { file, key } of queue) {
      const patch = (next: Partial<Upload>) => setUploads((current) => current.map((item) => item.key === key ? { ...item, ...next } : item))
      if (maxMB && file.size > maxMB * 1024 ** 2) { patch({ error: `بیشتر از ${maxMB.toLocaleString('fa-IR')} مگابایت است` }); continue }
      try {
        setFiles(await send(url, file, (progress) => patch({ progress })))
        setUploads((current) => current.filter((item) => item.key !== key))
      } catch (error) { patch({ error: error instanceof Error ? error.message : 'ارسال فایل انجام نشد' }) }
    }
    if (input.current) input.current.value = ''
  }

  async function remove(file: FileRow) {
    setMessage('')
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', fileId: file.id }) }).catch(() => null)
    const body = await response?.json().catch(() => ({})) || {}
    if (response?.ok && body.files) setFiles(body.files)
    else setMessage(body.error || 'حذف فایل انجام نشد')
  }

  return <div className={styles.files}>
    <span className={styles.note}>فایل برای خریدار <small>(اختیاری؛ متن، زیپ یا هر فایل دیگر)</small></span>
    <label
      className={`${styles.drop}${over ? ` ${styles.dropOver}` : ''}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); void add(event.dataTransfer.files) }}
    >
      <input ref={input} type="file" multiple className={styles.fileInput} aria-label="افزودن فایل برای خریدار" aria-describedby={hintId} onChange={(event) => void add(event.target.files)} />
      <span className={styles.dropTitle}>فایل را اینجا رها کنید یا <u>انتخاب کنید</u></span>
      <small id={hintId}>همان لحظه روی سفارش ذخیره می‌شود و پس از ثبت «تحویل داده شد» برای خریدار قابل دریافت است{maxMB ? ` · حداکثر ${maxMB.toLocaleString('fa-IR')} مگابایت برای هر فایل` : ''}</small>
    </label>
    {(files.length > 0 || uploads.length > 0) && <ul className={styles.fileList}>
      {files.map((file) => <li key={file.id} className={styles.fileRow}>
        <span className={styles.fileBadge} aria-hidden="true">{(file.filename.split('.').pop() || '').slice(0, 4).toUpperCase() || 'FILE'}</span>
        <span className={styles.fileName}><bdi>{file.filename}</bdi></span>
        <small className={styles.fileSize} dir="ltr">{formatBytes(Number(file.sizeBytes))}</small>
        <button type="button" className={styles.remove} aria-label={`حذف ${file.filename}`} onClick={() => void remove(file)}>×</button>
      </li>)}
      {uploads.map((item) => <li key={item.key} className={styles.fileRow} aria-busy={!item.error}>
        <span className={styles.fileBadge} aria-hidden="true">{item.error ? '!' : `${Math.round(item.progress * 100)}٪`}</span>
        <span className={styles.fileName}><bdi>{item.name}</bdi>{item.error && <small className={styles.fileError} role="alert">{item.error}</small>}</span>
        {item.error
          ? <button type="button" className={styles.remove} aria-label={`بستن خطای ${item.name}`} onClick={() => setUploads((current) => current.filter((other) => other.key !== item.key))}>×</button>
          : <span className={styles.progress} role="progressbar" aria-label={`ارسال ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}><i style={{ transform: `scaleX(${item.progress})` }} /></span>}
      </li>)}
    </ul>}
    {message && <p className={styles.fileError} role="alert">{message}</p>}
  </div>
}
