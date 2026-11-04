import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import './cloud.css'

export type CloudTab = 'overview' | 'hosting' | 'servers' | 'domains'

const TABS: { key: CloudTab | 'mine'; href: string; label: string; icon: string }[] = [
  { key: 'overview', href: '/cloud', label: 'نمای کلی', icon: 'cloud' },
  { key: 'hosting', href: '/hosting', label: 'میزبانی وب', icon: 'server' },
  { key: 'servers', href: '/servers', label: 'سرور و ابر', icon: 'cpu' },
  { key: 'domains', href: '/domains', label: 'دامنه', icon: 'globe' },
  { key: 'mine', href: '/dashboard/services', label: 'سرویس‌های من', icon: 'activity' },
]

/** The MoboCom Cloud bar shared by /cloud, /hosting, /servers and /domains: one section, each page keeps its address. */
export default function CloudBar({ active }: { active: CloudTab }) {
  return <nav className="cx-bar" aria-label="موبوکام کلاد">
    <div className="container cx-bar-inner">
      <Link href="/cloud" className="cx-brand" aria-label="موبوکام کلاد، نمای کلی">
        <span className="cx-mark" aria-hidden="true"><Icon name="cloud" size={18} /></span>
        <b>موبوکام <span>کلاد</span></b>
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
