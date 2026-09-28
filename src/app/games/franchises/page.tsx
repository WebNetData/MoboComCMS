import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { franchiseList } from '@/modules/games/server/portal'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import { FranchiseTiles } from '@/components/games/GameV2'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'مجموعه‌های بازی', description: 'همهٔ نسخه‌های سری‌های محبوب بازی، به ترتیب انتشار.', alternates: { canonical: toPublicPath('/games/franchises') } }

export default async function FranchisesPage() {
  await requireModule('games')
  const items = await franchiseList()
  return (
    <MediaShell section="games">
      <div className="container gv-page">
        <header className="gv-page-head">
          <nav className="gx-crumbs" aria-label="مسیر صفحه"><Link href="/games">بازی</Link> › مجموعه‌ها</nav>
          <h1>مجموعه‌های بازی</h1>
          <p>سری‌های محبوب را از اولین نسخه تا تازه‌ترین دنبال کنید.</p>
        </header>
      </div>
      {items.length ? <FranchiseTiles items={items} title="همهٔ مجموعه‌ها" /> : <div className="container"><EmptyState fa title="هنوز مجموعه‌ای ثبت نشده" text="مجموعه‌ها از پنل مدیریت بازی‌ها ساخته می‌شوند." /></div>}
    </MediaShell>
  )
}
