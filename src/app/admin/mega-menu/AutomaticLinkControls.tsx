'use client'
import type { SectionBar, SectionMenuConfig } from '@/modules/navigation/domain/megamenu'
import MenuIconField from '@/components/admin/MenuIconField'

export default function AutomaticLinkControls({ items, config, onChange }: { items: NonNullable<SectionBar['quickCatalog']>; config: SectionMenuConfig; onChange: (next: Partial<SectionMenuConfig>) => void }) {
  return <details className="studio-item"><summary>ویرایش لینک‌های خودکار ({items.length.toLocaleString('fa-IR')})</summary>{items.map(item => {
    const value = config.nodeOverrides[item.key] || {}
    const patch = (next: typeof value) => onChange({ nodeOverrides: { ...config.nodeOverrides, [item.key]: { ...value, ...next } } })
    return <div className="studio-item" key={item.key}><h3>{item.label}</h3><div className="sh-grid"><label className="sh-field"><span>عنوان در منو</span><input className="sh-input" maxLength={120} placeholder={item.label} value={value.label || ''} onChange={event => patch({ label: event.target.value })} /></label><MenuIconField value={value.icon || ''} onChange={icon => patch({ icon: icon || '' })} /></div><label className="sh-check"><input type="checkbox" checked={!value.hidden} onChange={event => patch({ hidden: !event.target.checked })} />نمایش لینک</label></div>
  })}</details>
}
