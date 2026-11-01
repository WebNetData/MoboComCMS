'use client'
import { useState } from 'react'
import { LibraryDialog } from '@/components/media/LibraryPicker'
import { readShowcase, EMPTY_SHOWCASE, WEB_LAYOUTS, type PromptShowcase } from '@/modules/prompts/domain/prompts'
import type { LibraryKind } from '@/modules/media/domain/library'
import ShowcasePreview from './ShowcasePreview'
import s from './PromptMaster.module.css'
import g from './PromptGallery.module.css'
export default function ShowcaseFields({value,kind,onChange}:{value:string;kind:string;onChange:(value:string)=>void}){
  let raw:Record<string,unknown>={};try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))raw=parsed}catch{/* keep empty draft */}
  const sample={...EMPTY_SHOWCASE,...Object.fromEntries(Object.keys(EMPTY_SHOWCASE).filter(key=>typeof raw[key]==='string').map(key=>[key,raw[key]]))} as PromptShowcase
  const [picking,setPicking]=useState<'cover'|'video'|null>(null)
  function change(key:keyof PromptShowcase,value:string){onChange(JSON.stringify({...sample,[key]:value}))}
  const names={none:'بدون پیش‌نمایش وب',landing:'لندینگ استودیوی خلاق',dashboard:'داشبورد محصول'}
  return <section className={g.showcaseFields} aria-labelledby="template-showcase-title"><h3 id="template-showcase-title">نمونهٔ خروجی و رسانه</h3><p>تصویر، ویدئو یا متن نتیجه را کنار پرامپت نمایش بده. انتخاب از کتابخانه همان فایل فعلی را استفاده می‌کند. واردکردن نشانی، دانلود خودکار انجام نمی‌دهد.</p>
    {(['cover','video'] as const).map(key=><div key={key} className={g.mediaField}><div><label className={s.field}>{key==='cover'?'نشانی تصویر نمونه یا پوستر':'نشانی مستقیم ویدئوی نمونه'}<input dir="ltr" value={sample[key]} maxLength={2048} onChange={e=>change(key,e.target.value)} placeholder={key==='cover'?'/api/media/covers/…':'https://…/sample.mp4'}/></label><button type="button" className={s.secondary} onClick={()=>setPicking(key)}>{key==='cover'?'انتخاب تصویر از کتابخانه':'انتخاب ویدئو از کتابخانه'}</button></div></div>)}
    <div className={s.twoFields}><label className={s.field}>توضیح جایگزین تصویر<input value={sample.alt} onChange={e=>change('alt',e.target.value)} maxLength={300}/></label><label className={s.field}>قاب کارت<select value={sample.aspect} onChange={e=>change('aspect',e.target.value)}><option value="square">مربع</option><option value="portrait">عمودی</option><option value="wide">عریض</option></select></label></div>
    <label className={s.field}>توضیح نمونه<textarea rows={2} value={sample.caption} onChange={e=>change('caption',e.target.value)} maxLength={1000}/></label><label className={s.field}>سازنده یا روش تهیهٔ نمونه<input value={sample.credit} onChange={e=>change('credit',e.target.value)} maxLength={160} placeholder="روش تهیه یا اعتبار منبع را دقیق بنویسید"/></label>
    <label className={s.field}>نمونهٔ نتیجهٔ متنی یا کد<textarea dir="auto" rows={6} value={sample.result} onChange={e=>change('result',e.target.value)} maxLength={12000}/><small>به‌صورت متن نمایش داده می‌شود؛ HTML یا JavaScript اجرا نمی‌شود.</small></label>
    <label className={s.field}>پیش‌نمایش ساختاری وب<select value={sample.webLayout} onChange={e=>change('webLayout',e.target.value)}>{WEB_LAYOUTS.map(key=><option key={key} value={key}>{names[key]}</option>)}</select></label><p>«ایدهٔ نمونه» باید متن دقیق پرامپت مربوط به این خروجی باشد. اگر نمونه را حذف می‌کنید، همهٔ رسانه‌ها و متن نتیجه را خالی و پیش‌نمایش وب را خاموش کنید.</p>
    <details><summary>پیش‌نمایش رسانهٔ انتخاب‌شده</summary><div className={g.adminSample}><ShowcasePreview sample={readShowcase(value)} kind={kind} title="پیش‌نمایش نمونه" compact/></div></details><button type="button" className={s.textButton} onClick={()=>onChange('{}')}>برداشتن نمونهٔ خروجی</button>
    {picking&&<LibraryDialog kind={(picking==='cover'?'image':'video') as LibraryKind} onClose={()=>setPicking(null)} onSelect={asset=>{change(picking,asset.url);setPicking(null)}}/>}
  </section>
}
