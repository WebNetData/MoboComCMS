import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { entityTopics, ENTITY_TOPIC_TYPES, type EntityTopicKind } from '@/modules/forum/server/related'
import { getForumViewer } from '@/modules/forum/server/forum'
import { itemKey, type ItemRef } from '@/modules/content/domain/items'
import ForumShell from '@/components/forum/ForumShell'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ type: string; id: string }>; searchParams: Promise<{ kind?: string; page?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, id } = await params
  if (!ENTITY_TOPIC_TYPES.includes(type as (typeof ENTITY_TOPIC_TYPES)[number])) return {}
  const data = await entityTopics({ type: type as ItemRef['type'], id: Number(id) }, 'QUESTION', 1, 1)
  return data ? { title: `پرسش و گفت‌وگو دربارهٔ ${data.item.title}`, description: `پرسش‌ها و گفت‌وگوهای کاربران دربارهٔ ${data.item.title}` } : {}
}

export default async function EntityTopicsPage({ params, searchParams }: Props) {
  const [{ type, id }, { kind: rawKind, page: rawPage }] = await Promise.all([params, searchParams])
  if (!ENTITY_TOPIC_TYPES.includes(type as (typeof ENTITY_TOPIC_TYPES)[number]) || !/^\d+$/.test(id)) notFound()
  const item: ItemRef = { type: type as ItemRef['type'], id: Number(id) }
  const kind: EntityTopicKind = rawKind === 'discussion' ? 'DISCUSSION' : 'QUESTION'
  const data = await entityTopics(item, kind, Number(rawPage), 20)
  if (!data) notFound()
  const viewer = await getForumViewer()
  const base = `/forum/related/${type}/${id}`
  const kindSlug = kind === 'QUESTION' ? 'question' : 'discussion'
  return <ForumShell viewer={viewer}>
    <div className="er-archive">
      <nav className="er-breadcrumbs" aria-label="مسیر صفحه"><Link href={data.item.url}>{data.item.title}</Link><span>›</span><span>جامعه</span></nav>
      <header className="er-archive-head"><div><p>جامعهٔ موبوکام</p><h1>پرسش و گفت‌وگو دربارهٔ {data.item.title}</h1></div><Link className="er-new" href={`/forum/new?item=${encodeURIComponent(itemKey(item))}&kind=${kindSlug}`}>{kind === 'QUESTION' ? 'پرسش تازه' : 'شروع گفت‌وگو'} ←</Link></header>
      <nav className="er-tabs" aria-label="نوع موضوع"><Link href={`${base}?kind=question`} className={kind === 'QUESTION' ? 'is-active' : ''}>پرسش و پاسخ</Link><Link href={`${base}?kind=discussion`} className={kind === 'DISCUSSION' ? 'is-active' : ''}>گفت‌وگوها</Link></nav>
      {data.topics.length ? <ol className="er-archive-list">{data.topics.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}><strong>{topic.title}</strong><small>{topic.solvedPostId ? '✓ پاسخ پذیرفته‌شده · ' : ''}{topic.replyCount.toLocaleString('fa-IR')} پاسخ · {topic.lastPostAt.toLocaleDateString('fa-IR')}</small></Link></li>)}</ol> : <div className="er-empty">هنوز موضوعی ثبت نشده است. شما می‌توانید اولین مورد را بسازید.</div>}
      {data.pages > 1 && <nav className="er-pages" aria-label="صفحه‌بندی">{data.page > 1 && <Link href={`${base}?kind=${kindSlug}&page=${data.page - 1}`}>صفحهٔ قبل</Link>}<span>صفحهٔ {data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>{data.page < data.pages && <Link href={`${base}?kind=${kindSlug}&page=${data.page + 1}`}>صفحهٔ بعد</Link>}</nav>}
    </div>
  </ForumShell>
}
