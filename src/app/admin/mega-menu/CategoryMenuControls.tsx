'use client'
import { useState } from 'react'
import type { SectionBar, SectionMenuConfig } from '@/modules/navigation/domain/megamenu'
import MenuIconField from '@/components/admin/MenuIconField'

export default function CategoryMenuControls({ nodes, config, onChange }: { nodes: NonNullable<SectionBar['categoryCatalog']>; config: SectionMenuConfig; onChange: (next: Partial<SectionMenuConfig>) => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const byKey = new Map(nodes.map(node => [node.key, node]))
  const path = (key: string) => { const labels: string[] = []; const seen = new Set<string>(); for (let node = byKey.get(key); node && !seen.has(node.key); node = node.parentKey ? byKey.get(node.parentKey) : undefined) { seen.add(node.key); labels.unshift(node.label) } return labels.join(' / ') }
  const matches = nodes.filter(node => path(node.key).includes(query.trim()))
  const node = byKey.get(selected) || matches[0]
  const override = node ? config.nodeOverrides[node.key] || {} : {}
  const patch = (next: typeof override) => { if (node) onChange({ nodeOverrides: { ...config.nodeOverrides, [node.key]: { ...override, ...next } } }) }
  const rank = new Map(config.itemOrder.map((key, index) => [key, index]))
  const naturalOrder = new Map(nodes.map((item, index) => [item.key, index]))
  const siblings = node ? nodes.filter(other => other.parentKey === node.parentKey).sort((a, b) => (rank.get(a.key) ?? 10000 + naturalOrder.get(a.key)!) - (rank.get(b.key) ?? 10000 + naturalOrder.get(b.key)!)) : []
  const position = siblings.findIndex(other => other.key === node?.key)
  const move = (delta: number) => { const keys = siblings.map(item => item.key); const siblingKeys = new Set(keys); const target = position + delta; if (target < 0 || target >= keys.length) return; [keys[position], keys[target]] = [keys[target], keys[position]]; onChange({ itemOrder: [...config.itemOrder.filter(key => !siblingKeys.has(key)), ...keys] }) }
  return <section className="sh-panel"><header className="sh-panel-head"><h2>دسته‌ها و زیرمنوهای خودکار</h2><small className="sh-muted">{nodes.length.toLocaleString('fa-IR')} مورد</small></header>
    <p className="sh-muted">عنوان، آیکن و نمایش در منو مستقل از محتوای دسته تنظیم می‌شوند. مخفی‌کردن یک شاخه زیرمنوهای آن را هم پنهان می‌کند.</p>
    <div className="sh-grid"><label className="sh-field"><span>جست‌وجوی دسته و مسیر</span><input className="sh-input" type="search" value={query} onChange={event => { setQuery(event.target.value); setSelected('') }} /></label>
    <label className="sh-field"><span>انتخاب دسته یا زیردسته</span><select className="sh-input" value={node?.key || ''} onChange={event => setSelected(event.target.value)}>{matches.map(item => <option key={item.key} value={item.key}>{path(item.key)}</option>)}</select></label></div>
    {node ? <div className="studio-item"><p className="sh-muted">{path(node.key)}</p><div className="sh-grid">
      <label className="sh-field"><span>عنوان در منو</span><input className="sh-input" maxLength={120} placeholder={node.label} value={override.label || ''} onChange={event => patch({ label: event.target.value })} /></label>
      <MenuIconField automatic value={override.icon} onChange={icon => { const next = { ...override }; if (icon === undefined) delete next.icon; else next.icon = icon; onChange({ nodeOverrides: { ...config.nodeOverrides, [node.key]: next } }) }} />
    </div><label className="sh-check"><input type="checkbox" checked={!override.hidden && !config.hiddenItems.includes(node.key)} onChange={event => { onChange({ hiddenItems: config.hiddenItems.filter(key => key !== node.key), nodeOverrides: { ...config.nodeOverrides, [node.key]: { ...override, hidden: !event.target.checked } } }) }} />نمایش در منو</label>
    {!node.inMenu && <p className="xm-notice">نمایش این دسته از تنظیمات خود دسته خاموش است؛ آن را در «مدیریت دسته‌ها» روشن کنید.</p>}
    <div className="flex gap-2 flex-wrap"><button type="button" className="sh-btn sh-btn-ghost" disabled={position <= 0} onClick={() => move(-1)}>↑ بالاتر در همین سطح</button><button type="button" className="sh-btn sh-btn-ghost" disabled={position >= siblings.length - 1} onClick={() => move(1)}>↓ پایین‌تر در همین سطح</button><button type="button" className="sh-btn sh-btn-ghost" onClick={() => { const next = { ...config.nodeOverrides }; delete next[node.key]; onChange({ nodeOverrides: next, hiddenItems: config.hiddenItems.filter(key => key !== node.key) }) }}>بازگرداندن تنظیمات دسته</button></div></div> : <p className="sh-muted">دسته‌ای پیدا نشد.</p>}
  </section>
}
