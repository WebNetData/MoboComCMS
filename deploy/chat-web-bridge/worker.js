importScripts('providers.js','diagnostics.js')
const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)
const panelPath=path=>/^\/admin\/(?:posts(?:\/|$)|ai\/production(?:\/|$))/.test(path)
const cancelled=new Set();let queue=Promise.resolve()
const enqueue=work=>{const task=queue.catch(()=>{}).then(work);queue=task.catch(()=>{});return task}
const contextOf=value=>{
 if(value===undefined)return null
 if(!value||Object.keys(value).some(k=>!['conversation','operation'].includes(k))||typeof value.conversation!=='string'||!value.conversation.split(':').every(valid)||value.conversation.split(':').length!==2||!/^text$|^image:[0-3]$/.test(value.operation))throw Error('شناسهٔ مرحلهٔ تولید معتبر نیست.')
 return value
}
const initialPath=provider=>new URL(mobocomWebProviders[provider].url).pathname
const threadPath=path=>/^\/c\/[a-z0-9-]+\/?$/i.test(path)
const freshChatPath=path=>/^\/(?:chat\/?|chat\/new\/?)?$/.test(path)
async function panelSender(sender){
 let url;try{url=new URL(sender.url)}catch{throw Error('فرستنده معتبر نیست.')}
 const{origin}=await chrome.storage.local.get('origin')
 if(sender.id!==chrome.runtime.id||!sender.tab||sender.frameId!=null&&sender.frameId!==0||url.origin!==origin||!panelPath(url.pathname))throw Error('این سایت یا صفحه به پل متصل نیست.')
 return url
}
async function tell(p,message){try{const tab=await chrome.tabs.get(p.panel),u=new URL(tab.url);if(u.origin===p.origin&&panelPath(u.pathname))await chrome.tabs.sendMessage(p.panel,{...message,id:p.id})}catch{}}
async function closeOwned(session){
 if(!session?.tab)return
 try{const tab=await chrome.tabs.get(session.tab),u=new URL(tab.url);if(u.origin===mobocomWebProviders[session.provider].origin&&(u.pathname===session.path||u.pathname===initialPath(session.provider)))await chrome.tabs.remove(session.tab)}catch{}
}
async function finish(execution,result){
 const{pending:p,conversation:s}=await chrome.storage.session.get(['pending','conversation'])
 if(s?.operation.id===execution){
  if(!result.error){s.operation.result=result;s.operation.stage='complete';delete s.operation.error}
  else s.operation.error=String(result.error).slice(0,500)
  s.expires=Date.now()+20*60000;await chrome.storage.session.set({conversation:s})
 }
 if(p?.execution!==execution)return
 await chrome.storage.session.remove('pending');cancelled.delete(p.id)
 await tell(p,{type:'RESULT',...result})
 if(p.context||result.keepChat){if(p.chat)await chrome.tabs.update(p.chat,{active:true}).catch(()=>{});return}
 if(p.chat)await closeOwned({tab:p.chat,provider:p.provider,path:p.path})
}
async function content(m,sender){
 const{pending:p,conversation:s}=await chrome.storage.session.get(['pending','conversation'])
 const op=s?.operation.id===m.id?s.operation:p?.execution===m.id?p.operation:null,provider=op&&((s?.operation===op?s.provider:p.provider)),tab=op&&(s?.operation===op?s.tab:p.chat)
 if(s?.operation===op?s.expires<=Date.now():!p||p.expires<=Date.now())throw Error('مهلت نگهداری این درخواست تمام شده است.')
 if(!op||sender.id!==chrome.runtime.id||sender.tab?.id!==tab||sender.frameId!=null&&sender.frameId!==0||!mobocomWebProviders[provider]||new URL(sender.url).origin!==mobocomWebProviders[provider].origin)throw Error('پاسخ متعلق به این درخواست نیست.')
 // MessageSender.url can retain the original document URL after pushState.
 const tabUrl=new URL((await chrome.tabs.get(tab)).url);if(tabUrl.origin!==mobocomWebProviders[provider].origin)throw Error('نشانی تب تغییر کرده؛ پاسخ خوانده نشد.')
 const locationResult=await chrome.scripting.executeScript({target:{tabId:tab,frameIds:[0]},func:()=>location.href})
 const actual=new URL(locationResult[0].result);if(actual.origin!==mobocomWebProviders[provider].origin)throw Error('نشانی سند تغییر کرده؛ پاسخ خوانده نشد.')
 const path=actual.pathname,current=s?.operation===op?s.path:p.path
 const transition=provider==='chatgpt'&&freshChatPath(current)&&threadPath(path)&&m.owned===true&&['sent','reading','complete'].includes(m.stage||op.stage)
 const freshAlias=provider==='chatgpt'&&freshChatPath(current)&&freshChatPath(path)&&['new','prepared'].includes(op.stage)
 const otherThread=provider!=='chatgpt'&&current===initialPath(provider)&&m.owned===true&&['sent','reading','complete'].includes(m.stage||op.stage)&&(provider==='gemini'?/^\/app\/[a-z0-9_-]+\/?$/i.test(path):/^\/(?:c|chat|a\/chat\/s)\/[a-z0-9_-]+\/?$/i.test(path))
 if(path!==current&&!transition&&!freshAlias&&!otherThread){
  const stage=value=>['new','prepared','dispatched','sent','reading','complete'].includes(value)?value:'unknown'
  op.routeFailure={message:['CHAT_PROGRESS','CHAT_RESULT','CHAT_VISIBLE'].includes(m.type)?m.type:'unknown',messageStage:stage(m.stage),receiptStage:stage(op.stage),owned:m.owned===true,fromFresh:freshChatPath(current),toThread:threadPath(path),sameAsTab:path===tabUrl.pathname,hasPending:p?.execution===m.id}
  if(s?.operation===op)await chrome.storage.session.set({conversation:s});if(p?.execution===m.id){p.operation=op;await chrome.storage.session.set({pending:p})}
 }
 // A confirmation failure is safe to report without trusting the new path or any response body.
 if(provider==='chatgpt'&&freshChatPath(current)&&threadPath(path)&&op.stage==='dispatched'&&m.type==='CHAT_RESULT'&&typeof m.error==='string'){
  if(p?.execution===m.id&&p.expires>Date.now()+1000&&!op.confirmationRecovery&&!cancelled.has(p.id)){
   // One read-only recovery of this already-dispatched execution; never click again.
   op.confirmationRecovery=true;if(s?.operation===op)await chrome.storage.session.set({conversation:s});p.operation=op;await chrome.storage.session.set({pending:p});await tell(p,{type:'PROGRESS',stage:'reading'});setTimeout(()=>{void launch(p,'')},300);return{ok:true,recovering:true}
  }
  await finish(m.id,{error:m.error.slice(0,500),keepChat:true});return{ok:true}
 }
 if(path!==current&&!transition&&!freshAlias&&!otherThread){if(p?.execution===m.id)await finish(m.id,{error:'گفتگوی درخواست تغییر کرده؛ پاسخ گفتگوی دیگری خوانده نشد.',keepChat:true});throw Error('گفتگوی درخواست تغییر کرده؛ پاسخ خوانده نشد.')}
 if(m.type==='CHAT_VISIBLE'){await chrome.tabs.update(tab,{active:true}).catch(()=>{});return{ok:true}}
 if(m.type==='CHAT_PROGRESS'){
  if(!['prepared','dispatched','sent','reading'].includes(m.stage)||!Number.isInteger(m.baseline)||m.baseline<0||m.baseline>40)throw Error('وضعیت مرحله معتبر نیست.')
  if(op.baseline===undefined)op.baseline=m.baseline
  const order=['new','prepared','dispatched','sent','reading','complete'];if(order.indexOf(m.stage)>order.indexOf(op.stage))op.stage=m.stage
  if(s?.operation===op){s.path=path;await chrome.storage.session.set({conversation:s})}
  if(p?.execution===m.id){p.path=path;p.operation=op;await chrome.storage.session.set({pending:p});await tell(p,{type:'PROGRESS',stage:m.stage==='dispatched'?'sent':m.stage})}
  return{ok:true,active:p?.execution===m.id&&!cancelled.has(p.id)&&p.expires>Date.now()}
 }
 let result={error:'پاسخ پل معتبر نیست.'}
 if(typeof m.error==='string')result={error:m.error.slice(0,500),keepChat:true}
 else if(m.owned!==true||!['sent','reading','complete'].includes(op.stage))result={error:'نمایش پیام همین درخواست تأیید نشده؛ پاسخ نامطمئن پذیرفته نشد.',keepChat:true}
 else if(op.mode==='IMAGE'){if(typeof m.data==='string'&&/^data:image\/webp;base64,[a-z0-9+/]+=*$/i.test(m.data)&&m.data.length<=2800000)result={data:m.data}}
 else if(typeof m.text==='string'&&m.text.trim()&&m.text.length<=60000)result={text:m.text}
 if(s?.operation===op){s.path=path;await chrome.storage.session.set({conversation:s})}
 await finish(m.id,result);return{ok:true}
}
async function launch(p,prompt){
 try{
  let tab
  if(p.chat)tab=await chrome.tabs.get(p.chat)
  else{
   tab=await chrome.tabs.create({url:'about:blank',active:true})
   const kept=await enqueue(async()=>{const state=await chrome.storage.session.get(['pending','conversation']);if(state.pending?.execution!==p.execution||cancelled.has(p.id))return false;state.pending.chat=tab.id;p.chat=tab.id;await chrome.storage.session.set({pending:state.pending});if(state.conversation?.operation.id===p.execution){state.conversation.tab=tab.id;await chrome.storage.session.set({conversation:state.conversation})}return true})
   if(!kept){await chrome.tabs.remove(tab.id).catch(()=>{});return}
   await chrome.tabs.update(tab.id,{url:mobocomWebProviders[p.provider].url,active:true})
  }
  await chrome.tabs.update(tab.id,{active:true})
  const until=Date.now()+20000;let loaded=false
  while(Date.now()<until){const state=await chrome.storage.session.get('pending');if(state.pending?.execution!==p.execution||cancelled.has(p.id))return;tab=await chrome.tabs.get(tab.id);if(tab.status==='complete'&&new URL(tab.url).origin===mobocomWebProviders[p.provider].origin){loaded=true;break}await new Promise(r=>setTimeout(r,200))}
  if(!loaded)throw Error('صفحهٔ Chat آماده نشد؛ وارد حساب شوید. درخواست تازه خودکار ارسال نمی‌شود.')
  const state=await chrome.storage.session.get(['pending','conversation']);if(state.pending?.execution!==p.execution||cancelled.has(p.id))return
  const session=state.conversation,op=state.pending.operation,options={provider:p.provider,context:!!p.context,path:session?.operation.id===op.id?session.path:state.pending.path,markers:session?.operation.id===op.id?session.markers:[],baseline:op.baseline,resume:['dispatched','sent','reading','complete'].includes(op.stage)}
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:p.provider==='chatgpt'?['dom-roots.js','dom.js','page.js',...(p.mode==='IMAGE'?['image-choice.js','image-data.js','image.js']:['chat.js'])]:['dom-roots.js','dom.js','providers.js','web-page.js','chat.js']})
  await chrome.scripting.executeScript({target:{tabId:tab.id},func:(prompt,id,expires,options,mode)=>{if(mode==='IMAGE')void mobocomChatImage(prompt,id,expires,options);else void mobocomChatRun(prompt,id,expires,options.provider,options)},args:[prompt,op.id,p.expires-1000,options,p.mode]})
 }catch(error){await enqueue(()=>finish(p.execution,{error:error?.message||'صفحهٔ چت در دسترس نیست؛ نتیجه حفظ شده و تولید دوباره ارسال نشد.',keepChat:true}))}
}
async function handle(m,sender){
 if(['CHAT_RESULT','CHAT_VISIBLE','CHAT_PROGRESS'].includes(m?.type))return content(m,sender)
 if(m?.type==='DIAGNOSE'){if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))throw Error('فرستنده معتبر نیست.');return{report:await mobocomChatDiagnostics()}}
 if(['CONNECT','DISCONNECT'].includes(m?.type)){
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))throw Error('فرستنده معتبر نیست.')
  const{origin}=await chrome.storage.local.get('origin'),{pending,conversation}=await chrome.storage.session.get(['pending','conversation'])
  if(pending)await finish(pending.execution,{error:'اتصال پل تغییر کرد؛ درخواست دوباره ارسال نشد.',keepChat:true})
  await chrome.storage.session.remove('conversation');await closeOwned(conversation);await chrome.scripting.unregisterContentScripts().catch(()=>{})
  if(m.type==='DISCONNECT'){await chrome.storage.local.remove('origin');if(origin)await chrome.permissions.remove({origins:[origin+'/*']});return{ok:true}}
  const u=new URL(m.origin);if(u.origin!==m.origin||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))||Object.values(mobocomWebProviders).some(p=>p.origin===u.origin))throw Error('نشانی معتبر نیست.')
  if(!await chrome.permissions.contains({origins:[u.origin+'/*']}))throw Error('دسترسی سایت لازم است.')
  if(origin&&origin!==u.origin)await chrome.permissions.remove({origins:[origin+'/*']})
  await chrome.storage.local.set({origin:u.origin});await chrome.scripting.registerContentScripts([{id:'mobocom-panel',matches:[u.origin+'/admin/posts*',u.origin+'/admin/ai/production*'],js:['panel.js'],runAt:'document_idle'}]);return{ok:true}
 }
 const url=await panelSender(sender);if(!valid(m?.id))throw Error('شناسهٔ درخواست معتبر نیست.')
 if(m.type==='PING')return{ready:true,version:chrome.runtime.getManifest().version,capabilities:['text','image','production-v1','production-v2','production-v3','production-v4',...Object.keys(mobocomWebProviders).map(p=>'chat-'+p)]}
 const state=await chrome.storage.session.get(['pending','conversation']),p=state.pending,s=state.conversation
 if(m.type==='CANCEL'){if(p&&p.panel===sender.tab.id&&p.id===m.id){cancelled.add(p.id);await chrome.storage.session.remove('pending');if(!p.context&&p.chat)await closeOwned({tab:p.chat,provider:p.provider,path:p.path})}return{ok:true}}
 const context=contextOf(m.context)
 if(context&&!/^\/admin\/ai\/production(?:\/|$)/.test(url.pathname))throw Error('زمینهٔ تولید فقط برای صفحهٔ تولید انبوه است.')
 if(context&&s?.key===context.conversation&&(s.panel!==sender.tab.id||s.origin!==url.origin))throw Error('این گفتگو به تب دیگری متصل است؛ در همان تب ادامه دهید.')
 if(['RESET','RELEASE'].includes(m.type)){
  if(!context)throw Error('زمینهٔ تولید لازم است.')
  if(s?.key===context.conversation&&s.panel===sender.tab.id&&s.origin===url.origin){if(p?.execution===s.operation.id){if(m.type==='RELEASE')throw Error('مرحله هنوز فعال است.');cancelled.add(p.id);await finish(p.execution,{error:'گفتگوی تازه صریحاً انتخاب شد.',keepChat:true})}await chrome.storage.session.remove('conversation');await closeOwned(s)}return{ok:true}
 }
 if(!['RUN','IMAGE'].includes(m.type)||typeof m.prompt!=='string'||!m.prompt.trim()||m.prompt.length>120000)throw Error('درخواست پل معتبر نیست.')
 if(context&&((m.type==='RUN')!==(context.operation==='text')))throw Error('نوع درخواست با مرحلهٔ تولید یکسان نیست.')
 const provider=m.provider||'chatgpt';if(typeof provider!=='string'||!Object.hasOwn(mobocomWebProviders,provider)||m.type==='IMAGE'&&provider!=='chatgpt')throw Error('سرویس یا تولید تصویر پشتیبانی نمی‌شود.')
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(m.prompt)))).map(b=>b.toString(16).padStart(2,'0')).join('')
 let session=context&&s&&s.key===context.conversation&&s.provider===provider&&s.panel===sender.tab.id&&s.origin===url.origin&&s.expires>Date.now()?s:null
 const same=session&&session.operation.key===context.operation
 if(same&&session.operation.hash!==hash)throw Error('پرامپت این مرحله تغییر کرده؛ برای حفظ نتیجه، گفتگوی تازه را صریحاً انتخاب کنید.')
 if(p&&p.expires>Date.now()&&!(same&&p.execution===session.operation.id))throw Error('یک درخواست در پل فعال است؛ آن را متوقف یا بازیابی کنید.')
 if(session&&!same&&session.operation.stage!=='complete')throw Error('مرحلهٔ قبلی نامطمئن است؛ ابتدا آن را بازیابی یا گفتگوی تازه را انتخاب کنید.')
 if(!session&&s){if(s.operation.stage!=='complete'&&s.expires>Date.now()&&p)throw Error('درخواست نامطمئن دیگری فعال است.');await closeOwned(s);await chrome.storage.session.remove('conversation')}
 const op=same?session.operation:{id:crypto.randomUUID(),key:context?.operation||m.id,hash,mode:m.type,stage:'new'}
 if(op.mode!==m.type)throw Error('نوع نتیجه با این مرحله یکسان نیست.')
 if(context&&!session)session={key:context.conversation,panel:sender.tab.id,origin:url.origin,provider,tab:null,path:initialPath(provider),markers:[],expires:Date.now()+20*60000}
 if(session){session.operation=op;session.expires=Date.now()+20*60000;if(!session.markers.includes('MOBOCOM_REQUEST_'+op.id))session.markers=[...session.markers,'MOBOCOM_REQUEST_'+op.id].slice(-12);await chrome.storage.session.set({conversation:session})}
 const pending={id:m.id,execution:op.id,origin:url.origin,panel:sender.tab.id,provider,chat:session?.tab||null,path:session?.path||initialPath(provider),context,operation:op,mode:m.type,expires:Date.now()+(m.type==='IMAGE'?660000:540000)}
 cancelled.delete(m.id);await chrome.storage.session.set({pending})
 if(op.result){await finish(op.id,op.result);return{ok:true}}
 setTimeout(()=>{void launch(pending,m.prompt)},0);return{ok:true}
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(m?.type==='CANCEL')void chrome.storage.session.get('pending').then(({pending:p})=>{if(p&&p.id===m.id&&sender.tab?.id===p.panel&&new URL(sender.url).origin===p.origin)cancelled.add(p.id)})
 const task=m?.type==='PING'?handle(m,sender):enqueue(()=>handle(m,sender));task.then(reply,e=>reply({error:e.message||'پل در دسترس نیست.'}));return true
})
chrome.tabs.onRemoved.addListener(id=>{void enqueue(async()=>{const{pending:p,conversation:s}=await chrome.storage.session.get(['pending','conversation']);if(p&&(p.panel===id||p.chat===id))await finish(p.execution,{error:'تب درخواست بسته شد؛ نتیجهٔ نامطمئن دوباره تولید نشد.',keepChat:true});if(s&&(s.panel===id||s.tab===id))await chrome.storage.session.remove('conversation')})})
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status!=='complete')return;void enqueue(async()=>{const{pending:p}=await chrome.storage.session.get('pending');return p?.chat===id&&p.expires>Date.now()&&['dispatched','sent','reading'].includes(p.operation.stage)?p:null}).then(p=>{if(p)void launch(p,'')})})
