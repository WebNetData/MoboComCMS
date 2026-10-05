import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from '@/components/AppLink'
import { getServerLocale } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { memberReviewPage } from '@/modules/account/server/reviews'
import Icon from '@/components/site/Icon'
import MyReviewManage from '@/components/engage/MyReviewManage'
import MyCommentDelete from '@/components/engage/MyCommentDelete'
import { EXPERIENCE_LABEL, dimensionsFor, isExperienceKind } from '@/modules/reviews/domain/dimensions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'نظرهای من | My reviews', robots: { index: false, follow: false } }

const STATUS: Record<string, { fa: string; en: string; tone: string }> = {
  APPROVED: { fa: 'منتشر شده', en: 'Published', tone: 'is-ok' },
  PENDING: { fa: 'در انتظار بررسی', en: 'Awaiting review', tone: 'is-wait' },
  REJECTED: { fa: 'تأیید نشد', en: 'Not approved', tone: 'is-no' },
}

export default async function MyReviewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [viewer, locale, query] = await Promise.all([getViewer(), getServerLocale(), searchParams])
  if (!viewer.userId) redirect('/login?next=/dashboard/reviews')
  const fa = locale === 'fa'
  const data = await memberReviewPage(viewer.userId, query.page)
  const date = new Intl.DateTimeFormat(fa ? 'fa-IR-u-ca-persian' : 'en', { dateStyle: 'medium' })
  return <div className="ud ulib-page recent-home myrev">
    <header className="ulib-head">
      <div className="recent-heading"><span className="ulib-head-icon"><Icon name="chat" size={25} /></span><div><span className="md-eyebrow">{fa ? 'فقط شما این صفحه را می‌بینید' : 'Only you can see this page'}</span><h1>{fa ? 'نظرهای من' : 'My reviews'}</h1><p className="muted">{fa ? 'امتیازها، نظرها و دیدگاه‌هایی که ثبت کرده‌اید، همراه با وضعیت بررسی هرکدام.' : 'The ratings, reviews and article comments you have written, with the state of each.'}</p></div></div>
    </header>
    {data.reviews.length ? <section className="ud-card recent-card" aria-labelledby="myrev-title">
      <header className="ud-card-head"><h2 id="myrev-title">{fa ? 'آخرین تغییرها' : 'Latest changes'}</h2><span className="recent-page-count">{fa ? `${data.total.toLocaleString('fa-IR')} نظر` : `${data.total} reviews`}</span></header>
      <ul className="myrev-list">{data.reviews.map((review) => {
        // An approved comment under an article that is not live is not public either.
        const state = review.kind === 'comment' && review.status === 'APPROVED' && !review.target ? { fa: 'تأییدشده؛ مقاله منتشر نیست', en: 'Approved; article not live', tone: 'is-wait' } : STATUS[review.status] || { fa: review.status, en: review.status, tone: 'is-wait' }
        const stars = Math.max(0, Math.min(5, review.rating))
        const dimensions = review.manage ? dimensionsFor(review.manage.itemType) : []
        const scores = dimensions.filter((dimension) => review.manage!.scores[dimension.key])
        const badge = review.manage && isExperienceKind(review.manage.verified) ? review.manage.verified : null
        return <li key={review.key}>
          <div className="myrev-top">
            {review.target
              ? <Link href={review.target.url} className="myrev-target">{review.target.image ? <img src={review.target.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true"><Icon name="chat" size={18} /></span>}<span><b>{review.target.title}</b><small>{review.label}</small></span></Link>
              : <span className="myrev-target is-gone"><span className="ulib-noart" aria-hidden="true"><Icon name="clock" size={18} /></span><span><b>{fa ? 'این مورد دیگر در دسترس نیست' : 'This item is no longer available'}</b><small>{review.label}</small></span></span>}
            <span className={`myrev-state ${state.tone}`}>{fa ? state.fa : state.en}</span>
          </div>
          <div className="myrev-meta">
            {review.kind !== 'comment' && <span className="myrev-stars" role="img" aria-label={fa ? `${stars.toLocaleString('fa-IR')} از ۵ ستاره` : `${stars} of 5 stars`}><span aria-hidden="true">{'★'.repeat(stars)}<i>{'★'.repeat(5 - stars)}</i></span></span>}
            <time dateTime={review.updatedAt.toISOString()}>{date.format(review.updatedAt)}</time>
          </div>
          {review.title && <h3>{review.title}</h3>}
          {review.body ? <p>{review.body}</p> : <p className="muted">{fa ? 'فقط امتیاز داده‌اید.' : 'Rating only.'}</p>}
          {(badge || scores.length > 0) && <ul className="rv-scores" aria-label={fa ? 'نشان و امتیازهای تخصصی' : 'Badge and dimension scores'}>
            {badge && <li><span className="rv-badge">✓ {fa ? EXPERIENCE_LABEL[badge].label : EXPERIENCE_LABEL[badge].labelEn}</span></li>}
            {scores.map((dimension) => <li key={dimension.key}>{fa ? dimension.label : dimension.labelEn} <b>{fa ? review.manage!.scores[dimension.key].toLocaleString('fa-IR') : review.manage!.scores[dimension.key]}</b></li>)}
          </ul>}
          {review.status === 'REJECTED' && <p className="myrev-note">{review.kind === 'comment' ? (fa ? 'این دیدگاه تأیید نشد و منتشر نشده است.' : 'This comment was not approved and is not published.') : review.manage
            ? (review.target ? (fa ? 'این متن منتشر نشده است. می‌توانید آن را همین‌جا ویرایش کنید.' : 'This text was not published. You can edit it here.') : (fa ? 'این متن منتشر نشده است.' : 'This text was not published.'))
            : (fa ? 'این متن منتشر نشده است. نظر محصول پس از ثبت قابل ویرایش نیست.' : 'This text was not published. A product review cannot be edited after it is written.')}</p>}
          {review.commentId && <MyCommentDelete id={review.commentId} fa={fa} />}
          {review.manage && <MyReviewManage item={review.manage.item} mine={{ rating: review.rating, body: review.body, status: review.status, verified: review.manage.verified, scores: review.manage.scores }} editable={!!review.target} title={review.target?.title || ''} path={review.target?.url || '/dashboard/reviews'} dimensions={dimensions.map(({ key, label, hint }) => ({ key, label, hint }))} fa={fa} />}
        </li>
      })}</ul>
    </section> : <section className="ud-card recent-empty"><span className="recent-empty-icon"><Icon name="chat" size={28} /></span><h2>{fa ? 'هنوز نظری ثبت نکرده‌اید' : 'You have not written a review yet'}</h2><p className="muted">{fa ? 'در صفحهٔ هر بازی، فیلم، آهنگ، نرم‌افزار یا محصول می‌توانید امتیاز بدهید و نظرتان را بنویسید، و زیر مقاله‌ها دیدگاه بگذارید.' : 'Rate and review from the page of any game, film, track, app or product, and comment under articles.'}</p></section>}
    {data.pages > 1 && <nav className="collections-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}>{data.page > 1 && <Link href={`/dashboard/reviews?page=${data.page - 1}`}>{fa ? 'قبلی' : 'Previous'}</Link>}<span>{fa ? `${data.page.toLocaleString('fa-IR')} از ${data.pages.toLocaleString('fa-IR')}` : `${data.page} of ${data.pages}`}</span>{data.page < data.pages && <Link href={`/dashboard/reviews?page=${data.page + 1}`}>{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
  </div>
}
