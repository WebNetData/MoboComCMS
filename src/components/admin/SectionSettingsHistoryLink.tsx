import Link from '@/components/AppLink'
import './authoring-controls.css'
import type { ConfigurationSection } from '@/modules/content/domain/history-forms'

/** The same owner history page; each destination keeps its own server guard. */
export default function SectionSettingsHistoryLink({ section }: { section: ConfigurationSection }) {
  return <Link className="btn btn-ghost" href={`/admin/history?type=settings-${section}&id=1`}>تاریخچه و بازگردانی</Link>
}
