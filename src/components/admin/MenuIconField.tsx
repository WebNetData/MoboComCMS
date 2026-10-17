'use client'
import { useId } from 'react'
import { ICON_NAMES } from '@/components/site/Icon'
import NavigationIcon from '@/components/site/NavigationIcon'

export default function MenuIconField({ value, onChange, automatic = false }: { value?: string; onChange: (value: string | undefined) => void; automatic?: boolean }) {
  const id = useId()
  return <div className="sh-field"><label htmlFor={id}>آیکن</label><div className="flex items-center gap-2"><NavigationIcon name={value} /><select id={id} className="sh-input" value={value === undefined ? '__auto' : ICON_NAMES.includes(value) || value === '' ? value : '__custom'} onChange={event => onChange(event.target.value === '__auto' ? undefined : event.target.value === '__custom' ? '⭐' : event.target.value)}>
    {automatic && <option value="__auto">پیش‌فرض قالب / دسته</option>}<option value="">بدون آیکن</option><option value="__custom">متن یا ایموجی دلخواه</option>{ICON_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
  </select></div>{value && !ICON_NAMES.includes(value) && <input className="sh-input" aria-label="آیکن دلخواه" maxLength={40} value={value} onChange={event => onChange(event.target.value)} />}</div>
}
