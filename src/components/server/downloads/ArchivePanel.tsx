'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, bytes, fa, faDate, useServerApi, useServerJson } from '@/app/admin/server/shared'
import { EMPTY_STORAGE, KIND_LABEL, STATUS, PHASE, TEXT_EXT, type Entry, type Overview, type ArchiveListing, type Job, type Listing, type Tone } from './types'
import { seconds } from './common'
import ArchiveEdits from './ArchiveEdits'
import type { ArchiveEdit } from '@/modules/server-panel/domain/archive-edits'
export default function ArchivePanel({ entry, tools, onClose, onQueued }: { entry: Entry; tools: Overview['tools']; onClose: () => void; onQueued: (text: string) => void }) {
  const api = useServerApi()
  const [password, setPassword] = useState('')
  const [listing, setListing] = useState<ArchiveListing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [format, setFormat] = useState<'zip' | '7z' | 'rar'>(entry.archive === 'tar' || !entry.archive ? 'zip' : entry.archive)
  const [replace, setReplace] = useState(false)
  const [edits, setEdits] = useState<ArchiveEdit[]>([])
  const [folder, setFolder] = useState(true)
  const [showPw, setShowPw] = useState(false)

  const load = useCallback(async (pw: string) => {
    setBusy(true); setError('')
    const result = await api<ArchiveListing>('/api/admin/server/downloads', { body: { op: 'archive-list', storage: 'local', path: entry.path, password: pw } })
    setBusy(false)
    if (result.ok) { setListing(result.data); setEdits([]); if (result.data.needsPassword && pw) setError('رمز درست نیست') } else setError(result.error)
  }, [api, entry.path])
  useEffect(() => { void load('') }, [load])

  async function queue(body: Record<string, unknown>, text: string) {
    setBusy(true); setError('')
    const result = await api('/api/admin/server/downloads', { body: { storage: 'local', path: entry.path, password, stamp: listing?.stamp, ...body } })
    setBusy(false)
    if (result.ok) { onQueued(text); onClose() } else setError(result.error)
  }
  const locked = !listing || listing.needsPassword
  const canRar = !!tools.rar
  return <section className="sa-card dl-archive" aria-label="ابزار آرشیو">
    <header className="sa-card-head">
      <h2><span className="dl-badge">{(listing?.format || entry.archive || '').toUpperCase()}</span> <bdi dir="auto">{entry.name}</bdi></h2>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button>
    </header>
    <div className="dl-archive-body">
      <div className="dl-archive-side">
        <div className="dl-facts">
          <div><small>حجم آرشیو</small><b>{bytes(entry.size)}</b></div>
          <div><small>پس از باز شدن</small><b>{listing && !listing.needsPassword ? bytes(listing.unpacked) : '—'}</b></div>
          <div><small>فایل‌ها</small><b>{listing && !listing.needsPassword ? fa(listing.files) : '—'}</b></div>
          <div><small>رمز</small><b className={listing?.encrypted || listing?.needsPassword ? 'dl-lock' : ''}>{!listing ? '…' : listing.encrypted || listing.needsPassword ? 'دارد' : 'ندارد'}</b></div>
        </div>
        {(listing?.encrypted || listing?.needsPassword) && <form className="sa-form" onSubmit={(e) => { e.preventDefault(); void load(password) }}>
          <label className="sa-field"><span>رمز فعلی آرشیو</span>
            <div className="dl-pw"><input className="input" dir="ltr" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPw(!showPw)}>{showPw ? 'پنهان' : 'نمایش'}</button></div>
          </label>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !password}>بررسی رمز</button>
        </form>}
        {error && <Notice tone="error">{error}</Notice>}
        {listing && !listing.needsPassword && listing.encrypted && password && <Notice tone="ok">رمز درست است.</Notice>}

        <fieldset className="dl-action" disabled={busy || locked}>
          <legend>باز کردن (Extract)</legend>
          <label className="sa-check"><input type="checkbox" checked={folder} onChange={(e) => setFolder(e.target.checked)} /> <span>در پوشه‌ای هم‌نام آرشیو</span></label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void queue({ op: 'extract', folder }, 'باز کردن آرشیو در صف قرار گرفت.')}>باز کردن همین‌جا</button>
        </fieldset>

        <fieldset className="dl-action" disabled={busy || locked}>
          <legend>رمز آرشیو</legend>
          <label className="sa-field"><span>{listing?.encrypted ? 'رمز تازه (خالی = برداشتن رمز)' : 'رمز برای گذاشتن روی آرشیو'}</span><input className="input" dir="ltr" type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
          <div className="sa-toolbar">
            <label className="sa-inline"><span>قالب خروجی</span><select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'zip' | '7z' | 'rar')}>
              <option value="zip">ZIP (AES-256)</option><option value="7z">7z (نام فایل‌ها هم رمزدار)</option><option value="rar" disabled={!canRar}>RAR{canRar ? ' (نام فایل‌ها هم رمزدار)' : ' — ابزار rar نصب نیست'}</option>
            </select></label>
            <label className="sa-check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> <span>جایگزین فایل اصلی</span></label>
          </div>
          <div className="sa-head-actions">
            {listing?.encrypted && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void queue({ op: 'repack', newPassword: '', format, replace }, 'برداشتن رمز در صف قرار گرفت.')}>برداشتن رمز</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={!newPassword} onClick={() => void queue({ op: 'repack', newPassword, format, replace }, listing?.encrypted ? 'تغییر رمز در صف قرار گرفت.' : 'رمزگذاری در صف قرار گرفت.')}>{listing?.encrypted ? 'تغییر رمز' : 'گذاشتن رمز'}</button>
          </div>
          {entry.archive === 'rar' && !canRar && <small className="sa-hint">خروجی RAR به ابزار rar نیاز دارد؛ بدون آن نسخهٔ بی‌رمز/رمزدار به ZIP یا 7z ساخته می‌شود.</small>}
        </fieldset>
      </div>
      <div className="dl-archive-list">
        {listing && !listing.needsPassword && <><ArchiveEdits listing={listing} edits={edits} onChange={setEdits} onRead={async name => { const r = await api<{ content: string; stamp: string }>('/api/admin/server/downloads', { body: { op: 'archive-read', storage: 'local', path: entry.path, entry: name, password } }); if (!r.ok) throw new Error(r.error); if (listing.stamp && r.data.stamp !== listing.stamp) throw new Error('آرشیو تغییر کرده؛ فهرست را دوباره باز کنید'); return r.data.content }} /><p className="sa-hint">تغییرات محتوا در یک فایل تازه ثبت می‌شوند و فایل اصلی حفظ می‌شود. رمز فعلی برای نسخهٔ ویرایش‌شده حفظ می‌شود؛ برای برداشتن رمز از دکمهٔ مخصوص آن استفاده کنید.</p><button type="button" className="btn btn-primary" disabled={busy || !edits.length} onClick={() => void queue({ op: 'repack', edits, format, newPassword: password, replace: false }, 'ساخت نسخهٔ ویرایش‌شده در صف قرار گرفت.')}>ساخت نسخهٔ ویرایش‌شده ({edits.length})</button></>}
        {!listing ? <div className="sa-skeleton" style={{ height: 220 }} /> : listing.needsPassword ? <p className="sa-empty">فهرست فایل‌های این آرشیو رمزدار است؛ رمز را وارد کنید.</p> : <ul>
          <li className="sa-hint">{fa(listing.files)} فایل در فهرست بالا قابل جست‌وجو است.</li>
        </ul>}
      </div>
    </div>
  </section>
}

// ------------------------------------------------------------------ editor
