'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import type { PlayerTrack } from './player-types'
import TrackActions from './TrackActions'
import { readPlaybackSession, sourceUrl, trackSource, writePlaybackSession } from './playback-session'
import { sized, srcSet } from '@/shared/media/image'

const PLAYER_ICONS: Record<string, React.ReactNode> = {
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" /></>,
  prev: <><path d="M18 6v12l-9-6 9-6Z" fill="currentColor" stroke="none" /><path d="M6 6v12" /></>,
  next: <><path d="M6 6v12l9-6-9-6Z" fill="currentColor" stroke="none" /><path d="M18 6v12" /></>,
  shuffle: <><path d="M3 7h3.5c2.5 0 4 1.5 5.5 5s3 5 5.5 5H21" /><path d="M3 17h3.5c1.4 0 2.5-.5 3.4-1.5M14.1 8.500C15 7.5 16.1 7 17.5 7H21" /><path d="m18 4 3 3-3 3M18 14l3 3-3 3" /></>,
  repeat: <><path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13" /><path d="M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" /></>,
  repeatOne: <><path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13" /><path d="M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" /><path d="M11.5 10.5 13 9.500v5" /></>,
  queue: <><path d="M4 6h11M4 11h11M4 16h7" /><path d="M16 14.500v5l4-2.5-4-2.500Z" fill="currentColor" stroke="none" /></>,
  download: <><path d="M12 4v11m-4.5-4.500L12 15l4.5-4.5" /><path d="M5 19h14" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  note: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
}
function PlayerIcon({ name, size = 20 }: { name: keyof typeof PLAYER_ICONS | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PLAYER_ICONS[name]}</svg>
}

type Lock = { reason: 'login' | 'vip' | 'buy'; track: PlayerTrack } | null

const lockReason = (status: number): 'login' | 'vip' | 'buy' | null => (status === 401 ? 'login' : status === 403 ? 'vip' : status === 402 ? 'buy' : null)
type PlayerState = {
  current: PlayerTrack | null
  queue: PlayerTrack[]
  playing: boolean
  play: (tracks: PlayerTrack[], index?: number) => void
  toggle: () => void
  next: () => void
  prev: () => void
}

const PlayerContext = createContext<PlayerState | null>(null)

