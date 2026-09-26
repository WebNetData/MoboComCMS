'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'

type Tab = 'description' | 'specifications' | 'reviews' | 'questions' | 'faq' | 'related-posts' | 'related-products'
type CriteriaKey = 'quality' | 'value' | 'usability'
const tabs: { id: Tab; fa: string; en: string }[] = [
  { id: 'description', fa: 'توضیحات', en: 'Description' },
  { id: 'specifications', fa: 'مشخصات فنی', en: 'Specifications' },
  { id: 'reviews', fa: 'دیدگاه کاربران', en: 'Reviews' },
  { id: 'questions', fa: 'پرسش و پاسخ', en: 'Questions' },
  { id: 'faq', fa: 'سوالات متداول', en: 'FAQ' },
  { id: 'related-posts', fa: 'مطالب مرتبط', en: 'Related articles' },
  { id: 'related-products', fa: 'محصولات مرتبط', en: 'Related products' },
]
const criteriaKeys: CriteriaKey[] = ['quality', 'value', 'usability']
const criteriaLabels: Record<CriteriaKey, { fa: string; en: string }> = {
  quality: { fa: 'کیفیت', en: 'Quality' },
  value: { fa: 'ارزش خرید', en: 'Value' },
  usability: { fa: 'تجربهٔ استفاده', en: 'Experience' },
}
const avatarPalette = ['#2f7cff', '#ff7a45', '#12b886', '#f0a500', '#8b5cf6', '#ef476f', '#118ab2', '#06a77d']

function avatarTone(name: string) {
  let hash = 0
  for (const char of name || '?') hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return avatarPalette[hash % avatarPalette.length]
}

function avatarInitial(name: string) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || '?'
  const second = parts[1]?.[0] || ''
  return (first + second).toUpperCase()
}

