import { toEmbedUrl } from '@/modules/site/domain/builder'
import type { FormatData } from '@/modules/journal/domain/formats'

// What a post's format adds to its page: above the body, a video's player or an interview's guest; below it, a
// review's score, verdict, pros and cons, or a news item's source. Only the post's own family's facts arrive here.

const VIDEO_FILE = /\.(mp4|webm|ogv|m4v)(\?|#|$)/i

/** Above the article body. */
export function PostFormatLead({ facts, title, fa }: { facts: FormatData; title: string; fa: boolean }) {
  const video = facts.videoUrl
  const embed = video ? toEmbedUrl(video) : ''
  return <>
    {video && (embed !== video
      ? <figure className="jp-format-video"><iframe src={embed} title={fa ? `ویدیوی ${title}` : `${title} video`} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></figure>
      : VIDEO_FILE.test(video) || video.startsWith('/')
        ? <figure className="jp-format-video"><video src={video} controls preload="metadata" aria-label={fa ? `ویدیوی ${title}` : `${title} video`} /></figure>
        : <p className="jp-format-line"><a href={video} target="_blank" rel="noopener noreferrer nofollow">{fa ? 'تماشای ویدیو' : 'Watch the video'} ↗</a></p>)}
    {facts.guestName && <aside className="jp-format-guest" aria-label={fa ? 'مهمان این گفت‌وگو' : 'Guest'}>
      <span className="jp-format-kicker">{fa ? 'گفت‌وگو با' : 'In conversation with'}</span>
      <strong>{facts.guestName}</strong>
      {facts.guestRole && <span>{facts.guestRole}</span>}
    </aside>}
  </>
}

/** Below the article body. */
export function PostFormatClose({ facts, fa }: { facts: FormatData; fa: boolean }) {
  const hasReview = facts.score !== undefined || facts.verdict || facts.pros?.length || facts.cons?.length
  const score = facts.score?.toLocaleString(fa ? 'fa-IR' : 'en-US', { maximumFractionDigits: 1 })
  return <>
    {hasReview && <section className="jp-format-review" aria-labelledby="jp-review-title">
      <header>
        <h2 id="jp-review-title">{fa ? 'جمع‌بندی نقد' : 'Review summary'}</h2>
        {score && <p className="jp-review-score" aria-label={fa ? `امتیاز ${score} از ۱۰` : `Score ${score} out of 10`}><b>{score}</b><span aria-hidden="true">/{fa ? '۱۰' : '10'}</span></p>}
      </header>
      {facts.verdict && <p className="jp-review-verdict">{facts.verdict}</p>}
      {(facts.pros?.length || facts.cons?.length) ? <div className="jp-review-lists">
        {facts.pros?.length ? <div><h3>{fa ? 'نقاط قوت' : 'Pros'}</h3><ul className="is-pros">{facts.pros.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {facts.cons?.length ? <div><h3>{fa ? 'نقاط ضعف' : 'Cons'}</h3><ul className="is-cons">{facts.cons.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      </div> : null}
    </section>}
    {facts.sourceName && <p className="jp-format-line jp-format-source">{fa ? 'منبع: ' : 'Source: '}{facts.sourceUrl ? <a href={facts.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{facts.sourceName}</a> : facts.sourceName}</p>}
  </>
}
