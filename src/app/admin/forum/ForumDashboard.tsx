'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Reports = {
  days: string[]
  series: Record<'topics' | 'replies' | 'members' | 'likes' | 'flags' | 'messages', number[]>
  totals: { topics: number; replies: number; members: number; likes: number; flags: number; messages: number; activeUsers: number; pending: number; pendingFlags: number; answeredIn24h: number; medianFirstReplyMinutes: number | null; unanswered: number }
  topTopics: { id: number; title: string; views: number; replies: number; likes: number }[]
  contributors: { id: number; username: string; name: string; posts: number }[]
  categories: { id: number; title: string; color: string; topics: number; posts: number }[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')
const day = (key: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`))

/** One metric as a small bar chart (single series, hover tooltip, newest day on the left for RTL). */
function Spark({ label, values, days, total }: { label: string; values: number[]; days: string[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  const w = 300, h = 64, gap = 2
  const bar = (w - gap * (values.length - 1)) / values.length
  return <figure className="fd-spark">
    <figcaption><span>{label}</span><b className="num">{hover !== null ? fa(values[hover]) : fa(total)}</b><small>{hover !== null ? day(days[hover]) : `${fa(values.length)} روز اخیر`}</small></figcaption>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${fa(total)} در ${fa(values.length)} روز`} onMouseLeave={() => setHover(null)}>
      {values.map((value, i) => {
        const x = w - (i + 1) * bar - i * gap
        const bh = value ? Math.max(3, (value / max) * (h - 4)) : 0
        return <g key={i} onMouseEnter={() => setHover(i)}>
          <rect x={x} y={0} width={bar + gap} height={h} fill="transparent" />
          {bh > 0 && <rect x={x} y={h - bh} width={bar} height={bh} rx={Math.min(3, bar / 2)} className={hover === i ? 'is-hover' : ''} />}
        </g>
      })}
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} className="fd-axis" />
    </svg>
  </figure>
}

export default function ForumDashboard() {
  const [data, setData] = useState<Reports | null>(null)
  const [days, setDays] = useState(30)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/forum?section=reports&days=${days}`, { cache: 'no-store' }).then(async (r) => {
      const body = await r.json().catch(() => null)
      if (!alive) return
      if (r.ok) { setData(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
    }).catch(() => alive && setError('بارگذاری نشد'))
    return () => { alive = false }
  }, [days])
  if (error) return <div className="xm-notice is-error" role="alert">{error}</div>
  if (!data) return <div className="tb-empty">در حال بارگذاری…</div>
  const k = data.totals
  return <section className="xm-section fd">
    <div className="fd-head">
      <h2>سلامت جامعه</h2>
      <div className="fd-range" role="group" aria-label="بازه">{[7, 30, 90].map((n) => <button key={n} type="button" className={days === n ? 'is-active' : ''} aria-pressed={days === n} onClick={() => setDays(n)}>{fa(n)} روز</button>)}</div>
    </div>
    <div className="fd-kpis">
      <div><span>کاربران فعال (نویسنده)</span><b className="num">{fa(k.activeUsers)}</b></div>
      <div><span>پاسخ در ۲۴ ساعت نخست</span><b className="num">{fa(k.answeredIn24h)}٪</b><small>{k.medianFirstReplyMinutes !== null ? `میانهٔ نخستین پاسخ: ${k.medianFirstReplyMinutes < 60 ? `${fa(k.medianFirstReplyMinutes)} دقیقه` : `${fa(Math.round(k.medianFirstReplyMinutes / 60))} ساعت`}` : 'هنوز پاسخی نیست'}</small></div>
      <div><span>موضوع بی‌پاسخ</span><b className="num">{fa(k.unanswered)}</b><Link href="/forum/unanswered" target="_blank">مشاهده</Link></div>
      <div className={k.pending || k.pendingFlags ? 'is-hot' : ''}><span>در انتظار ناظر</span><b className="num">{fa(k.pending + k.pendingFlags)}</b><small>{fa(k.pending)} بررسی · {fa(k.pendingFlags)} گزارش</small></div>
    </div>
    <div className="fd-sparks">
      <Spark label="موضوع تازه" values={data.series.topics} days={data.days} total={k.topics} />
      <Spark label="پاسخ" values={data.series.replies} days={data.days} total={k.replies} />
      <Spark label="عضو تازه" values={data.series.members} days={data.days} total={k.members} />
      <Spark label="واکنش" values={data.series.likes} days={data.days} total={k.likes} />
      <Spark label="پیام خصوصی" values={data.series.messages} days={data.days} total={k.messages} />
      <Spark label="گزارش" values={data.series.flags} days={data.days} total={k.flags} />
    </div>
    <div className="fd-cols">
      <div className="card"><h3>داغ‌ترین موضوع‌ها</h3>{data.topTopics.length ? <ol className="fd-list">{data.topTopics.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`} target="_blank">{topic.title}</Link><small className="num">{fa(topic.replies)} پاسخ · {fa(topic.likes)} واکنش · {fa(topic.views)} بازدید</small></li>)}</ol> : <p className="muted">موضوعی در این بازه نیست.</p>}</div>
      <div className="card"><h3>فعال‌ترین اعضا</h3>{data.contributors.length ? <ol className="fd-list">{data.contributors.map((user) => <li key={user.id}><Link href={`/forum/u/${user.username}`} target="_blank">{user.name}</Link><small className="num">{fa(user.posts)} پیام</small></li>)}</ol> : <p className="muted">هنوز فعالیتی نیست.</p>}</div>
      <div className="card"><h3>دسته‌ها</h3>{data.categories.length ? <ul className="fd-list">{data.categories.map((category) => <li key={category.id}><span><i className="fd-dot" style={{ background: category.color }} />{category.title}</span><small className="num">{fa(category.topics)} موضوع · {fa(category.posts)} پیام</small></li>)}</ul> : <p className="muted">—</p>}</div>
    </div>
  </section>
}
