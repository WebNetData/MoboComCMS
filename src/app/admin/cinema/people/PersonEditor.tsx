'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import ContentEditor from '@/components/editor/ContentEditor'
import FileUpload from '@/components/admin/FileUpload'
import RemoteCopy from '@/components/media/RemoteCopy'
import { Notice, send, fa } from '../shared'
import type { Detail, Profile } from './types'
import styles from '@/components/admin/ProfileManager.module.css'
import Portrait from '@/components/admin/ProfilePortrait'
import ProfileMergePanel from '@/components/admin/ProfileMergePanel'
import { OrganizationScope } from '@/components/media/OrganizationScope'
import AiAutofill from '../../cms/AiAutofill'
import type { AutofillField } from '@/modules/ai/domain/autofill'

// What the assistant may fill on a cast or crew profile: the name and biography. The photo and its lock stay with the editor.
const AI_FIELDS: AutofillField[] = [
  { key: 'name', label: 'نام نمایشی (فارسی، مثل نام رایج در سایت‌های فیلم)', type: 'text' },
  { key: 'bio', label: 'زندگی‌نامه و فعالیت‌های هنری با تیترهای فرعی', type: 'richtext' },
]

export default function PersonEditor({person,loading,onReload,onSaved,onClose}:{person:Detail;loading:boolean;onReload:()=>void;onSaved:(person:Profile)=>void;onClose:()=>void}) {
  const [name,setName]=useState(person.name),[image,setImage]=useState(person.image),[bio,setBio]=useState(person.bio),[locked,setLocked]=useState(person.imageLocked)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<'close'|'reload'|null>(null)
  const dirty=name!==person.name||image!==person.image||bio!==person.bio||locked!==person.imageLocked
  function leave(action:'close'|'reload'){if(dirty){setConfirm(action);return}if(action==='close')onClose();else onReload()}
  function photo(url:string){setImage(url);setLocked(true)}
  async function save(){
    setBusy(true);setError('')
    const result=await send<{person:Profile}>('/api/admin/cinema/people',person.id?'PATCH':'POST',{...(person.id?{id:person.id,profileVersion:person.profileVersion}:{}),name,image,bio,imageLocked:locked})
    setBusy(false)
    if(!result.ok){setError(result.error);return}
    onSaved(result.data.person)
  }
  if(person.mergedIntoId)return <section className="sa-card"><Notice>این پروفایل ادغام شده است و اطلاعات آن از پروفایل اصلی مدیریت می‌شود.</Notice><Link href={`/admin/cinema/people?edit=${person.mergedIntoId}`} className="btn btn-primary">باز کردن پروفایل اصلی</Link></section>
  return <section className="sa-card" aria-labelledby="person-editor-title">
    <header className={styles.editorHead}><div><span className={styles.eyebrow}>{person.id?'ویرایش پروفایل':'چهرهٔ جدید'}</span><h2 id="person-editor-title">{person.name||'ثبت بازیگر یا کارگردان'}</h2></div><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>leave('close')}>بستن</button></header>
    {confirm&&<div className={styles.confirm} role="alert"><p>تغییرات ذخیره نشده است. از تغییرات صرف‌نظر شود؟</p><button className="btn btn-ghost" type="button" onClick={()=>{const action=confirm;setConfirm(null);if(action==='close')onClose();else onReload()}}>بله، صرف‌نظر شود</button><button className="btn btn-primary" type="button" onClick={()=>setConfirm(null)}>ادامهٔ ویرایش</button></div>}
    {error&&<Notice tone="error">{error}</Notice>}
    <AiAutofill section="cinema-people" fields={AI_FIELDS} form={{name,bio}} onApply={values=>{if(typeof values.name==='string')setName(values.name);if(typeof values.bio==='string')setBio(values.bio)}}/>
    <form onSubmit={e=>{e.preventDefault();void save()}}>
      <fieldset disabled={busy||loading} className={styles.fields}>
        <legend className="sr-only">مشخصات عوامل</legend>
        <div className={styles.editorGrid}>
          {/* Photos are filed at download/cinema/images/<actors|director>/<name>: director only when every credit is directing. */}
          <OrganizationScope value={{section:'cinema-person',title:name,personRole:person.credits.length&&person.credits.every(credit=>credit.role==='DIRECTOR')?'director':'actor'}}><PhotoPanel image={image} name={name} locked={locked} onPhoto={photo} onLock={setLocked}/></OrganizationScope>
          <div className={styles.biography}>
            <label htmlFor="person-name">نام نمایشی</label><input id="person-name" className="input" dir="auto" required maxLength={120} minLength={2} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/>
            <small>تغییر نام نمایشی، شناسه و ارتباط با آثار را تغییر نمی‌دهد.</small>
            <h3>زندگی‌نامه</h3><ContentEditor value={bio} onChange={setBio} assetSection="cinema" minHeight={280} placeholder="زندگی‌نامه و فعالیت‌های هنری…"/>
            <small>{fa(bio.length)} از ۳۰٬۰۰۰ نویسه · نقش بازیگر یا کارگردان از آثار مرتبط مشخص می‌شود.</small>
          </div>
        </div>
        <footer className={styles.saveBar}><button className="btn btn-primary" type="submit" disabled={busy||loading||bio.length>30000}>{busy?'در حال ذخیره…':'ذخیرهٔ پروفایل'}</button>{person.id>0&&<button className="btn btn-ghost" type="button" onClick={()=>leave('reload')}>دریافت نسخهٔ تازه</button>}{person.publicCredits>0&&<Link className="btn btn-ghost" href={'/cinema/people/'+person.id}>مشاهدهٔ عمومی ↗</Link>}</footer>
      </fieldset>
    </form>
    <Credits person={person}/>
    {person.id > 0 && !dirty && <ProfileMergePanel key={person.id} sourceId={person.id} endpoint="/api/admin/cinema/people/merge" editor="/admin/cinema/people" />}
  </section>
}

