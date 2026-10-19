'use client'

import { useId } from 'react'
import type { SiteLink } from '@/modules/site/config/types'
import styles from './MenuTreeEditor.module.css'

export default function MenuPresentationField({ item, onChange }: { item: SiteLink; onChange: (patch: Partial<SiteLink>) => void }) {
  const id = useId(), mega = item.menuDisplay === 'mega'
  return <fieldset className={styles.presentation} aria-describedby={`${id}-help`}>
    <legend>نمایش زیرمنو</legend>
    <div className={styles.modes}>
      {(['dropdown', 'mega'] as const).map(mode => <label key={mode} className={`${styles.mode}${(mega ? mode === 'mega' : mode === 'dropdown') ? ` ${styles.selected}` : ''}`}>
        <input type="radio" name={id} value={mode} checked={mega ? mode === 'mega' : mode === 'dropdown'} onChange={() => onChange({ menuDisplay: mode })} />
        <span className={`${styles.diagram} ${mode === 'mega' ? styles.diagramMega : ''}`} aria-hidden="true"><i /><i /><i /></span>
        <span><b>{mode === 'mega' ? 'مگامنوی ستونی' : 'زیرمنوی کشویی'}</b><small>{mode === 'mega' ? 'پنل عریض با گروه‌بندی لینک‌ها' : 'فهرست جمع‌وجور با زیرمنوهای بازشونده'}</small></span>
      </label>)}
    </div>
    {mega && <label className={`sh-field ${styles.columnChoice}`}><span>تعداد ستون‌های مگامنو</span><select className="sh-input" value={item.menuColumns || 3} onChange={event => onChange({ menuColumns: Number(event.target.value) as 2 | 3 | 4 })}>{[2, 3, 4].map(n => <option key={n} value={n}>{n.toLocaleString('fa-IR')} ستون</option>)}</select></label>}
    <p id={`${id}-help`}>زیرمنوهای هر لینک، گروه‌های مگامنو را می‌سازند. در موبایل، گروه‌ها داخل منوی کناری باز می‌شوند.</p>
  </fieldset>
}
