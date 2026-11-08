// Isolated-world relay: only the explicitly approved Admin page can request work.
if (!globalThis.__mobocomChatBridge) {
  globalThis.__mobocomChatBridge=true
  const channel='MOBOCOM_CHAT_WEB_V1', valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)
  window.addEventListener('message',event=>{
    const m=event.data
    if(event.source!==window||event.origin!==location.origin||!m||m.channel!==channel||m.direction!=='request'||!valid(m.id)||!/^\/admin\/(?:posts(?:\/|$)|ai\/production(?:\/|$))/.test(location.pathname))return
    if(!['PING','RUN','IMAGE','CANCEL'].includes(m.type)||['RUN','IMAGE'].includes(m.type)&&(typeof m.prompt!=='string'||m.prompt.length>120000))return
    chrome.runtime.sendMessage({type:m.type,id:m.id,prompt:m.prompt,provider:m.provider},response=>{
      const error=chrome.runtime.lastError
      if(error||response?.error)window.postMessage({channel,direction:'response',id:m.id,error:response?.error||'افزونه در دسترس نیست؛ صفحه را تازه کنید.'},location.origin)
      else if(m.type==='PING')window.postMessage({channel,direction:'response',id:m.id,ready:true,capabilities:response?.capabilities},location.origin)
    })
  })
  chrome.runtime.onMessage.addListener(m=>{
    if(m?.type==='RESULT'&&valid(m.id))window.postMessage({channel,direction:'response',id:m.id,text:m.text,data:m.data,error:m.error},location.origin)
  })
}
