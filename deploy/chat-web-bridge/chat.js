async function mobocomChatRun(prompt,id,expires,provider='chatgpt',options={}){
 const dom=globalThis.mobocomChatDom,state=dom.operation(id,options,expires||Date.now()+530000)
 if(state.result){await dom.deliver(state,state.result).catch(()=>{});return}if(state.running)return
 state.running=true
 try{
  const page=provider==='chatgpt'?globalThis.mobocomChatPage:globalThis.mobocomOtherChatPage(provider),marker='MOBOCOM_END_'+id,text='MOBOCOM_REQUEST_'+id+'\n'+prompt+'\n\nRespond with the requested text only; do not use apps, tools or perform actions. End your final answer with this exact separate line:\n'+marker
  if(!state.sent){
   const input=provider==='chatgpt'?await page.ready(state):await page.ready(id,state.deadline)
   if(!state.sent){if(state.baseline===undefined)state.baseline=page.turns().length;if(provider==='chatgpt')page.fill(state,input,text);else page.fill(input,text);if(!await dom.notify(state,'prepared',false))throw Error('درخواست متوقف شد؛ ارسال انجام نشد.');if(provider==='chatgpt')await page.send(state,input);else{state.sent=true;await page.send(input,state.deadline);await dom.notify(state,'sent')}}
  }
  let previous='',stable=0,lastProgress=0
  while(Date.now()<state.deadline){
   if(provider==='chatgpt')page.check(state)
   const all=page.turns(),answer=[...all].slice(state.baseline||0).map(dom.text).join('\n')
   if(answer.length>90000)throw Error('پاسخ Chat بیش از حد بزرگ شد؛ درخواست تکرار نشد.')
   const result=dom.completed(answer,marker);stable=result&&result===previous?stable+1:0;previous=result
   if(result&&stable>=2&&page.stopped()){await dom.deliver(state,{text:result},provider==='chatgpt'?page.owns(state):true);return}
   if(Date.now()-lastProgress>10000){lastProgress=Date.now();await dom.notify(state,'reading',provider==='chatgpt'?page.owns(state):true)}
   await new Promise(r=>setTimeout(r,500))
  }
  throw Error('پاسخ کامل در مهلت نرسید؛ همان مرحله را برای بازیابی پاسخ آماده ادامه دهید. تولید دوباره فقط با انتخاب گفتگوی تازه انجام می‌شود.')
 }catch(error){await chrome.runtime.sendMessage({type:'CHAT_RESULT',id,owned:provider==='chatgpt'?globalThis.mobocomChatPage.owns(state):true,error:error instanceof Error?error.message:'اجرای Chat انجام نشد.',code:error?.code}).catch(()=>{})}
 finally{state.running=false}
}
