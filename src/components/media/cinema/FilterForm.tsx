'use client'

import { useEffect,useState,type ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import styles from './discovery.module.css'

export default function FilterForm({children,fa,dubbed}:{children:ReactNode;fa:boolean;dubbed:boolean}) {
  const [pending,setPending]=useState(false)
  useEffect(()=>{const restored=()=>setPending(false);window.addEventListener('pageshow',restored);return()=>window.removeEventListener('pageshow',restored)},[])
  return <form action="/cinema/browse" role="search" aria-label={fa?'جست‌وجوی پیشرفتهٔ سینما':'Advanced cinema search'} className={styles.form} aria-busy={pending} onSubmit={()=>setPending(true)}>
    {children}
    <footer className={styles.formFooter}>
      <label className={styles.check}><input type="checkbox" name="dubbed" value="1" defaultChecked={dubbed}/>{fa?'فقط دوبلهٔ فارسی':'Persian dub only'}</label>
      <button className={styles.submit} type="submit" disabled={pending}><Icon name="search" size={18}/>{pending?(fa?'در حال جست‌وجو…':'Searching…'):(fa?'نمایش نتایج':'Show results')}</button>
    </footer>
  </form>
}
