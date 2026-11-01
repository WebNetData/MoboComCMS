import Icon from '@/components/site/Icon'
import { FORMATS, TARGETS, TONES, type PromptInput } from '@/modules/prompts/domain/prompts'
import s from './PromptMaster.module.css'

export default function PromptFields({ input, change, disabled }: { input: PromptInput; change: (key: keyof PromptInput, value: string) => void; disabled: boolean }) {
  const field = (key: keyof PromptInput, label: string, placeholder = '') => <label className={s.field}>{label}<input value={input[key]} onChange={e => change(key, e.target.value)} placeholder={placeholder} maxLength={300} disabled={disabled} /></label>
  return <>
    <div className={s.twoFields}>
      <label className={s.field}>ابزار مقصد<select value={input.target} onChange={e => change('target', e.target.value)} disabled={disabled}>{TARGETS[input.kind].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className={s.field}>زبان پاسخ مورد انتظار<select value={input.language} onChange={e => change('language', e.target.value)} disabled={disabled}><option value="fa">فارسی</option><option value="en">English</option></select></label>
    </div>
    <details className={s.advanced}><summary><span><Icon name="sliders" size={17} /> تنظیمات دقیق‌تر</span><span className={s.muted}>زمینه، سبک و محدودیت‌ها</span></summary>
      <div className={s.advancedBody}>
        <div className={s.twoFields}>{field('role', 'نقش متخصص', 'مثلاً مدیر هنری یا مهندس نرم‌افزار')}{field('audience', 'مخاطب', 'این خروجی برای چه کسی است؟')}</div>
        <label className={s.field}>زمینه و اطلاعات تکمیلی<textarea rows={3} value={input.context} onChange={e => change('context', e.target.value)} maxLength={2000} placeholder="اطلاعات واقعی، نمونه، فناوری موجود یا جزئیات پروژه…" disabled={disabled} /></label>
        {(input.kind === 'TEXT' || input.kind === 'CODE') && <div className={s.twoFields}><label className={s.field}>لحن<select value={input.tone} onChange={e => change('tone', e.target.value)} disabled={disabled}>{TONES.map(v => <option key={v}>{v}</option>)}</select></label><label className={s.field}>قالب خروجی<select value={input.format} onChange={e => change('format', e.target.value)} disabled={disabled}>{FORMATS.map(v => <option key={v}>{v}</option>)}</select></label></div>}
        {(input.kind === 'IMAGE' || input.kind === 'VIDEO') && <>
          {field('style', input.kind === 'VIDEO' ? 'حال‌وهوا و حرکت دوربین' : 'سبک، نور و ترکیب‌بندی', 'سبک دلخواه را دقیق توصیف کنید')}
          <div className={s.twoFields}><label className={s.field}>نسبت تصویر<select value={input.ratio} onChange={e => change('ratio', e.target.value)} disabled={disabled}>{['1:1','16:9','9:16','4:3','3:4','3:2'].map(v => <option key={v} value={v}>{v}</option>)}</select></label>{input.kind === 'VIDEO' && <label className={s.field}>مدت صحنه<select value={input.duration} onChange={e => change('duration', e.target.value)} disabled={disabled}>{['5','10','15','30','60'].map(v => <option key={v} value={v}>{Number(v).toLocaleString('fa-IR')} ثانیه</option>)}</select></label>}</div>
        </>}
        {input.kind === 'WEB' && field('style', 'جهت هنری و سبک رابط', 'مثلاً تحریریه‌ای، مینیمال یا داشبورد محصول')}
        <label className={s.field}>محدودیت‌ها و موارد ناخواسته<textarea rows={2} value={input.negative} onChange={e => change('negative', e.target.value)} maxLength={2000} placeholder="چه چیزی نباید در نتیجه باشد؟" disabled={disabled} /></label>
      </div>
    </details>
  </>
}
