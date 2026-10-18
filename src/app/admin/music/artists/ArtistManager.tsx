'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import Portrait from '@/components/admin/ProfilePortrait'
import AdminPagination from '../../cms/AdminPagination'
import BulkActions, { runBulkAction, type BulkAction } from '../../cms/BulkActions'
import type { AdminPageSize } from '@/modules/content/domain/admin-pagination'
import { MusicShell, Notice, fa, useJson } from '../shared'
import ArtistEditor from './ArtistEditor'
import { ARTISTS_API, type Artist, type ArtistPage } from './types'
import styles from '@/components/admin/ProfileManager.module.css'

export default function ArtistManager({initialId,initialFilter}:{initialId:number|null;initialFilter:string}) {
  const [selected,setSelected]=useState<number|'new'|null>(initialId)
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState(initialFilter)
  const [page,setPage]=useState(1),[size,setSize]=useState<AdminPageSize>(20),[revision,setRevision]=useState(0),[saved,setSaved]=useState(false)
  const url=ARTISTS_API+'&'+new URLSearchParams({paged:'1',q:search,profileFilter:filter,page:String(page),limit:String(size)})
  function open(id:number|'new'){setSelected(id);setSaved(false)}
  return <div className={`${styles.page} ${styles.music}`}><MusicShell title="خواننده‌ها و هنرمندان" actions={<button type="button" className="btn btn-primary" disabled={selected!==null} onClick={()=>open('new')}>＋ هنرمند جدید</button>}>
    <div className={styles.intro}><div><span>چهره‌های موسیقی</span><h2>همهٔ هنرمندان، در یک کتابخانه</h2><p>عکس، کاور و زندگی‌نامه را مدیریت کنید؛ آهنگ‌ها، آلبوم‌ها و نشانی هنرمند حفظ می‌شوند.</p></div><Link href="/music/artists" className="btn btn-ghost">فهرست عمومی هنرمندان ↗</Link></div>
    {saved&&<Notice tone="ok">پروفایل هنرمند ذخیره شد.</Notice>}
    {selected!==null&&<ArtistLoader key={selected} id={selected} onClose={()=>setSelected(null)} onSelect={setSelected} onSaved={()=>{setSaved(true);setRevision(v=>v+1)}}/>}
    <section className="sa-card" aria-label="فهرست هنرمندان">
      <form className={styles.filters} onSubmit={e=>{e.preventDefault();setSearch(query.trim());setPage(1)}}>
        <div><label htmlFor="artist-search">جست‌وجوی خواننده</label><div className={styles.search}><input id="artist-search" name="q" className="input" value={query} maxLength={150} onChange={e=>setQuery(e.target.value)} placeholder="نام، نام لاتین یا نشانی…" autoComplete="off"/><button type="submit" className="btn btn-ghost">جست‌وجو</button></div></div>
        <div><label htmlFor="artist-filter">وضعیت پروفایل</label><select id="artist-filter" className="select" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="">همهٔ هنرمندان</option><option value="missing-image">بدون عکس پروفایل</option><option value="featured">هنرمندان ویژه</option><option value="unlinked">بدون آهنگ و آلبوم</option></select></div>
      </form>
      <ArtistList key={url+':'+revision} url={url} size={size} selected={selected} onEdit={open} onPage={setPage} onSize={value=>{setSize(value);setPage(1)}}/>
    </section>
  </MusicShell></div>
}

