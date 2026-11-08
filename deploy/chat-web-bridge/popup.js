const status = document.getElementById('status')
chrome.tabs.query({active:true,currentWindow:true}, tabs => {
  const tab=tabs[0]; let url
  try { url=new URL(tab.url) } catch { status.textContent='تب مدیریت موبوکام را باز کنید.'; return }
  const local=['localhost','127.0.0.1'].includes(url.hostname)
  if (!(url.protocol==='https:' || local&&url.protocol==='http:') || !/^\/admin\/posts(?:\/|$)/.test(url.pathname) || url.hostname==='chatgpt.com') { status.textContent='این کار را روی صفحهٔ مدیریت نوشته‌های موبوکام انجام دهید.'; return }
  document.getElementById('connect').onclick=()=>{
    chrome.permissions.request({origins:[url.origin+'/*']},async granted=>{
      if(!granted){status.textContent='دسترسی سایت داده نشد.';return}
      try { const r=await chrome.runtime.sendMessage({type:'CONNECT',origin:url.origin});status.textContent=r?.error||'متصل شد؛ صفحهٔ موبوکام را تازه کنید.' }
      catch { status.textContent='اتصال انجام نشد.' }
    })
  }
  document.getElementById('disconnect').onclick=async()=>{try{await chrome.runtime.sendMessage({type:'DISCONNECT'});status.textContent='اتصال قطع شد.'}catch{status.textContent='قطع اتصال انجام نشد.'}}
})
