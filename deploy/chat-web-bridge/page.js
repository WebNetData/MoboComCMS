// DOM-only support for fresh, bridge-owned Chat tabs. Never authenticates or reads history.
globalThis.mobocomChatPage = (() => {
  const pause = () => new Promise(r => setTimeout(r,250))
  const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  const uiError = message => Object.assign(new Error(message),{code:'CHAT_UI'})
  const existingTurns = () => document.querySelector('[data-message-author-role], [data-testid="assistant-turn"], [data-testid="user-turn"]')
  function fresh() { if(location.origin!=='https://chatgpt.com'||!/^\/(?:chat\/?|chat\/new\/?)?$/.test(location.pathname)||existingTurns())throw uiError('تب تازهٔ Chat لازم است؛ گفتگوی قبلی برای تولید استفاده نمی‌شود.') }
  function composer() {
    const nodes=Array.from(document.querySelectorAll('#prompt-textarea, [data-testid="prompt-textarea"], [data-testid="composer-input"], form textarea, main [role="textbox"][contenteditable="true"], form [contenteditable="true"]'))
      .filter(el=>visible(el)&&!el.disabled&&!el.readOnly&&(el instanceof HTMLTextAreaElement||el.isContentEditable))
    const unique=nodes.filter(el=>!nodes.some(other=>other!==el&&el.contains(other)))
    if(unique.length>1)throw uiError('بیش از یک کادر پیام در Chat پیدا شد؛ در تب بازشده حالت Chat و گفتگوی تازه را انتخاب کنید.')
    return unique[0]
  }
  const inWork = () => Array.from(document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],[role="tab"][data-state="active"]')).some(el=>visible(el)&&/^(work|codex)$/i.test(el.innerText.trim()))
  const chatSwitch = () => Array.from(document.querySelectorAll('[role="tab"],button,a')).filter(el=>visible(el)&&/^(chat|چت|گفتگو)$/i.test(el.innerText.trim()))
  function mode() { if(inWork())throw uiError('حالت Work/Codex فعال است؛ در تب ChatGPT حالت Chat را انتخاب و در موبوکام صریحاً دوباره تلاش کنید.') }
  async function ready(id,deadline) {
    fresh()
    const started=Date.now(),until=Math.min(deadline,started+15000);let announced=false,selected=false
    while(Date.now()<until){
      fresh()
      if(inWork()){
        const chat=chatSwitch()
        if(!selected&&chat.length===1){chat[0].click();selected=true;await pause();continue}
        if(selected){await pause();continue}
        mode()
      }
      const input=composer();if(input)return input
      if(!selected){const chat=chatSwitch();if(chat.length===1&&chat[0].getAttribute('aria-selected')!=='true'){chat[0].click();selected=true}}
      if(!announced&&Date.now()-started>3000){announced=true;await chrome.runtime.sendMessage({type:'CHAT_VISIBLE',id}).catch(()=>{})}
      await pause()
    }
    throw uiError('کادر نوشتن Chat پیدا نشد. تب ChatGPT باز شد؛ در همان پروفایل مرورگر وارد حساب شوید، حالت Chat و گفتگوی تازه را انتخاب کنید، سپس در موبوکام «تلاش مجدد» را بزنید. اگر آماده است، رابط فعلی هنوز پشتیبانی نمی‌شود؛ ارسال انجام نشد.')
  }
  function fill(input,text) {
    fresh()
    if((input instanceof HTMLTextAreaElement?input.value:input.innerText).trim())throw uiError('کادر Chat از قبل متن دارد؛ برای حفظ آن ارسال انجام نشد. گفتگوی تازه را انتخاب کنید.')
    input.focus()
    if(input instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))}
    else{document.execCommand('insertText',false,text);input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}))}
    const normalized=value=>value.replace(/\s+/g,' ').trim()
    if(normalized(input instanceof HTMLTextAreaElement?input.value:input.innerText)!==normalized(text))throw uiError('نوشتن در کادر Chat تأیید نشد؛ درخواست ارسال نشد.')
  }
  async function send(input,deadline) {
    const until=Math.min(deadline,Date.now()+10000)
    while(Date.now()<until){
      mode();fresh()
      const root=input.closest('form')||document
      const candidates=Array.from(root.querySelectorAll('button[data-testid="send-button"], button[data-testid="composer-send-button"], button#composer-submit-button, button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="Send"], button[aria-label="ارسال پیام"], button[type="submit"]')).filter(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true')
      if(candidates.length===1){candidates[0].click();return} // Exactly one send. No API or replay.
      await pause()
    }
    throw uiError('دکمهٔ ارسال Chat آماده یا یکتا نیست؛ ورود، سهمیه و رابط را در تب بازشده بررسی کنید. ارسال انجام نشد.')
  }
  const turns=()=>document.querySelectorAll('[data-message-author-role="assistant"], [data-testid="assistant-turn"]')
  const stopped=()=>!Array.from(document.querySelectorAll('button[data-testid="stop-button"],button[data-testid="composer-stop-button"],button[aria-label="Stop generating"]')).some(visible)
  return{ready,fill,send,turns,stopped}
})()
