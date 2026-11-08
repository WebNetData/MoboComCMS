// Refuse unknown/ambiguous DOM instead of calling private APIs or extracting cookies.
globalThis.mobocomOtherChatPage = provider => {
 const adapter=globalThis.mobocomWebProviders[provider]
 if(!adapter?.fresh)throw Error('سرویس چت پشتیبانی نمی‌شود.')
 const visible=e=>e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'
 const pause=()=>new Promise(r=>setTimeout(r,250))
 const ui=message=>Object.assign(Error(message),{code:'CHAT_UI'})
 function fresh(){if(location.origin!==adapter.origin||!adapter.fresh.test(location.pathname)||document.querySelector(adapter.existing))throw ui('گفتگوی تازه لازم است؛ گفتگوی قبلی یا نشانی تغییرکرده استفاده نمی‌شود.')}
 async function ready(id,deadline){
   const until=Math.min(deadline,Date.now()+15000);let shown=false
   while(Date.now()<until){
     fresh()
     const nodes=[...document.querySelectorAll(adapter.input)].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&(e instanceof HTMLTextAreaElement||e.isContentEditable))
     const inputs=nodes.filter(e=>!nodes.some(n=>n!==e&&e.contains(n)))
     if(inputs.length>1)throw ui('بیش از یک کادر پیام پیدا شد؛ ارسال انجام نشد.')
     if(inputs.length===1)return inputs[0]
     if(!shown){shown=true;await chrome.runtime.sendMessage({type:'CHAT_VISIBLE',id}).catch(()=>{})}
     await pause()
   }
   throw ui('رابط چت آماده نیست؛ در تب بازشده وارد حساب شوید و گفتگوی تازه باز کنید. رابط تغییرکرده، محدودیت یا چالش ورود به‌طور خودکار دور زده نمی‌شود؛ ارسال انجام نشد.')
 }
 function fill(input,text){
   fresh();const value=e=>e instanceof HTMLTextAreaElement?e.value:e.innerText
   if(value(input).trim())throw ui('کادر پیام از قبل متن دارد؛ ارسال انجام نشد.')
   input.focus()
   if(input instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))}
   else{document.execCommand('insertText',false,text);input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}))}
   const normalize=t=>t.replace(/\s+/g,' ').trim()
   if(normalize(value(input))!==normalize(text))throw ui('نوشتن پیام تأیید نشد؛ ارسال انجام نشد.')
 }
 async function send(input,deadline){
   const until=Math.min(deadline,Date.now()+10000)
   while(Date.now()<until){
     fresh()
     const root=input.closest('form')||document,buttons=[...root.querySelectorAll(adapter.send)].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true')
     if(buttons.length===1){buttons[0].click();return}
     await pause()
   }
   throw ui('دکمهٔ ارسال پشتیبانی‌شده آماده یا یکتا نیست؛ ارسال انجام نشد. تب سرویس را بررسی کنید.')
 }
 return{ready,fill,send,turns:()=>document.querySelectorAll(adapter.turns),stopped:()=>![...document.querySelectorAll('[aria-label="Stop generating"],[aria-label="Stop response"],button.stop-button,[data-testid="stop-button"]')].some(visible)}
}
