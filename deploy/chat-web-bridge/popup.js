const status = document.getElementById('status')
document.getElementById('version').textContent=chrome.runtime.getManifest().version
document.getElementById('diagnose').onclick=async()=>{try{const result=await chrome.runtime.sendMessage({type:'DIAGNOSE'});if(result?.error){status.textContent=result.error;return}document.getElementById('report').value=JSON.stringify(result.report,null,2);status.textContent='گزارش فنی آماده است؛ متن گفتگو، کوکی، کلید و اطلاعات حساب در گزارش نیست.'}catch{status.textContent='خواندن وضعیت انجام نشد؛ در تب ChatGPT یا موبوکام دوباره بررسی کنید.'}}
document.getElementById('copy').onclick=async()=>{const report=document.getElementById('report');if(!report.value)return;try{await navigator.clipboard.writeText(report.value);status.textContent='گزارش کپی شد.'}catch{report.focus();report.select();status.textContent='متن گزارش را کپی کنید.'}}
chrome.tabs.query({active:true,currentWindow:true}, tabs => {
  const tab=tabs[0]; let url
  try { url=new URL(tab.url) } catch { status.textContent='تب مدیریت موبوکام را باز کنید.'; return }
  const local=['localhost','127.0.0.1'].includes(url.hostname)
  if (!(url.protocol==='https:' || local&&url.protocol==='http:') || !/^\/admin\/(?:posts(?:\/|$)|ai\/production(?:\/|$))/.test(url.pathname) || url.hostname==='chatgpt.com') { status.textContent='این کار را روی صفحهٔ نوشته‌ها یا تولید انبوهٔ موبوکام انجام دهید.'; return }
  document.getElementById('connect').onclick=()=>{
    chrome.permissions.request({origins:[url.origin+'/*']},async granted=>{
      if(!granted){status.textContent='دسترسی سایت داده نشد.';return}
      try { const r=await chrome.runtime.sendMessage({type:'CONNECT',origin:url.origin});status.textContent=r?.error||'متصل شد؛ صفحهٔ موبوکام را تازه کنید.' }
      catch { status.textContent='اتصال انجام نشد.' }
    })
  }
  document.getElementById('disconnect').onclick=async()=>{try{await chrome.runtime.sendMessage({type:'DISCONNECT'});status.textContent='اتصال قطع شد.'}catch{status.textContent='قطع اتصال انجام نشد.'}}
})
