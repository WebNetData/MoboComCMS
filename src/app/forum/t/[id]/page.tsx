import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer, getTopic, visibleCategories } from '@/modules/forum/server/forum'
import ForumShell from '@/components/forum/ForumShell'
import TopicView, { type TopicData } from '@/components/forum/TopicView'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; post?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, { page }] = await Promise.all([params, searchParams])
  const data = await getTopic(Number(id), await getForumViewer(), { page: Number(page) || 1 })
  if (!data) return { title: 'موضوع پیدا نشد', robots: { index: false } }
  const hidden = data.thread.status !== 'VISIBLE'
  return {
    title: `${data.thread.title} — ${data.category.title}`,
    description: data.description || undefined,
    robots: hidden ? { index: false } : undefined,
    alternates: { canonical: data.page > 1 ? `/forum/t/${id}?page=${data.page}` : `/forum/t/${id}` },
    openGraph: { type: 'article', title: data.thread.title, description: data.description || undefined },
  }
}

export default async function TopicPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ id }, { page, post }] = await Promise.all([params, searchParams])
  const viewer = await getForumViewer()
  const data = await getTopic(Number(id), viewer, { page: Number(page) || 1, post: Number(post) || undefined })
  if (!data) notFound()
  const categories = (await visibleCategories(viewer)).filter((c) => c.access.create || c.id === data.category.id).map((c) => ({ id: c.id, title: c.title, color: c.color, parentId: c.parentId }))
  // Dates → strings for the client component.
  const serialized = JSON.parse(JSON.stringify(data)) as TopicData
  const first = data.posts.find((p) => p.number === 1)
  const jsonLd = first ? {
    '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', headline: data.thread.title, datePublished: data.thread.createdAt, dateModified: data.thread.lastPostAt,
    author: { '@type': 'Person', name: first.author.name, url: `/forum/u/${first.author.username}` }, text: data.description,
    interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: data.thread.replyCount }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: data.thread.likeCount }],
  } : null
  return (
    <ForumShell viewer={viewer} category={data.category.slug}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
      <TopicView data={serialized} categories={categories} focusPost={Number(post) || undefined} />
    </ForumShell>
  )
}
