'use client'

import Icon from '@/components/site/Icon'
import type { ControlArea } from './groups'

/** The admin's areas beside the menu: one press shows that area's groups and nothing else. The search box still reaches all of them. */
export default function AreaRail({ areas, active, current, loading, fa, onPick }: {
  areas: ControlArea[]
  /** The area on show. */
  active?: string
  /** The area of the page that is open, marked while another is on show. */
  current?: string
  loading: boolean
  fa: boolean
  onPick: (id: string) => void
}) {
  return <div className="acn-rail" role="group" aria-label={fa ? 'حوزه‌های مدیریت' : 'Admin areas'} aria-busy={loading}>
    {loading ? Array.from({ length: 7 }, (_, index) => <span className="acn-ghost" key={index} />)
      : areas.map(area => <button key={area.id} type="button" className={`acn-tab ${area.id === current ? 'has-page' : ''}`} aria-pressed={area.id === active} onClick={() => onPick(area.id)}>
        <span className="acn-tab-icon"><Icon name={area.icon} size={18} /></span>
        <span>{fa ? area.title : area.titleEn}</span>
      </button>)}
  </div>
}
