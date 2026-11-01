'use client'
import { useState } from 'react'
import Icon from '@/components/site/Icon'
import { copyPrompt, downloadPrompt } from './browser'
import g from './PromptGallery.module.css'
export default function PromptCopy({ text, title, compact = false }: { text: string; title: string; compact?: boolean }) {
  const [notice,setNotice] = useState('')
  async function copy(){try{await copyPrompt(text);setNotice('پرامپت کپی شد')}catch{setNotice('کپی انجام نشد؛ متن پرامپت را انتخاب کنید')}}
  return <div className={g.copyGroup}><button type="button" className={compact ? g.copySmall : g.copyMain} onClick={copy} aria-label={`کپی پرامپت ${title}`}><Icon name="copy" size={16}/>{compact ? 'کپی' : 'کپی پرامپت'}</button>{!compact&&<button type="button" className={g.download} onClick={()=>downloadPrompt(text)} aria-label="دریافت فایل پرامپت"><Icon name="download" size={17}/></button>}<span className={compact?g.copyNotice:g.copyStatus} role="status">{notice}</span></div>
}