function PhotoPanel({image,name,locked,onPhoto,onLock}:{image:string;name:string;locked:boolean;onPhoto:(url:string)=>void;onLock:(value:boolean)=>void}) {
  return <section className={styles.photoPanel} aria-label="عکس پروفایل">
    <div className={styles.preview}><Portrait image={image} name={name}/></div>
    <label htmlFor="person-image">نشانی عکس</label><input id="person-image" className="input" dir="ltr" value={image} onChange={e=>onPhoto(e.target.value)} maxLength={2048} placeholder="https://… یا /files/…"/>
    <FileUpload section="cinema" accept="image/*" role="avatar" label="بارگذاری عکس" onUploaded={file=>onPhoto(file.url)}/>
    <RemoteCopy section="cinema" url={image} onCopied={onPhoto}/>
    {image&&<button type="button" className="btn btn-ghost btn-sm" onClick={()=>onPhoto('')}>حذف عکس از پروفایل</button>}
    <label className={styles.check}><input type="checkbox" checked={locked} onChange={e=>onLock(e.target.checked)}/>حفظ عکس دستی هنگام دریافت اطلاعات فیلم</label>
    <small>با فعال بودن این گزینه، حتی حذف دستی عکس هم در همگام‌سازی بعدی حفظ می‌شود. فایل اصلی از کتابخانه حذف نمی‌شود.</small>
  </section>
}

function Credits({person}:{person:Detail}) {
  return <details className={styles.credits}><summary>آثار مرتبط · {fa(person.credits.length)}{person.moreCredits?' +':''}</summary>{person.credits.length?<ul>{person.credits.map(credit=><li key={credit.id}><Link href={'/admin/cinema/titles?edit='+credit.title.id}>{credit.title.title}</Link><span>{credit.role==='DIRECTOR'?'کارگردان':credit.role==='PRODUCER'?'تهیه‌کننده':'بازیگر'}{credit.character?' · '+credit.character:''} · {credit.title.status==='PUBLISHED'?'منتشرشده':'پیش‌نویس'}</span></li>)}</ul>:<p>هنوز اثری به این پروفایل متصل نیست؛ تا انتشار اثر مرتبط، در فهرست عمومی نمایش داده نمی‌شود.</p>}{person.moreCredits&&<p>۱۰۰ همکاری نخست نمایش داده شده است.</p>}</details>
}
