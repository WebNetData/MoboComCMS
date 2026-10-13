'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { IMAGE_WIDTHS } from '@/shared/media/image'
import { pictureHtml, type PictureChoice } from '@/modules/editor/domain/classic'

// The media library of the editors: the pictures already on this server (newest first), uploading new ones
// (several at once, by picking or dropping), and what a picture needs before it goes into the text — its
// alternative text, size, alignment and an optional caption. Uses /api/admin/media for both list and upload.

type Item = { name: string; url: string; bytes: number; addedAt: string }
type Listing = { items: Item[]; total: number; page: number; pages: number }

const ACCEPT = 'image/jpeg,image/png,image/webp'
const thumb = (url: string) => `${url}?w=320`

export default function MediaLibrary({ onClose, onInsert }: { onClose: () => void; onInsert: (html: string, choice: PictureChoice) => void }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (f: string, e: string) => (fa ? f : e)
  const num = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(0)
  const [chosen, setChosen] = useState<Item | null>(null)
  const [alt, setAlt] = useState('')
  const [caption, setCaption] = useState('')
  const [width, setWidth] = useState(0)
  const [align, setAlign] = useState<PictureChoice['align']>('none')
  const [over, setOver] = useState(false)

  const load = useCallback(async (next: number) => {
    setLoading(true); setError('')
    const response = await fetch(`/api/admin/media?page=${next}&size=40`, { cache: 'no-store' }).catch(() => null)
    const data: Listing | null = response?.ok ? await response.json().catch(() => null) : null
    setLoading(false)
    if (!data) { setError(L('کتابخانه بارگذاری نشد.', 'The library could not be loaded.')); return }
    setItems((now) => (next === 1 ? data.items : [...now, ...data.items.filter((item) => !now.some((have) => have.name === item.name))]))
    setPage(data.page); setPages(data.pages); setTotal(data.total)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fa])

  useEffect(() => { void load(1) }, [load])

  // A dialog: focus comes in, Escape closes, Tab stays inside, and focus goes back to where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('button, input')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab' || !box.current) return
      const stops = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href]')].filter((el) => el.offsetParent !== null)
      if (!stops.length) return
      const first = stops[0], last = stops[stops.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); before?.focus() }
  }, [onClose])

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((file) => ACCEPT.split(',').includes(file.type))
    if (!list.length) { setError(L('فقط تصویر JPG، PNG یا WebP تا ۱۵ مگابایت.', 'JPG, PNG or WebP pictures up to 15 MB only.')); return }
    setError(''); setUploading(list.length)
    let last: Item | null = null
    for (const file of list) {
      const form = new FormData(); form.append('file', file, file.name)
      const response = await fetch('/api/admin/media', { method: 'POST', body: form }).catch(() => null)
      const data = await response?.json().catch(() => null)
      if (response?.ok && data?.url) {
        const item: Item = { name: String(data.url).split('/').pop() || '', url: data.url, bytes: file.size, addedAt: new Date().toISOString() }
        last = item
        setItems((now) => [item, ...now]); setTotal((now) => now + 1)
      } else setError(data?.error || L('بارگذاری یک تصویر انجام نشد.', 'A picture could not be uploaded.'))
      setUploading((now) => Math.max(0, now - 1))
    }
    if (last) choose(last)
  }

  function choose(item: Item) { setChosen(item); setAlt(''); setCaption(''); setWidth(0); setAlign('none') }

  function insert() {
    if (!chosen) return
    const choice: PictureChoice = { url: chosen.url, alt: alt.trim(), caption: caption.trim(), width, align }
    onInsert(pictureHtml(choice), choice)
  }

  return <div className="ml-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={box} className="ml" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ml-head">
        <h2 id={titleId}>{L('کتابخانهٔ رسانه', 'Media library')}</h2>
        <span className="ml-count">{total > 0 && L(`${num(total)} تصویر`, `${num(total)} pictures`)}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => picker.current?.click()} disabled={uploading > 0}>{uploading > 0 ? L(`در حال بارگذاری ${num(uploading)}…`, `Uploading ${num(uploading)}…`) : L('بارگذاری تصویر', 'Upload pictures')}</button>
        <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={(event) => { const files = event.target.files; if (files?.length) void upload(files); event.target.value = '' }} />
        <button type="button" className="ml-x" onClick={onClose} aria-label={L('بستن', 'Close')}>✕</button>
      </header>
      <div className="ml-body">
        <div className={`ml-grid-wrap${over ? ' is-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); if (event.dataTransfer.files.length) void upload(event.dataTransfer.files) }}>
          {error && <p className="ml-note is-error" role="alert">{error}</p>}
          {!loading && !items.length && !error && <p className="ml-note">{L('هنوز تصویری بارگذاری نشده است. تصویر را این‌جا رها کنید یا «بارگذاری تصویر» را بزنید.', 'No pictures yet. Drop one here or press “Upload pictures”.')}</p>}
          <ul className="ml-grid" aria-label={L('تصویرها', 'Pictures')}>
            {items.map((item) => <li key={item.name}>
              <button type="button" className={chosen?.name === item.name ? 'is-on' : ''} aria-pressed={chosen?.name === item.name} onClick={() => choose(item)} onDoubleClick={() => { choose(item); onInsert(pictureHtml({ url: item.url, alt: '', caption: '', width: 0, align: 'none' }), { url: item.url, alt: '', caption: '', width: 0, align: 'none' }) }} aria-label={L(`تصویر بارگذاری‌شده در ${new Date(item.addedAt).toLocaleDateString('fa-IR')}`, `Picture uploaded ${new Date(item.addedAt).toLocaleDateString('en-US')}`)}>
                <img src={thumb(item.url)} alt="" loading="lazy" />
              </button>
            </li>)}
          </ul>
          {loading && <p className="ml-note" aria-busy="true">{L('در حال بارگذاری…', 'Loading…')}</p>}
          {!loading && page < pages && <button type="button" className="btn btn-ghost btn-sm ml-more" onClick={() => void load(page + 1)}>{L('تصویرهای بیشتر', 'More pictures')}</button>}
        </div>
        <aside className="ml-side" aria-label={L('جزئیات تصویر', 'Picture details')}>
          {chosen ? <>
            <img className="ml-preview" src={thumb(chosen.url)} alt="" />
            <small className="ml-meta num">{num(Math.max(1, Math.round(chosen.bytes / 1024)))} KB · {new Date(chosen.addedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US')}</small>
            <label className="ml-field"><span>{L('متن جایگزین (برای نابینایان و موتور جست‌وجو)', 'Alternative text')}</span><input className="input" value={alt} maxLength={200} onChange={(event) => setAlt(event.target.value)} placeholder={L('آنچه در تصویر دیده می‌شود', 'What the picture shows')} /></label>
            <label className="ml-field"><span>{L('زیرنویس (اختیاری)', 'Caption (optional)')}</span><input className="input" value={caption} maxLength={300} onChange={(event) => setCaption(event.target.value)} /></label>
            <label className="ml-field"><span>{L('اندازه', 'Size')}</span><select className="select" value={width} onChange={(event) => setWidth(Number(event.target.value))}><option value={0}>{L('اندازهٔ کامل', 'Full size')}</option>{IMAGE_WIDTHS.filter((w) => w >= 320).map((w) => <option key={w} value={w}>{L(`${num(w)} پیکسل`, `${w}px`)}</option>)}</select></label>
            <label className="ml-field"><span>{L('چیدمان', 'Alignment')}</span><select className="select" value={align} onChange={(event) => setAlign(event.target.value as PictureChoice['align'])}><option value="none">{L('بدون چیدمان', 'None')}</option><option value="center">{L('وسط', 'Centre')}</option><option value="right">{L('راست', 'Right')}</option><option value="left">{L('چپ', 'Left')}</option></select></label>
            <button type="button" className="btn btn-primary ml-insert" onClick={insert}>{L('افزودن به نوشته', 'Insert into the text')}</button>
          </> : <p className="ml-note">{L('یک تصویر را انتخاب کنید تا متن جایگزین، اندازه و چیدمان آن را تعیین کنید. با دو بار کلیک، تصویر مستقیم افزوده می‌شود.', 'Choose a picture to set its alternative text, size and alignment. Double-click inserts it straight away.')}</p>}
        </aside>
      </div>
    </div>
  </div>
}
