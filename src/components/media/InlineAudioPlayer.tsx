'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { EditorialMedia } from '@/shared/media/editorial'
import Icon from '@/components/site/Icon'

const clock = (value: number) => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00'
/** A presentation for standalone editorial files, without inventing a Music track or another queue. */
export default function InlineAudioPlayer({ media }: { media: EditorialMedia }) {
  const audio = useRef<HTMLAudioElement>(null)
  const id = useId()
  const [playing, setPlaying] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('')
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0), [speed, setSpeed] = useState('1'), [volume, setVolume] = useState(1)
  useEffect(() => {
    const element = audio.current
    if (!element) return
    element.src = media.src; element.load()
    return () => { element.pause(); element.removeAttribute('src'); element.load() }
  }, [media.src])
  const title = media.title || 'فایل صوتی', kind = media.audioKind === 'podcast' ? 'پادکست' : media.audioKind === 'voice' ? 'پیام صوتی' : 'موسیقی'
  async function toggle() {
    const element = audio.current
    if (!element || pending) return
    if (!element.paused) { element.pause(); return }
    setError(''); setPending(true)
    try { await element.play() } catch { setError('پخش انجام نشد؛ دوباره تلاش کنید یا فایل را مستقیم باز کنید.') } finally { setPending(false) }
  }
  const seek = (next: number) => { const element = audio.current; if (element && duration > 0) { element.currentTime = Math.max(0, Math.min(duration, next)); setTime(element.currentTime) } }
  return <section className="mc-audio" aria-label={`${kind}: ${title}`} data-playing={playing}>
    <audio ref={audio} src={media.src} preload="metadata" onLoadedMetadata={event => { const n = event.currentTarget.duration; setDuration(Number.isFinite(n) ? n : 0) }} onDurationChange={event => { const n = event.currentTarget.duration; setDuration(Number.isFinite(n) ? n : 0) }} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={event => { setPlaying(true); document.querySelectorAll<HTMLMediaElement>('audio,video').forEach(other => { if (other !== event.currentTarget) other.pause() }) }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setPending(false); setError('فایل صوتی در دسترس نیست یا قالب آن توسط مرورگر پشتیبانی نمی‌شود.') }} />
    <div className="mc-audio-art" aria-hidden="true">{media.poster ? <img src={media.poster} alt="" loading="lazy" /> : <Icon name={media.audioKind === 'music' ? 'music' : 'mic'} size={30} />}</div>
    <div className="mc-audio-body">
      <div className="mc-audio-heading"><span>{kind}</span><strong dir="auto">{title}</strong></div>
      <div className="mc-audio-timeline"><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(time, duration || 1)} disabled={!duration} aria-label="زمان پخش" aria-valuetext={`${clock(time)} از ${clock(duration)}`} onChange={event => seek(Number(event.target.value))} /><div dir="ltr"><time>{clock(time)}</time><time>{clock(duration)}</time></div></div>
      <div className="mc-audio-controls">
        <button type="button" className="mc-audio-play" aria-label={playing ? 'توقف پخش' : 'پخش فایل صوتی'} disabled={pending} onClick={() => void toggle()}><Icon name={playing ? 'pause' : 'play'} size={21} /><span>{pending ? 'در حال پخش…' : playing ? 'توقف' : 'پخش'}</span></button>
        <button type="button" aria-label="۱۵ ثانیه عقب" disabled={!duration} onClick={() => seek(time - 15)}>−۱۵</button><button type="button" aria-label="۱۵ ثانیه جلو" disabled={!duration} onClick={() => seek(time + 15)}>+۱۵</button>
        <div className="mc-audio-speed"><label htmlFor={id+'-speed'}>سرعت</label><select id={id+'-speed'} value={speed} onChange={event => { setSpeed(event.target.value); if (audio.current) audio.current.playbackRate = Number(event.target.value) }}>{['0.75', '1', '1.25', '1.5', '2'].map(value => <option key={value} value={value}>{value}×</option>)}</select></div>
        <label className="mc-audio-volume"><span>صدا</span><input type="range" min={0} max={1} step={0.05} value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (audio.current) audio.current.volume = value }} /></label>
        <a href={media.src} target="_blank" rel="noopener noreferrer" aria-label="بازکردن فایل صوتی">فایل ↗</a>
      </div>
      {error && <p role="alert" className="mc-media-error">{error} <button type="button" onClick={() => { setError(''); audio.current?.load(); void toggle() }}>تلاش دوباره</button></p>}
    </div>
  </section>
}
