import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer, visibleCategories } from '@/modules/forum/server/forum'
import { TRUST_NAMES } from '@/modules/forum/domain/community'
import ForumShell from '@/components/forum/ForumShell'
import NewTopic from '@/components/forum/NewTopic'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'موضوع تازه — تالار گفتمان', robots: { index: false } }

export default async function NewTopicPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const { category } = await searchParams
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/forum/new${category ? `?category=${category}` : ''}`)}`)
  const categories = (await visibleCategories(viewer)).filter((c) => c.access.create)
  const selected = categories.find((c) => c.slug === category)
  return (
    <ForumShell viewer={viewer}>
      <header className="fx-page-head"><h1>موضوع تازه</h1><p className="fx-muted">عنوان روشن بنویسید، جزئیات لازم (نسخه، دستگاه، پیام خطا) را بیاورید و برچسب مناسب بزنید تا زودتر پاسخ بگیرید.</p></header>
      {viewer.silenced || viewer.suspended ? (
        <div className="fx-empty"><p>امکان ارسال پیام برای حساب شما موقتاً بسته است.</p></div>
      ) : categories.length ? (
        <>
          <NewTopic categories={categories.map((c) => ({ id: c.id, title: c.title, color: c.color, parentId: c.parentId }))} categoryId={selected?.id} />
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
