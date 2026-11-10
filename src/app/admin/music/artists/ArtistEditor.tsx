'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import ContentEditor from '@/components/editor/ContentEditor'
import FileUpload from '@/components/admin/FileUpload'
import RemoteCopy from '@/components/media/RemoteCopy'
import Portrait from '@/components/admin/ProfilePortrait'
import ProfileMergePanel from '@/components/admin/ProfileMergePanel'
import { OrganizationScope } from '@/components/media/OrganizationScope'
import AiAutofill from '../../cms/AiAutofill'
import type { AutofillField } from '@/modules/ai/domain/autofill'
import { Notice, send, fa } from '../shared'
import { ARTISTS_API, type Artist, type Work } from './types'
import styles from '@/components/admin/ProfileManager.module.css'

// What the assistant may fill on an artist: names and biography. Pictures, featured and merging stay with the editor.
const AI_FIELDS: AutofillField[] = [
  { key: 'name', label: 'نام نمایشی فارسی خواننده یا هنرمند', type: 'text' },
  { key: 'nameEn', label: 'نام لاتین یا نام هنری دیگر', type: 'text', dir: 'ltr' },
  { key: 'bio', label: 'زندگی‌نامه و فعالیت‌های هنری با تیترهای فرعی', type: 'richtext' },
]

export default function ArtistEditor({artist,loading,onReload,onSaved,onClose}:{artist:Artist;loading:boolean;onReload:()=>void;onSaved:(id:number)=>void;onClose:()=>void}) {
  const [name,setName]=useState(artist.name),[nameEn,setNameEn]=useState(artist.nameEn),[image,setImage]=useState(artist.image),[cover,setCover]=useState(artist.cover),[bio,setBio]=useState(artist.bio),[featured,setFeatured]=useState(artist.featured)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<'close'|'reload'|null>(null)
  const dirty=changed(artist,{name,nameEn,image,cover,bio,featured})
  const disabled=busy||loading||!artist.profileCanEdit
  function leave(action:'close'|'reload'){if(dirty){setConfirm(action);return}if(action==='close')onClose();else onReload()}
  async function save(){
    setBusy(true);setError('')
    const result=await send<{id:number}>(ARTISTS_API,artist.id?'PATCH':'POST',{...(artist.id?{id:artist.id,expectedUpdatedAt:artist.updatedAt}:{}),name,nameEn,image,cover,bio,featured})
    setBusy(false)
    if(!result.ok){setError(result.error);return}
    onSaved(result.data.id)
  }
  return <section className="sa-card" aria-labelledby="artist-editor-title">
    <header className={styles.editorHead}><div><span className={styles.eyebrow}>{artist.id?'پروفایل هنرمند':'هنرمند جدید'}</span><h2 id="artist-editor-title">{artist.name||'ثبت خواننده یا هنرمند'}</h2></div><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>leave('close')}>بستن</button></header>
    {confirm&&<div className={styles.confirm} role="alert"><p>تغییرات ذخیره نشده است. از تغییرات صرف‌نظر شود؟</p><button type="button" className="btn btn-ghost" onClick={()=>{const action=confirm;setConfirm(null);if(action==='close')onClose();else onReload()}}>بله، صرف‌نظر شود</button><button type="button" className="btn btn-primary" onClick={()=>setConfirm(null)}>ادامهٔ ویرایش</button></div>}
    {!artist.profileCanEdit&&<Notice>این هنرمند مشترک است؛ ویرایش آن با سازنده یا مدیر موزیک است.</Notice>}
    {error&&<Notice tone="error">{error}</Notice>}
    {artist.profileCanEdit&&<AiAutofill section="music-artists" fields={AI_FIELDS} form={{name,nameEn,bio}} onApply={values=>{if(typeof values.name==='string')setName(values.name);if(typeof values.nameEn==='string')setNameEn(values.nameEn);if(typeof values.bio==='string')setBio(values.bio)}}/>}
    <form onSubmit={e=>{e.preventDefault();void save()}}>
      <fieldset disabled={disabled} className={styles.fields}><legend className="sr-only">مشخصات خواننده</legend>
        <div className={styles.editorGrid}>
          <OrganizationScope value={{section:'music',artist:nameEn||name,artistImage:true}}><div className="sa-stack"><ArtistImage id="artist-image" label="عکس پروفایل" role="avatar" value={image} name={name} onChange={setImage}/><ArtistImage id="artist-cover" label="کاور صفحهٔ هنرمند" role="cover" value={cover} name={name} onChange={setCover}/></div></OrganizationScope>
          <div className={styles.biography}>
            <label htmlFor="artist-name">نام نمایشی خواننده</label><input id="artist-name" name="name" className="input" dir="auto" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/>
            <label htmlFor="artist-alias">نام لاتین یا نام هنری دیگر</label><input id="artist-alias" name="nameEn" className="input" dir="auto" maxLength={160} value={nameEn} onChange={e=>setNameEn(e.target.value)} autoComplete="off"/>
            <small>تغییر نام، نشانی هنرمند و ارتباط با آهنگ‌ها و آلبوم‌ها را تغییر نمی‌دهد.</small>
            <label className="sa-check"><input type="checkbox" checked={featured} onChange={e=>setFeatured(e.target.checked)}/>هنرمند ویژه</label>
            <h3>زندگی‌نامه</h3>{artist.profileCanEdit?<div inert={busy||loading}><ContentEditor value={bio} onChange={setBio} assetSection="music" minHeight={340} placeholder="زندگی‌نامه و فعالیت‌های هنری…"/></div>:<p>زندگی‌نامه را در پروفایل عمومی هنرمند ببینید.</p>}
            <small>{fa(bio.length)} از ۲۰٬۰۰۰ نویسه · ورود گروهی، مشخصات هنرمند موجود را بازنویسی نمی‌کند.</small>
          </div>
        </div>
        <SaveActions artist={artist} disabled={disabled||bio.length>20000} busy={busy} onReload={()=>leave('reload')}/>
      </fieldset>
    </form>
    {artist.id>0&&<p className={styles.count}><Link href={'/music/artist/'+artist.slug}>مشاهدهٔ پروفایل عمومی ↗</Link> · <span dir="ltr">/music/artist/{artist.slug}</span></p>}
    {artist.id>0&&artist.profileCanEdit&&<Link className="btn btn-ghost btn-sm" href={'/admin/history?type=music-artists&id='+artist.id}>تاریخچهٔ تغییرات</Link>}
    <ArtistWorks artist={artist}/>
    {artist.id > 0 && artist.profileCanMerge && !dirty && <ProfileMergePanel key={artist.id} sourceId={artist.id} endpoint="/api/admin/music/artists/merge" editor="/admin/music/artists" />}
  </section>
}

