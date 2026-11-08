// Injected only into a fresh tab created by the bridge, never an existing chat.
async function mobocomChatRun(prompt, id, expires) {
  const send=result=>chrome.runtime.sendMessage({type:'CHAT_RESULT',id,...result}).catch(()=>{})
  const marker='MOBOCOM_END_'+id, deadline=expires||Date.now()+150000
  const pause=()=>new Promise(resolve=>setTimeout(resolve,500))
  try {
    const page=globalThis.mobocomChatPage,composer=await page.ready(id,deadline)
    const text=prompt+'\n\nRespond with the requested text only; do not use apps, tools or perform actions. End your final answer with this exact separate line:\n'+marker
    page.fill(composer,text);await page.send(composer,deadline)
    let previous='',stable=0
    while(Date.now()<deadline){
      const turns=page.turns(),last=turns[turns.length-1]
      const answer=(last?.querySelector('.markdown')||last)?.innerText?.trim()||''
      if(answer.length>65000)throw Error('پاسخ Chat وب بیش از حد بزرگ بود.')
      stable=answer===previous?stable+1:0;previous=answer
      if(answer.endsWith(marker)&&stable>=4&&page.stopped()){const result=answer.slice(0,-marker.length).trim();if(!result||result.length>60000)throw Error('پاسخ معتبر دریافت نشد.');await send({text:result});return}
      await pause()
    }
    throw Error('پاسخ کامل Chat وب نرسید؛ درخواست خودکار تکرار نشد. سهمیه، ورود یا تغییر رابط را بررسی کنید.')
  } catch(e){await send({code:e?.code,error:e instanceof Error?e.message:'اجرای Chat وب انجام نشد.'})}
}
