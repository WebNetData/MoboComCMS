'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import type { PlayerTrack } from './player-types'

type Lock = { reason: 'login' | 'vip'; track: PlayerTrack } | null
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
  const [queue, setQueue] = useState<PlayerTrack[]>([])
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
  }, [])
  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])

  const load = useCallback(async (track: PlayerTrack, wantHq: boolean) => {
    const el = audio.current
    if (!el) return
    setLock(null); setNotice(''); setLoading(true)
    let useHq = wantHq && track.hasHq
    if (track.access === 'MEMBERS' || useHq) {
      const res = await fetch(`/api/media/track/${track.id}?check=1${useHq ? '&q=hq' : ''}`, { headers: { accept: 'application/json' } }).catch(() => null)
      if (res && (res.status === 401 || res.status === 403)) {
        if (useHq && track.access !== 'MEMBERS') {
          useHq = false
          setNotice(fa ? 'کیفیت ۳۲۰ مخصوص اعضای VIP است؛ با کیفیت عادی پخش می‌شود.' : 'HQ audio is for VIP members — playing standard quality.')
        } else {
          setLoading(false); setPlaying(false)
          setLock({ reason: res.status === 401 ? 'login' : 'vip', track })
          return
        }
      }
    }
    el.src = `/api/media/track/${track.id}${useHq ? '?q=hq' : ''}`
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false)).finally(() => setLoading(false))
  }, [fa])

  /** Downloads go through a freshly signed link (download protection) or the VIP/login gate. */
  const download = useCallback(async (track: PlayerTrack) => {
    const res = await fetch(`/api/media/track/${track.id}?dl=1&issue=1`, { headers: { accept: 'application/json' } }).catch(() => null)
    if (res && (res.status === 401 || res.status === 403)) { setLock({ reason: res.status === 401 ? 'login' : 'vip', track }); return }
    const data = res?.ok ? await res.json().catch(() => null) : null
    if (typeof data?.href === 'string' && data.href.startsWith('/api/media/track/')) window.location.assign(data.href)
    else setNotice(fa ? 'دانلود انجام نشد؛ دوباره امتحان کنید.' : 'Download failed — please try again.')
  }, [fa])

  useEffect(() => {
    if (current) load(current, hq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, index, queue])

  const play = useCallback((tracks: PlayerTrack[], start = 0) => {
    if (!tracks.length) return
    const same = current && tracks[start]?.id === current.id
    if (same && audio.current) {
      if (audio.current.paused) audio.current.play().then(() => setPlaying(true)).catch(() => undefined)
      else audio.current.pause()
      return
    }
    setQueue(tracks)
    setIndex(Math.max(0, Math.min(start, tracks.length - 1)))
  }, [current])

  const toggle = useCallback(() => {
    const el = audio.current
    if (!el || !current) return
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => undefined)
    else el.pause()
  }, [current])

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
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setLength(e.currentTarget.duration)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onEnded={() => { if (repeat === 'one' && audio.current) { audio.current.currentTime = 0; audio.current.play().catch(() => undefined) } else next() }}
        onError={() => { setLoading(false); setPlaying(false); if (current) setNotice(fa ? 'پخش این آهنگ ممکن نشد.' : 'This track could not be played.') }}
      />
      {current && (
        <div className="mu-player" role="region" aria-label={fa ? 'پخش‌کننده موزیک' : 'Music player'}>
          <div className="mu-player-progress" aria-hidden="true"><span style={{ width: `${length ? (time / length) * 100 : 0}%` }} /></div>
          <div className="mu-player-inner">
            <Link href={`/music/track/${current.slug}`} className="mu-player-meta">
              {current.cover ? <img src={current.cover} alt="" className={playing ? 'is-spinning' : ''} /> : <span className="mu-player-noart">♪</span>}
              <span><b>{current.title}</b><small>{current.artist}</small></span>
            </Link>
            <div className="mu-player-center">
              <div className="mu-player-buttons">
                <button type="button" className={`mu-ic${shuffle ? ' is-on' : ''}`} onClick={() => setShuffle(!shuffle)} aria-label={fa ? 'پخش تصادفی' : 'Shuffle'} title={fa ? 'پخش تصادفی' : 'Shuffle'}>⤮</button>
                <button type="button" className="mu-ic" onClick={prev} aria-label={fa ? 'قبلی' : 'Previous'}>⏮</button>
                <button type="button" className="mu-play-main" onClick={toggle} aria-label={playing ? (fa ? 'توقف' : 'Pause') : (fa ? 'پخش' : 'Play')}>{loading ? <span className="mu-spinner" /> : playing ? '❚❚' : '▶'}</button>
                <button type="button" className="mu-ic" onClick={next} aria-label={fa ? 'بعدی' : 'Next'}>⏭</button>
                <button type="button" className={`mu-ic${repeat !== 'off' ? ' is-on' : ''}`} onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')} aria-label={fa ? 'تکرار' : 'Repeat'} title={fa ? 'تکرار' : 'Repeat'}>{repeat === 'one' ? '🔂' : '🔁'}</button>
              </div>
              <div className="mu-player-seek" dir="ltr">
                <span>{fmt(time)}</span>
                <input type="range" min={0} max={length || current.duration || 0} step={1} value={Math.min(time, length || time)} onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value) }} aria-label={fa ? 'موقعیت پخش' : 'Seek'} />
                <span>{fmt(length || current.duration)}</span>
              </div>
            </div>
            <div className="mu-player-side">
              {current.hasHq && <button type="button" className={`mu-hq${hq ? ' is-on' : ''}`} onClick={() => { const on = !hq; setHq(on); writePref('mu.hq', on ? '1' : '0'); load(current, on) }} title={fa ? 'کیفیت ۳۲۰' : '320 kbps'}>320</button>}
              <button type="button" className="mu-ic" onClick={() => void download(current)} aria-label={fa ? 'دانلود' : 'Download'} title={fa ? 'دانلود' : 'Download'}>⤓</button>
              <button type="button" className={`mu-ic${showQueue ? ' is-on' : ''}`} onClick={() => setShowQueue(!showQueue)} aria-label={fa ? 'صف پخش' : 'Queue'} title={fa ? 'صف پخش' : 'Queue'}>☰</button>
              <input className="mu-volume" dir="ltr" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); writePref('mu.volume', String(v)) }} aria-label={fa ? 'صدا' : 'Volume'} />
              <button type="button" className="mu-ic mu-close" onClick={() => { audio.current?.pause(); setQueue([]); setLock(null) }} aria-label={fa ? 'بستن' : 'Close'}>✕</button>
            </div>
          </div>
          {notice && <div className="mu-player-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="close">✕</button></div>}
          {lock && (
            <div className="mu-player-lock" role="alert">
              <span className="vip-crown">♛</span>
              <div><b>{lock.reason === 'login' ? (fa ? 'برای پخش وارد شوید' : 'Sign in to listen') : (fa ? 'این آهنگ مخصوص اعضای VIP است' : 'This track is for VIP members')}</b><small>{lock.track.title} — {lock.track.artist}</small></div>
              <Link className="btn btn-primary btn-sm" href={lock.reason === 'login' ? `/login?next=${encodeURIComponent(`/music/track/${lock.track.slug}`)}` : '/vip'}>{lock.reason === 'login' ? (fa ? 'ورود' : 'Sign in') : (fa ? 'عضویت VIP' : 'Go VIP')}</Link>
            </div>
          )}
          {showQueue && (
            <div className="mu-queue">
              <header><b>{fa ? 'صف پخش' : 'Up next'}</b><span className="muted">{queue.length}</span></header>
              <ol>{queue.map((track, i) => (
                <li key={`${track.id}-${i}`} className={i === index ? 'is-current' : ''}>
                  <button type="button" onClick={() => setIndex(i)}>{track.cover ? <img src={track.cover} alt="" /> : <span className="mu-player-noart">♪</span>}<span><b>{track.title}</b><small>{track.artist}</small></span>{track.access === 'MEMBERS' && <em className="vip-dot">VIP</em>}</button>
                </li>
              ))}</ol>
            </div>
          )}
        </div>
      )}
    </PlayerContext.Provider>
  )
}
