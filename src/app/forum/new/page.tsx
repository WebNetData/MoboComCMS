import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound, redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer, visibleCategories } from '@/modules/forum/server/forum'
import { TRUST_NAMES } from '@/modules/forum/domain/community'
import ForumShell from '@/components/forum/ForumShell'
import NewTopic from '@/components/forum/NewTopic'
import { parseItemKey, itemKey } from '@/modules/content/domain/items'
import { itemCard } from '@/modules/content/server/registry'
import { ENTITY_TOPIC_TYPES, publicEntityCategoryIds, type EntityTopicKind } from '@/modules/forum/server/related'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'موضوع تازه — تالار گفتمان', robots: { index: false } }

export default async function NewTopicPage({ searchParams }: { searchParams: Promise<{ category?: string; item?: string; kind?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const { category, item: itemParam, kind: kindParam } = await searchParams
  const ref = itemParam ? parseItemKey(itemParam) : null
  if (itemParam && (!ref || !ENTITY_TOPIC_TYPES.includes(ref.type as (typeof ENTITY_TOPIC_TYPES)[number]))) notFound()
  const item = ref ? await itemCard(ref) : null
  if (ref && !item) notFound()
  const kind: EntityTopicKind = kindParam === 'question' ? 'QUESTION' : 'DISCUSSION'
  if (!viewer.userId) {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (ref) { params.set('item', itemKey(ref)); params.set('kind', kind === 'QUESTION' ? 'question' : 'discussion') }
    redirect(`/login?next=${encodeURIComponent(`/forum/new${params.size ? `?${params}` : ''}`)}`)
  }
  const publicIds = ref ? new Set(await publicEntityCategoryIds()) : null
  const categories = (await visibleCategories(viewer)).filter((c) => c.access.create && (!publicIds || publicIds.has(c.id)))
  const selected = categories.find((c) => c.slug === category)
  return (
    <ForumShell viewer={viewer}>
      <header className="fx-page-head"><h1>{item ? kind === 'QUESTION' ? 'پرسش تازه' : 'گفت‌وگوی تازه' : 'موضوع تازه'}</h1>{item && <p>دربارهٔ <Link href={item.url}>{item.title}</Link></p>}<p className="fx-muted">عنوان روشن بنویسید، جزئیات لازم (نسخه، دستگاه، پیام خطا) را بیاورید و برچسب مناسب بزنید تا زودتر پاسخ بگیرید.</p></header>
      {viewer.silenced || viewer.suspended ? (
        <div className="fx-empty"><p>امکان ارسال پیام برای حساب شما موقتاً بسته است.</p></div>
      ) : categories.length ? (
        <>
          <NewTopic categories={categories.map((c) => ({ id: c.id, title: c.title, color: c.color, parentId: c.parentId }))} categoryId={selected?.id} context={ref ? { key: itemKey(ref), kind } : undefined} />
          <aside className="fx-tips">
            <strong>راهنمای نوشتن</strong>
            <ul>
              <li><code>**پررنگ**</code>، <code>*مورب*</code>، <code>`کد`</code> و <code>&gt; نقل‌قول</code></li>
              <li>با <code>@نام‌کاربری</code> دیگران را خبر کنید؛ <code>:fire:</code> ایموجی می‌گذارد</li>
              <li>سطح اعتماد شما: {TRUST_NAMES[viewer.trustLevel]} — با مشارکت بیشتر امکانات بیشتری باز می‌شود</li>
            </ul>
          </aside>
        </>
      ) : (
        <div className="fx-empty"><p>در حال حاضر در هیچ دسته‌ای اجازهٔ ایجاد موضوع ندارید. <Link href="/forum">بازگشت به تالار</Link></p></div>
      )}
    </ForumShell>
  )
}
