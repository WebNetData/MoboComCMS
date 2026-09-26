import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer, searchForum } from '@/modules/forum/server/forum'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, CategoryBadge, Pager, TimeAgo, num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'جست‌وجو در تالار', robots: { index: false } }

function highlight(text: string, q: string) {
  if (!q) return text
  const parts = text.split(q)
  return parts.flatMap((part, index) => (index ? [<mark key={index}>{q}</mark>, part] : [part]))
}

export default async function ForumSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; category?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const params = await searchParams
  const data = await searchForum(viewer, { q: params.q, page: Number(params.page) || 1, category: params.category })
  return (
    <ForumShell viewer={viewer} active="search">
      <header className="fx-page-head">
        <h1>جست‌وجو</h1>
        <form className="fx-big-search" role="search"><input name="q" type="search" defaultValue={data.q} className="input" placeholder="چه چیزی دنبالش هستید؟" aria-label="عبارت جست‌وجو" autoFocus /><button className="btn btn-primary">جست‌وجو</button></form>
        {data.q && <p className="fx-muted">{data.q.length < 2 ? 'دست‌کم دو حرف بنویسید.' : `${num(data.total)} نتیجه برای «${data.q}»`}</p>}
      </header>
      <ol className="fx-results">{data.results.map((result) => (
        <li key={result.id}>
          <Link href={`/forum/t/${result.topic.id}?post=${result.number}`} className="fx-result-title">{result.topic.solved ? '✓ ' : ''}{result.topic.title}</Link>
          <div className="fx-result-meta">{result.category && <CategoryBadge category={result.category} />}<Avatar author={result.author} size={20} /><span>{result.author.name}</span><span className="fx-muted">· <TimeAgo date={result.createdAt} /> · پیام #{num(result.number)}</span></div>
          <p>{highlight(result.snippet, data.q)}</p>
        </li>
      ))}</ol>
      <Pager page={data.page} pages={data.pages} href={(n) => `/forum/search?q=${encodeURIComponent(data.q)}${n > 1 ? `&page=${n}` : ''}`} />
    </ForumShell>
  )
}
