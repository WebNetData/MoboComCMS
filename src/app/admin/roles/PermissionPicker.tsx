'use client'

import { SITE_SECTIONS } from '@/modules/identity/domain/sections'

export default function PermissionPicker({ available, selected, labels, onChange }: { available: string[]; selected: string[]; labels: Record<string, string>; onChange: (values: string[]) => void }) {
  const grouped = new Set(SITE_SECTIONS.flatMap(section => [...section.permissions]))
  const availableKeys = new Set(available), selectedKeys = new Set(selected)
  const groups = [...SITE_SECTIONS.map(section => ({ name: section.label, hint: section.hint, keys: section.permissions.filter(key => availableKeys.has(key)) })), { name: 'کارشناسان و نویسندگان', hint: 'کار مشخص، بدون مدیریت سایر بخش‌ها', keys: available.filter(key => /\.author$|\.handle$/.test(key) && !grouped.has(key)) }, { name: 'مدیریت سراسری و خدمات مشترک', hint: 'این دسترسی‌ها محدود به یک بخش نیستند؛ با دقت واگذار کنید.', keys: available.filter(key => !grouped.has(key) && !/\.author$|\.handle$/.test(key)) }].filter(group => group.keys.length)
  const toggle = (keys: readonly string[], enabled: boolean) => { const changed = new Set(keys); onChange(enabled ? [...new Set([...selected, ...keys])] : selected.filter(key => !changed.has(key))) }
  return <div className="role-permission-groups">{groups.map(group => <fieldset key={group.name} className="role-permission-group"><legend>{group.name}</legend><p className="muted">{group.hint}</p><label className="sa-check"><input type="checkbox" checked={group.keys.every(key => selectedKeys.has(key))} onChange={event => toggle(group.keys, event.target.checked)} />انتخاب همهٔ این بخش</label><div>{group.keys.map(key => <label key={key} className="sa-check"><input type="checkbox" checked={selectedKeys.has(key)} onChange={event => toggle([key], event.target.checked)} /><span>{labels[key] || key}</span></label>)}</div></fieldset>)}</div>
}
