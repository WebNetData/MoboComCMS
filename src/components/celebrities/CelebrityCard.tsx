import Link from '@/components/AppLink'
import type { CelebrityCard } from '@/modules/celebrities/server/celebrities'

const fa = (value: number) => value.toLocaleString('fa-IR')

/** The works line of a card: films and series, albums, songs. */
function worksOf(person: CelebrityCard) {
  return [person.titles ? `${fa(person.titles)} فیلم و سریال` : '', person.albums ? `${fa(person.albums)} آلبوم` : '', person.songs ? `${fa(person.songs)} آهنگ` : ''].filter(Boolean)
}

/** The ring of a portrait tells the sections at a glance: cinema red, music violet, both a blend. */
const tone = (person: CelebrityCard) => (person.titles && (person.songs || person.albums) ? 'is-both' : person.titles ? 'is-cinema' : 'is-music')

/** One person in the «چهره‌ها» directory: picture, name, roles and how many works of each kind. */
export default function CelebrityCardView({ person, note }: { person: CelebrityCard; note?: string }) {
  const works = worksOf(person)
  return <Link href={`/celebrities/${encodeURIComponent(person.slug)}`} className={`cb-card ${tone(person)}`}>
    <span className="cb-card-art">{person.image ? <img src={person.image} alt="" loading="lazy" decoding="async" /> : <i aria-hidden="true">{person.name.slice(0, 1)}</i>}{person.featured && <em>برگزیده</em>}</span>
    <b className="cb-card-name">{person.name}</b>
    {person.nameEn && <small className="cb-card-en" dir="ltr">{person.nameEn}</small>}
    {person.roles.length > 0 && <span className="cb-card-roles">{person.roles.slice(0, 3).map((role) => <i key={role}>{role}</i>)}</span>}
    {(note || works.length > 0) && <small className="cb-card-works">{note || works.join('، ')}</small>}
  </Link>
}

/** A wide card of the featured strip: the person's picture as a soft backdrop, their portrait, roles and works. */
export function FeaturedCelebrity({ person }: { person: CelebrityCard }) {
  const backdrop = person.cover || person.image
  return <Link href={`/celebrities/${encodeURIComponent(person.slug)}`} className={`cb-feature ${tone(person)}`}>
    {backdrop && <span className="cb-feature-back" aria-hidden="true"><img src={backdrop} alt="" loading="lazy" decoding="async" /></span>}
    <span className="cb-feature-face">{person.image ? <img src={person.image} alt="" loading="lazy" decoding="async" /> : <i aria-hidden="true">{person.name.slice(0, 1)}</i>}</span>
    <span className="cb-feature-copy">
      <b>{person.name}</b>
      {person.roles.length > 0 && <small>{person.roles.slice(0, 3).join(' · ')}</small>}
      {worksOf(person).length > 0 && <small className="cb-feature-works">{worksOf(person).join('، ')}</small>}
    </span>
  </Link>
}
