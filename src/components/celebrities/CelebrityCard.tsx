import Link from '@/components/AppLink'
import type { CelebrityCard } from '@/modules/celebrities/server/celebrities'

const fa = (value: number) => value.toLocaleString('fa-IR')

/** One person in the «چهره‌ها» directory: picture, name, roles and how many works of each kind. */
export default function CelebrityCardView({ person }: { person: CelebrityCard }) {
  const works = [person.titles ? `${fa(person.titles)} فیلم و سریال` : '', person.albums ? `${fa(person.albums)} آلبوم` : '', person.songs ? `${fa(person.songs)} آهنگ` : ''].filter(Boolean)
  return <Link href={`/celebrities/${encodeURIComponent(person.slug)}`} className="cb-card">
    <span className="cb-card-art">{person.image ? <img src={person.image} alt="" loading="lazy" decoding="async" /> : <i aria-hidden="true">{person.name.slice(0, 1)}</i>}{person.featured && <em>ویژه</em>}</span>
    <b className="cb-card-name">{person.name}</b>
    {person.roles.length > 0 && <span className="cb-card-roles">{person.roles.slice(0, 3).join(' · ')}</span>}
    {works.length > 0 && <small className="cb-card-works">{works.join('، ')}</small>}
  </Link>
}
