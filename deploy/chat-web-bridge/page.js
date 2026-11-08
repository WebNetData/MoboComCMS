// Only fresh tabs or the bridge's explicitly pinned per-item conversation.
globalThis.mobocomChatPage=(()=>{
 const dom=globalThis.mobocomChatDom,pause=()=>new Promise(r=>setTimeout(r,250))
 const ui=message=>Object.assign(Error(message),{code:'CHAT_UI'})
 const userSelector='[data-message-author-role="user"],[data-testid="user-turn"],article[data-turn="user"],[data-user-message-bubble]',assistantSelector='[data-message-author-role="assistant"],[data-testid="assistant-turn"],article[data-turn="assistant"]',chromeSelector='nav,aside,header,[role="navigation"],[role="dialog"],form,[contenteditable="true"],[data-thread-title]'
 const nodes=(selector,opposite)=>{const role=opposite==='user'?'assistant':'user',labels=role==='user'?/^(?:You said|شما گفتید)\s*:?$/:/^(?:ChatGPT said|ChatGPT گفت|چت.?جی.?پی.?تی گفت)\s*:?$/,semantic=dom.outer('article[data-testid^="conversation-turn"],section[data-testid^="conversation-turn"]').filter(el=>{const heading=dom.query('h1,h2,h3,h4,h5,h6,[role="heading"]',el)[0];return labels.test((el.getAttribute('aria-label')||heading?.textContent||'').trim())}),all=[...new Set([...dom.outer(selector),...semantic].map(el=>{const article=dom.closest(el,'article[data-testid^="conversation-turn"],article[data-turn]');return article&&!dom.query(opposite==='user'?userSelector:assistantSelector,article).length?article:el}))];return all.filter(el=>!all.some(other=>other!==el&&dom.contains(other,el)))}
 const users=()=>nodes(userSelector,'assistant')
 const responsePart=el=>dom.visible(el)&&!dom.closest(el,userSelector+','+chromeSelector)&&!dom.query(userSelector,el).length
 function region(el){let scope=el;for(let parent=globalThis.mobocomChatTree.parent(scope),depth=0;parent&&depth<12;parent=globalThis.mobocomChatTree.parent(parent),depth++){if(parent.matches('body,html,main,[role="main"],'+chromeSelector)||dom.query(userSelector,parent).length||dom.query(dom.composerSelector,parent).length)break;scope=parent}return scope}
 const targets=()=>dom.query('[data-search-result-target]').filter(responsePart).map(region)
 const turns=()=>{const all=[...new Set([...nodes(assistantSelector,'user'),...targets()])];return all.filter(el=>!all.some(other=>other!==el&&dom.contains(other,el)))}
 const freshPath=path=>/^\/(?:chat\/?|chat\/new\/?)?$/.test(path),threadPath=path=>/^\/c\/[a-z0-9-]+\/?$/i.test(path)
 const owns=state=>users().some(el=>dom.text(el).includes('MOBOCOM_REQUEST_'+state.id))
 const responses=state=>{const user=users().find(el=>dom.text(el).includes('MOBOCOM_REQUEST_'+state.id));if(!user)throw ui('پیام همین درخواست هنوز در گفتگو پیدا نشد؛ پاسخ دیگری خوانده نمی‌شود.');const known=turns().filter(el=>dom.after(user,el));if(known.length)return known;const root=dom.closest(user,'main,[role="main"]')||document.body,all=[...new Set(dom.query('pre,.markdown,[data-markdown],p'+(state.mode==='image'?',img':''),root).filter(el=>responsePart(el)&&dom.after(user,el)&&(el.tagName!=='IMG'||globalThis.mobocomChatImageData?.supports(el))).map(region))];return all.filter(el=>!all.some(other=>other!==el&&dom.contains(other,el)))}
 function check(state){
  if(location.origin!=='https://chatgpt.com')throw ui('نشانی سرویس تغییر کرده؛ گفتگو خوانده نشد.')
  if(location.pathname!==state.path){if(freshPath(state.path)&&(threadPath(location.pathname)&&owns(state)||freshPath(location.pathname)&&!users().length&&!turns().length))state.path=location.pathname;else throw ui('گفتگوی درخواست تغییر کرده؛ پاسخ گفتگوی دیگری استفاده نمی‌شود.')}
  const ownUsers=users(),allowed=state.options.markers||[]
  if(state.options.context){
   if(ownUsers.some(el=>!allowed.some(marker=>dom.text(el).includes(marker))))throw ui('این گفتگو پیام غیرمرتبط دارد؛ گفتگوی تازه را صریحاً انتخاب کنید.')
   if(!freshPath(state.path)&&!ownUsers.length)throw ui('مالکیت گفتگوی ادامه‌دار تأیید نشد؛ خواندن انجام نشد.')
  }else if(!state.sent&&!owns(state)&&(ownUsers.length||turns().length||!freshPath(state.path)))throw ui('تب تازهٔ Chat لازم است؛ گفتگوی قبلی استفاده نمی‌شود.')
 }
 function composer(){
  const eligible=el=>dom.visible(el)&&!el.disabled&&!el.readOnly&&(el instanceof HTMLTextAreaElement||el.isContentEditable);let all=[...document.querySelectorAll(dom.composerSelector)].filter(eligible);if(!all.length)all=[...document.querySelectorAll('main textarea,[role="main"] textarea,main [contenteditable="true"],[role="main"] [contenteditable="true"]')].filter(eligible)
  const unique=all.filter(el=>!all.some(other=>other!==el&&el.contains(other)));if(unique.length>1)throw ui('بیش از یک کادر پیام پیدا شد؛ ارسال انجام نشد.');return unique[0]
 }
 async function settle(state){
  while(Date.now()<state.deadline){
   try{check(state);state.routePending=false;return}catch(error){
    const markers=[...(state.options.markers||[]),'MOBOCOM_REQUEST_'+state.id],messages=users(),owned=messages.length&&messages.every(el=>markers.some(marker=>dom.text(el).includes(marker)))
    if(location.origin!=='https://chatgpt.com'||!freshPath(state.path)||threadPath(location.pathname)||!owned)throw error
    // The nonce is present, but the router has not committed its canonical path.
    // Do not read/deliver results or send another prompt during this transition.
    state.routePending=true;await pause()
   }
  }
  throw ui('نشانی نهایی گفتگو در مهلت همین درخواست آماده نشد؛ پاسخ حفظ شده و درخواست دوباره ارسال نمی‌شود.')
 }
 const inWork=()=>[...document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],[role="tab"][data-state="active"]')].some(el=>dom.visible(el)&&/^(work|codex)$/i.test(el.innerText.trim()))
 const switchers=()=>[...document.querySelectorAll('[role="tab"],button,a')].filter(el=>dom.visible(el)&&/^(chat|چت|گفتگو)$/i.test(el.innerText.trim()))
 async function ready(state){
  const until=Math.min(state.deadline,Date.now()+20000);let selected=false,shown=false
  while(Date.now()<until){
   await settle(state);if(owns(state)){state.sent=true;return null}
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
 async function imageMode(state,input,payload){
  await settle(state);const current=input instanceof HTMLTextAreaElement?input.value:input.innerText,normalize=value=>(value||'').replace(/\s+/g,' ').trim();if(current.trim()&&normalize(current)!==normalize(payload))return
  const root=input.closest('form')||input.parentElement,names=new Set(['Create image','Create images','Generate image','ساخت تصویر','ایجاد تصویر','تولید تصویر']),label=el=>(el.getAttribute('aria-label')||el.innerText||'').replace(/\s+/g,' ').trim()
  if([...root.querySelectorAll('[aria-pressed="true"],[aria-selected="true"],button')].some(el=>dom.visible(el)&&(/^(?:Remove|حذف) (?:Create image|image|تصویر)/i.test(label(el))||names.has(label(el))&&(el.getAttribute('aria-pressed')==='true'||el.getAttribute('aria-selected')==='true')))){state.imageTool='selected';return}
  const choices=scope=>[...scope.querySelectorAll('button,[role="menuitem"]')].filter(el=>dom.visible(el)&&!el.disabled&&!el.closest('a[href]')&&names.has(label(el)))
  let choice=choices(root);if(choice.length===1){choice[0].click();state.imageTool='selected';await pause();return}
  const tools=[...root.querySelectorAll('button')].filter(el=>dom.visible(el)&&!el.disabled&&/^(?:Tools|More tools|Add files and more|Add photos and files|ابزارها|ابزارهای بیشتر|افزودن فایل و بیشتر)$/i.test(label(el)))
  if(tools.length!==1){state.imageTool='prompt';return}
  tools[0].click();await pause();const menus=[...document.querySelectorAll('[role="menu"],[role="dialog"]')].filter(dom.visible);choice=menus.flatMap(choices)
  if(choice.length===1){choice[0].click();state.imageTool='selected';await pause();return}
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));input.focus();state.imageTool='prompt'
 }
 async function confirmSent(state){
  // The send is already recorded. Hydration may outlast readiness's short budget;
  // observe it within the original operation deadline rather than fail and replay.
  const until=state.deadline
  while(Date.now()<until){
   if(location.origin!=='https://chatgpt.com')throw ui('نشانی سرویس تغییر کرده؛ ارسال دیگری انجام نشد.')
   if(owns(state)){await settle(state);state.path=location.pathname;await dom.notify(state,'sent',true);state.confirmed=true;return}
   if(location.pathname!==state.path&&!(freshPath(state.path)&&(threadPath(location.pathname)||freshPath(location.pathname)||/^\/c\/?$/.test(location.pathname))))throw ui('گفتگوی درخواست تغییر کرده؛ پاسخ دیگری خوانده نشد.')
   const allowed=state.options.markers||[],foreign=users().some(el=>{const value=dom.text(el).trim();return value&&!allowed.some(marker=>value.includes(marker))})
   if(foreign)throw ui('گفتگو پیام نامرتبط دارد؛ ارسال نامطمئن تکرار نشد.')
   await pause()
  }
  throw ui('کلیک ارسال ثبت شد اما نمایش پیام هنوز تأیید نشد؛ برای خواندن همان درخواست بازیابی کنید. ارسال دوباره فقط با گفتگوی تازه مجاز است.')
 }
 async function send(state,input){
  const until=Math.min(state.deadline,Date.now()+30000)
  while(Date.now()<until){
   await settle(state);if(owns(state)){state.sent=true;await confirmSent(state);return}
   if(inWork())throw ui('حالت Work/Codex فعال شد؛ ارسال انجام نشد.')
   const root=input.closest('form')||document,buttons=[...root.querySelectorAll('button[data-testid="send-button"],button[data-testid="composer-send-button"],button#composer-submit-button,button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="ارسال پیام"],button[type="submit"]')].filter(el=>dom.visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true')
   if(buttons.length===1){if(!await dom.notify(state,'dispatched',false))throw ui('درخواست متوقف شده؛ پیام فرستاده نشد.');state.sent=true;buttons[0].click();await confirmSent(state);return}
   await pause()
  }
  throw ui('دکمهٔ ارسال آماده یا یکتا نشد؛ متن همین درخواست حفظ شد. با بازیابی مرحله دوباره ارسال نمی‌شود مگر هنوز ارسال نشده باشد.')
 }
 const stopped=state=>{const controls=dom.query('button[data-testid="stop-button"],button[data-testid="composer-stop-button"],button[aria-label="Stop generating"]');if(controls.some(dom.visible))return false;return !responses(state).some(el=>el.matches('[data-is-streaming="true"]')||dom.query('[data-is-streaming="true"],[role="progressbar"]',el).some(dom.visible))}
 return{turns,users,responses,owns,check,settle,ready,fill,send,imageMode,confirmSent,stopped}
})()
