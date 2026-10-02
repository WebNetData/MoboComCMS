import Link from '@/components/AppLink'
import { itemKey, type ItemRef } from '@/modules/content/domain/items'
import { entityTopics, type EntityTopicKind } from '@/modules/forum/server/related'

const sections: { kind: EntityTopicKind; title: string; action: string; slug: string }[] = [
  { kind: 'QUESTION', title: 'پرسش و پاسخ', action: 'پرسش تازه', slug: 'question' },
  { kind: 'DISCUSSION', title: 'گفت‌وگوها', action: 'شروع گفت‌وگو', slug: 'discussion' },
]

/** Forum topics tied to this public entity; hidden and restricted topics never enter the preview. */
export default async function RelatedDiscussions({ item }: { item: ItemRef }) {
  const results = await Promise.all(sections.map((section) => entityTopics(item, section.kind)))
  if (results.every((result) => !result)) return null
  const key = itemKey(item)
  return <section className="er-section" id="discussions" aria-labelledby="er-title">
    <header className="er-heading"><div><span>جامعهٔ موبوکام</span><h2 id="er-title">پرسش و گفت‌وگو</h2><p>تجربه‌ها و راه‌حل‌ها را با دیگران به اشتراک بگذارید.</p></div><Link href={`/forum/related/${item.type}/${item.id}`}>همهٔ موضوع‌ها ←</Link></header>
    <div className="er-grid">{sections.map((section, index) => {
      const data = results[index]
      if (!data) return null
      return <div className="er-column" key={section.kind}>
        <div className="er-column-head"><h3>{section.title}</h3><span>{data.total.toLocaleString('fa-IR')}</span></div>
        {data.topics.length ? <ol className="er-topic-list">{data.topics.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}><strong>{topic.title}</strong><small>{topic.solvedPostId ? '✓ پاسخ پذیرفته‌شده · ' : ''}{topic.replyCount.toLocaleString('fa-IR')} پاسخ</small></Link></li>)}</ol> : <p className="er-empty">هنوز موضوعی ثبت نشده است.</p>}
        <div className="er-column-actions"><Link className="er-new" href={`/forum/new?item=${encodeURIComponent(key)}&kind=${section.slug}`}>{section.action} ←</Link>{data.total > data.topics.length && <Link href={`/forum/related/${item.type}/${item.id}?kind=${section.slug}`}>نمایش همه</Link>}</div>
      </div>
    })}</div>
  </section>
}
