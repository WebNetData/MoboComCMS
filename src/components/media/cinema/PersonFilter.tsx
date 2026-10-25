'use client'

import { useEffect,useId,useRef,useState,type KeyboardEvent } from 'react'
import Icon from '@/components/site/Icon'
import styles from './discovery.module.css'

export type PersonChoice={id:number;name:string;image:string}
export default function PersonFilter({role,initial,value,fa}:{role:'CAST'|'DIRECTOR'|'PRODUCER';initial:PersonChoice|null;value?:string;fa:boolean}) {
  const id=useId(),input=useRef<HTMLInputElement>(null)
  const [choice,setChoice]=useState(initial),[query,setQuery]=useState(initial?.name||''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[retry,setRetry]=useState(0)
  const [cleared,setCleared]=useState(false)
  const key=open&&query.trim().length>=2?role+':'+query.trim()+':'+retry:''
  const {options,status}=usePeopleOptions(key,role,query)
  const label=role==='CAST'?(fa?'بازیگر':'Actor'):role==='PRODUCER'?(fa?'تهیه‌کننده':'Producer'):(fa?'کارگردان':'Director')
  const invalid=!!value&&!initial&&!cleared&&!choice&&!query
  function choose(person:PersonChoice|null){setCleared(true);setChoice(person);setQuery(person?.name||'');setOpen(false);setActive(-1);input.current?.setCustomValidity('');input.current?.focus()}
  function keyboard(event:KeyboardEvent<HTMLInputElement>){
    if(event.key==='Escape'){setOpen(false);setActive(-1);return}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setOpen(true)
      if(options.length)setActive(current=>event.key==='ArrowDown'?(current+1)%options.length:(current<=0?options.length-1:current-1))
    }else if(event.key==='Enter'&&open&&active>=0&&options[active]){event.preventDefault();choose(options[active])}
  }
  const show=open&&query.trim().length>=2
  return <div className={styles.personFilter} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
    <label htmlFor={id}>{label}</label>
    <input type="hidden" name={role==='CAST'?'actor':role==='PRODUCER'?'producer':'director'} value={choice?.id||(invalid?value:'')}/>
    <div className={styles.personInput}>
      <input ref={input} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={id+'-list'} aria-activedescendant={show&&active>=0&&options[active]?id+'-'+options[active].id:undefined} aria-describedby={id+'-hint'} autoComplete="off" dir="auto" maxLength={60} value={query} placeholder={fa?'نام را بنویسید و انتخاب کنید…':'Type a name and select…'} onFocus={()=>setOpen(true)} onKeyDown={keyboard} onChange={event=>{setCleared(true);setQuery(event.target.value);setChoice(null);setActive(-1);setOpen(true);event.target.setCustomValidity(event.target.value.trim()?(fa?'یک نام را از پیشنهادها انتخاب کنید':'Select a name from the suggestions'):'')}}/>
      {(query||invalid)&&<button type="button" aria-label={fa?'پاک کردن '+label:'Clear '+label} onClick={()=>choose(null)}>×</button>}
    </div>
    <small id={id+'-hint'}>{invalid?(fa?'این شخص در فهرست عمومی در دسترس نیست؛ انتخاب را پاک کنید.':'This public credit is unavailable; clear the selection.'):(fa?'دو حرف یا بیشتر؛ سپس نام را انتخاب کنید.':'Type two or more characters, then select a name.')}</small>
    <div className={styles.suggestions} hidden={!show}>
      <ul id={id+'-list'} role="listbox" aria-label={fa?'پیشنهادهای '+label:label+' suggestions'} aria-busy={status==='loading'}>
        {options.map((person,index)=><li key={person.id} id={id+'-'+person.id} role="option" aria-selected={active===index} className={active===index?styles.optionActive:undefined} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(person)}><span className={styles.initial} aria-hidden="true">{person.name.slice(0,1)}</span><span dir="auto">{person.name}</span><Icon name="plus" size={14}/></li>)}
      </ul>
      <PeopleFeedback status={status} count={options.length} fa={fa} onRetry={()=>setRetry(value=>value+1)}/>
    </div>
  </div>
}

function PeopleFeedback({status,count,fa,onRetry}:{status:string;count:number;fa:boolean;onRetry:()=>void}){
  if(status==='error')return <div className={styles.suggestionNote} role="alert">{fa?'دریافت نام‌ها ممکن نشد.':'Names could not be loaded.'}<button type="button" onClick={onRetry}>{fa?'تلاش دوباره':'Retry'}</button></div>
  return <p className={styles.suggestionNote} role="status">{status==='loading'?(fa?'در حال جست‌وجو…':'Searching…'):count?(fa?'با کلیدهای جهت و Enter انتخاب کنید.':'Use arrow keys and Enter to select.'):(fa?'نامی پیدا نشد؛ املای دیگری امتحان کنید.':'No matches; try another spelling.')}</p>
}
function usePeopleOptions(key:string,role:string,query:string){
  const [result,setResult]=useState<{key:string;status:string;options:PersonChoice[]}>({key:'',status:'ready',options:[]})
  useEffect(()=>{
    if(!key)return
    const controller=new AbortController()
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch('/api/cinema/people?'+new URLSearchParams({role,q:query.trim()}),{signal:controller.signal,cache:'no-store'})
        if(!response.ok)throw Error('unavailable')
        const data=await response.json()
        if(!controller.signal.aborted)setResult({key,status:'ready',options:data.options})
      }catch{if(!controller.signal.aborted)setResult({key,status:'error',options:[]})}
    },250)
    return()=>{clearTimeout(timer);controller.abort()}
  },[key,role,query])
  return key&&result.key===key?result:{options:[],status:key?'loading':'ready'}
}
