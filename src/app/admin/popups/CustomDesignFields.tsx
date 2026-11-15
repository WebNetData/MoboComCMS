'use client'

import { CUSTOM_ACCENTS, CUSTOM_ICONS, CUSTOM_LAYOUTS, CUSTOM_PALETTES, DEFAULT_CUSTOM_STYLE, type CustomPopupStyle } from '@/modules/popups/domain/custom'

export default function CustomDesignFields({ value, onChange }: { value: CustomPopupStyle; onChange: (value: CustomPopupStyle) => void }) {
  const style = { ...DEFAULT_CUSTOM_STYLE, ...value }
  const fields = [
    { key: 'layout', label: 'چیدمان', options: CUSTOM_LAYOUTS },
    { key: 'palette', label: 'رنگ زمینه', options: CUSTOM_PALETTES },
    { key: 'accent', label: 'رنگ تأکیدی', options: CUSTOM_ACCENTS },
    { key: 'align', label: 'تراز محتوا', options: [{ id: 'start', label: 'ابتدای متن' }, { id: 'center', label: 'وسط' }] },
    { key: 'width', label: 'عرض پنجره', options: [{ id: 'compact', label: 'جمع‌وجور' }, { id: 'wide', label: 'عریض' }] },
    { key: 'imageFit', label: 'نمایش تصویر', options: [{ id: 'cover', label: 'پوشاندن قاب' }, { id: 'contain', label: 'نمایش کامل تصویر' }] },
    { key: 'buttonStyle', label: 'ظاهر دکمه', options: [{ id: 'solid', label: 'توپر' }, { id: 'outline', label: 'دورخط' }] },
    { key: 'buttonIcon', label: 'آیکن دکمه', options: CUSTOM_ICONS },
  ] as const

  return <div className="pm-row">{fields.map(field => <label key={field.key} className="sa-field">
    <span>{field.label}</span>
    <select className="input" aria-label={field.label} value={style[field.key]} onChange={event => onChange({ ...style, [field.key]: event.target.value })}>
      {field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>)}</div>
}
