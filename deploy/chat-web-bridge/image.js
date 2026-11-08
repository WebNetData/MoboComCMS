async function mobocomChatImage(prompt,id,expires,options={}){
 const dom=globalThis.mobocomChatDom,page=globalThis.mobocomChatPage,state=dom.operation(id,options,expires||Date.now()+650000)
 state.mode='image'
 if(state.result){await dom.deliver(state,state.result).catch(()=>{});return}if(state.running)return
 state.running=true;let choice
 try{
  const text='MOBOCOM_REQUEST_'+id+'\nFor this turn, use the built-in image creation tool and actually generate exactly ONE image. The earlier text-only/JSON instruction applied only to the earlier text request. Do not return another article, JSON or an image prompt.\n'+prompt+'\nThe request reference above is metadata only; never render it as text in the image.'
  if(!state.sent){let input=await page.ready(state);if(!state.sent){await page.imageMode(state,input,text);input=await page.ready(state);if(state.baseline===undefined)state.baseline=page.turns().length;page.fill(state,input,text);if(!await dom.notify(state,'prepared',false))throw Error('درخواست متوقف شد؛ تصویر درخواست نشد.');await page.send(state,input)}}
  if(state.baseline===undefined)throw Error('خط مبنای تصویر برای بازیابی معلوم نیست؛ گفتگوی تازه را صریحاً انتخاب کنید.')
  if(!state.confirmed)await page.confirmSent(state)
  const visibleImages=()=>[...new Set(page.responses(state).flatMap(turn=>dom.query('img',turn)))].filter(img=>dom.visible(img)&&!dom.closest(img,'[aria-hidden="true"]')&&mobocomChatImageData.supports(img))
  choice=mobocomChatImageChoice(state,visibleImages)
  const readyImages=()=>[...new Map(visibleImages().filter(img=>img.complete&&img.naturalWidth>=256&&img.naturalHeight>=256).map(img=>[img.currentSrc||img.src,img])).values()]
  let previous='',stable=0,lastProgress=0,plain='',plainSince=0
  while(Date.now()<state.deadline){
   await page.settle(state)
   const visible=visibleImages(),images=readyImages()
   const image=choice.pick(images),stamp=image?(image.currentSrc||image.src)+'|'+image.naturalWidth+'|'+image.naturalHeight:'';stable=stamp&&stamp===previous?stable+1:0;previous=stamp
   if(image&&stable>=3&&page.stopped(state)){
    const control=new AbortController();state.imageReadAbort=control;state.imageReadSource=image.currentSrc||image.src;let data
    try{data=await mobocomChatImageData(image,{deadline:state.deadline,signal:control.signal,onStage:stage=>{state.imageTransferStage=stage}})}catch(error){if(control.signal.aborted){previous='';stable=0;continue}throw error}finally{if(state.imageReadAbort===control){delete state.imageReadAbort;delete state.imageReadSource}}
    const selected=choice.pick(readyImages());if(!selected||(selected.currentSrc||selected.src)!==(image.currentSrc||image.src)){previous='';stable=0;continue}
    await dom.deliver(state,{data},page.owns(state));return
   }
   if(!visible.length&&page.stopped(state)){const answer=page.responses(state).map(dom.text).join('\n'),creating=/(?:creating|generating|imagining)(?:\s+an?)?\s+(?:image|picture)|در حال (?:ساخت|تولید|آماده.?سازی) تصویر/i.test(answer);if(!creating&&answer.trim()&&answer===plain){if(plainSince&&Date.now()-plainSince>20000)throw Error('Chat به درخواست تصویر فقط متن پاسخ داد؛ ابزار تولید تصویر این گفتگو اجرا نشد. وضعیت ابزار/سهمیه را در Chat بررسی کنید؛ متن و تصاویر قبلی حفظ شده‌اند.')}else{plain=answer;plainSince=Date.now()}}
   if(Date.now()-lastProgress>10000){lastProgress=Date.now();await dom.notify(state,'reading',page.owns(state))}
   await new Promise(r=>setTimeout(r,700))
  }
  throw Error('تصویر کامل در مهلت نرسید؛ مرحله را برای خواندن همان تصویر بازیابی کنید. درخواست تازه خودکار ارسال نمی‌شود.')
 }catch(error){await chrome.runtime.sendMessage({type:'CHAT_RESULT',id,owned:page.owns(state),error:error instanceof Error?error.message:'تولید تصویر انجام نشد.',code:error?.code}).catch(()=>{})}
 finally{choice?.close();delete state.imageReadAbort;delete state.imageReadSource;state.running=false}
}
