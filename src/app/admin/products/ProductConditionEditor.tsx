'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

const CONDITIONS = [{ value: 'NEW', fa: 'نو', en: 'New' }, { value: 'OPEN_BOX', fa: 'جعبه‌باز', en: 'Open box' }, { value: 'USED', fa: 'کارکرده', en: 'Used' }, { value: 'REFURBISHED', fa: 'بازسازی‌شده', en: 'Refurbished' }]

export default function ProductConditionEditor({ form, setForm }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>> }) {
  const { locale } = useI18n(), fa = locale === 'fa'
  if (form.kind !== 'PHYSICAL') return null
  const set = (key: string, value: unknown) => setForm(current => ({ ...current, [key]: value }))
  return <section className="grid-column-span-3 card" aria-labelledby="product-condition-heading">
    <h3 id="product-condition-heading">{fa ? 'وضعیت کالا' : 'Item condition'}</h3>
    <p className="muted">{fa ? 'برای کالای کارکرده، جعبه‌باز یا بازسازی‌شده، هر دستگاه واقعی را در یک صفحهٔ جدا ثبت کنید. عکس‌های همان دستگاه را در گالری موجود اضافه کنید و ضمانت را هم صریح بنویسید.' : 'Give each actual used, open-box, or refurbished device its own listing. Add photos of that device to the existing gallery and state its warranty clearly.'}</p>
    <div className="store-admin-grid">
      <label className="store-admin-field"><span>{fa ? 'وضعیت' : 'Condition'}</span><select className="select" value={form.condition || 'NEW'} onChange={event => set('condition', event.target.value)}>{CONDITIONS.map(item => <option key={item.value} value={item.value}>{fa ? item.fa : item.en}</option>)}</select></label>
      {(form.condition || 'NEW') !== 'NEW' && <>
        <label className="store-admin-field"><span>{fa ? 'درجهٔ ظاهری (اختیاری)' : 'Grade (optional)'}</span><select className="select" value={form.conditionGrade || ''} onChange={event => set('conditionGrade', event.target.value)}><option value="">{fa ? 'ثبت نشده' : 'Not recorded'}</option>{['A', 'B', 'C'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="store-admin-field"><span>{fa ? 'توضیح وضعیت ظاهری' : 'Condition notes'}</span><textarea className="textarea" rows={2} maxLength={500} value={form.conditionNotes || ''} onChange={event => set('conditionNotes', event.target.value)} /></label>
        <label className="store-admin-field"><span>{fa ? 'گزارش سلامت کالا' : 'Item health report'}</span><textarea className="textarea" rows={3} maxLength={1200} value={form.healthReport || ''} onChange={event => set('healthReport', event.target.value)} /><small className="muted">{fa ? 'فقط بررسی انجام‌شده را ثبت کنید؛ اطلاعات ثبت‌نشده تأیید نمی‌شود.' : 'Record only checks that were performed; unrecorded checks are not implied.'}</small></label>
      </>}
    </div>
  </section>
}
