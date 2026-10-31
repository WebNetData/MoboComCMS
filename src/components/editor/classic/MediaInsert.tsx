'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LibraryPicker from '@/components/media/LibraryPicker'
import RemoteCopy from '@/components/media/RemoteCopy'
import { editorialMedia, editorialMediaHtml, embedOf } from '@/shared/media/editorial'
import Icon from '@/components/site/Icon'

function MediaDialog({ kind, onClose, onInsert }: { kind: 'video' | 'audio'; onClose: () => void; onInsert: (html: string) => void }) {
  const box = useRef<HTMLDialogElement>(null), id = useId()
  const [src, setSrc] = useState(''), [title, setTitle] = useState(''), [caption, setCaption] = useState(''), [poster, setPoster] = useState(''), [audioKind, setAudioKind] = useState('music'), [ratio, setRatio] = useState('16:9')
  const provider = embedOf(src)?.provider
  const checked = editorialMedia({ kind, src, title, caption, poster: provider ? '' : poster, audioKind, ratio })
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, dialog = box.current
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog?.showModal()
    return () => { dialog?.close(); document.body.style.overflow = overflow; before?.focus() }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(<dialog ref={box} className="ce-media-dialog" aria-labelledby={id+'-title'} onCancel={event => { event.preventDefault(); onClose() }}>
    <header><div><span>رسانه در محتوای شما</span><h2 id={id+'-title'}>{kind === 'video' ? 'درج ویدیو' : 'درج موسیقی و پادکست'}</h2></div><button type="button" className="btn btn-ghost" aria-label="بستن درج رسانه" onClick={onClose}>✕</button></header>
    <div className="ce-media-dialog-body">
      <p>{kind === 'video' ? 'لینک آپارات، یوتیوب، نماشا یا تماشا را وارد کنید؛ برای فایل ویدیویی، از کتابخانه انتخاب کنید یا لینک مستقیم بدهید.' : 'موسیقی، پادکست و ویس را با پلیر داخل همین نوشته قرار دهید. فایل را از کتابخانه انتخاب کنید یا لینک مستقیم بدهید.'}</p>
      <label htmlFor={id+'-src'}>لینک {kind === 'video' ? 'ویدیو' : 'فایل صوتی'}</label><input id={id+'-src'} autoFocus className="input" type="text" inputMode="url" dir="ltr" placeholder={kind === 'video' ? 'https://www.aparat.com/v/…' : 'https://…/audio.mp3'} value={src} onChange={event => setSrc(event.target.value.trim())} aria-invalid={!!src && !checked} aria-describedby={id+'-hint'} />
      <div className="ce-media-picker"><LibraryPicker kind={kind} onSelect={asset => { setSrc(asset.url); setTitle(asset.name); setCaption(asset.caption) }} />{!provider && <RemoteCopy url={src} kind="file" onCopied={setSrc} />}</div>
      <p id={id+'-hint'} className={src && !checked ? 'error-text' : 'muted'} role={src && !checked ? 'alert' : undefined}>{!src ? 'فایل‌های کتابخانه دوباره بارگذاری نمی‌شوند؛ لینک بیرونی هم تا انتخاب انتقال، بیرونی می‌ماند.' : !checked ? 'نشانی معتبر نیست؛ لینک HTTPS سرویس پشتیبانی‌شده یا فایل با پسوند صوتی/ویدیویی وارد کنید.' : provider ? `پلیر رسمی ${provider} · بدون دانلود مجدد` : 'فایل مستقیم · پخش با پلیر موبوکام'}</p>
      <label htmlFor={id+'-name'}>عنوان رسانه</label><input id={id+'-name'} className="input" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="عنوانی برای خواننده…" />
      {kind === 'audio' ? <div><label htmlFor={id+'-kind'}>نوع فایل صوتی</label><select id={id+'-kind'} className="select" value={audioKind} onChange={event => setAudioKind(event.target.value)}><option value="music">موسیقی</option><option value="podcast">پادکست</option><option value="voice">پیام صوتی</option></select></div> : <div><label htmlFor={id+'-ratio'}>نسبت تصویر</label><select id={id+'-ratio'} className="select" value={ratio} onChange={event => setRatio(event.target.value)}><option value="16:9">عریض 16:9</option><option value="4:3">کلاسیک 4:3</option><option value="1:1">مربع 1:1</option><option value="9:16">عمودی 9:16</option></select></div>}
      {!provider && <div><label htmlFor={id+'-poster'}>تصویر کاور (اختیاری)</label><input id={id+'-poster'} className="input" dir="ltr" value={poster} onChange={event => setPoster(event.target.value.trim())} placeholder="/api/media/covers/…" /><LibraryPicker kind="image" onSelect={asset => setPoster(asset.url)} /></div>}
      <label htmlFor={id+'-caption'}>توضیح زیر رسانه (اختیاری)</label><textarea id={id+'-caption'} className="input" maxLength={500} rows={2} value={caption} onChange={event => setCaption(event.target.value)} />
    </div>
    <footer><button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button><button type="button" className="btn btn-primary" disabled={!checked} onClick={() => { if (checked) { onInsert(editorialMediaHtml(checked)); onClose() } }}>درج در نوشته</button></footer>
  </dialog>, document.body)
}

export default function MediaInsert({ onInsert, onOpen }: { onInsert: (html: string) => void; onOpen: () => void }) {
  const [kind, setKind] = useState<'video' | 'audio' | null>(null)
  return <><button type="button" className="btn btn-ghost btn-sm ce-media" onClick={() => { onOpen(); setKind('video') }}><Icon name="video" size={16} />درج ویدیو</button><button type="button" className="btn btn-ghost btn-sm ce-media" onClick={() => { onOpen(); setKind('audio') }}><Icon name="music" size={16} />درج موسیقی و پادکست</button>{kind && <MediaDialog kind={kind} onInsert={onInsert} onClose={() => setKind(null)} />}</>
}
