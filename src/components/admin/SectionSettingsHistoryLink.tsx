import Link from '@/components/AppLink'
import './authoring-controls.css'

/** The same owner history page; each destination keeps its own server guard. */
export default function SectionSettingsHistoryLink({ section }: { section: 'journal' | 'cinema' | 'music' | 'games' | 'software' | 'site' | 'navigation' | 'media' | 'notifications' | 'businesses' | 'delivery' | 'storefront' | 'returns' | 'watermark' | 'profile-fields' | 'trust-seals' | 'seo' }) {
  return <Link className="btn btn-ghost" href={`/admin/history?type=settings-${section}&id=1`}>تاریخچه و بازگردانی</Link>
}
