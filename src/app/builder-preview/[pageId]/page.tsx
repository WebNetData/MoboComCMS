import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import {
  canPreviewBuilder, resolvePreviewDoc, resolvePreviewTarget, validPreviewPageId,
} from '@/modules/site/server/builder-preview-admin'
import DesignSurface from '@/components/content/builder/DesignSurface'
import DashboardHome from '@/app/dashboard/OverviewHome'
import { getServerLocale } from '@/i18n/server'
import DashboardDesign from '@/app/dashboard/DesignView'
import TitlePage from '@/app/cinema/[slug]/detail-view'
import TrackPage from '@/app/music/track/[slug]/detail-view'
import AlbumPage from '@/app/music/album/[slug]/detail-view'
import GamePage from '@/app/games/[slug]/detail-view'
import SoftwarePage from '@/app/software/[slug]/detail-view'
import HomeView from '@/modules/site/server/pages/home/page'
import BlogPage from '@/modules/site/server/pages/blog/page'
import PostPage from '@/modules/site/server/pages/blog/[slug]/page'
import ProductPage from '@/modules/catalog/server/pages/products/[slug]/page'
import CustomPage from '@/modules/site/server/pages/p/[slug]/page'
import { ThemePageView } from '@/modules/site/server/pages/section/page'
import type { BuilderPreview } from '@/modules/site/server/builder-preview'
import BuilderPreviewClient from '@/components/content/builder/BuilderPreviewClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Builder preview', robots: { index: false, follow: false } }

/**
 * Live preview for the page builder. It lives OUTSIDE /admin on purpose: the admin
 * layout is a client component that renders a loading screen until the session is
 * known, so a preview nested there never reached the browser as server HTML and
 * its editor bridge never ran. Access is still limited to admins who may edit the
 * page (checked server-side below).
 */
const PREVIEW_CSS = `
body{cursor:default}
[data-sid]{outline:1px dashed transparent;outline-offset:-2px;transition:outline-color .12s ease}
[data-sid]:hover{outline-color:#48b8ff}
[data-cid]:hover{outline:1px dashed #f5b942;outline-offset:-1px}
[data-bid]{position:relative}
[data-bid]:hover{outline:2px dashed #34bfa0;outline-offset:3px}
.is-bld-selected{outline:2px solid #48b8ff!important;outline-offset:2px}
[data-bid][draggable=true],[data-sid][draggable=true]{cursor:grab}
body.bld-dragging,body.bld-dragging *{cursor:grabbing!important}
.bld-dline{position:absolute;left:0;right:0;height:3px;background:#48b8ff;border-radius:2px;pointer-events:none;z-index:60;box-shadow:0 0 0 1px #0d1d2e88}
.bld-section-over{outline:3px solid #f5b942!important;outline-offset:-3px}
.bld-section-before{box-shadow:inset 0 4px 0 #48b8ff}
.bld-section-after{box-shadow:inset 0 -4px 0 #48b8ff}
.bld-empty-drop{position:fixed;inset:1rem;z-index:80;display:grid;place-items:center;border:3px dashed #48b8ff;border-radius:22px;background:#0d1d2ee6;color:#cfe4f7;font:600 18px/1.8 system-ui,sans-serif;pointer-events:none}
.bp-note{max-width:42rem;margin:4rem auto;padding:1.5rem;border:1px solid #29445f;border-radius:16px;background:#0d1d2e;color:#cfe4f7;font:15px/1.8 system-ui,sans-serif;text-align:center}
`

export default async function BuilderPreviewRoute({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params
  const session = await getServerSession(authOptions)
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id)
  const allowed = validPreviewPageId(pageId) && await canPreviewBuilder(pageId, userId)

  let body
  if (!allowed) {
    body = <div className="bp-note">پیش‌نمایش در دسترس نیست — با حساب مدیر مجاز وارد شوید.<br />Preview unavailable — sign in with an authorized admin account.</div>
  } else {
    const [doc, target] = await Promise.all([resolvePreviewDoc(pageId), resolvePreviewTarget(pageId)])
    const preview: BuilderPreview = { pageId, doc }
    switch (target.kind) {
      case 'template': {
        const { meta, sample } = target
        const withTemplate: BuilderPreview = { pageId, doc, template: { id: meta.id, type: meta.type, doc } }
        const none = (fa: string, en: string) => <div className="bp-note">{fa}<br />{en}</div>
        if (meta.type === 'surface') {
          const props = { params: Promise.resolve({slug: sample || ''}), preview: withTemplate }
          body = meta.surface === 'account' ? <DesignSurface design={{surface:'account',entryId:0,preview:withTemplate}} locale={await getServerLocale()}><DashboardHome /></DesignSurface>
            : meta.surface === 'dashboard' ? <DashboardDesign preview={withTemplate} />
            : !sample ? none('برای پیش‌نمایش، ابتدا یک محتوای منتشرشده در این بخش بسازید.', 'Publish an entry in this section first.')
            : meta.surface === 'movie' || meta.surface === 'series' ? <TitlePage {...props} />
            : meta.surface === 'track' ? <TrackPage {...props} />
            : meta.surface === 'album' ? <AlbumPage {...props} />
            : meta.surface === 'game' ? <GamePage {...props} /> : <SoftwarePage {...props} />
        }
        else if (meta.type === 'page') body = <ThemePageView meta={meta} doc={doc} preview={preview} />
        else if (meta.type === 'header' || meta.type === 'footer') body = <HomeView preview={withTemplate} />
        else if (meta.type === 'single-post') body = sample ? <PostPage params={Promise.resolve({ slug: sample })} preview={withTemplate} /> : none('برای پیش‌نمایش قالب پست، ابتدا یک مطلب بسازید.', 'Create a post to preview this layout.')
        else body = sample ? <ProductPage params={Promise.resolve({ slug: sample })} preview={withTemplate} /> : none('برای پیش‌نمایش قالب محصول، ابتدا یک محصول بسازید.', 'Create a product to preview this layout.')
        break
      }
      case 'home':
        body = <HomeView preview={preview} />
        break
      case 'blog':
        body = <BlogPage searchParams={Promise.resolve({})} preview={preview} />
        break
      case 'post':
        body = <PostPage params={Promise.resolve({ slug: target.slug })} preview={preview} />
        break
      case 'product':
        body = <ProductPage params={Promise.resolve({ slug: target.slug })} preview={preview} />
        break
      case 'page':
        body = <CustomPage params={Promise.resolve({ slug: target.slug })} preview={preview} />
        break
      default:
        body = <div className="bp-note">این صفحه پیدا نشد — ابتدا محتوا را ذخیره کنید.<br />Page not found — save the entry first.</div>
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} />
      {body}
      {allowed && <BuilderPreviewClient pageId={pageId} empty={{ fa: 'اینجا رها کنید تا اولین بخش ساخته شود', en: 'Drop here to create the first section' }} />}
    </>
  )
}