function fmtDate(iso: string, fa: boolean) {
  try {
    return new Date(iso).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function Stars({ value, size = 'md', label }: { value: number; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const rounded = Math.round(value)
  return (
    <span className={`rv-stars rv-stars-${size}`} role="img" aria-label={label || `${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? 'is-on' : 'is-off'}>★</span>
      ))}
    </span>
  )
}

function StarInput({ value, onChange, size = 'lg', label }: { value: number; onChange: (n: number) => void; size?: 'sm' | 'lg'; label: string }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <span className={`star-input star-input-${size}`} role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}`}
          className={n <= shown ? 'is-on' : ''}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  )
}

export default function ProductTabs({ slug, descriptionFa, descriptionEn, rating, reviewCount, questionCount = 0 }: { slug: string; descriptionFa: string; descriptionEn: string; rating: number; reviewCount: number; questionCount?: number }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const { status } = useSession()
  const [tab, setTab] = useState<Tab>('description')
  const [data, setData] = useState<Record<string, any>>({ description: { htmlFa: descriptionFa, htmlEn: descriptionEn } })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(1)
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [guestName, setGuestName] = useState('')
  const [criteria, setCriteria] = useState<Record<CriteriaKey, number>>({ quality: 5, value: 5, usability: 5 })
  const [overall, setOverall] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const keyFor = (selected: Tab, selectedPage: number) => selected === 'reviews' || selected === 'questions' ? `${selected}:${selectedPage}` : selected
  const cacheKey = keyFor(tab, page)
  const content = data[cacheKey]

  const fetchTab = async (selected: Tab, selectedPage: number) => {
    const key = keyFor(selected, selectedPage)
    if (data[key]) return
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(slug)}/tabs?tab=${selected}&page=${selectedPage}`, { cache: 'no-store' })
      if (!response.ok) throw Error('load failed')
      const json = await response.json()
      setData(old => ({ ...old, [key]: json }))
    } catch {
      setLoadError(fa ? 'این بخش بارگذاری نشد. دوباره تلاش کنید.' : 'This section could not load. Please retry.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void fetchTab(tab, page) }, [tab, page, reloadToken])

  useEffect(() => {
    const applyHash = () => {
      const id = window.location.hash.replace(/^#/, '')
      const found = tabs.find(item => `store-tab-${item.id}` === id)
      if (!found || found.id === tab) return
      setTab(found.id)
      setPage(1)
      setBody('')
      setMessage('')
      setLoadError('')
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [tab])

  function selectTab(next: Tab) {
    setTab(next)
    setPage(1)
    setBody('')
    setMessage('')
    setLoadError('')
  }

  function pickOverall(next: number) {
    setOverall(next)
    setCriteria({ quality: next, value: next, usability: next })
  }

  async function submit(kind: 'review' | 'question') {
    setSubmitting(true)
    setMessage('')
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(slug)}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, body, title, criteria, guestName, rating: overall }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) { setMessage(result?.error || (fa ? 'ثبت انجام نشد.' : 'Submission failed.')); return }
      setBody(''); setTitle('')
      setData(old => {
        const next = { ...old }
        for (const key of Object.keys(next)) if (key.startsWith('reviews:') || key.startsWith('questions:')) delete next[key]
        return next
      })
      setReloadToken(token => token + 1)
      setMessage(fa ? 'ثبت شد و پس از بررسی نمایش داده می‌شود.' : 'Submitted. It will appear after moderation.')
    } catch { setMessage(fa ? 'ارتباط برقرار نشد. دوباره تلاش کنید.' : 'Connection failed. Please retry.') }
    finally { setSubmitting(false) }
  }

  const counts: Partial<Record<Tab, number>> = { reviews: reviewCount, questions: questionCount }
  const overallScore = Number.isFinite(criteria.quality) ? Math.round(((criteria.quality + criteria.value + criteria.usability) / 3) * 10) / 10 : overall
  const breakdown = content?.breakdown || {}
  const totalReviews = content?.total || 0
  const criteriaAvg: Partial<Record<CriteriaKey, number>> = content?.criteria || {}

  return <section className="store-tabs-section" aria-label={fa ? 'جزئیات محصول' : 'Product details'}>
    <div className="store-tab-list" role="tablist" aria-label={fa ? 'بخش‌های محصول' : 'Product sections'}>
      {tabs.map(item => <button type="button" role="tab" id={`store-tab-${item.id}`} aria-controls={`store-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} className={`store-tab ${tab === item.id ? 'active' : ''}`} key={item.id} onClick={() => selectTab(item.id)}>{fa ? item.fa : item.en}{counts[item.id] ? <span className="store-tab-count num">{counts[item.id]}</span> : null}</button>)}
    </div>
    <div className="store-tab-panel" role="tabpanel" id={`store-panel-${tab}`} aria-labelledby={`store-tab-${tab}`} aria-busy={loading}>
      {loading && !content && <div className="store-loading" role="status"><span aria-hidden="true" />{fa ? 'در حال بارگذاری…' : 'Loading…'}</div>}
      {loadError && <p className="store-form-message" role="alert">{loadError}</p>}
      {!loading && !content && tab !== 'description' && <button className="btn btn-ghost" type="button" onClick={() => void fetchTab(tab, page)}>{fa ? 'تلاش دوباره' : 'Retry'}</button>}

      {tab === 'description' && content && <div className="store-description prose" dangerouslySetInnerHTML={{ __html: fa ? content.htmlFa : content.htmlEn }} />}

      {tab === 'specifications' && content && (content.fields?.length ? <dl className="store-spec-list">{content.fields.map((field: any) => <div key={field.key}><dt>{fa ? field.label : field.labelEn || field.label}</dt><dd>{field.value}</dd></div>)}</dl> : <p className="muted">{fa ? 'مشخصاتی برای این محصول ثبت نشده است.' : 'No specifications are available yet.'}</p>)}

      {tab === 'faq' && content && <div className="store-faq-list">{content.items?.length ? content.items.map((item: any, index: number) => <details key={index}><summary>{fa ? item.question : item.questionEn || item.question}</summary><p>{fa ? item.answer : item.answerEn || item.answer}</p></details>) : <p className="muted">{fa ? 'سوال متداولی ثبت نشده است.' : 'No FAQ entries yet.'}</p>}</div>}

      {tab === 'reviews' && <>
        <div className="rv-wrap">
          <aside className="rv-summary" aria-label={fa ? 'خلاصهٔ امتیازها' : 'Rating summary'}>
            <div className="rv-score">
              <strong className="rv-score-value num">{(content?.average || rating || 0).toFixed(1)}</strong>
              <div className="rv-score-side">
                <Stars value={content?.average || rating || 0} size="lg" />
                <span className="rv-score-unit">{fa ? 'از ۵' : 'out of 5'}</span>
                <small className="rv-score-total num">{(totalReviews || reviewCount)} {fa ? 'دیدگاه ثبت‌شده' : 'reviews'}</small>
              </div>
            </div>
            <div className="rv-bars">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = Number(breakdown[n] || 0)
                const pct = totalReviews ? Math.round((count / totalReviews) * 100) : 0
                return <div className="rv-bar-row" key={n}>
                  <span className="num">{n}</span>
                  <span className="rv-bar"><i style={{ width: `${pct}%` }} /></span>
                  <span className="rv-bar-pct num">{pct}%</span>
                </div>
              })}
            </div>
            {criteriaKeys.some(key => criteriaAvg[key]) && <div className="rv-criteria-summary">
              {criteriaKeys.map(key => criteriaAvg[key] ? <div className="rv-criteria-row" key={key}>
                <span>{fa ? criteriaLabels[key].fa : criteriaLabels[key].en}</span>
                <span className="rv-bar"><i style={{ width: `${(Number(criteriaAvg[key]) / 5) * 100}%` }} /></span>
                <strong className="num">{Number(criteriaAvg[key]).toFixed(1)}</strong>
              </div> : null)}
            </div>}
            <a className="rv-jump" href="#rv-form">{fa ? 'افزودن دیدگاه' : 'Write a review'}</a>
          </aside>

          <div className="rv-main">
            <header className="rv-main-head">
              <h3>{fa ? 'دیدگاه کاربران' : 'Customer reviews'}</h3>
              <span className="rv-main-count num">{totalReviews || reviewCount}</span>
            </header>

            {loading && !content && null}
            {content && !content.signedIn && <div className="rv-gate" id="rv-form">
              <div className="rv-gate-icon" aria-hidden="true">★</div>
              <div>
                <strong>{fa ? 'دیدگاه را فقط خریداران ثبت می‌کنند' : 'Only buyers can write a review'}</strong>
                <p className="muted">{fa ? 'برای ثبت دیدگاه باید این محصول را خریداری کرده باشید. ابتدا وارد حساب خود شوید.' : 'You need to buy this product first. Sign in to continue.'}</p>
              </div>
              <Link href={`/login?next=/products/${slug}`} className="btn btn-primary">{fa ? 'ورود به حساب' : 'Sign in'}</Link>
            </div>}
            {content && content.signedIn && content.hasReviewed && <div className="rv-gate is-done" id="rv-form">
              <div className="rv-gate-icon" aria-hidden="true">✓</div>
              <div>
                <strong>{fa ? 'شما برای این محصول دیدگاه ثبت کرده‌اید' : 'You already reviewed this product'}</strong>
                <p className="muted">{fa ? 'با تشکر از نظر شما. دیدگاه پس از بررسی نمایش داده می‌شود.' : 'Thanks. Your review shows up after moderation.'}</p>
              </div>
            </div>}
            {content && content.signedIn && !content.hasReviewed && !content.canReview && <div className="rv-gate" id="rv-form">
              <div className="rv-gate-icon" aria-hidden="true">★</div>
              <div>
                <strong>{fa ? 'برای ثبت دیدگاه ابتدا خرید کنید' : 'Buy to write a review'}</strong>
                <p className="muted">{fa ? 'دیدگاه‌ها مخصوص خریداران تأییدشدهٔ همین محصول است.' : 'Reviews are reserved for verified buyers of this product.'}</p>
              </div>
              <Link href={`/products/${slug}`} className="btn btn-primary">{fa ? 'خرید محصول' : 'Buy product'}</Link>
            </div>}
            {content && content.canReview && <div className="rv-form" id="rv-form">
              <header className="rv-form-head">
                <h4>{fa ? 'دیدگاه خود را بنویسید' : 'Write your review'}</h4>
                <p className="muted">{fa ? 'تجربهٔ واقعی خرید و استفاده را با دیگران به اشتراک بگذارید.' : 'Share your real purchase experience.'}</p>
              </header>
              <div className="rv-form-score">
                <span className="rv-form-label">{fa ? 'امتیاز شما' : 'Your rating'}</span>
                <StarInput size="lg" value={overall} onChange={pickOverall} label={fa ? 'امتیاز کلی' : 'Overall rating'} />
                <strong className="num">{overallScore.toFixed(1)} / 5</strong>
              </div>
              <div className="rv-form-criteria">
                {criteriaKeys.map(key => <div className="rv-criteria-input" key={key}>
                  <span>{fa ? criteriaLabels[key].fa : criteriaLabels[key].en}</span>
                  <StarInput size="sm" value={criteria[key]} onChange={(n) => setCriteria(old => ({ ...old, [key]: n }))} label={fa ? criteriaLabels[key].fa : criteriaLabels[key].en} />
                </div>)}
              </div>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} placeholder={fa ? 'عنوان دیدگاه (اختیاری)' : 'Review title (optional)'} />
              <textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={3000} placeholder={fa ? 'دربارهٔ کیفیت، سرعت تحویل و پشتیبانی بنویسید…' : 'Tell others about quality, delivery and support…'} />
              <footer className="rv-form-foot">
                <button type="button" className="btn btn-primary" disabled={submitting || body.trim().length < 10} onClick={() => void submit('review')}>{submitting ? (fa ? 'در حال ثبت…' : 'Submitting…') : (fa ? 'ثبت دیدگاه' : 'Submit review')}</button>
                <small className="muted">{fa ? 'دیدگاه شما پس از تأیید نمایش داده می‌شود.' : 'Your review appears after approval.'}</small>
              </footer>
            </div>}

            {content?.items?.length ? <div className="rv-list">
              {content.items.map((item: any) => {
                const name = item.user?.name || (fa ? 'مشتری' : 'Customer')
                const written = fmtDate(item.createdAt, fa)
                return <article className="rv-card" key={item.id}>
                  <header className="rv-card-head">
                    <span className="rv-avatar" style={{ background: avatarTone(name) }} aria-hidden="true">{avatarInitial(name)}</span>
                    <div className="rv-who">
                      <strong>{name}</strong>
                      <div className="rv-meta">
                        <span className="rv-verified"><i aria-hidden="true">✓</i>{fa ? 'خریدار تأییدشده' : 'Verified buyer'}</span>
                        {written && <time dateTime={item.createdAt}>{written}</time>}
                      </div>
                    </div>
                    <span className="rv-card-score"><strong className="num">{item.rating}</strong><Stars value={item.rating} size="sm" /></span>
                  </header>
                  {item.title && <h4 className="rv-card-title">{item.title}</h4>}
                  <p className="rv-card-body">{item.body}</p>
                  {item.criteria && criteriaKeys.some(key => Number(item.criteria[key])) && <div className="rv-card-criteria">
                    {criteriaKeys.map(key => Number(item.criteria[key]) ? <span key={key}><b>{fa ? criteriaLabels[key].fa : criteriaLabels[key].en}</b><Stars value={Number(item.criteria[key])} size="sm" /></span> : null)}
                  </div>}
                </article>
              })}
            </div> : !loading && content && <p className="muted rv-empty">{fa ? 'هنوز دیدگاهی ثبت نشده است. اولین نفری باشید که تجربه‌اش را می‌نویسد.' : 'No reviews yet. Be the first to share your experience.'}</p>}
          </div>
        </div>
      </>}

      {tab === 'questions' && <>
        <div className="qa-wrap">
          <div className="qa-ask">
            <header className="qa-ask-head">
              <h3>{fa ? 'پرسش و پاسخ' : 'Questions & answers'}</h3>
              <span className="rv-main-count num">{content?.total || questionCount}</span>
            </header>
            <p className="muted qa-ask-hint">{fa ? 'پرسش برای همه آزاد است؛ مهمانان هم می‌توانند بپرسند و پس از بررسی نمایش داده می‌شود.' : 'Everyone can ask, guests included. Questions appear after moderation.'}</p>
            <div className="qa-form">
              {status !== 'authenticated' && <label className="qa-field">{fa ? 'نام شما' : 'Your name'}<input className="input" value={guestName} onChange={(event) => setGuestName(event.target.value)} minLength={2} maxLength={80} placeholder={fa ? 'مثال: علی' : 'e.g. Alex'} /></label>}
              <label className="qa-field">{fa ? 'پرسش شما' : 'Your question'}<textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={3000} placeholder={fa ? 'دربارهٔ این محصول چه می‌خواهید بدانید؟' : 'What would you like to know about this product?'} /></label>
              <div className="qa-form-foot">
                <button type="button" className="btn btn-primary" disabled={submitting || body.trim().length < 10 || (status !== 'authenticated' && guestName.trim().length < 2)} onClick={() => void submit('question')}>{submitting ? (fa ? 'در حال ثبت…' : 'Submitting…') : (fa ? 'ثبت پرسش' : 'Ask a question')}</button>
                <small className="muted">{fa ? 'پاسخ فروشگاه معمولاً کمتر از ۲۴ ساعت ارسال می‌شود.' : 'Store answers usually arrive within 24 hours.'}</small>
              </div>
            </div>
          </div>

          <div className="qa-main">
            {content?.items?.length ? <div className="qa-list">
              {content.items.map((item: any) => {
                const name = item.user?.name || (fa ? 'مهمان' : 'Guest')
                const written = fmtDate(item.createdAt, fa)
                return <article className="qa-card" key={item.id}>
                  <div className="qa-q">
                    <span className="qa-tag">{fa ? 'پرسش' : 'Q'}</span>
                    <div className="qa-q-body">
                      <p>{item.body}</p>
                      <div className="qa-meta"><strong>{name}</strong>{written && <time dateTime={item.createdAt}>{written}</time>}</div>
                    </div>
                  </div>
                  {item.answer ? <div className="qa-a">
                    <span className="qa-tag qa-tag-a">{fa ? 'پاسخ فروشگاه' : 'Store answer'}</span>
                    <div className="qa-q-body"><p>{item.answer}</p></div>
                  </div> : <div className="qa-pending">{fa ? 'در انتظار پاسخ فروشگاه' : 'Waiting for store reply'}</div>}
                </article>
              })}
            </div> : !loading && content && <p className="muted rv-empty">{fa ? 'هنوز پرسشی ثبت نشده است. اولین پرسش را شما بپرسید.' : 'No questions yet. Ask the first one.'}</p>}
          </div>
        </div>
      </>}

      {(tab === 'related-posts' || tab === 'related-products') && content && <div className="store-related-grid">{content.items?.length ? content.items.map((item: any) => <Link className="store-related-card" href={tab === 'related-posts' ? `/blog/${item.slug}` : `/products/${item.slug}`} key={item.id}>{(item.image || item.cover) && <img src={item.image || item.cover} alt="" loading="lazy" />}<strong>{fa ? item.title || item.name : item.titleEn || item.nameEn || item.title || item.name}</strong>{item.excerpt && <small>{fa ? item.excerpt : item.excerptEn || item.excerpt}</small>}</Link>) : <p className="muted">{fa ? 'موردی یافت نشد.' : 'Nothing to show yet.'}</p>}</div>}

      {(tab === 'reviews' || tab === 'questions') && content?.pages > 1 && <div className="store-pagination"><button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>{fa ? 'قبلی' : 'Previous'}</button><span className="num">{page} / {content.pages}</span><button className="btn btn-ghost" disabled={page >= content.pages} onClick={() => setPage(n => n + 1)}>{fa ? 'بعدی' : 'Next'}</button></div>}
      {message && <p className="store-form-message" role="status">{message}</p>}
    </div>
  </section>
}