function ArtistList({url,size,selected,onEdit,onPage,onSize}:{url:string;size:AdminPageSize;selected:number|'new'|null;onEdit:(id:number)=>void;onPage:(value:number)=>void;onSize:(value:AdminPageSize)=>void}) {
  const {data,error,loading,reload}=useJson<ArtistPage>(url)
  const [checked,setChecked]=useState<number[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[notice,setNotice]=useState('')
  const checkedIds=new Set(checked)
  function toggle(id:number){setChecked(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
  async function apply(action:BulkAction){
    if(action!=='delete'||!checked.length||busy||selected!==null)return
    setBusy(true);setNotice('');setProgress(0)
    try{
      const result=await runBulkAction('/api/admin/media-library','music-artists',checked,action,setProgress)
      setChecked(result.failed.map(row=>row.id))
      setNotice(`${fa(result.succeeded.length)} هنرمند حذف شد.${result.failed.length?' '+result.failed.slice(0,3).map(row=>row.reason).join('، '):''}`)
      await reload()
    }catch{setNotice('دریافت نتیجه ناموفق بود؛ پیش از تکرار، فهرست را تازه کنید.')}
    finally{setBusy(false)}
  }
  if(error)return <><Notice tone="error">{error}</Notice><button type="button" className="btn btn-ghost" onClick={()=>void reload()}>تلاش دوباره</button></>
  if(!data)return <Notice>در حال دریافت هنرمندان…</Notice>
  return <div aria-busy={loading}>
    <p className={styles.count} role="status">{fa(data.total)} هنرمند{data.mine?' · ویرایش فقط برای هنرمندانی که خودتان ساخته‌اید فعال است.':''}</p>
    {!data.mine&&data.rows.length>0&&<div className={styles.selection}>
      <label className="sa-check"><input type="checkbox" checked={data.rows.every(row=>checkedIds.has(row.id))} disabled={busy||selected!==null} onChange={()=>setChecked(checked.length===data.rows.length?[]:data.rows.map(row=>row.id))}/>انتخاب همهٔ این صفحه</label>
      <small>حذف هنرمند، آهنگ‌ها و آلبوم‌های وابسته را هم حذف می‌کند و قابل بازگشت نیست.</small>
      <BulkActions count={checked.length} canPublish={false} fa busy={busy||selected!==null} progress={progress} onApply={apply} onClear={()=>setChecked([])}/>
    </div>}
    {notice&&<Notice>{notice}</Notice>}
    {!data.rows.length?<div className={styles.empty}><h3>هنرمندی پیدا نشد</h3><p>نام یا فیلتر را تغییر دهید، یا یک هنرمند جدید بسازید.</p></div>:<div className={styles.grid}>{data.rows.map(artist=><article key={artist.id} className={styles.card}>
      {!data.mine&&<input type="checkbox" aria-label={`انتخاب ${artist.name}`} checked={checkedIds.has(artist.id)} disabled={busy||selected!==null} onChange={()=>toggle(artist.id)}/>}
      <div className={styles.portrait}><Portrait image={artist.image} name={artist.name}/></div>
      <div className={styles.info}><h3 dir="auto">{artist.name}</h3>{artist.nameEn&&<p dir="auto">{artist.nameEn}</p>}<small>{fa(artist._count.tracks)} آهنگ · {fa(artist._count.albums)} آلبوم{artist.featured?' · ویژه':''}</small></div>
      <div className={styles.actions}><button type="button" className="btn btn-ghost btn-sm" disabled={busy||selected!==null} onClick={()=>onEdit(artist.id)} aria-label={`${artist.profileCanEdit?'ویرایش':'مشاهدهٔ مشخصات'} ${artist.name}`}>{artist.profileCanEdit?'ویرایش':'مشاهدهٔ مشخصات'}</button><Link className="btn btn-ghost btn-sm" href={'/music/artist/'+artist.slug} aria-label={`پروفایل ${artist.name}`}>پروفایل ↗</Link></div>
    </article>)}</div>}
    <AdminPagination fa page={data.page} pages={data.pages} size={size} total={data.total} shown={data.rows.length} busy={loading||busy} onPage={onPage} onSize={onSize}/>
  </div>
}

function ArtistLoader({id,onClose,onSelect,onSaved}:{id:number|'new';onClose:()=>void;onSelect:(id:number)=>void;onSaved:()=>void}) {
  const {data,error,loading,reload}=useJson<Artist[]>(id==='new'?null:ARTISTS_API+'&id='+id)
  const empty:Artist={id:0,slug:'',name:'',nameEn:'',image:'',cover:'',bio:'',featured:false,updatedAt:'',profileCanEdit:true,_count:{tracks:0,albums:0}}
  if(error)return <section className="sa-card"><Notice tone="error">{error}</Notice><button type="button" className="btn btn-ghost" onClick={()=>void reload()}>تلاش دوباره</button><button type="button" className="btn btn-ghost" onClick={onClose}>بستن</button></section>
  if(id!=='new'&&!data)return <Notice>در حال دریافت مشخصات هنرمند…</Notice>
  if(id!=='new'&&!data?.[0])return <section className="sa-card"><Notice tone="error">هنرمند پیدا نشد.</Notice><button type="button" className="btn btn-ghost" onClick={onClose}>بستن</button></section>
  return <ArtistEditor key={data?.[0]?.updatedAt||'new'} artist={data?.[0]||empty} loading={loading} onReload={()=>void reload()} onClose={onClose} onSaved={savedId=>{onSaved();if(id==='new')onSelect(savedId);else void reload()}}/>
}
