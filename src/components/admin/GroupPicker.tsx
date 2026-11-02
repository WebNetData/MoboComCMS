'use client'

import { SITE_GROUP_FAMILIES, type SiteGroup } from '@/modules/account/domain/site-groups'
import './group-picker.css'

/** Every group of the site, by kind. A chosen group that no longer exists stays listed, so it can be taken off. */
export default function GroupPicker({ legend, groups, value, onChange }: { legend: string; groups: SiteGroup[]; value: string[]; onChange: (next: string[]) => void }) {
  const missing = value.filter((key) => !groups.some((group) => group.key === key))
  const toggle = (key: string, on: boolean) => onChange(on ? [...value, key] : value.filter((item) => item !== key))
  const option = (key: string, label: string, count?: number) => (
    <label key={key} className={value.includes(key) ? 'is-on' : ''}>
      <input type="checkbox" checked={value.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />
      <span>{label}</span>
      {count !== undefined && <small>{count.toLocaleString('fa-IR')}</small>}
    </label>
  )
  return <div className="gp" role="group" aria-label={legend}>
    {SITE_GROUP_FAMILIES.map((family) => {
      const items = groups.filter((group) => group.family === family.id)
      if (!items.length) return null
      return <div key={family.id} className="gp-family"><p className="gp-family-title">{family.label}</p><div className="gp-options">{items.map((group) => option(group.key, group.label, group.count))}</div></div>
    })}
    {missing.length > 0 && <div className="gp-family"><p className="gp-family-title">گروه‌های حذف‌شده</p><div className="gp-options">{missing.map((key) => option(key, key))}</div></div>}
    {!groups.length && !missing.length && <p className="gp-empty">هنوز گروهی ساخته نشده است.</p>}
  </div>
}
