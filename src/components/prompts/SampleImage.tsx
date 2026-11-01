'use client'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/site/Icon'
import g from './PromptGallery.module.css'
export default function SampleImage({ src, alt }: { src: string; alt: string }) {
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null)
  useEffect(()=>{if(!open)return;const box=dialog.current,button=trigger.current;box?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{box?.close();document.body.style.overflow=before;button?.focus()}},[open])
  if(failed)return <div className={g.failedMedia} role="status"><Icon name="image" size={32}/><p>نمونهٔ تصویر بارگذاری نشد</p><button type="button" onClick={()=>setFailed(false)}>تلاش دوباره</button></div>
  return <><button ref={trigger} type="button" className={g.imageButton} onClick={()=>setOpen(true)} aria-label="بزرگ‌نمایی نمونهٔ تصویر"><img src={src} alt={alt} width={1400} height={1050} onError={()=>setFailed(true)} referrerPolicy="no-referrer"/><span><Icon name="search" size={16}/>بزرگ‌نمایی تصویر</span></button>{open&&<dialog ref={dialog} className={g.zoomDialog} onCancel={event=>{event.preventDefault();setOpen(false)}} aria-label="نمونهٔ تصویر در اندازهٔ بزرگ"><button type="button" className={g.closeZoom} onClick={()=>setOpen(false)} aria-label="بستن تصویر بزرگ">×</button><img src={src} alt={alt} referrerPolicy="no-referrer"/></dialog>}</>
}
