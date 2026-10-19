'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PlayerAudio } from '@/modules/media/server/links'

const clock = (time: number) => { const s = Math.max(0, Math.floor(time || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
type Props = { video: RefObject<HTMLVideoElement | null>; tracks: PlayerAudio[]; onActive: (active: boolean) => void }

/** The video owns position/rate; a selected authorized audio file follows it. No server-side transcoding. */
export default function SeparateAudioControls({ video, tracks, onActive }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false), [playing, setPlaying] = useState(false), [time, setTime] = useState(0), [duration, setDuration] = useState(0), [volume, setVolume] = useState(1), [muted, setMuted] = useState(false)
  const track = tracks.find(track => String(track.id) === selected)
  useEffect(() => {
    const element = video.current, external = audio.current
    if (!element || !external || !track) { onActive(false); return }
    const wasMuted = element.muted
    let cancelled = false
    onActive(true); element.muted = true; external.src = track.src; external.volume = element.volume; setVolume(element.volume); setMuted(false); setError(''); setLoading(true)
    const sync = () => {
      if (external.readyState && Math.abs(external.currentTime - element.currentTime) > 0.25) try { external.currentTime = element.currentTime } catch { /* Wait for a seekable range. */ }
      external.playbackRate = element.playbackRate
    }
    const fail = () => { if (!cancelled) { setError('این فایل صوتی در مرورگر پخش نشد؛ صدای اصلی فعال شد.'); setSelected('') } }
    const start = () => { sync(); if (!element.paused) void external.play().catch(fail) }
    const pause = () => { external.pause(); setPlaying(false) }
    const update = () => { sync(); setTime(element.currentTime); setDuration(Number.isFinite(element.duration) ? element.duration : 0); setPlaying(!element.paused) }
    const ready = () => { setLoading(false); start() }
    const mainPlay = () => { setPlaying(true); start() }
    const mainMute = () => { if (!element.muted) element.muted = true }
    element.addEventListener('play', mainPlay); element.addEventListener('playing', start); element.addEventListener('pause', pause); element.addEventListener('waiting', pause); element.addEventListener('ended', pause); element.addEventListener('seeking', sync); element.addEventListener('ratechange', sync); element.addEventListener('timeupdate', update); element.addEventListener('volumechange', mainMute)
    external.addEventListener('canplay', ready); external.addEventListener('error', fail)
    external.load(); update(); start()
    return () => {
      cancelled = true; onActive(false)
      element.removeEventListener('play', mainPlay); element.removeEventListener('playing', start); element.removeEventListener('pause', pause); element.removeEventListener('waiting', pause); element.removeEventListener('ended', pause); element.removeEventListener('seeking', sync); element.removeEventListener('ratechange', sync); element.removeEventListener('timeupdate', update); element.removeEventListener('volumechange', mainMute)
      external.removeEventListener('canplay', ready); external.removeEventListener('error', fail); external.pause(); external.removeAttribute('src'); external.load(); element.muted = wasMuted
    }
  }, [track, video, onActive])
  useEffect(() => { const element = audio.current; if (element) { element.volume = volume; element.muted = muted } }, [volume, muted])
  useEffect(() => {
    if (!track) return
    const key = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'm' && !(event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName)))) { event.preventDefault(); event.stopImmediatePropagation(); setMuted(value => !value) } }
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true)
  }, [track])
  if (!tracks.length) return null
  return <div className="vp-track-controls">
    <audio ref={audio} preload="none" aria-hidden="true" />
    <label>ترک صوتی<select aria-label="ترک صوتی" value={selected} onChange={e => { setSelected(e.target.value); setError('') }}><option value="">صدای اصلی ویدیو</option>{tracks.map(track => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>
    {track && <>
      <button type="button" onClick={() => { const element = video.current; if (!element) return; if (element.paused) void element.play().catch(() => setError('برای شروع پخش دوباره تلاش کنید')); else element.pause() }}>{playing ? 'توقف' : 'پخش'}</button>
      <label className="vp-seek">زمان پخش<input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(time, duration || 1)} aria-valuetext={`${clock(time)} از ${clock(duration)}`} onChange={e => { if (video.current) video.current.currentTime = Number(e.target.value) }} /></label><span dir="ltr">{clock(time)} / {clock(duration)}</span>
      <label>بلندی صدای ترک<input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(Number(e.target.value))} /></label>
      <button type="button" aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? 'وصل صدا' : 'بی‌صدا'}</button>
      <span role="status">{loading ? 'در حال آماده‌سازی صدا…' : 'صدای انتخابی با ویدیو همگام است'}</span>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>
}
