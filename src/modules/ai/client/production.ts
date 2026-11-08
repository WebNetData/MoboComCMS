'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { requestChatWeb, requestChatWebImage, checkProductionChat, resetProductionChat, releaseProductionChat } from './chat-web'
import type { ProductionChoice } from '../domain/production-execution'
import type { ProductionConfig, ProductionKind, ProductionSeed, ProductionOutput, ProductionImage } from '../domain/production'
export type ProductionItemView = { id: string; position: number; seed: ProductionSeed; state: string; output: ProductionOutput | null; images: ProductionImage[]; error: string; expiresAt: string | null; saved: { id: number; href: string; title: string } | null }
export type ProductionBatchView = { id: string; kind: ProductionKind; status: string; version: number; config: ProductionConfig; items: ProductionItemView[] }
type BatchSummary = { id: string; status: string; createdAt: string; _count: { items: number } }
type Step = { itemId: string; lease: string; phase: 'text' | 'image'; index?: number; prompt: string }
export async function productionApi(body: Record<string, unknown>, image = false, signal?: AbortSignal) {
  const response = await fetch('/api/admin/ai/production'+(image?'/image':''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionProtocol: 1, ...body }), signal: AbortSignal.any([AbortSignal.timeout(body.action==='generate'?155000:65000),...(signal?[signal]:[])]) })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error || 'درخواست انجام نشد؛ وضعیت را تازه کنید. تولید خودکار تکرار نشد.')
  return data as { batch: ProductionBatchView; step?: Step }
}
export function useProduction(kind: ProductionKind) {
  const [batch, setBatch] = useState<ProductionBatchView | null>(null), [batches,setBatches] = useState<BatchSummary[]>([]), [categories,setCategories] = useState<{id:number;name:string}[]>([]), [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  const [providers,setProviders]=useState<{text:ProductionChoice[];image:ProductionChoice[];message?:string;canSelectModel?:boolean}>({text:[],image:[]})
  const [bridgeVersion,setBridgeVersion]=useState('')
  const current=useRef(batch), running=useRef(false), abort=useRef<AbortController|null>(null)
  const receive=useCallback((value:ProductionBatchView|null)=>{current.current=value;setBatch(value)},[])
  const refresh=useCallback(async(id?:string)=>{
    const response=await fetch('/api/admin/ai/production?'+(id?'id='+encodeURIComponent(id):'kind='+kind),{cache:'no-store',signal:AbortSignal.timeout(20000)}),data=await response.json().catch(()=>null)
    if(!response.ok||!data)throw new Error(data?.error||'خواندن وضعیت انجام نشد')
    if(id)receive(data.batch);else{setCategories(data.categories);setBatches(data.batches);setProviders(data.providers||{text:[],image:[]})}
    return data.batch as ProductionBatchView|undefined
  },[kind,receive])
  useEffect(()=>{void refresh().catch(e=>setMessage(e.message));receive(null);return()=>abort.current?.abort()},[refresh,receive])
  const command=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
    if(!current.current)throw new Error('دسته را انتخاب کنید')
    const result=await productionApi({action,id:current.current.id,version:current.current.version,...extra});receive(result.batch);return result
  },[receive])
  async function create(input: unknown) {if(running.current)return;setBusy(true);setMessage('');try{receive((await productionApi({action:'create',id:crypto.randomUUID(),input})).batch);await refresh()}catch(e){setMessage(e instanceof Error?e.message:'ساخت دسته انجام نشد')}finally{setBusy(false)}}
  async function checkBridge(){if(running.current)return;setBusy(true);try{const version=await checkProductionChat(AbortSignal.timeout(6000));setBridgeVersion(version);setMessage('پل فعال '+version+' است؛ اتصال تأیید شد و هیچ درخواست تولیدی ارسال نشد.')}catch(e){setBridgeVersion('');setMessage(e instanceof Error?e.message:'خواندن نسخهٔ پل انجام نشد')}finally{setBusy(false)}}
  async function releaseIfComplete(itemId:string) {
    const b=current.current,item=b?.items.find(x=>x.id===itemId)
    if(!b||item?.state!=='REVIEW')return
    const c=b.config,usesChat=(c.generation?.text.source||'chat-web')==='chat-web'||(c.cover||c.inline)&&(c.generation?.image.source||'chat-web')==='chat-web'
    if(usesChat)await releaseProductionChat(b.id+':'+itemId).catch(()=>{})
  }
  async function run() {
    if(running.current||!current.current)return
    running.current=true;setBusy(true);setMessage('');const control=new AbortController();abort.current=control;let step:Step|undefined
    try{
      const config=current.current.config,hasWork=current.current.items.some(x=>x.state==='READY')
      if(hasWork&&((config.generation?.text.source||'chat-web')==='chat-web'||(config.cover||config.inline)&&(config.generation?.image.source||'chat-web')==='chat-web')){setMessage('بررسی نسخه و اتصال پل Chat؛ هنوز درخواستی تولید نشده است…');setBridgeVersion(await checkProductionChat(control.signal,config.generation?.text.source==='chat-web'?config.generation.text.chatProvider:undefined))}
      await command('start')
      while(!control.signal.aborted){
        const item:ProductionItemView|undefined=current.current!.items.find(x=>x.state==='READY');if(!item)break
        const phase:'text'|'image'=item.output?'image':'text',target=current.current!.config.generation?.[phase]
        if(target?.source==='api'){
          setMessage(`${item.position+1} از ${current.current!.items.length} · ${phase==='text'?'نوشتن متن':'تولید تصویر'} با ${target.provider} · ${target.model}؛ در انتظار پاسخ سرویس…`)
          const result=await productionApi({action:'generate',id:current.current!.id,version:current.current!.version,itemId:item.id},false,control.signal);receive(result.batch);await releaseIfComplete(item.id);continue
        }
        const claimed=await command('claim',{itemId:item.id});step=claimed.step;if(!step)throw new Error('مرحلهٔ تولید دریافت نشد')
        setMessage(`${item.position+1} از ${current.current!.items.length} · ${step.phase==='text'?'نوشتن متن':'تولید تصویر '+step.index}`)
        const context={conversation:current.current!.id+':'+item.id,operation:step.phase==='text'?'text':'image:'+step.index}
        const progress=(stage:string)=>setMessage(`${item.position+1} از ${current.current!.items.length} · ${stage==='prepared'?'پیام آماده است؛ ارسال در گفتگوی همین ردیف…':stage==='sent'?'پیام ارسال شد؛ منتظر پاسخ Chat…':'در حال خواندن پاسخ همان درخواست؛ ارسال دوباره انجام نمی‌شود…'}`)
        if(step.phase==='text'){const text=await requestChatWeb(step.prompt,control.signal,true,target?.source==='chat-web'?target.chatProvider:undefined,context,progress);if(control.signal.aborted)break;await command('text',{itemId:step.itemId,lease:step.lease,text})}
        else{const data=await requestChatWebImage(step.prompt,control.signal,context,progress);if(control.signal.aborted)break;const result=await productionApi({id:current.current!.id,version:current.current!.version,itemId:step.itemId,lease:step.lease,index:step.index,data},true);receive(result.batch)}
        step=undefined;await releaseIfComplete(item.id)
      }
      if(!control.signal.aborted&&current.current?.status==='RUNNING'){await command('pause');setMessage('تولید تکمیل شد؛ نتیجه‌ها را بازبینی و به‌صورت پیش‌نویس ذخیره کنید.')}
    }catch(e){
      setMessage(e instanceof Error?e.message:'تولید متوقف شد')
      if(current.current){try{await refresh(current.current.id);if(step&&current.current?.items.some(x=>x.id===step!.itemId&&x.state==='RUNNING'))await command('fail',{itemId:step.itemId,lease:step.lease})}catch{setMessage('ارتباط قطع شد؛ وضعیت را تازه کنید. درخواست نامطمئن خودکار تکرار نمی‌شود.')}}
    }finally{if(control.signal.aborted&&current.current){try{await refresh(current.current.id);if(current.current?.status==='RUNNING')await command('pause')}catch{setMessage('درخواست مرورگر لغو شد؛ برای تأیید توقف سرور وضعیت را تازه کنید.')}}abort.current=null;running.current=false;setBusy(false)}
  }
  async function stop() {abort.current?.abort();setMessage('در حال توقف؛ متن‌ها و تصاویر تکمیل‌شده حفظ می‌شوند.')}
  async function act(action:string,itemId?:string){if(running.current)return;setBusy(true);setMessage('');try{if(action==='retry-fresh'){if(!itemId||!current.current)throw new Error('ردیف را انتخاب کنید');await resetProductionChat(current.current.id+':'+itemId);action='retry'}await command(action,itemId?{itemId}:{});if(action==='retry')setMessage('ردیف آمادهٔ ادامه است؛ شروع را بزنید. پاسخ آمادهٔ همین مرحله ابتدا بازیابی می‌شود.');if(action==='save')setMessage('پیش‌نویس ذخیره شد؛ انتشار خودکار انجام نمی‌شود.')}catch(e){setMessage(e instanceof Error?e.message:'انجام نشد')}finally{setBusy(false)}}
  async function saveAll(){if(running.current||!current.current)return;setBusy(true);setMessage('');try{for(const row of current.current.items.filter(x=>x.state==='REVIEW'))await command('save',{itemId:row.id});setMessage('ردیف‌های بازبینی‌شده به‌صورت پیش‌نویس ذخیره شدند.')}catch(e){setMessage(e instanceof Error?e.message:'ذخیره متوقف شد؛ موارد موفق دوباره ساخته نمی‌شوند')}finally{setBusy(false)}}
  return{batch,batches,categories,providers,busy,message,setMessage,refresh,create,run,stop,act,saveAll,bridgeVersion,checkBridge}
}
