'use client'

import { useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'

type Props = {
  src: string
  playback: 'hls' | 'video' | 'maybe' | 'embed'
  poster?: string
  title: string
  resumeKey: string
  progressLinkId?: number
  serverResume?: number | null
  nextEpisode?: { href: string; label: string } | null
  downloadHref?: string
  /** Subtitle files of this film or episode, served by the site as WebVTT. */
  subtitles?: { id: number; language: string; label: string; src: string }[]
  /** The signed-in member's choice kept with the account ('' = never chose); null for a visitor. */
  subtitlePreference?: string | null
}

const SUBTITLE_KEY = 'vp:subtitle'
/** The subtitle a viewer picked last on this device ('off' when they turned subtitles off); Persian when they never chose. */
const preferredSubtitle = () => { try { return localStorage.getItem(SUBTITLE_KEY) || 'fa' } catch { return 'fa' } }

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]
const fa = (value: number) => value.toLocaleString('fa-IR')
const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`
}
const read = (key: string) => { try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 } }
const write = (key: string, value: number | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, String(Math.floor(value))) } catch { /* private mode */ } }

/**
 * Online player for film / episode links: MP4 / WebM natively, HLS (.m3u8)
 * through hls.js with a quality menu, MKV when the browser has the codecs.
 * Remembers where you stopped; explains and offers the download when the
 * browser cannot decode the file (HEVC / AC3 / DTS in most MKV releases).
 */
export default function VideoPlayer({ src, playback, poster, title, resumeKey, progressLinkId, serverResume, nextEpisode, downloadHref, subtitles = [], subtitlePreference = null }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls | null>(null)
  const [error, setError] = useState<'' | 'codec' | 'network'>('')
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([])
  const [level, setLevel] = useState(-1)
  const [speed, setSpeed] = useState(1)
  const [resume, setResume] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [pip, setPip] = useState(false)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  useEffect(() => { setPip('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) }, [])
  // Subtitles: the one in the viewer's language is switched on, and what they switch to is remembered.
  useEffect(() => {
    const element = video.current
    if (!element || !subtitles.length) return
    const tracks = element.textTracks
    // The account's choice comes first; a member who never chose, and a visitor, get what this device remembers.
    const wanted = subtitlePreference || preferredSubtitle()
    const apply = () => { for (let i = 0; i < tracks.length; i++) tracks[i].mode = wanted !== 'off' && tracks[i].language === wanted ? 'showing' : 'disabled' }
    apply()
    let settled = false
    const timer = window.setTimeout(() => { settled = true }, 1500)
    const remember = () => {
      if (!settled) return
      let showing = 'off'
      for (let i = 0; i < tracks.length; i++) if (tracks[i].mode === 'showing') showing = tracks[i].language || 'off'
      try { localStorage.setItem(SUBTITLE_KEY, showing) } catch { /* private mode */ }
      // A member's choice goes with the account, so the next device starts the same way.
      if (subtitlePreference !== null) void fetch('/api/media/playback-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subtitle: showing }), keepalive: true }).catch(() => undefined)
    }
    tracks.addEventListener('change', remember)
    return () => { window.clearTimeout(timer); tracks.removeEventListener('change', remember) }
  }, [subtitles, subtitlePreference])
  useEffect(() => {
    if (nextCountdown === null || !nextEpisode) return
    if (nextCountdown === 0) { window.location.assign(nextEpisode.href); return }
    const timer = window.setTimeout(() => setNextCountdown((value) => value === null ? null : value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [nextCountdown, nextEpisode])

  useEffect(() => {
    const element = video.current
    if (!element || playback === 'embed') return
    setError(''); setLevels([])
    let cancelled = false
    const saved = serverResume == null ? read(resumeKey) : serverResume
    if (saved > 30) setResume(saved)

    const native = playback !== 'hls' || element.canPlayType('application/vnd.apple.mpegurl')
    if (native) element.src = src
    else {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return
        if (!HlsCtor.isSupported()) { setError('codec'); return }
        const instance = new HlsCtor({ enableWorker: true, capLevelToPlayerSize: true })
        hls.current = instance
        instance.on(HlsCtor.Events.MANIFEST_PARSED, (_event, data) => {
          setLevels(data.levels.map((item, index) => ({ index, height: item.height })).filter((item) => item.height > 0).sort((a, b) => b.height - a.height))
        })
        instance.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) { instance.recoverMediaError(); return }
          setError(data.type === HlsCtor.ErrorTypes.NETWORK_ERROR ? 'network' : 'codec')
        })
        instance.loadSource(src)
        instance.attachMedia(element)
      }).catch(() => setError('network'))
    }
    return () => { cancelled = true; hls.current?.destroy(); hls.current = null; element.removeAttribute('src'); element.load() }
  }, [src, playback, resumeKey, serverResume, attempt])

  // Remember the position every few seconds; forget it near the end.
  useEffect(() => {
    const element = video.current
    if (!element) return
    let last = 0
    let lastRemoteAt = 0
    const saveRemote = () => {
      if (!progressLinkId || !Number.isFinite(element.duration) || element.duration <= 0 || element.currentTime <= 0) return
      lastRemoteAt = Date.now()
      void fetch('/api/cinema/progress', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', keepalive: true,
        body: JSON.stringify({ linkId: progressLinkId, positionSeconds: element.currentTime, durationSeconds: element.duration }),
      }).catch(() => undefined)
    }
    const onTime = () => {
      if (Math.abs(element.currentTime - last) < 5) return
      last = element.currentTime
      write(resumeKey, element.duration && element.currentTime > element.duration - 60 ? null : element.currentTime)
      if (Date.now() - lastRemoteAt >= 15000) saveRemote()
    }
    const onEnd = () => { write(resumeKey, null); saveRemote(); if (nextEpisode) setNextCountdown(8) }
    const onPlay = () => setNextCountdown(null)
    const onError = () => {
      const code = element.error?.code
      // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED, 3 = MEDIA_ERR_DECODE, 2 = MEDIA_ERR_NETWORK
      setError(code === 2 ? 'network' : 'codec')
    }
    const onMeta = () => { if (element.videoWidth === 0 && element.duration > 0 && playback !== 'hls') setError('codec') }
    element.addEventListener('timeupdate', onTime)
    element.addEventListener('pause', saveRemote)
    element.addEventListener('ended', onEnd)
    element.addEventListener('play', onPlay)
    window.addEventListener('pagehide', saveRemote)
    element.addEventListener('error', onError)
    element.addEventListener('loadedmetadata', onMeta)
    return () => { element.removeEventListener('timeupdate', onTime); element.removeEventListener('pause', saveRemote); element.removeEventListener('ended', onEnd); element.removeEventListener('play', onPlay); element.removeEventListener('error', onError); element.removeEventListener('loadedmetadata', onMeta); window.removeEventListener('pagehide', saveRemote) }
  }, [resumeKey, playback, progressLinkId, nextEpisode])

  // Keyboard: space/k play, ←/→ 10s, f fullscreen, m mute.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = video.current
      const target = event.target as HTMLElement | null
      if (!element || (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return
      if (event.key === ' ' || event.key === 'k') { event.preventDefault(); if (element.paused) void element.play(); else element.pause() }
      else if (event.key === 'ArrowRight') element.currentTime = Math.min(element.duration || Infinity, element.currentTime + 10)
      else if (event.key === 'ArrowLeft') element.currentTime = Math.max(0, element.currentTime - 10)
      else if (event.key === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void element.requestFullscreen?.() }
      else if (event.key === 'm') element.muted = !element.muted
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (playback === 'embed') return <div className="vp-frame"><iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>

  const setRate = (value: number) => { setSpeed(value); if (video.current) video.current.playbackRate = value }
  const pickLevel = (value: number) => { setLevel(value); if (hls.current) hls.current.currentLevel = value }

  return <div className="vp">
    <div className="vp-frame">
      <video ref={video} controls playsInline preload="metadata" poster={poster || undefined} aria-label={title}>
        {subtitles.map((track) => <track key={track.id} kind="subtitles" src={track.src} srcLang={track.language || 'und'} label={track.label} />)}
      </video>
      {resume > 0 && !error && <div className="vp-resume" role="status">
        <span>از {clock(resume)} ادامه می‌دهید؟</span>
        <button type="button" onClick={() => { if (video.current) { video.current.currentTime = resume; void video.current.play() } setResume(0) }}>ادامهٔ پخش</button>
        <button type="button" className="is-ghost" onClick={() => { write(resumeKey, null); setResume(0) }}>از اول</button>
      </div>}
      {nextEpisode && nextCountdown !== null && !error && <div className="vp-next" role="status">
        <span>قسمت بعدی {nextEpisode.label} تا {fa(nextCountdown)} ثانیهٔ دیگر پخش می‌شود.</span>
        <a href={nextEpisode.href}>اکنون پخش کن</a>
        <button type="button" className="is-ghost" onClick={() => setNextCountdown(null)}>ماندن در این صفحه</button>
      </div>}
      {error && <div className="vp-error" role="alert">
        <b>{error === 'network' ? 'فایل از سرور دانلود دریافت نشد' : 'مرورگر شما نمی‌تواند این فایل را پخش کند'}</b>
        <p>{error === 'network'
          ? 'اتصال به سرور فایل برقرار نشد یا لینک منقضی شده است. دوباره تلاش کنید؛ اگر درست نشد مشکل را گزارش دهید.'
          : 'این فایل احتمالاً با کدک HEVC (x265) یا صدای AC3/DTS ساخته شده که مرورگرها پخش نمی‌کنند. فایل را دانلود کنید و با VLC یا MX Player ببینید، یا کیفیت دیگری را امتحان کنید.'}</p>
        <div>
          {error === 'network' && <button type="button" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button>}
          {downloadHref && <a href={downloadHref} rel="nofollow">⤓ دانلود فایل</a>}
        </div>
      </div>}
    </div>
    <div className="vp-bar">
      <label>سرعت پخش
        <select value={speed} onChange={(event) => setRate(Number(event.target.value))}>{SPEEDS.map((value) => <option key={value} value={value}>{value === 1 ? 'عادی' : `${fa(value)}×`}</option>)}</select>
      </label>
      {levels.length > 1 && <label>کیفیت
        <select value={level} onChange={(event) => pickLevel(Number(event.target.value))}>
          <option value={-1}>خودکار</option>
          {levels.map((item) => <option key={item.index} value={item.index}>{fa(item.height)}p</option>)}
        </select>
      </label>}
      {pip && <button type="button" onClick={() => { void video.current?.requestPictureInPicture?.().catch(() => undefined) }}>تصویر در تصویر</button>}
      <span className="vp-keys">میان‌بر: Space پخش/توقف · ←/→ ده ثانیه · F تمام‌صفحه</span>
    </div>
  </div>
}
