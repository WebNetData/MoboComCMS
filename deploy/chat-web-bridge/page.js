// Only fresh tabs or the bridge's explicitly pinned per-item conversation.
globalThis.mobocomChatPage=(()=>{
 const dom=globalThis.mobocomChatDom,pause=()=>new Promise(r=>setTimeout(r,250))
 const ui=message=>Object.assign(Error(message),{code:'CHAT_UI'})
 const turns=()=>dom.outer('[data-message-author-role="assistant"],[data-testid="assistant-turn"]')
 const users=()=>dom.outer('[data-message-author-role="user"],[data-testid="user-turn"]')
 const freshPath=path=>/^\/(?:chat\/?|chat\/new\/?)?$/.test(path),threadPath=path=>/^\/c\/[a-z0-9-]+\/?$/i.test(path)
 const owns=state=>users().some(el=>(el.textContent||'').includes('MOBOCOM_REQUEST_'+state.id))
 function check(state){
  if(location.origin!=='https://chatgpt.com')throw ui('نشانی سرویس تغییر کرده؛ گفتگو خوانده نشد.')
  if(location.pathname!==state.path){if(freshPath(state.path)&&(threadPath(location.pathname)&&owns(state)||freshPath(location.pathname)&&!users().length&&!turns().length))state.path=location.pathname;else throw ui('گفتگوی درخواست تغییر کرده؛ پاسخ گفتگوی دیگری استفاده نمی‌شود.')}
  const ownUsers=users(),allowed=state.options.markers||[]
  if(state.options.context){
   if(ownUsers.some(el=>!allowed.some(marker=>(el.textContent||'').includes(marker))))throw ui('این گفتگو پیام غیرمرتبط دارد؛ گفتگوی تازه را صریحاً انتخاب کنید.')
   if(!freshPath(state.path)&&!ownUsers.length)throw ui('مالکیت گفتگوی ادامه‌دار تأیید نشد؛ خواندن انجام نشد.')
  }else if(!state.sent&&!owns(state)&&(ownUsers.length||turns().length||!freshPath(state.path)))throw ui('تب تازهٔ Chat لازم است؛ گفتگوی قبلی استفاده نمی‌شود.')
 }
 function composer(){
  const all=[...document.querySelectorAll('#prompt-textarea,[data-testid="prompt-textarea"],[data-testid="composer-input"],form textarea,main [role="textbox"][contenteditable="true"],form [contenteditable="true"]')].filter(el=>dom.visible(el)&&!el.disabled&&!el.readOnly&&(el instanceof HTMLTextAreaElement||el.isContentEditable))
  const unique=all.filter(el=>!all.some(other=>other!==el&&el.contains(other)));if(unique.length>1)throw ui('بیش از یک کادر پیام پیدا شد؛ ارسال انجام نشد.');return unique[0]
 }
 const inWork=()=>[...document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],[role="tab"][data-state="active"]')].some(el=>dom.visible(el)&&/^(work|codex)$/i.test(el.innerText.trim()))
 const switchers=()=>[...document.querySelectorAll('[role="tab"],button,a')].filter(el=>dom.visible(el)&&/^(chat|چت|گفتگو)$/i.test(el.innerText.trim()))
 async function ready(state){
  const until=Math.min(state.deadline,Date.now()+20000);let selected=false,shown=false
  while(Date.now()<until){
   check(state);if(owns(state)){state.sent=true;return null}
   if(inWork()){const buttons=switchers();if(!selected&&buttons.length===1){buttons[0].click();selected=true;await pause();continue}if(selected){await pause();continue}throw ui('در تب بازشده حالت Chat را انتخاب کنید؛ Work/Codex استفاده نمی‌شود.')}
   const input=composer();if(input)return input
   if(!shown){shown=true;await chrome.runtime.sendMessage({type:'CHAT_VISIBLE',id:state.id}).catch(()=>{})}
   await pause()
  }
  throw ui('کادر Chat آماده نشد؛ در تب بازشده وارد حساب شوید و سپس مرحله را بازیابی کنید. ارسال انجام نشد.')
 }
 function fill(state,input,value){
  check(state);const current=input instanceof HTMLTextAreaElement?input.value:input.innerText,normalize=s=>s.replace(/\s+/g,' ').trim()
  if(normalize(current)===normalize(value))return
  if(current.trim())throw ui('کادر Chat متن غیرمرتبط دارد؛ برای حفظ آن ارسال انجام نشد. گفتگوی تازه را صریحاً انتخاب کنید.')
  input.focus();if(input instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}else{document.execCommand('insertText',false,value);input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}))}
  if(normalize(input instanceof HTMLTextAreaElement?input.value:input.innerText)!==normalize(value))throw ui('نوشتن پیام تأیید نشد؛ ارسال انجام نشد.')
 }
 async function send(state,input){
  const until=Math.min(state.deadline,Date.now()+30000)
  while(Date.now()<until){
   check(state);if(owns(state)){state.sent=true;await dom.notify(state,'sent');return}
   if(inWork())throw ui('حالت Work/Codex فعال شد؛ ارسال انجام نشد.')
   const root=input.closest('form')||document,buttons=[...root.querySelectorAll('button[data-testid="send-button"],button[data-testid="composer-send-button"],button#composer-submit-button,button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="ارسال پیام"],button[type="submit"]')].filter(el=>dom.visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true')
   if(buttons.length===1){if(!await dom.notify(state,'prepared'))throw ui('درخواست متوقف شده؛ پیام فرستاده نشد.');state.sent=true;buttons[0].click();await dom.notify(state,'sent',owns(state));return}
   await pause()
  }
  throw ui('دکمهٔ ارسال آماده یا یکتا نشد؛ متن همین درخواست حفظ شد. با بازیابی مرحله دوباره ارسال نمی‌شود مگر هنوز ارسال نشده باشد.')
 }
 const stopped=()=>![...document.querySelectorAll('button[data-testid="stop-button"],button[data-testid="composer-stop-button"],button[aria-label="Stop generating"],[data-is-streaming="true"]')].some(dom.visible)
 return{turns,users,owns,check,ready,fill,send,stopped}
})()
