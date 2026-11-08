// Capture only a newly generated bitmap in the bridge's fresh assistant turn.
// No media/private inference endpoint, cookie export, download history or existing tabs.
async function mobocomChatImage(prompt,id,deadline) {
  const send=result=>chrome.runtime.sendMessage({type:'CHAT_RESULT',id,...result}).catch(()=>{})
  const pause=()=>new Promise(resolve=>setTimeout(resolve,700))
  try{
    if(location.origin!=='https://chatgpt.com'||location.pathname!=='/'||document.querySelector('[data-message-author-role]'))throw Error('برای تولید تصویر تب تازهٔ Chat لازم است.')
    let composer
    while(Date.now()<deadline){composer=document.querySelector('#prompt-textarea');if(composer)break;await pause()}
    if(!composer)throw Error('در ChatGPT وارد شوید؛ ابزار تصویر یا رابط آماده نیست.')
    if(Array.from(document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"]')).some(el=>/^(work|codex)$/i.test(el.innerText.trim())))throw Error('ابتدا حالت Chat را در حساب انتخاب کنید.')
    composer.focus()
    if(composer instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(composer,prompt);composer.dispatchEvent(new Event('input',{bubbles:true}))}
    else{document.execCommand('insertText',false,prompt);composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}))}
    let button;for(let i=0;i<20;i++){button=document.querySelector('button[data-testid="send-button"]');if(button&&!button.disabled)break;await pause()}
    if(!button||button.disabled)throw Error('ابزار تصویر Chat آماده نیست؛ ورود، سهمیه یا رابط را بررسی کنید.')
    button.click()
    let previous='',stable=0
    while(Date.now()<deadline){
      const images=Array.from(document.querySelectorAll('[data-message-author-role="assistant"] img')).filter(img=>img.complete&&img.naturalWidth>=256&&img.naturalHeight>=256)
      if(images.length>1)throw Error('بیش از یک تصویر برگشت؛ برای جلوگیری از انتخاب اشتباه ثبت نشد.')
      const image=images[0],stamp=image?image.currentSrc+'|'+image.naturalWidth+'|'+image.naturalHeight:''
      stable=stamp&&stamp===previous?stable+1:0;previous=stamp
      if(image&&stable>=8&&!document.querySelector('button[data-testid="stop-button"]')){
        const canvas=document.createElement('canvas'),scale=Math.min(1,1600/image.naturalWidth,1600/image.naturalHeight);canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale)
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height)
        let data;try{data=canvas.toDataURL('image/webp',0.9)}catch{throw Error('مرورگر اجازهٔ خواندن پیکسل تصویر Chat را نداد؛ دریافت مخفی انجام نمی‌شود.')}
        if(!data.startsWith('data:image/webp;base64,')||data.length>2800000)throw Error('تصویر خواندنی یا در اندازهٔ مجاز نیست؛ ثبت نشد.')
        await send({data});return
      }
      await pause()
    }
    throw Error('تصویر کامل دریافت نشد؛ سهمیه، ورود یا تغییر رابط را بررسی کنید. خودکار تکرار نشد.')
  }catch(e){await send({error:e instanceof Error?e.message:'تولید تصویر انجام نشد.'})}
}
