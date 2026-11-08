'use client'
import { CHAT_WEB_PROVIDERS, type ChatWebProvider } from '@/modules/ai/domain/production-execution'
import type { ProductionConfig } from '@/modules/ai/domain/production'
import type { ProductionChoice, ProductionGeneration, ProductionTarget } from '@/modules/ai/domain/production-execution'
import css from './Production.module.css'

export default function ProductionConnection({value,onChange,providers,disabled}:{value:ProductionConfig;onChange:(value:ProductionConfig)=>void;providers:{text:ProductionChoice[];image:ProductionChoice[];message?:string;canSelectModel?:boolean};disabled:boolean}) {
  const generation:ProductionGeneration=value.generation||{text:{source:'chat-web'},image:{source:'chat-web'},confirmed:false}
  const edit=(phase:'text'|'image',target:ProductionTarget)=>onChange({...value,generation:{...generation,[phase]:target,confirmed:false}})
  return <fieldset className="card seo-form" disabled={disabled}><legend>سرویس و مدل این دسته</legend>
    <p className="muted seo-wide">انتخاب این قسمت فقط برای همین دسته است؛ اتصال دستیار مدیریت و Codex تغییر نمی‌کند. فقط سرویس «انتخاب خودکار کم‌هزینه» مطابق سیاست مدیر جایگزین مجاز دارد.</p>
    {providers.message&&<p className="xm-notice seo-wide" role="status">{providers.message}</p>}
    {(['text',...(value.cover||value.inline?['image']:[])] as ('text'|'image')[]).map(phase=>{
      const target=generation[phase],choices=providers[phase],label=phase==='text'?'متن':'تصویر'
      return <fieldset className={`seo-wide seo-form ${css.sourceGroup}`} key={phase}><legend>تولید {label}</legend>
        <label className="studio-field"><span>روش تولید {label}</span><select className="select" value={target.source} onChange={e=>edit(phase,e.target.value==='api'?{source:'api',provider:choices[0].provider,model:choices[0].model}:{source:'chat-web'})}><option value="chat-web">Chat وب شخصی · افزونهٔ مرورگر</option><option value="api" disabled={!choices.length}>API استاندارد / مدل محلی{!choices.length?' · نیازمند تنظیم':''}</option></select></label>
        {target.source==='chat-web'&&phase==='text'&&<label className="studio-field"><span>سرویس چت وب</span><select className="select" value={target.chatProvider||'chatgpt'} onChange={e=>edit(phase,{source:'chat-web',chatProvider:e.target.value as ChatWebProvider})}>{CHAT_WEB_PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}</select><small>پل شخصی ۰.۴ و ورود در همان مرورگر لازم است؛ تصویر مسیر مستقل ChatGPT دارد. سهمیه و رابط سرویس محدودیت دارند.</small></label>}
 {target.source==='api'&&<><label className="studio-field"><span>سرویس {label}</span><select className="select" value={target.provider} onChange={e=>{const selected=choices.find(c=>c.provider===e.target.value);if(selected)edit(phase,{source:'api',provider:selected.provider,model:selected.model})}}>{choices.map(choice=><option key={choice.provider} value={choice.provider}>{choice.label}</option>)}</select></label><label className="studio-field seo-wide"><span>شناسهٔ مدل {label}</span><input className="input" dir="ltr" required readOnly={!providers.canSelectModel} maxLength={120} value={target.model} onChange={e=>edit(phase,{...target,model:e.target.value})}/>{!providers.canSelectModel&&<small>مدل را مدیر تنظیمات برای این کاربرد تعیین می‌کند.</small>}</label></>}
        {!choices.length&&<p className="muted seo-wide">{phase==='text'?'مدیر تنظیمات می‌تواند Qwen، DeepSeek، Gemini، OpenRouter یا مدل محلی را در تنظیمات AI و مجموعهٔ کلیدها فعال کند.':'برای تصویر API، کاربرد «تولید انبوه · API تصویر» را صریحاً با سرویس تصویر سازگار با OpenAI و خروجی base64 تنظیم کنید. مدل متنی DeepSeek تصویر تولید نمی‌کند.'}</p>}
      </fieldset>
    })}
    <a className="btn btn-ghost btn-sm" href="/admin/ai">تنظیم سرویس‌ها، مدل‌ها و کلیدهای API</a>
    {(generation.text.source==='api'||(value.cover||value.inline)&&generation.image.source==='api')&&<label className="flex items-center gap-2 seo-wide"><input type="checkbox" required checked={generation.confirmed} onChange={e=>onChange({...value,generation:{...generation,confirmed:e.target.checked}})}/>مصرف API یا منابع میزبان مدل محلی را می‌پذیرم؛ رایگان یا نامحدودبودن تضمین نمی‌شود.</label>}
    <p className="muted seo-wide">مدل‌های محلی سهمیهٔ تجاری ندارند، اما به ظرفیت سخت‌افزار محدودند. سهمیه و هزینهٔ سرویس‌های آنلاین مستقل از رایگان‌بودن چت وب آن‌هاست. تصاویر انتخاب‌شده مسیر مستقل دارند.</p>
  </fieldset>
}
