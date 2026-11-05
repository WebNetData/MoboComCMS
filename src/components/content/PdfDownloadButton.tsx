'use client'
import { useState } from 'react'

export default function PdfDownloadButton({item}:{item:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function download(){
    if(busy)return
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/content-pdf/'+encodeURIComponent(item),{cache:'no-store',signal:AbortSignal.timeout(60000)})
      if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result?.error||'دریافت PDF انجام نشد')}
      if(!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('فایل PDF آماده نشد')
      const filename=/filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition')||'')?.[1]
      const url=URL.createObjectURL(await response.blob()),a=document.createElement('a')
      a.href=url;a.download=filename?decodeURIComponent(filename):'mobocom.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
    }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'آماده‌سازی طول کشید؛ دوباره تلاش کنید')}finally{setBusy(false)}
  }
  return <span className="content-pdf-download"><button type="button" className="ea-btn" aria-busy={busy} disabled={busy} onClick={()=>void download()}><svg className="ea-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M12 12v6m-3-3 3 3 3-3"/></svg>{busy?'در حال ساخت PDF…':'دانلود PDF'}</button>{error&&<small className="ea-note" role="alert">{error}</small>}</span>
}
