import Link from '@/components/AppLink'
import { recommendStudios } from '@/modules/recommendations/server/studios'

export default async function StudioSuggestions({ studioId, enabled }: { studioId: number; enabled: { games: boolean; software: boolean } }) {
  const suggestions = await recommendStudios(studioId, enabled)
  if (!suggestions.length) return null
  return <section className="org-suggestions" aria-labelledby="org-suggestions-title">
    <header><span>کشف بیشتر</span><h2 id="org-suggestions-title">سازندگان و ناشران مرتبط</h2></header>
    <ul>{suggestions.map((studio) => <li key={studio.id}><Link href={`/studios/${studio.id}`}><span className="org-logo">{studio.logo ? <img src={studio.logo} alt="" loading="lazy" /> : studio.name.slice(0, 1)}</span><span><b>{studio.name}</b><small>{studio.reason}</small></span><span className="org-arrow" aria-hidden="true">←</span></Link></li>)}</ul>
  </section>
}
