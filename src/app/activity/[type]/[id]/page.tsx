import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import { parseItemKey } from '@/modules/content/domain/items'
import { itemTimeline } from '@/modules/content/server/timeline'
import { TIMELINE_LABEL } from '@/modules/content/domain/timeline'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ type: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, id } = await params
  const ref = parseItemKey(`${type}:${id}`)
  const timeline = ref ? await itemTimeline(ref) : null
  // A list of facts shown elsewhere: readable, but the item's own page is the one to index.
  return timeline ? { title: `خط زمانی ${timeline.item.title}`, robots: { index: false, follow: true }, alternates: { canonical: timeline.item.url } } : { title: 'پیدا نشد', robots: { index: false } }
}

/** /activity/:type/:id — the public timeline of one item: releases, episodes, articles and forum topics about it. */
export default async function ItemActivityPage({ params }: Props) {
  const { type, id } = await params
  const ref = parseItemKey(`${type}:${id}`)
  const timeline = ref ? await itemTimeline(ref) : null
  if (!timeline) notFound()
  const day = (iso: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date(iso))
  return <MediaShell section="search">
    <div className="container md-body it-timeline" dir="rtl">
      <header><Link href={timeline.item.url} className="md-eyebrow">← {timeline.item.title}</Link><h1>خط زمانی</h1><p className="muted">آنچه برای این مورد در سایت رخ داده است، از تازه به قدیم.</p></header>
      <ol>{timeline.events.map((event) => <li key={`${event.kind}-${event.at}-${event.href}-${event.title}`} className={`is-${event.kind}`}>
        <time dateTime={event.at}>{day(event.at)}</time>
        <span className="it-kind">{TIMELINE_LABEL[event.kind]}</span>
        <Link href={event.href}><b>{event.title}</b>{event.detail && <small dir="ltr">{event.detail}</small>}</Link>
      </li>)}</ol>
    </div>
  </MediaShell>
}
