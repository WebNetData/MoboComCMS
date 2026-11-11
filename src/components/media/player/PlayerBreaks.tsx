'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { breakDue, crossedPoint, midrollPoints, type PlayerPacing } from '@/modules/ads/domain/ads'
import type { ServedAd } from '@/modules/ads/server/serving'

/** What the watch page allows in this player: ads (with their pacing and label) and the site's intro. */
export type PlayerBreaksConfig = {
  /** The film's own page: what campaigns target. */
  path: string
  ads: { pacing: PlayerPacing; label: string } | null
  intro: { src: string; skipAfter: number; frequency: 'SESSION' | 'ALWAYS' } | null
}
type Break = { kind: 'ad'; ad: ServedAd } | { kind: 'intro'; src: string; skipAfter: number }

const LAST_BREAK = 'vp:break:last', INTRO_SEEN = 'vp:intro:seen'
const fa = (value: number) => Math.max(0, Math.ceil(value)).toLocaleString('fa-IR')
const clock = (seconds: number) => { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60).toLocaleString('fa-IR')}:${String(s % 60).padStart(2, '0').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}` }
// The device remembers when this viewer last had a break and whether they saw the intro this session; private mode just shows more.
const remember = { get: (key: string, session = false) => { try { return (session ? sessionStorage : localStorage).getItem(key) } catch { return null } }, set: (key: string, value: string, session = false) => { try { (session ? sessionStorage : localStorage).setItem(key, value) } catch { /* private mode */ } } }
const view = (token: string) => { void fetch('/api/promo/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }), keepalive: true }).catch(() => undefined) }

async function serve(placements: string[], path: string): Promise<Record<string, ServedAd | null>> {
  const response = await fetch(`/api/promo/serve?ps=${placements.join(',')}&path=${encodeURIComponent(path)}&lang=fa`, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) return {}
  const data = await response.json() as { ads?: Record<string, { ad: ServedAd | null }> }
  return Object.fromEntries(placements.map(key => [key, data.ads?.[key]?.ad ?? null]))
}
const within = <T,>(work: Promise<T>, ms: number, fallback: T) => Promise.race([work, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))])

/**
 * Breaks in the film player (owner, 2026-11-11): an ad before the film and in long films, the site's intro, and a
 * small banner over the playing film. A layer over the frame, so the player itself is untouched: the film is held
 * while a break plays and resumed after it. Ads come from the ads module (targeting, pacing, counting); every failure
 * just lets the film play.
 */
export default function PlayerBreaks({ video, config }: { video: RefObject<HTMLVideoElement | null>; config: PlayerBreaksConfig }) {
  const [current, setCurrent] = useState<Break | null>(null)
  const [overlay, setOverlay] = useState<ServedAd | null>(null)
  const active = useRef(false), queue = useRef<Break[]>([]), started = useRef(false)
  const prefetch = useRef<Promise<Record<string, ServedAd | null>> | null>(null)
  const { ads, intro, path } = config
  const closeOverlay = useCallback(() => setOverlay(null), [])

  // Asked once the page loads, so the first play does not wait; shown (and counted) only if it is played.
  useEffect(() => { prefetch.current = ads ? serve(['player-preroll', 'player-overlay'], path).catch(() => ({})) : null }, [ads, path])

  const finish = useCallback(() => {
    const next = queue.current.shift()
    if (next) { setCurrent(next); return }
    active.current = false
    setCurrent(null)
    // Started by the viewer's own press: the browser lets it go on. If it refuses, the player's play button stays.
    void video.current?.play().catch(() => undefined)
  }, [video])

  useEffect(() => {
    const element = video.current
    if (!element) return
    let points: number[] = [], prev = 0, played = 0, overlayDone = false
    const done = new Set<number>()
    const hold = (list: Promise<Break[]>) => {
      active.current = true
      element.pause()
      void list.then(found => { queue.current = found; finish() }, () => { queue.current = []; finish() })
    }
    const onPlay = () => {
      if (active.current) { element.pause(); return }
      if (started.current) return
      started.current = true
      const introDue = !!intro && (intro.frequency === 'ALWAYS' || !remember.get(INTRO_SEEN, true))
      const adDue = !!ads && breakDue(Number(remember.get(LAST_BREAK)), Date.now(), ads.pacing)
      if (!introDue && !adDue) return
      hold((async () => {
        const list: Break[] = []
        const preroll = adDue && prefetch.current ? (await within(prefetch.current, 2500, {}))['player-preroll'] : null
        if (preroll) list.push({ kind: 'ad', ad: preroll })
        if (introDue && intro) list.push({ kind: 'intro', src: intro.src, skipAfter: intro.skipAfter })
        return list
      })())
    }
    const onMeta = () => { points = ads ? midrollPoints(element.duration, ads.pacing) : [] }
    const onSeeked = () => { prev = element.currentTime }
    const onTime = () => {
      const now = element.currentTime, step = now - prev
      if (!element.paused && !active.current && step > 0 && step < 5) played += step
      if (ads && !overlayDone && ads.pacing.overlayAfter && played >= ads.pacing.overlayAfter && !active.current) {
        overlayDone = true
        void prefetch.current?.then(found => { if (found['player-overlay']) setOverlay(found['player-overlay']) })
      }
      const point = ads && !active.current ? crossedPoint(points, prev, now, done) : null
      prev = now
      if (point === null || !ads) return
      done.add(point)
      if (!breakDue(Number(remember.get(LAST_BREAK)), Date.now(), ads.pacing)) return
      // The film's own fullscreen would hide the break: leave it first (the frame's fullscreen keeps the break in view).
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => undefined)
      hold(within(serve(['player-midroll'], path), 3000, {}).then(found => found['player-midroll'] ? [{ kind: 'ad' as const, ad: found['player-midroll']! }] : []).catch(() => []))
    }
    element.addEventListener('play', onPlay)
    element.addEventListener('loadedmetadata', onMeta)
    element.addEventListener('seeked', onSeeked)
    element.addEventListener('timeupdate', onTime)
    if (element.readyState >= 1) onMeta()
    return () => { element.removeEventListener('play', onPlay); element.removeEventListener('loadedmetadata', onMeta); element.removeEventListener('seeked', onSeeked); element.removeEventListener('timeupdate', onTime) }
  }, [video, ads, intro, path, finish])

  return <>
    {current && <BreakView key={current.kind === 'ad' ? current.ad.view : `intro:${current.src}`} item={current} label={ads?.label || 'تبلیغ'} onEnd={finish} />}
    {overlay && !current && <OverlayAd ad={overlay} label={ads?.label || 'تبلیغ'} onClose={closeOverlay} />}
  </>
}

/** One break over the frame: a video or a picture, its label and time, «رد کردن» once allowed, the advertiser's link. */
function BreakView({ item, label, onEnd }: { item: Break; label: string; onEnd: () => void }) {
  const media = useRef<HTMLVideoElement>(null), ended = useRef(false), counted = useRef(false)
  const [elapsed, setElapsed] = useState(0), [length, setLength] = useState(0), [muted, setMuted] = useState(false)
  const ad = item.kind === 'ad' ? item.ad : null
  const isVideo = item.kind === 'intro' || !!ad?.video
  const src = item.kind === 'intro' ? item.src : ad?.video || ''
  const skipAfter = item.kind === 'intro' ? item.skipAfter : ad!.skipAfter
  const total = isVideo ? length : ad!.seconds
  const end = useCallback(() => { if (!ended.current) { ended.current = true; onEnd() } }, [onEnd])

  useEffect(() => { if (item.kind === 'ad') remember.set(LAST_BREAK, String(Date.now())); else remember.set(INTRO_SEEN, '1', true) }, [item])
  useEffect(() => {
    const element = media.current
    if (!element) return
    // Sound needs the viewer's permission in some browsers: then it plays muted with a button for sound.
    element.play().catch(() => { element.muted = true; setMuted(true); element.play().catch(end) })
  }, [end])
  useEffect(() => {
    const begun = Date.now()
    let lastAt = 0, lastProgress = Date.now()
    const timer = setInterval(() => {
      const seconds = isVideo ? media.current?.currentTime ?? 0 : (Date.now() - begun) / 1000
      if (seconds !== lastAt) { lastAt = seconds; lastProgress = Date.now() }
      setElapsed(seconds)
      if (ad && !counted.current && seconds >= 1.5) { counted.current = true; view(ad.view) }
      if (!isVideo && seconds >= ad!.seconds) end()
      // A file that never starts or stops loading is not worth the viewer's wait.
      if (isVideo && Date.now() - lastProgress > (seconds ? 10_000 : 8_000)) end()
    }, 250)
    return () => clearInterval(timer)
  }, [ad, isVideo, end])

  const canSkip = skipAfter > 0 && elapsed >= skipAfter
  const kindLabel = item.kind === 'ad' ? label : 'اینترو'
  return <div className="vp-break" role="region" aria-label={kindLabel}>
    {isVideo
      ? <video ref={media} src={src} playsInline preload="auto" poster={ad?.image || undefined} onLoadedMetadata={e => setLength(e.currentTarget.duration || 0)} onEnded={end} onError={end} aria-label={kindLabel} />
      : <img src={ad!.image} alt={ad!.alt || ad!.title} />}
    <span className="vp-break-tag">{kindLabel}{total > 0 && <span dir="ltr">{clock(total - elapsed)}</span>}</span>
    <div className="vp-break-actions">
      {ad?.click && <a className="vp-break-link" href={ad.click} target="_blank" rel="noopener sponsored">{ad.cta || 'اطلاعات بیشتر'}</a>}
      {muted && <button type="button" className="vp-break-ghost" onClick={() => { if (media.current) { media.current.muted = false; setMuted(false) } }}>روشن کردن صدا</button>}
      {canSkip
        ? <button type="button" className="vp-break-skip" onClick={end}>{item.kind === 'ad' ? 'رد کردن تبلیغ' : 'رد کردن اینترو'}</button>
        : skipAfter > 0 && <span className="vp-break-wait">رد کردن تا {fa(skipAfter - elapsed)} ثانیه</span>}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{canSkip ? 'اکنون می‌توانید رد کنید' : skipAfter > 0 ? `${kindLabel}؛ پس از ${fa(skipAfter)} ثانیه می‌توانید رد کنید` : `${kindLabel} در حال پخش است`}</p>
  </div>
}

/** A small banner over the bottom of the playing film; the viewer closes it, or it goes after 20 seconds. */
function OverlayAd({ ad, label, onClose }: { ad: ServedAd; label: string; onClose: () => void }) {
  useEffect(() => {
    const count = setTimeout(() => view(ad.view), 1500), gone = setTimeout(onClose, 20_000)
    return () => { clearTimeout(count); clearTimeout(gone) }
  }, [ad, onClose])
  const body = ad.kind === 'IMAGE' ? <img src={ad.image} alt={ad.alt || ad.title} /> : <span className="vp-overlay-text"><b>{ad.title}</b>{ad.text && <span>{ad.text}</span>}</span>
  return <div className="vp-overlay-ad" role="complementary" aria-label={label}>
    {ad.click ? <a href={ad.click} target="_blank" rel="noopener sponsored">{body}</a> : body}
    <span className="vp-break-tag">{label}</span>
    <button type="button" className="vp-overlay-close" aria-label="بستن تبلیغ" onClick={onClose}>×</button>
  </div>
}
