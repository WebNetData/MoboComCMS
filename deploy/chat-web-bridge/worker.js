const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)
const cancelled=new Set()
let queue=Promise.resolve()
async function finish(p,result){
  cancelled.delete(p.id)
  await chrome.storage.session.remove('pending')
  try{const tab=await chrome.tabs.get(p.panel);if(new URL(tab.url).origin===p.origin&&/^\/admin\/posts(?:\/|$)/.test(new URL(tab.url).pathname))await chrome.tabs.sendMessage(p.panel,{type:'RESULT',id:p.id,...result})}catch{}
  if(p.chat)await chrome.tabs.remove(p.chat).catch(()=>{})
}
async function handle(m,sender){
  const{origin}=await chrome.storage.local.get('origin')
  if(['CONNECT','DISCONNECT'].includes(m?.type)){
    if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))throw Error('فرستنده معتبر نیست.')
    const{pending}=await chrome.storage.session.get('pending');if(pending)await finish(pending,{error:'اتصال پل تغییر کرد؛ درخواست تکرار نشد.'})
    await chrome.scripting.unregisterContentScripts().catch(()=>{})
    if(m.type==='DISCONNECT'){await chrome.storage.local.remove('origin');if(origin)await chrome.permissions.remove({origins:[origin+'/*']});return{ok:true}}
    const u=new URL(m.origin);if(u.origin!==m.origin||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))||u.hostname==='chatgpt.com')throw Error('نشانی معتبر نیست.')
    if(!await chrome.permissions.contains({origins:[u.origin+'/*']}))throw Error('دسترسی سایت لازم است.')
    if(origin&&origin!==u.origin)await chrome.permissions.remove({origins:[origin+'/*']})
    await chrome.storage.local.set({origin:u.origin});await chrome.scripting.registerContentScripts([{id:'mobocom-panel',matches:[u.origin+'/admin/posts*'],js:['panel.js'],runAt:'document_idle'}]);return{ok:true}
  }
  const{pending}=await chrome.storage.session.get('pending')
  if(m?.type==='CHAT_RESULT'){
    if(!pending||sender.tab?.id!==pending.chat||m.id!==pending.id||Date.now()>pending.expires||new URL(sender.url).origin!=='https://chatgpt.com')throw Error('پاسخ متعلق به این درخواست نیست.')
    const result=typeof m.text==='string'&&m.text.trim()&&m.text.length<=60000?{text:m.text}:typeof m.error==='string'?{error:m.error.slice(0,500)}:{error:'پاسخ پل معتبر نیست.'};await finish(pending,result);return{ok:true}
  }
  let u;try{u=new URL(sender.url)}catch{throw Error('فرستنده معتبر نیست.')}
  if(sender.id!==chrome.runtime.id||!sender.tab||u.origin!==origin||!/^\/admin\/posts(?:\/|$)/.test(u.pathname)||!valid(m?.id))throw Error('این سایت یا صفحه به پل متصل نیست.')
  if(m.type==='PING')return{ready:true}
  if(m.type==='CANCEL'){if(pending&&pending.panel===sender.tab.id&&pending.id===m.id)await finish(pending,{error:'درخواست لغو شد؛ مصرف احتمالی حساب بازگردانده نمی‌شود.'});return{ok:true}}
  if(m.type!=='RUN'||typeof m.prompt!=='string'||!m.prompt.trim()||m.prompt.length>120000)throw Error('درخواست پل معتبر نیست.')
  if(pending&&pending.expires>Date.now())throw Error('یک درخواست در پل فعال است؛ تا پایان آن منتظر بمانید.')
  if(pending)await finish(pending,{error:'مهلت درخواست قبلی تمام شد؛ تکرار نشد.'})
  cancelled.clear()
  const p={id:m.id,origin,panel:sender.tab.id,chat:null,expires:Date.now()+165000}
  await chrome.storage.session.set({pending:p})
  try{
    const tab=await chrome.tabs.create({url:'about:blank',active:false});p.chat=tab.id;await chrome.storage.session.set({pending:p})
    await chrome.tabs.update(tab.id,{url:'https://chatgpt.com/'})
    const loadDeadline=Date.now()+20000
    let loaded=false
    while(Date.now()<loadDeadline){if(cancelled.has(p.id))throw Error('لغو شد.');const current=await chrome.tabs.get(tab.id);if(current.status==='complete'&&current.url?.startsWith('https://chatgpt.com/')){loaded=true;break}await new Promise(r=>setTimeout(r,200))}
    if(!loaded)throw Error('صفحهٔ Chat وب بارگذاری نشد.')
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['chat.js']})
    if(cancelled.has(p.id))throw Error('لغو شد.')
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:(prompt,id,expires)=>{void mobocomChatRun(prompt,id,expires)},args:[m.prompt,m.id,p.expires-1000]})
  }catch(e){await finish(p,{error:e?.message==='صفحهٔ Chat وب بارگذاری نشد.'?e.message:'Chat وب باز نشد؛ وارد حساب شوید و اتصال افزونه را بررسی کنید.'})}
  return{ok:true}
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.type==='CANCEL')void chrome.storage.session.get('pending').then(({pending:p})=>{if(p&&m.id===p.id&&sender.tab?.id===p.panel&&new URL(sender.url).origin===p.origin)cancelled.add(p.id)})
  queue=queue.catch(()=>{}).then(()=>handle(m,sender)).then(reply,e=>reply({error:e.message||'پل در دسترس نیست.'}));return true
})
chrome.tabs.onRemoved.addListener(id=>{queue=queue.catch(()=>{}).then(async()=>{const{pending:p}=await chrome.storage.session.get('pending');if(p&&(p.panel===id||p.chat===id))await finish(p,{error:'تب درخواست بسته شد؛ درخواست خودکار تکرار نشد.'})})})
