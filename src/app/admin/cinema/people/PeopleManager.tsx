'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { CinemaShell, Notice, fa, useJson } from '../shared'
import AdminPagination from '../../cms/AdminPagination'
import type { AdminPageSize } from '@/modules/content/domain/admin-pagination'
import PersonEditor from './PersonEditor'
import Portrait from '@/components/admin/ProfilePortrait'
import type { Detail, People } from './types'
import styles from '@/components/admin/ProfileManager.module.css'

export default function PeopleManager({ initialId }: { initialId: number | null }) {
  const [selected,setSelected]=useState<number|'new'|null>(initialId)
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[role,setRole]=useState('')
  const [page,setPage]=useState(1),[size,setSize]=useState<AdminPageSize>(20),[revision,setRevision]=useState(0)
  const url='/api/admin/cinema/people?'+new URLSearchParams({q:search,role,page:String(page),limit:String(size)})
  return <div className={styles.page}><CinemaShell title="بازیگران و کارگردان‌ها" actions={<button className="btn btn-primary" type="button" disabled={selected!==null} onClick={()=>setSelected('new')}>＋ پروفایل جدید</button>}>
    <div className={styles.intro}><div><span>چهره‌های سینما</span><h2>هر چهره، یک پروفایل ماندگار</h2><p>عکس و زندگی‌نامه را یک‌جا مدیریت کنید؛ ارتباط با فیلم‌ها و سریال‌ها حفظ می‌شود.</p></div><Link className="btn btn-ghost" href="/cinema/people">مشاهدهٔ فهرست عمومی ↗</Link></div>
    {selected!==null && <PersonLoader key={selected} id={selected} onClose={()=>setSelected(null)} onSaved={()=>setRevision(v=>v+1)} />}
    <section className="sa-card" aria-label="فهرست عوامل">
      <form className={styles.filters} onSubmit={e=>{e.preventDefault();setSearch(query.trim());setPage(1)}}>
        <div><label htmlFor="people-search">جست‌وجوی نام</label><div className={styles.search}><input id="people-search" className="input" value={query} onChange={e=>setQuery(e.target.value)} maxLength={150} placeholder="نام بازیگر یا کارگردان…"/><button className="btn btn-ghost" type="submit">جست‌وجو</button></div></div>
        <div><label htmlFor="people-role">نوع فعالیت</label><select id="people-role" className="select" value={role} onChange={e=>{setRole(e.target.value);setPage(1)}}><option value="">همهٔ عوامل</option><option value="CAST">بازیگران</option><option value="DIRECTOR">کارگردان‌ها</option><option value="PRODUCER">تهیه‌کننده‌ها</option><option value="uncredited">بدون اثر مرتبط</option></select></div>
      </form>
      <PeopleList key={url+':'+revision} url={url} size={size} selected={selected} onEdit={setSelected} onPage={setPage} onSize={value=>{setSize(value);setPage(1)}} />
    </section>
  </CinemaShell></div>
}

function PeopleList({url,size,selected,onEdit,onPage,onSize}:{url:string;size:AdminPageSize;selected:number|'new'|null;onEdit:(id:number)=>void;onPage:(page:number)=>void;onSize:(size:AdminPageSize)=>void}) {
  const {data,error,loading,reload}=useJson<People>(url)
  if(error)return <><Notice tone="error">{error}</Notice><button className="btn btn-ghost" type="button" onClick={()=>void reload()}>تلاش دوباره</button></>
  if(!data)return <Notice>در حال دریافت پروفایل‌ها…</Notice>
  return <div aria-busy={loading}>
    <div className={styles.count} role="status">{fa(data.total)} پروفایل · عکس‌ها و مشخصات مشترک در همهٔ آثار</div>
    {!data.people.length?<div className={styles.empty}><h3>پروفایلی پیدا نشد</h3><p>نام یا فیلتر را تغییر دهید، یا یک پروفایل جدید بسازید.</p></div>:<div className={styles.grid}>{data.people.map(person=><article className={styles.card} key={person.id}>
      <div className={styles.portrait}><Portrait image={person.image} name={person.name}/></div>
      <div className={styles.info}><h3 dir="auto">{person.name}</h3><p>{person.roles.map(role=>role==='DIRECTOR'?'کارگردان':role==='PRODUCER'?'تهیه‌کننده':'بازیگر').join(' · ')||'بدون اثر مرتبط'}</p><small>{fa(person.creditCount)} همکاری{person.imageLocked?' · عکس دستی محفوظ':''}</small></div>
      <div className={styles.actions}><button type="button" className="btn btn-ghost btn-sm" disabled={selected!==null} aria-label={`ویرایش ${person.name}`} aria-pressed={selected===person.id} onClick={()=>onEdit(person.id)}>ویرایش</button>{person.publicCredits>0&&<Link href={'/cinema/people/'+person.id} className="btn btn-ghost btn-sm" aria-label={`پروفایل ${person.name}`}>پروفایل ↗</Link>}</div>
    </article>)}</div>}
    <AdminPagination fa page={data.page} pages={data.pages} size={size} total={data.total} shown={data.people.length} busy={loading} onPage={onPage} onSize={onSize}/>
  </div>
}

function PersonLoader({id,onClose,onSaved}:{id:number|'new';onClose:()=>void;onSaved:()=>void}) {
  const [saved,setSaved]=useState(false)
  const {data,error,loading,reload,setData}=useJson<{person:Detail}>(id==='new'?null:'/api/admin/cinema/people?id='+id)
  const empty:Detail={id:0,name:'',normalizedName:'',image:'',bio:'',imageLocked:true,profileVersion:0,credits:[],moreCredits:false,publicCredits:0}
  if(error)return <section className="sa-card"><Notice tone="error">{error}</Notice><button type="button" className="btn btn-ghost" onClick={()=>void reload()}>تلاش دوباره</button><button type="button" className="btn btn-ghost" onClick={onClose}>بستن</button></section>
  if(id!=='new'&&!data)return <Notice>در حال دریافت مشخصات…</Notice>
  return <>{saved&&<Notice tone="ok">پروفایل ذخیره شد.</Notice>}<PersonEditor key={data?.person.profileVersion??'new'} person={data?.person||empty} loading={loading} onReload={()=>{setSaved(false);void reload()}} onClose={onClose} onSaved={person=>{setData({person:{...(data?.person||empty),...person}});setSaved(true);onSaved()}}/></>
}