function changed(artist:Artist,draft:Pick<Artist,'name'|'nameEn'|'image'|'cover'|'bio'|'featured'>) {
  return (Object.keys(draft) as (keyof typeof draft)[]).some(key=>draft[key]!==artist[key])
}
function SaveActions({artist,disabled,busy,onReload}:{artist:Artist;disabled:boolean;busy:boolean;onReload:()=>void}) {
  if(!artist.profileCanEdit)return null
  return <footer className={styles.saveBar}><button type="submit" className="btn btn-primary" disabled={disabled}>{busy?'در حال ذخیره…':'ذخیرهٔ هنرمند'}</button>{artist.id>0&&<button type="button" className="btn btn-ghost" onClick={onReload}>دریافت نسخهٔ تازه</button>}</footer>
}

function ArtistImage({id,label,role,value,name,onChange}:{id:string;label:string;role:'avatar'|'cover';value:string;name:string;onChange:(value:string)=>void}) {
  return <section className={styles.photoPanel} aria-label={`${label}: انتخاب رسانه`}>
    <div className={styles.preview}><Portrait image={value} name={name}/></div>
    <label htmlFor={id}>{label}</label><input id={id} name={id} className="input" dir="ltr" value={value} onChange={e=>onChange(e.target.value)} maxLength={2048} placeholder="https://… یا /files/…" autoComplete="off" spellCheck={false}/>
    <FileUpload section="music" accept="image/*" role={role} label="بارگذاری عکس" onUploaded={file=>onChange(file.url)}/><RemoteCopy section="music" url={value} onCopied={onChange}/>
    {value&&<button type="button" className="btn btn-ghost btn-sm" onClick={()=>onChange('')}>حذف {label}</button>}
    <small>حذف عکس از پروفایل، فایل اصلی کتابخانه را پاک نمی‌کند.</small>
  </section>
}

function ArtistWorks({artist}:{artist:Artist}) {
  const lists:{label:string;tab:string;rows:Work[];count:number}[]=[{label:'آهنگ‌ها',tab:'tracks',rows:artist.tracks||[],count:artist._count.tracks},{label:'آلبوم‌ها',tab:'albums',rows:artist.albums||[],count:artist._count.albums}]
  return <details className={styles.credits}><summary>آثار مرتبط · {fa(artist._count.tracks)} آهنگ · {fa(artist._count.albums)} آلبوم</summary>{lists.map(list=><section key={list.tab}><h3>{list.label}</h3>{list.rows.length?<ul>{list.rows.map(work=><li key={work.id}><Link href={`/admin/music/library?tab=${list.tab}&edit=${work.id}`}>{work.title}</Link><span>{work.status==='PUBLISHED'?'منتشرشده':'پیش‌نویس'}</span></li>)}</ul>:<p>اثری با دسترسی فعلی شما برای نمایش وجود ندارد.</p>}{list.count>30&&<small>۳۰ اثر آخر در دسترس نمایش داده شده است.</small>}</section>)}</details>
}
