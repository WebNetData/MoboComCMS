'use client'
import { useEffect, useRef, useState } from 'react'
import { ECONOMY_PROVIDERS, type EconomyPolicy, type EconomyProvider } from '@/modules/ai/domain/economy'
type Source={provider:string;configured:boolean;model:string;health:{retryAt:number;reason:string;latency:number;lastSuccess:number}|null}
type State={policy:EconomyPolicy;sources:Source[]}
const labels:Record<EconomyProvider,string>={ollama:'Ollama · مدل نصب‌شدهٔ محلی',openrouter:'OpenRouter · فقط openrouter/free',omniroute:'OmniRoute · سیاست رایگان درگاه شما'}
const endpoint='/api/admin/ai/economy'
export default function Economy(){
  const [data,setData]=useState<State|null>(null),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false),[forbidden,setForbidden]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0)
  const running=useRef(false)
  useEffect(()=>{const c=new AbortController();void fetch(endpoint,{cache:'no-store',signal:c.signal}).then(async r=>{if(r.status===403||r.status===423){setForbidden(true);return}const b=await r.json();if(!r.ok)throw Error(b.error||'خواندن سیاست انجام نشد');if(!c.signal.aborted){setData(b);setFailed(false)}}).catch(e=>{if(!c.signal.aborted){setNotice(e.message);setFailed(true)}});return()=>c.abort()},[reload])
  if(forbidden)return null
  const change=(patch:Partial<EconomyPolicy>)=>setData(d=>d?{...d,policy:{...d.policy,...patch}}:d)
  async function save(){
    if(!data||running.current)return
    running.current=true;setBusy(true);setNotice('')
    try{const r=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data.policy),signal:AbortSignal.timeout(20000)}),b=await r.json();if(!r.ok)throw Error(b.error||'ذخیره انجام نشد');setData(b);setFailed(false);setNotice('سیاست ذخیره شد؛ برای استفاده، سرویس «انتخاب خودکار کم‌هزینه» را برای کاربرد یا دسته انتخاب کنید.')}
    catch(e){setFailed(true);setNotice(e instanceof Error?e.message:'ذخیره انجام نشد')}
    finally{running.current=false;setBusy(false)}
  }
  return <section className="card seo-form" aria-label="سیاست کم‌هزینهٔ هوش مصنوعی">
    <header className="seo-wide"><h2>انتخاب هوشمند منابع کم‌هزینه</h2><p className="muted">از اتصال‌های موجود و کلیدهای مجاز خودتان استفاده می‌کند. سرویس‌های زیر را در تنظیم پیش‌فرض، کاربردها یا مجموعهٔ کلیدها پیکربندی کنید. برای کم‌هزینه‌کردن پیش‌فرض سایت، اتصال زیرمجموعه را در یک کاربرد یا مجموعهٔ کلیدها نگه دارید. ثبت سیاست به‌تنهایی مسیر دستیار را تغییر نمی‌دهد.</p></header>
    {notice&&<p className={`xm-notice seo-wide${failed?' is-error':''}`} role={failed?'alert':'status'}>{notice}</p>}
    {!data?<button className="btn btn-ghost" type="button" onClick={()=>setReload(v=>v+1)}>دریافت سیاست</button>:<>
      <label className="flex items-center gap-2 seo-wide"><input type="checkbox" checked={data.policy.enabled} disabled={busy} onChange={e=>change({enabled:e.target.checked})}/>انتخاب خودکار برای کاربردهایی که این سرویس را انتخاب کرده‌اند فعال باشد</label>
      <label className="flex items-center gap-2 seo-wide"><input type="checkbox" checked={data.policy.gatewayFreeOnly} disabled={busy} onChange={e=>change({gatewayFreeOnly:e.target.checked,providers:e.target.checked?data.policy.providers:data.policy.providers.filter(p=>p!=='omniroute')})}/>در OmniRoute فقط اتصال‌ها و مدل‌های مجاز بدون هزینه را فعال و جایگزین پولی را غیرفعال کرده‌ام؛ موبوکام هزینهٔ داخلی درگاه را تضمین نمی‌کند.</label>
      <fieldset className="seo-wide seo-form" disabled={busy}><legend>منابع مجاز و ترتیب اولویت</legend>
        {ECONOMY_PROVIDERS.map(p=><label className="flex items-center gap-2 seo-wide" key={p}><input type="checkbox" checked={data.policy.providers.includes(p)} disabled={p==='omniroute'&&!data.policy.gatewayFreeOnly} onChange={e=>change({providers:e.target.checked?[...data.policy.providers,p]:data.policy.providers.filter(x=>x!==p)})}/>{labels[p]}</label>)}
        <ol className="seo-wide">{data.policy.providers.map((p,i)=><li key={p}>{labels[p]} <button className="btn btn-ghost btn-sm" type="button" disabled={!i} aria-label={`اولویت بیشتر ${labels[p]}`} onClick={()=>{const next=[...data.policy.providers];[next[i-1],next[i]]=[next[i],next[i-1]];change({providers:next})}}>بالاتر</button></li>)}</ol>
      </fieldset>
      <label className="studio-field"><span>حداکثر سرویس در یک درخواست</span><select className="select" value={data.policy.maxAttempts} disabled={busy} onChange={e=>change({maxAttempts:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={busy||!data.policy.providers.length} onClick={()=>void save()}>{busy?'در حال ذخیره…':'ذخیرهٔ سیاست کم‌هزینه'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>setReload(v=>v+1)}>وضعیت ذخیره‌شده</button></div>
      <ul className="seo-wide">{data.sources.map(s=><li key={s.provider}><b>{s.provider}</b> · {s.configured?'اتصال تنظیم شده':'نیازمند تنظیم اتصال'}{s.model&&<> · <bdi>{s.model}</bdi></>}{s.health?.reason&&` · توقف موقت (${s.health.reason})`}{s.health?.retryAt?` · تلاش بعدی ${new Date(s.health.retryAt).toLocaleTimeString('fa-IR')}`:''}{s.health?.lastSuccess?` · آخرین پاسخ ${s.health.latency} ms`:''}</li>)}</ul>
    </>}
    <p className="muted seo-wide">جایگزینی فقط پس از رد صریح کلید یا سهمیه انجام می‌شود. قطع اتصال، پاسخ ناقص و لغو باعث ارسال دوباره نمی‌شوند. فهرست محلی هنگام نیاز و حداکثر هر ۵ دقیقه تازه می‌شود؛ OpenRouter مدل رایگان آماده را انتخاب می‌کند. اعلان خرابی داخل پنل است. رایگان‌بودن، سرعت و دسترسی نامحدود تضمین نمی‌شوند.</p>
  </section>
}
