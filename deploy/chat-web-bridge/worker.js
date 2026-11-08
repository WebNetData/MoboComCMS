importScripts('providers.js')
const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)
const cancelled=new Set()
let queue=Promise.resolve()
async function finish(p,result){
  cancelled.delete(p.id)
  await chrome.storage.session.remove('pending')
  try{const tab=await chrome.tabs.get(p.panel);if(new URL(tab.url).origin===p.origin&&/^\/admin\/(?:posts(?:\/|$)|ai\/production(?:\/|$))/.test(new URL(tab.url).pathname))await chrome.tabs.sendMessage(p.panel,{type:'RESULT',id:p.id,...result})}catch{}
  if(p.chat){if(result.keepChat)await chrome.tabs.update(p.chat,{active:true}).catch(()=>{});else await chrome.tabs.remove(p.chat).catch(()=>{})}
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
    await chrome.storage.local.set({origin:u.origin});await chrome.scripting.registerContentScripts([{id:'mobocom-panel',matches:[u.origin+'/admin/posts*',u.origin+'/admin/ai/production*'],js:['panel.js'],runAt:'document_idle'}]);return{ok:true}
  }
  const{pending}=await chrome.storage.session.get('pending')
  if(['CHAT_RESULT','CHAT_VISIBLE'].includes(m?.type)){
    if(!pending||sender.tab?.id!==pending.chat||m.id!==pending.id||Date.now()>pending.expires||new URL(sender.url).origin!==(globalThis.mobocomWebProviders[pending.provider||'chatgpt']?.origin))throw Error('پاسخ متعلق به این درخواست نیست.')
    if(m.type==='CHAT_VISIBLE'){await chrome.tabs.update(pending.chat,{active:true});return{ok:true}}
    let result={error:'پاسخ پل معتبر نیست.'}
    if(typeof m.error==='string')result={error:m.error.slice(0,500),keepChat:m.code==='CHAT_UI'}
    else if(pending.mode==='IMAGE'){if(typeof m.data==='string'&&/^data:image\/webp;base64,[a-z0-9+/]+=*$/i.test(m.data)&&m.data.length<=2800000)result={data:m.data}}
    else if(typeof m.text==='string'&&m.text.trim()&&m.text.length<=60000)result={text:m.text}
    await finish(pending,result);return{ok:true}
  }
  let u;try{u=new URL(sender.url)}catch{throw Error('فرستنده معتبر نیست.')}
  if(sender.id!==chrome.runtime.id||!sender.tab||u.origin!==origin||!/^\/admin\/(?:posts(?:\/|$)|ai\/production(?:\/|$))/.test(u.pathname)||!valid(m?.id))throw Error('این سایت یا صفحه به پل متصل نیست.')
  if(m.type==='PING')return{ready:true,capabilities:['text','image','production-v1','production-v2',...Object.keys(globalThis.mobocomWebProviders).map(p=>'chat-'+p)]}
  if(m.type==='CANCEL'){if(pending&&pending.panel===sender.tab.id&&pending.id===m.id)await finish(pending,{error:'درخواست لغو شد؛ مصرف احتمالی حساب بازگردانده نمی‌شود.'});return{ok:true}}
  if(!['RUN','IMAGE'].includes(m.type)||typeof m.prompt!=='string'||!m.prompt.trim()||m.prompt.length>120000)throw Error('درخواست پل معتبر نیست.')
  if(pending&&pending.expires>Date.now())throw Error('یک درخواست در پل فعال است؛ تا پایان آن منتظر بمانید.')
  if(pending)await finish(pending,{error:'مهلت درخواست قبلی تمام شد؛ تکرار نشد.'})
  const provider=m.provider||'chatgpt',adapter=Object.hasOwn(globalThis.mobocomWebProviders,provider)&&globalThis.mobocomWebProviders[provider]
  if(!adapter||m.type==='IMAGE'&&provider!=='chatgpt')throw Error('این سرویس یا تولید تصویر پشتیبانی نمی‌شود.')
  cancelled.clear()
  const p={id:m.id,provider,origin,panel:sender.tab.id,chat:null,mode:m.type,expires:Date.now()+(m.type==='IMAGE'?660000:165000)}
  await chrome.storage.session.set({pending:p})
  try{
    const tab=await chrome.tabs.create({url:'about:blank',active:false});p.chat=tab.id;await chrome.storage.session.set({pending:p})
    await chrome.tabs.update(tab.id,{url:adapter.url})
    const loadDeadline=Date.now()+20000
    let loaded=false
    while(Date.now()<loadDeadline){if(cancelled.has(p.id))throw Error('لغو شد.');const current=await chrome.tabs.get(tab.id);if(current.status==='complete'&&current.url&&new URL(current.url).origin===adapter.origin){loaded=true;break}await new Promise(r=>setTimeout(r,200))}
    if(!loaded){await finish(p,{error:'صفحهٔ Chat آماده نشد؛ تب آن باز شد. ورود، اتصال و حالت Chat را بررسی کنید؛ ارسال انجام نشد.',keepChat:true});return{ok:true}}
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:provider==='chatgpt'?['page.js',m.type==='IMAGE'?'image.js':'chat.js']:['providers.js','web-page.js','chat.js']})
    if(cancelled.has(p.id))throw Error('لغو شد.')
    if(m.type==='IMAGE')await chrome.scripting.executeScript({target:{tabId:tab.id},func:(prompt,id,expires)=>{void mobocomChatImage(prompt,id,expires)},args:[m.prompt,m.id,p.expires-1000]})
    else await chrome.scripting.executeScript({target:{tabId:tab.id},func:(prompt,id,expires,provider)=>{void mobocomChatRun(prompt,id,expires,provider)},args:[m.prompt,m.id,p.expires-1000,provider]})
  }catch(e){await finish(p,{error:e?.message==='صفحهٔ Chat وب بارگذاری نشد.'?e.message:'Chat وب باز نشد؛ وارد حساب شوید و اتصال افزونه را بررسی کنید.'})}
  return{ok:true}
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.type==='CANCEL')void chrome.storage.session.get('pending').then(({pending:p})=>{if(p&&m.id===p.id&&sender.tab?.id===p.panel&&new URL(sender.url).origin===p.origin)cancelled.add(p.id)})
  queue=queue.catch(()=>{}).then(()=>handle(m,sender)).then(reply,e=>reply({error:e.message||'پل در دسترس نیست.'}));return true
})
chrome.tabs.onRemoved.addListener(id=>{queue=queue.catch(()=>{}).then(async()=>{const{pending:p}=await chrome.storage.session.get('pending');if(p&&(p.panel===id||p.chat===id))await finish(p,{error:'تب درخواست بسته شد؛ درخواست خودکار تکرار نشد.'})})})
