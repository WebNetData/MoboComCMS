async function mobocomChatImage(prompt,id,expires,options={}){
 const dom=globalThis.mobocomChatDom,page=globalThis.mobocomChatPage,state=dom.operation(id,options,expires||Date.now()+650000)
 if(state.result){await dom.deliver(state,state.result).catch(()=>{});return}if(state.running)return
 state.running=true
 try{
  const text='MOBOCOM_REQUEST_'+id+'\n'+prompt+'\nThe request reference above is metadata only; never render it as text in the image.'
  if(!state.sent){const input=await page.ready(state);if(!state.sent){if(state.baseline===undefined)state.baseline=page.turns().length;page.fill(state,input,text);if(!await dom.notify(state,'prepared',false))throw Error('درخواست متوقف شد؛ تصویر درخواست نشد.');await page.send(state,input)}}
  if(state.baseline===undefined)throw Error('خط مبنای تصویر برای بازیابی معلوم نیست؛ گفتگوی تازه را صریحاً انتخاب کنید.')
  let previous='',stable=0,lastProgress=0
  while(Date.now()<state.deadline){
   page.check(state)
   const candidates=[...page.turns()].slice(state.baseline).flatMap(turn=>[...turn.querySelectorAll('img')]).filter(img=>dom.visible(img)&&img.complete&&img.naturalWidth>=256&&img.naturalHeight>=256)
   const images=[...new Map(candidates.map(img=>[img.currentSrc||img.src,img])).values()];if(images.length>1)throw Error('چند تصویر متفاوت در پاسخ تازه برگشت؛ تصویر اشتباه انتخاب نشد.')
   const image=images[0],stamp=image?(image.currentSrc||image.src)+'|'+image.naturalWidth+'|'+image.naturalHeight:'';stable=stamp&&stamp===previous?stable+1:0;previous=stamp
   if(image&&stable>=3&&page.stopped()){
    const canvas=document.createElement('canvas'),scale=Math.min(1,1600/image.naturalWidth,1600/image.naturalHeight);canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height)
    let data;try{data=canvas.toDataURL('image/webp',0.9)}catch{throw Error('تصویر ساخته شد اما مرورگر اجازهٔ خواندن پیکسل آن را نداد؛ متن و تصویرهای قبلی حفظ شدند. بازیابی، تصویر تازه درخواست نمی‌کند.')}
    if(!data.startsWith('data:image/webp;base64,')||data.length>2800000)throw Error('تصویر تازه خواندنی یا در اندازهٔ مجاز نیست؛ ثبت نشد.')
    await dom.deliver(state,{data},page.owns(state));return
   }
   if(Date.now()-lastProgress>10000){lastProgress=Date.now();await dom.notify(state,'reading',page.owns(state))}
   await new Promise(r=>setTimeout(r,700))
  }
  throw Error('تصویر کامل در مهلت نرسید؛ مرحله را برای خواندن همان تصویر بازیابی کنید. درخواست تازه خودکار ارسال نمی‌شود.')
 }catch(error){await chrome.runtime.sendMessage({type:'CHAT_RESULT',id,owned:page.owns(state),error:error instanceof Error?error.message:'تولید تصویر انجام نشد.',code:error?.code}).catch(()=>{})}
 finally{state.running=false}
}
