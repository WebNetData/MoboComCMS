'use client'
import { useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { inputChecklist, type PromptInput } from '@/modules/prompts/domain/prompts'
import { copyPrompt, downloadPrompt } from './browser'
import OutputPlaceholder from './OutputPlaceholder'
import s from './PromptMaster.module.css'

export type PromptResult = { output: string; engine: string; model: string; input: PromptInput; item: { id: number; version: number } | null }
export default function PromptOutput({ result, input, output, setOutput, busy, onSave, saving }: { result: PromptResult | null; input: PromptInput; output: string; setOutput: (v: string) => void; busy: boolean; onSave: () => void; saving: boolean }) {
  const [notice, setNotice] = useState(''), checks = inputChecklist(input), filled = checks.filter(v => v.filled).length
  async function copy() { try { await copyPrompt(output); setNotice('پرامپت کپی شد') } catch (error) { setNotice(error instanceof Error ? error.message : 'کپی انجام نشد') } }
  return <section className={`${s.panel} ${s.outputPanel}`} aria-labelledby="prompt-output-title" aria-busy={busy}>
    <div className={s.panelHead}><div><span className={s.panelIcon}><Icon name="code" size={18} /></span><h2 id="prompt-output-title">خروجی پرامپت</h2></div><span className={s.tag}>{busy ? 'در حال ساخت…' : result ? result.engine === 'AI' ? 'بهبود هوشمند' : result.engine === 'EDITED' ? 'ویرایش‌شده' : 'ساختاریافته' : 'آمادهٔ ایدهٔ شما'}</span></div>
    <div className={s.outputBody}>
      {output ? <label className={s.outputLabel}>متن پرامپت؛ قابل ویرایش<textarea aria-label="متن خروجی پرامپت" value={output} onChange={e => { setOutput(e.target.value); setNotice('') }} maxLength={24000} spellCheck={false} dir="auto" disabled={busy} /></label>
        : <OutputPlaceholder busy={busy}/>}
      <div className={s.outputMeta}><span>{Array.from(output).length.toLocaleString('fa-IR')} نویسه</span>{result?.model && <bdi>{result.model}</bdi>}<span>{result?.item ? 'در تاریخچهٔ خصوصی شما' : 'متن را پیش از استفاده مرور کنید'}</span></div>
      <div className={s.outputActions}><button type="button" className={s.primary} onClick={copy} disabled={!output || busy}><Icon name="copy" size={17} />کپی پرامپت</button><button type="button" className={s.secondary} onClick={() => downloadPrompt(output)} disabled={!output || busy}><Icon name="download" size={17} />دریافت متن</button>{result?.item && <button type="button" className={s.secondary} onClick={onSave} disabled={saving || busy || output === result.output}>{saving ? 'ذخیره…' : 'ذخیرهٔ ویرایش'}</button>}</div>
      <p className={s.feedback} role="status">{notice}</p>
    </div>
    <div className={s.checklist}><div><h3>کامل‌بودن ورودی</h3><span>{filled.toLocaleString('fa-IR')} از {checks.length.toLocaleString('fa-IR')} جزئیات</span></div><div className={s.inputProgress} role="progressbar" aria-label="کامل‌بودن جزئیات ورودی" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={checks.length}>{checks.map((check,index)=><span key={check.label} data-filled={index<filled}/>)}</div><ul>{checks.map(check => <li key={check.label} data-filled={check.filled}><Icon name={check.filled ? 'check' : 'plus'} size={14} />{check.label}</li>)}</ul><p>این راهنما ساختار ورودی را بررسی می‌کند؛ امتیاز صحت یا کیفیت هوش مصنوعی نیست.</p></div>
    <div className={s.outputFoot}><Icon name="shield" size={17} /><p>پرامپت، نقطهٔ شروع است. نتیجه را در ابزار مقصد بررسی کن و جزئیات را با نیاز خودت سازگار کن.</p><Link href="/prompts/library" aria-label="دیدن الگوهای پرامپت"><Icon name="arrow" size={18} /></Link></div>
  </section>
}
