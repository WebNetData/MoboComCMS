'use client'
import { useState } from 'react'
import { local, type SiteLink } from '@/modules/site/config/types'
import { MENU_DEPTH, MENU_ITEMS } from '@/modules/site/config/menus'
import MenuIconField from './MenuIconField'
import MenuPresentationField from './MenuPresentationField'
import styles from './MenuTreeEditor.module.css'

const size = (items: SiteLink[]): number => items.reduce((sum, item) => sum + 1 + size(item.children || []), 0)
const entry = (): SiteLink => ({ id: crypto.randomUUID(), label: local('لینک جدید', 'New link'), href: '/', enabled: true })
const identity = (item: SiteLink) => item.id || item.href + item.label.fa

/** Edits the existing config document; descendants always travel with their parent. */
export default function MenuTreeEditor({ value, onChange, depth = 1, total = size(value), onPromote, presentation = 'list' }: { value: SiteLink[]; onChange: (items: SiteLink[]) => void; depth?: number; total?: number; onPromote?: (index: number) => void; presentation?: 'navigation' | 'list' }) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const patch = (index: number, next: Partial<SiteLink>) => onChange(value.map((item, i) => i === index ? { ...item, ...next } : item))
  const move = (index: number, delta: number) => { const next = [...value]; const target = index + delta; [next[index], next[target]] = [next[target], next[index]]; onChange(next) }
  return <div className={styles.tree}>
    {value.length ? <ol>{value.map((item, index) => <li key={identity(item)} className={styles.item}>
      <details open={depth === 1}><summary><span>{item.label.fa || 'بدون عنوان'}</span>{presentation === 'navigation' && depth === 1 && <small className={styles.modeBadge}>{item.menuDisplay === 'mega' ? 'مگامنو' : 'کشویی'}</small>}{item.enabled === false && <small>پنهان</small>}<small>{item.children?.length ? `${item.children.length.toLocaleString('fa-IR')} زیرمنو` : ''}</small></summary>
        <div className={styles.fields}>
          <label className="sh-field"><span>عنوان</span><input className="sh-input" maxLength={120} value={item.label.fa} onChange={event => patch(index, { label: { ...item.label, fa: event.target.value } })} /></label>
          <label className="sh-field"><span>نشانی مقصد</span><input className="sh-input" dir="ltr" maxLength={2048} value={item.href} onChange={event => patch(index, { href: event.target.value })} /></label>
          {presentation === 'navigation' && <label className={`sh-field ${styles.description}`}><span>توضیح کوتاه لینک (اختیاری)</span><input className="sh-input" maxLength={180} value={item.description?.fa || ''} onChange={event => patch(index, { description: { ...local('', ''), ...item.description, fa: event.target.value } })} /></label>}
          <MenuIconField automatic value={item.icon} onChange={icon => patch(index, { icon })} />
          <label className="sh-check"><input type="checkbox" checked={item.enabled !== false} onChange={event => patch(index, { enabled: event.target.checked })} />نمایش لینک و زیرمنوها</label>
        </div>
        {presentation === 'navigation' && depth === 1 && <MenuPresentationField item={item} onChange={next => patch(index, next)} />}
        <div className={styles.actions}>
          <button type="button" className="sh-btn sh-btn-ghost" disabled={index === 0} aria-label={`بالا بردن ${item.label.fa}`} onClick={() => move(index, -1)}>↑ بالا</button>
          <button type="button" className="sh-btn sh-btn-ghost" disabled={index === value.length - 1} aria-label={`پایین بردن ${item.label.fa}`} onClick={() => move(index, 1)}>↓ پایین</button>
          {index > 0 && <button type="button" className="sh-btn sh-btn-ghost" disabled={branchDepth(item) + depth > MENU_DEPTH} onClick={() => { const next = [...value]; const previous = next[index - 1]; next[index - 1] = { ...previous, children: [...(previous.children || []), item] }; next.splice(index, 1); onChange(next) }}>زیرمنوی مورد قبلی</button>}
          {onPromote && <button type="button" className="sh-btn sh-btn-ghost" onClick={() => onPromote(index)}>یک سطح بالاتر</button>}
          <button type="button" className="sh-btn sh-btn-ghost" onClick={() => setPendingDelete(identity(item))}>حذف</button>
        </div>
        {pendingDelete === identity(item) && <div className={styles.confirm} role="alert"><p>«{item.label.fa}» و زیرمنوهایش از فهرست حذف شوند؟ محتوا و دسته‌بندی‌ها حذف نمی‌شوند.</p><button type="button" className="sh-btn" onClick={() => { onChange(value.filter((_, i) => i !== index)); setPendingDelete(null) }}>حذف از فهرست</button><button type="button" className="sh-btn sh-btn-ghost" onClick={() => setPendingDelete(null)}>انصراف</button></div>}
        {depth < MENU_DEPTH && <MenuTreeEditor value={item.children || []} total={total} depth={depth + 1} presentation={presentation} onChange={children => patch(index, { children })} onPromote={childIndex => { const children = [...(item.children || [])]; const [child] = children.splice(childIndex, 1); const next = [...value]; next[index] = { ...item, children }; next.splice(index + 1, 0, child); onChange(next) }} />}
      </details>
    </li>)}</ol> : depth === 1 ? <p className="sh-muted">هنوز لینکی در این فهرست نیست.</p> : null}
    <button type="button" className="sh-btn sh-btn-ghost" disabled={total >= MENU_ITEMS} onClick={() => onChange([...value, entry()])}>{depth === 1 ? '+ افزودن لینک' : '+ افزودن زیرمنو'}</button>
  </div>
}

function branchDepth(item: SiteLink): number { return 1 + Math.max(0, ...(item.children || []).map(branchDepth)) }
