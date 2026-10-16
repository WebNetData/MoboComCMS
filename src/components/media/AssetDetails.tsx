'use client'
import { useState } from 'react'
import type { LibraryAsset, LibraryFolder } from '@/modules/media/domain/library'
import { formatBytes } from './api'
export default function AssetDetails({ asset, folders, onSave }: { asset: LibraryAsset; folders: LibraryFolder[]; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(asset.name), [alt, setAlt] = useState(asset.alt), [caption, setCaption] = useState(asset.caption), [tags, setTags] = useState(asset.tags.join('، ')), [folder, setFolder] = useState(String(asset.folderId || ''))
  return <form className="mcl-details" onSubmit={e => { e.preventDefault(); void onSave({ name, alt, caption, tags, folderId: folder || null }) }}>
    {asset.kind === 'image' ? <img src={asset.url} alt={asset.alt} /> : <div className="mcl-file-symbol">{asset.kind === 'video' ? '▷' : asset.kind === 'audio' ? '♫' : '▤'}</div>}
    <div className="mcl-detail-meta"><span>{asset.mime}</span><b dir="ltr">{formatBytes(Number(asset.bytes))}</b>{asset.width > 0 && <span>{asset.width} × {asset.height}</span>}</div>
    <label>نام نمایشی<input className="input" value={name} maxLength={120} disabled={!asset.editable} onChange={e => setName(e.target.value)} required /></label>
    <label>متن جایگزین<input className="input" value={alt} maxLength={500} disabled={!asset.editable} onChange={e => setAlt(e.target.value)} /></label>
    <label>توضیح / زیرنویس<textarea className="input" value={caption} maxLength={2000} disabled={!asset.editable} onChange={e => setCaption(e.target.value)} /></label>
    <label>برچسب‌ها<input className="input" value={tags} placeholder="آموزش، محصول، کاور" disabled={!asset.editable} onChange={e => setTags(e.target.value)} /></label>
    <label>پوشه<select className="select" value={folder} disabled={!asset.editable} onChange={e => setFolder(e.target.value)}><option value="">بدون پوشه</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name} (#{f.id})</option>)}</select></label>
    {asset.editable && <button className="btn btn-primary" type="submit">ذخیرهٔ اطلاعات</button>}
    <label>نشانی ثابت<input className="input" dir="ltr" readOnly value={asset.url} onFocus={e => e.target.select()} /></label>
    <small>تغییر نام یا پوشه، نشانی فایل‌های استفاده‌شده در مطالب را عوض نمی‌کند.</small>
    <a className="btn btn-ghost" href={asset.url} target="_blank" rel="noopener noreferrer">باز کردن فایل ↗</a>
  </form>
}
