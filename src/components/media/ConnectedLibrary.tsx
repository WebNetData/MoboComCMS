'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { libraryKind, type LibraryAsset, type LibraryKind } from '@/modules/media/domain/library'
import { contentTypeFor } from '@/modules/downloads/domain/mask'
const ConnectedDownloads = dynamic(() => import('@/components/server/ConnectedDownloads'), { ssr: false, loading: () => <p role="status">بارگیری فضاهای متصل…</p> })
export default function ConnectedLibrary({ initialPath, kind, onSelect }: { initialPath?: string; kind?: LibraryKind; onSelect?: (asset: LibraryAsset) => void }) {
  const [message, setMessage] = useState('')
  return <div className="mcl-connected"><p>فایل‌های فضاهای متصل مستقیم از همان هاست خوانده می‌شوند. برای درج در محتوا، نشانی عمومی فایل‌ها را تنظیم کنید. ابزار آرشیو روی نسخهٔ محلی کار می‌کند؛ فایل دوردست را با «ارسال به فضای دیگر» به همین سرور کپی کنید.</p><p role="alert">{message}</p><ConnectedDownloads initialPath={initialPath} onPick={onSelect ? entry => { const mime = contentTypeFor(entry.name, null), actualKind = libraryKind(mime, entry.name); if (kind && kind !== actualKind) { setMessage('نوع فایل با این فیلد مطابقت ندارد'); return } onSelect({ id: `connected:${entry.path}`, name: entry.name, url: entry.url, mime, kind: actualKind, bytes: String(entry.size), width: 0, height: 0, alt: '', caption: '', tags: [], folderId: null, revision: 0, archivedAt: null, editable: false }) } : undefined} /></div>
}
