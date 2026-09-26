import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { categoryIndex, forumStats, getForumViewer } from '@/modules/forum/server/forum'
import ForumShell from '@/components/forum/ForumShell'
import { TimeAgo, num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'دسته‌بندی‌های تالار', alternates: { canonical: '/forum/categories' } }

export default async function ForumCategoriesPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const [categories, stats] = await Promise.all([categoryIndex(viewer), forumStats()])
  return (
    <ForumShell viewer={viewer} active="categories">
      <header className="fx-page-head">
        <h1>دسته‌بندی‌ها</h1>
        <p className="fx-muted">{num(stats.threads)} موضوع · {num(stats.posts)} پیام · {num(stats.members)} عضو فعال · {num(stats.online)} نفر آنلاین</p>
      </header>
      <table className="fx-cats">
        <thead><tr><th scope="col">دسته</th><th scope="col" className="fx-col-num">موضوع</th><th scope="col">آخرین موضوع‌ها</th></tr></thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} style={{ ['--cat' as string]: category.color }}>
              <td className="fx-cats-main">
                <Link href={`/forum/c/${category.slug}`} className="fx-cats-title">{category.icon && <span aria-hidden="true">{category.icon}</span>}{category.title}{category.vip && <small className="fx-vip">VIP</small>}</Link>
                {category.description && <p>{category.description}</p>}
                {category.children.length > 0 && <div className="fx-subcats">{category.children.map((child) => <Link key={child.id} href={`/forum/c/${child.slug}`}><i style={{ background: child.color }} aria-hidden="true" />{child.title}</Link>)}</div>}
              </td>
              <td className="fx-col-num"><b>{num(category.topics)}</b></td>
              <td className="fx-cats-latest">{category.latest.length ? <ul>{category.latest.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}>{topic.title}</Link><small><TimeAgo date={topic.lastPostAt} /></small></li>)}</ul> : <span className="fx-muted">هنوز موضوعی نیست</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!categories.length && <div className="fx-empty"><p>دسته‌ای برای نمایش وجود ندارد.</p></div>}
    </ForumShell>
  )
}
