// Only a bitmap already visible in the owned response. Normal CORS remains enforced.
globalThis.mobocomChatImageData=async(image,options={})=>{
 if(!globalThis.mobocomChatImageData.supports(image))throw Error('رسانهٔ این پاسخ از مبدأ تصویر پشتیبانی‌شده نیست؛ تصویر دیگری وارد نشد.')
 const encode=source=>{const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;if(width<256||height<256||width*height>32000000)throw Error('ابعاد تصویر ساخته‌شده معتبر نیست.');const scale=Math.min(1,1600/width,1600/height),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/webp',0.9);if(!data.startsWith('data:image/webp;base64,')||data.length>2800000)throw Error('تصویر ساخته‌شده در اندازهٔ مجاز نیست.');return data}
 const stage=value=>options.onStage?.(value),deadline=Number.isFinite(options.deadline)?options.deadline:Date.now()+15000
 try{
 if(Date.now()>=deadline)throw Object.assign(Error('deadline'),{name:'TimeoutError'})
 stage('encoding');try{const data=encode(image);stage('ready');return data}catch(error){if(error?.name!=='SecurityError')throw error}
 const source=new URL(image.currentSrc||image.src,location.href),same=source.origin===location.origin;
 if(source.protocol!=='https:'||source.username||source.password||!same&&!/^(?:[a-z0-9-]+\.)*oaiusercontent\.com$/i.test(source.hostname))throw Error('مرورگر اجازهٔ خواندن تصویر این میزبان را نداد؛ رسانهٔ دیگری دریافت نشد.')
 const remaining=Math.max(1,Math.floor(deadline-Date.now())),signal=AbortSignal.any([AbortSignal.timeout(remaining),...(options.signal?[options.signal]:[])])
 stage('reading');const response=await fetch(source.href,{mode:'cors',credentials:same?'same-origin':'omit',redirect:'follow',signal})
 const final=new URL(response.url||source.href);if(final.protocol!=='https:'||final.username||final.password||final.origin!==location.origin&&!/^(?:[a-z0-9-]+\.)*oaiusercontent\.com$/i.test(final.hostname)){await response.body?.cancel();throw Error('نشانی نهایی رسانهٔ همین پاسخ مجاز نیست؛ تصویر دیگری دریافت نشد.')}
 if(!response.ok||!/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type')||'')||!response.body){await response.body?.cancel();throw Error('رسانهٔ تصویرِ همین پاسخ قابل دریافت نیست؛ تولید دوباره انجام نشد.')}
 const length=Number(response.headers.get('content-length'));if(length>12000000){await response.body.cancel();throw Error('فایل تصویر بیش از حد بزرگ است.')}
 const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000000)throw Error('فایل تصویر بیش از حد بزرگ است.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 if(signal.aborted)throw signal.reason
 stage('decoding');const bitmap=await createImageBitmap(new Blob(chunks,{type:response.headers.get('content-type')}));try{if(Date.now()>=deadline)throw Object.assign(Error('deadline'),{name:'TimeoutError'});const data=encode(bitmap);stage('ready');return data}finally{bitmap.close()}
 }catch(error){
  if(options.signal?.aborted)throw error
  if(error?.name==='TimeoutError'||error?.name==='AbortError'){stage('timeout');throw Object.assign(Error('تصویر ساخته شده است، اما خواندن فایل در مهلت همین مرحله کامل نشد؛ بازیابی فقط همان تصویر را می‌خواند و تولید تازه نمی‌فرستد.'),{code:'CHAT_IMAGE_READ_TIMEOUT'})}
  if(error instanceof TypeError){stage('network');throw Object.assign(Error('تصویر ساخته شد اما دریافت فایل با شبکه یا سیاست CORS مرورگر انجام نشد؛ همان تصویر حفظ شده و دوباره تولید نمی‌شود.'),{code:'CHAT_IMAGE_READ_NETWORK'})}
  throw error
 }
}
globalThis.mobocomChatImageData.supports=image=>{try{const u=new URL(image.currentSrc||image.src,location.href);if(u.username||u.password)return false;if(u.protocol==='data:')return /^data:image\/(?:png|jpeg|webp);base64,/i.test(u.href);if(u.protocol==='blob:')return u.origin===location.origin;return u.protocol==='https:'&&(u.origin===location.origin||/^(?:[a-z0-9-]+\.)*oaiusercontent\.com$/i.test(u.hostname))}catch{return false}}
