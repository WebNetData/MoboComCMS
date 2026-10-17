'use client'
import { useState } from 'react'
import { IMAGE_WIDTHS } from '@/shared/media/image'
import { pictureHtml, type PictureChoice } from '@/modules/editor/domain/classic'
import type { LibraryAsset } from '@/modules/media/domain/library'
import { LibraryDialog } from '@/components/media/LibraryPicker'

function Insertion({ asset, onInsert }: { asset: LibraryAsset; onInsert: (html: string, choice: PictureChoice) => void }) {
  const [alt, setAlt] = useState(asset.alt), [caption, setCaption] = useState(asset.caption), [width, setWidth] = useState(0), [align, setAlign] = useState<PictureChoice['align']>('none')
  return <div className="mcl-insertion"><img src={asset.url} alt="" /><label>متن جایگزین<input className="input" value={alt} maxLength={500} onChange={e => setAlt(e.target.value)} /></label><label>زیرنویس<input className="input" value={caption} maxLength={2000} onChange={e => setCaption(e.target.value)} /></label><label>اندازه<select className="select" value={width} onChange={e => setWidth(Number(e.target.value))}><option value={0}>اندازهٔ کامل</option>{IMAGE_WIDTHS.filter(w => w >= 320).map(w => <option key={w} value={w}>{w} پیکسل</option>)}</select></label><label>چیدمان<select className="select" value={align} onChange={e => setAlign(e.target.value as PictureChoice['align'])}><option value="none">بدون چیدمان</option><option value="center">وسط</option><option value="right">راست</option><option value="left">چپ</option></select></label><button type="button" className="btn btn-primary" onClick={() => { const choice = { url: asset.url, alt, caption, width, align }; onInsert(pictureHtml(choice), choice) }}>افزودن به نوشته</button></div>
}
export default function MediaLibrary({ onClose, onInsert }: { onClose: () => void; onInsert: (html: string, choice: PictureChoice) => void }) {
  return <LibraryDialog kind="image" onClose={onClose} renderSelection={asset => <Insertion key={asset.id} asset={asset} onInsert={onInsert} />} />
}
