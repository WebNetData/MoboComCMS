import { sectionDisplayName } from '@/modules/site/server/section-names'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import './cloud.css'

export type CloudTab = 'overview' | 'hosting' | 'servers' | 'domains'

const TABS: { key: CloudTab | 'mine'; href: string; label: string; icon: string }[] = [
  { key: 'overview', href: '/cloud', label: 'نمای کلی', icon: 'cloud' },
  { key: 'hosting', href: '/hosting', label: 'میزبانی وب', icon: 'server' },
  { key: 'servers', href: '/servers', label: 'سرور و ابر', icon: 'cpu' },
  { key: 'domains', href: '/domains', label: 'دامنه', icon: 'globe' },
  { key: 'mine', href: '/dashboard/cloud', label: 'سرویس‌های من', icon: 'activity' },
]

/** The MoboCom Cloud bar shared by /cloud, /hosting, /servers and /domains: one section, each page keeps its address. */
export default async function CloudBar({ active }: { active: CloudTab }) {
  // The section's own name (Admin › sections); its last word keeps the accent colour, as «موبوکام کلاد» did.
  const name = await sectionDisplayName('hosting', true, { fa: 'موبوکام کلاد', en: 'MoboCom Cloud' }), words = name.split(' '), last = words.pop()
  return <nav className="cx-bar" aria-label={name}>
    <div className="container cx-bar-inner">
      <Link href="/cloud" className="cx-brand" aria-label={`${name}، نمای کلی`}>
        <span className="cx-mark" aria-hidden="true"><Icon name="cloud" size={18} /></span>
        <b>{words.length ? `${words.join(' ')} ` : ''}<span>{last}</span></b>
      </Link>
      <ul className="cx-tabs">
        {TABS.map((tab) => <li key={tab.key}>
          <Link href={tab.href} className={tab.key === 'mine' ? 'is-mine' : undefined} aria-current={tab.key === active ? 'page' : undefined}>
            <Icon name={tab.icon} size={16} />{tab.label}
          </Link>
        </li>)}
      </ul>
    </div>
  </nav>
}