export function usePlayer(): PlayerState | null {
  return useContext(PlayerContext)
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function readPref(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

/**
 * Site-wide music player. Audio is loaded from /api/media/track/:id, which checks
 * VIP access and redirects to the file; the raw file URL never reaches the page.
 */
export default function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const audio = useRef<HTMLAudioElement | null>(null)
  const restoredTrackId = useRef<number | null>(null)
  const reportedTrackId = useRef<number | null>(null)
  const historyWritable = useRef<boolean | null>(null)
  const progressSyncAt = useRef(0)
  const progressRequest = useRef<Promise<void>>(Promise.resolve())
  const loadRequestId = useRef(0)
  const resumeAt = useRef(0)
  const [queue, setQueue] = useState<PlayerTrack[]>([])
  const [sessionReady, setSessionReady] = useState(false)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [length, setLength] = useState(0)
  const [volume, setVolume] = useState(0.9)
  const [hq, setHq] = useState(false)
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off')
  const [shuffle, setShuffle] = useState(false)
  const [lock, setLock] = useState<Lock>(null)
  const [notice, setNotice] = useState('')
  const [showQueue, setShowQueue] = useState(false)
  const [loading, setLoading] = useState(false)
  const current = queue[index] || null

  useEffect(() => {
    setVolume(Number(readPref('mu.volume', '0.9')) || 0.9)
    setHq(readPref('mu.hq', '0') === '1')
    const saved = readPlaybackSession()
    if (saved) {
      restoredTrackId.current = saved.queue[saved.index].id
      resumeAt.current = saved.time
      setQueue(saved.queue)
      setIndex(saved.index)
      setTime(saved.time)
    }
    setSessionReady(true)
  }, [])
  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])
  useEffect(() => {
    if (sessionReady) writePlaybackSession(queue.length ? { queue, index, time } : null)
  }, [sessionReady, queue, index, time])

  const load = useCallback(async (track: PlayerTrack, wantHq: boolean) => {
    const el = audio.current
    if (!el) return
    const requestId = ++loadRequestId.current
    if (Number(el.dataset.trackId) === track.id && el.currentTime > 0) resumeAt.current = el.currentTime
    reportedTrackId.current = null
    progressSyncAt.current = 0
    setLock(null); setNotice(''); setLoading(true)
    let source = trackSource(track, wantHq)
    let useHq = source.quality === 'hq'
    if (track.access === 'MEMBERS' || useHq) {
      const res = await fetch(sourceUrl(source, true), { headers: { accept: 'application/json' } }).catch(() => null)
      if (requestId !== loadRequestId.current) return
      if (res?.status === 402) { setLoading(false); setPlaying(false); setLock({ reason: 'buy', track }); return }
      if (res && (res.status === 401 || res.status === 403)) {
        if (useHq && track.access !== 'MEMBERS') {
          useHq = false
          source = trackSource(track, false)
          setNotice(fa ? 'کیفیت ۳۲۰ مخصوص اعضای VIP است؛ با کیفیت عادی پخش می‌شود.' : 'HQ audio is for VIP members — playing standard quality.')
        } else {
          setLoading(false); setPlaying(false)
          setLock({ reason: res.status === 401 ? 'login' : 'vip', track })
          return
        }
      }
    }
    if (requestId !== loadRequestId.current) return
    if (resumeAt.current <= 0 && historyWritable.current !== false) {
      const progress = await fetch(`/api/music/history?trackId=${track.id}`, { signal: AbortSignal.timeout(1500) }).catch(() => null)
      if (progress?.status === 401) historyWritable.current = false
      else if (progress?.ok) {
        historyWritable.current = true
        const data = await progress.json().catch(() => null)
        if (!data?.completedAt && Number.isFinite(data?.positionSeconds) && Number.isFinite(data?.durationSeconds) && data.positionSeconds > 5 && data.durationSeconds - data.positionSeconds > 5) resumeAt.current = data.positionSeconds
      }
    }
    if (requestId !== loadRequestId.current) return
    el.dataset.trackId = String(track.id)
    el.src = sourceUrl(source)
    el.play().then(() => setPlaying(true)).catch(async () => {
      setPlaying(false)
      // A paid track (or one locked after the page loaded) fails to load: ask why and show the right gate.
      const res = await fetch(`/api/media/track/${track.id}?check=1`, { headers: { accept: 'application/json' } }).catch(() => null)
      const reason = res ? lockReason(res.status) : null
      if (reason) setLock({ reason, track })
    }).finally(() => setLoading(false))
  }, [fa])

  const syncProgress = useCallback((completed = false) => {
    const el = audio.current
    if (!el || historyWritable.current !== true) return
    const trackId = Number(el.dataset.trackId)
    const duration = el.duration
    if (!Number.isSafeInteger(trackId) || trackId <= 0 || !Number.isFinite(duration) || duration <= 0) return
    const position = completed ? duration : el.currentTime
    if (!Number.isFinite(position) || position < 0) return
    progressSyncAt.current = Date.now()
    const body = JSON.stringify({ trackId, position, duration, completed })
    progressRequest.current = progressRequest.current.catch(() => undefined).then(async () => {
      await fetch('/api/music/history', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body, keepalive: true })
    })
    void progressRequest.current.catch(() => undefined)
  }, [])

  /** The audio element only says "error"; ask the server why so the visitor (and the admin) see the real cause. */
  const explainFailure = useCallback(async (track: PlayerTrack) => {
    const generic = fa ? 'پخش این آهنگ ممکن نشد.' : 'This track could not be played.'
    setNotice(generic)
    try {
      // Not followed: a direct link to another host cannot be fetched from the page (CSP); it is the browser's own load that failed.
      const res = await fetch(`/api/media/track/${track.id}`, { headers: { Range: 'bytes=0-1', accept: '*/*' }, cache: 'no-store', redirect: 'manual' })
      if (res.type === 'opaqueredirect') { setNotice(fa ? 'مرورگر نتوانست فایل را از سرور فایل بگیرد (لینک مستقیم). احتمالاً آن سرور دسترسی را رد می‌کند یا فایل معتبر نیست.' : 'The browser could not load the file from its server (direct link).'); return }
      const reason = lockReason(res.status)
      if (reason) { setLock({ reason, track }); setNotice(''); return }
      if (res.status === 404 || res.status === 410) setNotice(fa ? 'فایل این آهنگ روی سرور پیدا نشد یا حذف شده است.' : 'The audio file was not found on its server.')
      else if (res.status >= 500) setNotice(fa ? 'سرور فایل صوتی در حال حاضر در دسترس نیست؛ کمی بعد دوباره تلاش کنید.' : 'The audio server is unreachable right now — try again shortly.')
      else if (res.ok) {
        const type = res.headers.get('content-type') || ''
        setNotice(/^audio\/|octet-stream/.test(type) ? generic : fa ? `فایل صوتی معتبر نیست (نوع: ${type.split(';')[0] || 'نامشخص'}). لینک آهنگ را در پنل بررسی کنید.` : `The file is not audio (${type || 'unknown type'}).`)
      }
      await res.body?.cancel().catch(() => undefined)
    } catch { /* keep the generic message */ }
  }, [fa])

  /** Downloads go through a freshly signed link (download protection) or the VIP/login gate. */
  const download = useCallback(async (track: PlayerTrack) => {
    const res = await fetch(`/api/media/track/${track.id}?dl=1&issue=1`, { headers: { accept: 'application/json' } }).catch(() => null)
    const reason = res ? lockReason(res.status) : null
    if (reason) { setLock({ reason, track }); return }
    const data = res?.ok ? await res.json().catch(() => null) : null
    if (typeof data?.href === 'string' && data.href.startsWith('/api/media/track/')) window.location.assign(data.href)
    else setNotice(fa ? 'دانلود انجام نشد؛ دوباره امتحان کنید.' : 'Download failed — please try again.')
  }, [fa])

  useEffect(() => {
    if (current?.id === restoredTrackId.current) return
    if (current) {
      if (audio.current && reportedTrackId.current === Number(audio.current.dataset.trackId) && !audio.current.ended) syncProgress()
      resumeAt.current = 0; setTime(0); load(current, hq)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, index, queue])

  const play = useCallback((tracks: PlayerTrack[], start = 0) => {
    if (!tracks.length) return
    restoredTrackId.current = null
    const same = current && tracks[start]?.id === current.id
    if (same && audio.current) {
      if (!audio.current.getAttribute('src')) void load(current, hq)
      else if (audio.current.paused) audio.current.play().then(() => setPlaying(true)).catch(() => undefined)
      else audio.current.pause()
      return
    }
    setQueue(tracks)
    setIndex(Math.max(0, Math.min(start, tracks.length - 1)))
  }, [current, hq, load])

  const toggle = useCallback(() => {
    const el = audio.current
    if (!el || !current) return
    restoredTrackId.current = null
    if (!el.getAttribute('src')) void load(current, hq)
    else if (el.paused) el.play().then(() => setPlaying(true)).catch(() => undefined)
    else el.pause()
  }, [current, hq, load])

  const next = useCallback(() => {
    if (!queue.length) return
    if (shuffle && queue.length > 1) {
      let pick = index
      while (pick === index) pick = Math.floor(Math.random() * queue.length)
      setIndex(pick)
      return
    }
    if (index + 1 < queue.length) setIndex(index + 1)
    else if (repeat === 'all') setIndex(0)
    else setPlaying(false)
  }, [queue.length, index, repeat, shuffle])

  const prev = useCallback(() => {
    const el = audio.current
    if (el && el.currentTime > 4) { el.currentTime = 0; return }
    if (index > 0) setIndex(index - 1)
    else if (el) el.currentTime = 0
  }, [index])

  // Lock-screen / headset controls.
  useEffect(() => {
    if (!current || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, artwork: current.cover ? [{ src: current.cover, sizes: '512x512' }] : [] })
      navigator.mediaSession.setActionHandler('play', toggle)
      navigator.mediaSession.setActionHandler('pause', toggle)
      navigator.mediaSession.setActionHandler('nexttrack', next)
      navigator.mediaSession.setActionHandler('previoustrack', prev)
    } catch { /* unsupported */ }
  }, [current, toggle, next, prev])

  const value = useMemo(() => ({ current, queue, playing, play, toggle, next, prev }), [current, queue, playing, play, toggle, next, prev])

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); if (!audio.current?.ended && reportedTrackId.current === Number(audio.current?.dataset.trackId)) syncProgress() }}
        onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); if (!e.currentTarget.paused && Date.now() - progressSyncAt.current >= 15_000) syncProgress() }}
        onDurationChange={(e) => setLength(e.currentTarget.duration)}
        onLoadedMetadata={(e) => { if (resumeAt.current > 0) { e.currentTarget.currentTime = Math.min(resumeAt.current, Math.max(0, e.currentTarget.duration - 1)); resumeAt.current = 0 } }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => {
          setLoading(false)
          const trackId = Number(audio.current?.dataset.trackId)
          if (Number.isSafeInteger(trackId) && trackId > 0 && reportedTrackId.current !== trackId) {
            reportedTrackId.current = trackId
            void fetch('/api/music/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trackId }), keepalive: true })
              .then((response) => {
                if (response.status === 401) historyWritable.current = false
                else if (response.ok) {
                  historyWritable.current = true
                  if (Number(audio.current?.dataset.trackId) === trackId) syncProgress()
                }
              })
              .catch(() => undefined)
          }
        }}
        onEnded={() => { syncProgress(true); if (repeat === 'one' && audio.current) { reportedTrackId.current = null; audio.current.currentTime = 0; audio.current.play().catch(() => undefined) } else next() }}
        onError={() => { setLoading(false); setPlaying(false); if (current) void explainFailure(current) }}
      />
      {current && (
        <div className="mu-player" role="region" aria-label={fa ? 'پخش‌کننده موزیک' : 'Music player'} data-playing={playing || undefined}>
          {current.cover && <div className="mu-player-glow" aria-hidden="true" style={{ backgroundImage: `url("${encodeURI(current.cover)}")` }} />}
          <div className="mu-player-progress" aria-hidden="true"><span style={{ width: `${length ? (time / length) * 100 : 0}%` }} /></div>
          <div className="mu-player-inner">
            <Link href={`/music/track/${current.slug}`} className="mu-player-meta">
              {current.cover ? <img src={sized(current.cover, 160)} srcSet={srcSet(current.cover, 160)} alt="" className={playing ? 'is-spinning' : ''} /> : <span className="mu-player-noart"><PlayerIcon name="note" /></span>}
              <span><b>{current.title}</b><small>{current.artist}</small></span>
            </Link>
            <div className="mu-player-center">
              <div className="mu-player-buttons">
                <button type="button" className={`mu-ic${shuffle ? ' is-on' : ''}`} onClick={() => setShuffle(!shuffle)} aria-label={fa ? 'پخش تصادفی' : 'Shuffle'} title={fa ? 'پخش تصادفی' : 'Shuffle'}><PlayerIcon name="shuffle" size={18} /></button>
                <button type="button" className="mu-ic" onClick={prev} aria-label={fa ? 'قبلی' : 'Previous'}><PlayerIcon name="prev" /></button>
                <button type="button" className="mu-play-main" onClick={toggle} aria-label={playing ? (fa ? 'توقف' : 'Pause') : (fa ? 'پخش' : 'Play')}>{loading ? <span className="mu-spinner" /> : <PlayerIcon name={playing ? 'pause' : 'play'} size={22} />}</button>
                <button type="button" className="mu-ic" onClick={next} aria-label={fa ? 'بعدی' : 'Next'}><PlayerIcon name="next" /></button>
                <button type="button" className={`mu-ic mu-mobile-queue-button${showQueue ? ' is-on' : ''}`} onClick={() => setShowQueue(!showQueue)} aria-label={fa ? 'صف پخش' : 'Queue'} aria-expanded={showQueue}><PlayerIcon name="queue" /></button>
                <button type="button" className={`mu-ic${repeat !== 'off' ? ' is-on' : ''}`} onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')} aria-label={fa ? 'تکرار' : 'Repeat'} title={fa ? 'تکرار' : 'Repeat'}><PlayerIcon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={18} /></button>
              </div>
              <div className="mu-player-seek" dir="ltr">
                <span>{fmt(time)}</span>
                <input type="range" min={0} max={length || current.duration || 0} step={1} value={Math.min(time, length || time)} onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value) }} aria-label={fa ? 'موقعیت پخش' : 'Seek'} />
                <span>{fmt(length || current.duration)}</span>
              </div>
            </div>
            <div className="mu-player-side">
              <TrackActions trackId={current.id} title={current.title} />
              {current.hasHq && <button type="button" className={`mu-hq${hq ? ' is-on' : ''}`} onClick={() => { const on = !hq; setHq(on); writePref('mu.hq', on ? '1' : '0'); load(current, on) }} title={fa ? 'کیفیت ۳۲۰' : '320 kbps'}>320</button>}
              <button type="button" className="mu-ic" onClick={() => void download(current)} aria-label={fa ? 'دانلود' : 'Download'} title={fa ? 'دانلود' : 'Download'}><PlayerIcon name="download" /></button>
              <button type="button" className={`mu-ic${showQueue ? ' is-on' : ''}`} onClick={() => setShowQueue(!showQueue)} aria-label={fa ? 'صف پخش' : 'Queue'} title={fa ? 'صف پخش' : 'Queue'} aria-expanded={showQueue}><PlayerIcon name="queue" /></button>
              <input className="mu-volume" dir="ltr" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); writePref('mu.volume', String(v)) }} aria-label={fa ? 'صدا' : 'Volume'} />
              <button type="button" className="mu-ic mu-close" onClick={() => { loadRequestId.current++; audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current?.removeAttribute('data-track-id'); setQueue([]); setTime(0); setLock(null) }} aria-label={fa ? 'بستن' : 'Close'}><PlayerIcon name="close" size={18} /></button>
            </div>
          </div>
          {notice && <div className="mu-player-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label={fa ? 'بستن پیام' : 'Dismiss'}><PlayerIcon name="close" size={16} /></button></div>}
          {lock && (
            <div className="mu-player-lock" role="alert">
              <span className="vip-crown">♛</span>
              <div><b>{lock.reason === 'login' ? (fa ? 'برای پخش وارد شوید' : 'Sign in to listen') : lock.reason === 'buy' ? (fa ? 'این آهنگ فروشی است' : 'This track is for sale') : (fa ? 'این آهنگ مخصوص اعضای VIP است' : 'This track is for VIP members')}</b><small>{lock.track.title} — {lock.track.artist}</small></div>
              <Link className="btn btn-primary btn-sm" href={lock.reason === 'login' ? `/login?next=${encodeURIComponent(`/music/track/${lock.track.slug}`)}` : lock.reason === 'buy' ? `/music/track/${lock.track.slug}#buy` : '/vip'}>{lock.reason === 'login' ? (fa ? 'ورود' : 'Sign in') : lock.reason === 'buy' ? (fa ? 'خرید' : 'Buy') : (fa ? 'عضویت VIP' : 'Go VIP')}</Link>
            </div>
          )}
          {showQueue && (
            <div className="mu-queue">
              <header>
                <div><b>{fa ? 'صف پخش' : 'Up next'}</b><small>{fa ? `${(index + 1).toLocaleString('fa-IR')} از ${queue.length.toLocaleString('fa-IR')} آهنگ` : `${index + 1} of ${queue.length}`}</small></div>
                <button type="button" className="mu-ic" onClick={() => setShowQueue(false)} aria-label={fa ? 'بستن صف پخش' : 'Close queue'}><PlayerIcon name="close" size={16} /></button>
              </header>
              <ol>{queue.map((track, i) => (
                <li key={`${track.id}-${i}`} className={i === index ? 'is-current' : i < index ? 'is-played' : ''}>
                  <button type="button" onClick={() => play(queue, i)} aria-current={i === index ? 'true' : undefined}>
                    <i className="mu-queue-no">{i === index && playing ? <span className="mu-eq" aria-hidden="true"><b /><b /><b /></span> : (i + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</i>
                    {track.cover ? <img src={track.cover} alt="" loading="lazy" /> : <span className="mu-player-noart"><PlayerIcon name="note" size={16} /></span>}<span><b>{track.title}</b><small>{track.artist}</small></span>{track.access === 'MEMBERS' && <em className="vip-dot">VIP</em>}
                  </button>
                </li>
              ))}</ol>
            </div>
          )}
        </div>
      )}
    </PlayerContext.Provider>
  )
}
