'use client'
import { useState } from 'react'
import type { EngineeringPolicy, EngineeringSkill } from '@/modules/ai/domain/engineering'

function SkillTags({ tags, commit }: { tags: string[]; commit: (tags: string[]) => void }) {
  const [text, setText] = useState(tags.join(', '))
  return <label>برچسب‌ها، با ویرگول جدا شوند<input className="input" value={text} maxLength={400} onChange={e => setText(e.target.value)} onBlur={() => commit(text.split(/[,،]/).map(tag => tag.trim()).filter(Boolean))} /></label>
}
export default function PolicyEditor({ initial, busy, save }: { initial: EngineeringPolicy; busy: boolean; save: (policy: EngineeringPolicy) => Promise<boolean> }) {
  const [draft, setDraft] = useState(initial), [reloadKey, setReloadKey] = useState(0)
  const change = (id: string, patch: Partial<EngineeringSkill>) => setDraft(old => ({ ...old, skills: old.skills.map(s => s.id === id ? { ...s, ...patch } : s) }))
  return <details className="sa-card ae-settings"><summary>تنظیمات مهندسی، بودجه و مهارت‌های شخصی</summary>
    <form onSubmit={async e => { e.preventDefault(); if (await save(draft)) setDraft(old => ({ ...old, revision: old.revision + 1 })) }}>
      {initial.revision !== draft.revision && <div role="status"><p>تنظیمات سرور تغییر کرده است. پیش‌نویس شما حفظ شده؛ پیش از ادامه آخرین تنظیمات را بررسی کنید. دکمهٔ زیر پیش‌نویس فعلی را جایگزین می‌کند.</p><button type="button" className="btn btn-ghost" onClick={() => { setDraft(initial); setReloadKey(old => old + 1) }}>بارگذاری آخرین تنظیمات به‌جای پیش‌نویس</button></div>}
      <label className="ae-check"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(old => ({ ...old, enabled: e.target.checked }))} />مهندسی هوشمند فعال باشد</label>
      <p className="sa-hint">اسکیل‌های موبوکام، معماری و راهنمای کیفیت همراه نسخهٔ برنامه هستند؛ فقط بخش مرتبط زیر سقف زمینه برای مدل فرستاده می‌شود. مهارت شخصی اختیار انتشار یا اجرای فرمان سرور ایجاد نمی‌کند.</p>
      <div className="ae-fields">
        {([{ key: 'maxSteps', label: 'حداکثر فراخوانی مدل در هر درخواست', min: 1, max: 8 }, { key: 'contextChars', label: 'بودجهٔ زمینه، نویسه', min: 8000, max: 48000 }, { key: 'outputTokens', label: 'حداکثر خروجی هر فراخوانی، توکن', min: 1000, max: 12000 }, { key: 'maxFiles', label: 'حداکثر فایل تغییرکرده', min: 1, max: 24 }] as const).map(field => <label key={field.key}>{field.label}<input className="input" type="number" min={field.min} max={field.max} value={draft[field.key]} required onChange={e => setDraft(old => ({ ...old, [field.key]: Number(e.target.value) }))} /></label>)}
      </div>
      <h3>مهارت‌های افزوده‌شده توسط شما</h3><p className="sa-hint">دستورالعمل متنی بنویسید؛ اسکریپت یا فایل اجرایی آپلود نمی‌شود. نسخهٔ انتخاب‌شدهٔ مهارت در تاریخچهٔ هر درخواست حفظ می‌شود.</p>
      {!draft.skills.length && <p>هنوز مهارت شخصی اضافه نشده است.</p>}
      {draft.skills.map((skill, index) => <fieldset className="ae-skill" key={skill.id}><legend>مهارت {index + 1}</legend>
        <label>نام مهارت<input className="input" value={skill.title} minLength={2} maxLength={100} required onChange={e => change(skill.id, { title: e.target.value })} /></label>
        <SkillTags key={skill.id + ':' + reloadKey} tags={skill.tags} commit={tags => change(skill.id, { tags })} />
        <label>دستورالعمل مهارت<textarea className="input" rows={7} value={skill.body} minLength={5} maxLength={16000} required onChange={e => change(skill.id, { body: e.target.value })} /></label>
        <div className="ae-row"><label className="ae-check"><input type="checkbox" checked={skill.enabled} onChange={e => change(skill.id, { enabled: e.target.checked })} />قابل انتخاب در درخواست‌های جدید باشد</label><button className="btn btn-ghost" type="button" onClick={() => setDraft(old => ({ ...old, skills: old.skills.filter(s => s.id !== skill.id) }))}>حذف مهارت {skill.title || index + 1}</button></div>
      </fieldset>)}
      <div className="ae-row"><button className="btn btn-ghost" type="button" disabled={draft.skills.length >= 24 || busy} onClick={() => setDraft(old => ({ ...old, skills: [...old.skills, { id: 'skill-' + crypto.randomUUID(), title: '', body: '', tags: [], enabled: true }] }))}>افزودن مهارت جدید</button><button className="btn btn-primary" type="submit" disabled={busy || initial.revision !== draft.revision}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات و مهارت‌ها'}</button></div>
    </form>
  </details>
}
