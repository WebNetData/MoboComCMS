// Injected only into a fresh tab created by the bridge, never an existing chat.
async function mobocomChatRun(prompt, id, expires) {
  const send=result=>chrome.runtime.sendMessage({type:'CHAT_RESULT',id,...result}).catch(()=>{})
  const marker='MOBOCOM_END_'+id, deadline=expires||Date.now()+150000
  const pause=()=>new Promise(resolve=>setTimeout(resolve,500))
  try {
    if(location.origin!=='https://chatgpt.com'||location.pathname!=='/')throw Error('تب تازهٔ ChatGPT لازم است.')
    let composer
    while(Date.now()<deadline){composer=document.querySelector('#prompt-textarea');if(composer)break;await pause()}
    if(!composer)throw Error('در مرورگر وارد ChatGPT شوید و حالت Chat را انتخاب کنید؛ رابط پشتیبانی‌شده پیدا نشد.')
    if(Array.from(document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"]')).some(el=>/^(work|codex)$/i.test(el.innerText.trim())))throw Error('حالت Work/Codex انتخاب شده؛ ابتدا در حساب خود Chat را انتخاب کنید.')
    // Never reuse any page with existing assistant/user turns.
    if(document.querySelector('[data-message-author-role]'))throw Error('تب تازه نبود؛ برای حفظ گفتگوهای قبلی ارسال متوقف شد.')
    composer.focus()
    const text=prompt+'\n\nRespond with the requested text only; do not use apps, tools or perform actions. End your final answer with this exact separate line:\n'+marker
    if(composer instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(composer,text);composer.dispatchEvent(new Event('input',{bubbles:true}))}
    else {document.execCommand('insertText',false,text);composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}))}
    let button
    for(let i=0;i<20;i++){button=document.querySelector('button[data-testid="send-button"]');if(button&&!button.disabled)break;await pause()}
    if(!button||button.disabled)throw Error('دکمهٔ ارسال Chat وب آماده نیست؛ ورود، سهمیه و رابط را بررسی کنید.')
    button.click() // exactly once; no private API, retries or CAPTCHA handling
    let previous='',stable=0
    while(Date.now()<deadline){
      const turns=document.querySelectorAll('[data-message-author-role="assistant"]'),last=turns[turns.length-1]
      const answer=(last?.querySelector('.markdown')||last)?.innerText?.trim()||''
      if(answer.length>65000)throw Error('پاسخ Chat وب بیش از حد بزرگ بود.')
      stable=answer===previous?stable+1:0;previous=answer
      if(answer.endsWith(marker)&&stable>=4&&!document.querySelector('button[data-testid="stop-button"]')){const result=answer.slice(0,-marker.length).trim();if(!result||result.length>60000)throw Error('پاسخ معتبر دریافت نشد.');await send({text:result});return}
      await pause()
    }
    throw Error('پاسخ کامل Chat وب نرسید؛ درخواست خودکار تکرار نشد. سهمیه، ورود یا تغییر رابط را بررسی کنید.')
  } catch(e){await send({error:e instanceof Error?e.message:'اجرای Chat وب انجام نشد.'})}
}
