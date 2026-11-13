'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_BACKGROUNDS, SUBTITLE_COLORS, SUBTITLE_EDGES, SUBTITLE_SIZES, type SubtitleStyle } from '@/modules/media/domain/playback-prefs'
import { PlayerIcon } from '@/components/media/player/icons'
import type { Subtitles } from '@/components/media/player/useSubtitles'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const HIDE_AFTER_MS = 2800
const fa = (value: number) => value.toLocaleString('fa-IR')
const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`
}
const speedLabel = (value: number) => value === 1 ? 'عادی' : `${fa(value)}×`
type Page = 'main' | 'subtitles' | 'style' | 'speed' | 'quality'

type Props = {
  video: RefObject<HTMLVideoElement | null>
  /** The frame that goes fullscreen with the picture, subtitles and these controls. */
  stage: RefObject<HTMLDivElement | null>
  subs: Subtitles
  allowOwnFiles: boolean
  levels: { index: number; height: number }[]
  level: number
  onLevel: (value: number) => void
  speed: number
  onSpeed: (value: number) => void
  canPip: boolean
  /** A separate audio file plays instead of the film's sound (its own volume is under the player). */
  externalAudio: boolean
}

/**
 * The film player's own controls over the picture (owner 2026-11-13: a more professional player): play, ten seconds
 * back and forward, the timeline with what is loaded and the time under the pointer, sound, subtitles and a settings
 * menu (subtitle, its look and timing, speed, quality), picture-in-picture and fullscreen of the whole frame. They step
 * aside while the film plays and come back on any pointer move, touch or key.
 */
export default function PlayerControls({ video, stage, subs, allowOwnFiles, levels, level, onLevel, speed, onSpeed, canPip, externalAudio }: Props) {
  const [paused, setPaused] = useState(true), [time, setTime] = useState(0), [duration, setDuration] = useState(0), [loaded, setLoaded] = useState(0)
  const [volume, setVolume] = useState(1), [muted, setMuted] = useState(false), [waiting, setWaiting] = useState(false), [started, setStarted] = useState(false)
  const [idle, setIdle] = useState(false), [page, setPage] = useState<Page | null>(null), [full, setFull] = useState(false), [hover, setHover] = useState<{ x: number; time: number } | null>(null)
  const timer = useRef(0), gear = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null), lastSubtitle = useRef('')
  // Shown, the bar also lifts the subtitles above it (CSS: .vp-frame:has(.vp-ui[data-visible])).
  const visible = !idle || paused || page !== null

  const wake = useCallback(() => {
    setIdle(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setIdle(true), HIDE_AFTER_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const element = video.current, frame = stage.current
    if (!element || !frame) return
    const sync = () => {
      setPaused(element.paused); setTime(element.currentTime); setDuration(Number.isFinite(element.duration) ? element.duration : 0)
      setVolume(element.volume); setMuted(element.muted)
      const ranges = element.buffered
      let end = 0
      for (let i = 0; i < ranges.length; i++) if (ranges.start(i) <= element.currentTime + 1) end = Math.max(end, ranges.end(i))
      setLoaded(end)
    }
    const play = () => { setStarted(true); sync(); wake() }
    const wait = () => setWaiting(true), go = () => setWaiting(false)
    const off = new AbortController(), signal = off.signal
    for (const name of ['pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'volumechange', 'seeked'] as const) element.addEventListener(name, sync, { signal })
    element.addEventListener('play', play, { signal }); element.addEventListener('waiting', wait, { signal }); element.addEventListener('playing', go, { signal }); element.addEventListener('canplay', go, { signal })
    document.addEventListener('fullscreenchange', () => setFull(document.fullscreenElement === frame), { signal })
    sync()
    return () => off.abort()
  }, [video, stage, wake])

  // Any pointer move or key over the frame brings the controls back; Escape closes the menu first.
  useEffect(() => {
    const frame = stage.current
    if (!frame) return
    const key = (event: KeyboardEvent) => { wake(); if (event.key === 'Escape' && page) { event.stopPropagation(); setPage(null); gear.current?.focus() } }
    frame.addEventListener('pointermove', wake); frame.addEventListener('keydown', key); frame.addEventListener('focusin', wake)
    return () => { frame.removeEventListener('pointermove', wake); frame.removeEventListener('keydown', key); frame.removeEventListener('focusin', wake) }
  }, [stage, wake, page])
  useEffect(() => { if (page) panel.current?.querySelector<HTMLElement>('[role=radio][aria-checked=true], .vp-menu-row, .vp-menu-back, .vp-menu-field button')?.focus() }, [page])
  useEffect(() => { if (subs.selected) lastSubtitle.current = subs.selected }, [subs.selected])

  const toggle = useCallback(() => {
    const element = video.current
    if (!element) return
    if (element.paused) void element.play().catch(() => undefined)
    else element.pause()
  }, [video])
  const seekBy = (seconds: number) => { const element = video.current; if (element) element.currentTime = Math.max(0, Math.min(element.duration || Infinity, element.currentTime + seconds)) }
  const fullscreen = () => {
    const frame = stage.current, element = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (document.fullscreenElement) void document.exitFullscreen()
    else if (frame?.requestFullscreen) void frame.requestFullscreen().catch(() => element?.webkitEnterFullscreen?.())
    else element?.webkitEnterFullscreen?.()
  }
  const captions = () => subs.select(subs.selected ? '' : (lastSubtitle.current && subs.all.some(t => String(t.id) === lastSubtitle.current) ? lastSubtitle.current : String(subs.all[0]?.id ?? '')))
  const style = subs.style, setStyle = (patch: Partial<SubtitleStyle>) => subs.setStyle({ ...style, ...patch })
  const point = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect(), share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    setHover({ x: share * 100, time: share * duration })
  }
  const chosenLabel = subs.chosen ? subs.chosen.label : 'خاموش'
  const levelLabel = level < 0 ? 'خودکار' : `${fa(levels.find(item => item.index === level)?.height || 0)}p`
  const go = (next: Page | null) => () => setPage(next)

  return <div className="vp-ui" data-visible={visible || undefined} data-full={full || undefined}>
    {/* A press on the picture plays or pauses; on a touch screen the first one only shows the controls. */}
    <div className="vp-hit" onPointerUp={event => { if (event.pointerType === 'mouse') { toggle(); wake() } else if (!visible) wake(); else toggle() }} onDoubleClick={fullscreen} aria-hidden="true" />
    {paused && !started && <button type="button" className="vp-big-play" onClick={toggle} aria-label="پخش"><PlayerIcon name="play" size={34} /></button>}
    {waiting && !paused && <span className="vp-waiting" role="status">در حال بارگذاری…</span>}

    {page && <div className="vp-menu" ref={panel} role="dialog" aria-label="تنظیمات پخش" dir="rtl">
      <div className="vp-menu-head">
        {page === 'main' ? <p className="vp-menu-title">تنظیمات پخش</p> : <button type="button" className="vp-menu-back" onClick={go('main')}><PlayerIcon name="right" size={18} />{page === 'subtitles' ? 'زیرنویس' : page === 'style' ? 'ظاهر زیرنویس' : page === 'speed' ? 'سرعت پخش' : 'کیفیت'}</button>}
        <button type="button" className="vp-menu-close" aria-label="بستن تنظیمات" onClick={() => { setPage(null); gear.current?.focus() }}>×</button>
      </div>
      {page === 'main' && <>
        <button type="button" className="vp-menu-row" onClick={go('subtitles')}><span>زیرنویس</span><b>{chosenLabel}</b><PlayerIcon name="left" size={18} /></button>
        <button type="button" className="vp-menu-row" onClick={go('style')}><span>ظاهر زیرنویس</span><b>{SUBTITLE_SIZES[style.size]} · {SUBTITLE_COLORS[style.color].label}</b><PlayerIcon name="left" size={18} /></button>
        <button type="button" className="vp-menu-row" onClick={go('speed')}><span>سرعت پخش</span><b>{speedLabel(speed)}</b><PlayerIcon name="left" size={18} /></button>
        {levels.length > 1 && <button type="button" className="vp-menu-row" onClick={go('quality')}><span>کیفیت</span><b>{levelLabel}</b><PlayerIcon name="left" size={18} /></button>}
        <p className="vp-menu-keys">میان‌بر: Space پخش/توقف · ←/→ ده ثانیه · ↑/↓ صدا · C زیرنویس · F تمام‌صفحه · M بی‌صدا</p>
      </>}

      {page === 'subtitles' && <>
        <div role="radiogroup" aria-label="انتخاب زیرنویس" className="vp-menu-list">
          {[{ id: '', label: 'خاموش', format: undefined as string | undefined }, ...subs.all.map(track => ({ id: String(track.id), label: track.label, format: track.format }))].map(item => <button key={item.id || 'off'} type="button" role="radio" aria-checked={subs.selected === item.id} className="vp-menu-option" onClick={() => subs.select(item.id)}>
            <span className="vp-tick">{subs.selected === item.id && <PlayerIcon name="check" size={16} />}</span><span dir="auto">{item.label}</span>{item.format === 'ass' && <small>ASS</small>}
          </button>)}
        </div>
        {!subs.all.length && <p className="vp-menu-note">برای این فایل زیرنویسی پیدا نشد.</p>}
        {allowOwnFiles && <>
          <input ref={file} type="file" accept=".srt,.vtt,.ass,.ssa,text/vtt" hidden onChange={event => { const picked = event.target.files?.[0]; event.target.value = ''; if (picked) void subs.addFile(picked) }} />
          <button type="button" className="vp-menu-action" onClick={() => file.current?.click()}><PlayerIcon name="upload" size={18} />افزودن زیرنویس از دستگاه شما</button>
          <p className="vp-menu-note">فایل SRT، VTT یا ASS فقط در مرورگر شما خوانده می‌شود و جایی فرستاده نمی‌شود.</p>
        </>}
        {subs.chosen?.format === 'ass' && subs.chosen.styledSrc && <label className="vp-menu-check"><input type="checkbox" checked={!subs.plain} onChange={event => subs.setPlain(!event.target.checked)} />نمایش با استایل اصلی ASS</label>}
        {subs.selected && <div className="vp-menu-field">
          <span id="vp-delay">همگام‌سازی زیرنویس</span>
          <div className="vp-stepper" role="group" aria-labelledby="vp-delay" dir="ltr">
            <button type="button" onClick={() => subs.setDelay(Math.max(-30, subs.delay - 0.25))} aria-label="زیرنویس زودتر">−</button>
            <output aria-live="polite">{subs.delay > 0 ? '+' : ''}{subs.delay.toFixed(2)}s</output>
            <button type="button" onClick={() => subs.setDelay(Math.min(30, subs.delay + 0.25))} aria-label="زیرنویس دیرتر">+</button>
            {subs.delay !== 0 && <button type="button" onClick={() => subs.setDelay(0)}>صفر</button>}
          </div>
        </div>}
        <p className="vp-menu-note" role="status">{subs.loading ? 'در حال دریافت زیرنویس…' : subs.ready ? 'زیرنویس با استایل خودش نمایش داده می‌شود' : ''}</p>
        {subs.error && <p className="vp-menu-error" role="alert">{subs.error}{subs.styled && <button type="button" onClick={() => { subs.setPlain(true); subs.setError('') }}>نمایش ساده</button>}</p>}
      </>}

      {page === 'style' && <>
        {subs.styled && <p className="vp-menu-note">زیرنویس ASS با استایل خودش نمایش داده می‌شود؛ این ظاهر برای نمایش ساده است.</p>}
        <fieldset className="vp-menu-field"><legend>اندازه</legend><div className="vp-segments">{(Object.keys(SUBTITLE_SIZES) as SubtitleStyle['size'][]).map(key => <button key={key} type="button" aria-pressed={style.size === key} onClick={() => setStyle({ size: key })}>{SUBTITLE_SIZES[key]}</button>)}</div></fieldset>
        <fieldset className="vp-menu-field"><legend>رنگ</legend><div className="vp-swatches">{(Object.keys(SUBTITLE_COLORS) as SubtitleStyle['color'][]).map(key => <button key={key} type="button" aria-pressed={style.color === key} aria-label={SUBTITLE_COLORS[key].label} title={SUBTITLE_COLORS[key].label} style={{ background: SUBTITLE_COLORS[key].value }} onClick={() => setStyle({ color: key })} />)}</div></fieldset>
        <fieldset className="vp-menu-field"><legend>پس‌زمینه</legend><div className="vp-segments">{(Object.keys(SUBTITLE_BACKGROUNDS) as SubtitleStyle['background'][]).map(key => <button key={key} type="button" aria-pressed={style.background === key} onClick={() => setStyle({ background: key })}>{SUBTITLE_BACKGROUNDS[key]}</button>)}</div></fieldset>
        <fieldset className="vp-menu-field"><legend>لبهٔ نوشته</legend><div className="vp-segments">{(Object.keys(SUBTITLE_EDGES) as SubtitleStyle['edge'][]).map(key => <button key={key} type="button" aria-pressed={style.edge === key} onClick={() => setStyle({ edge: key })}>{SUBTITLE_EDGES[key]}</button>)}</div></fieldset>
        <label className="vp-menu-field"><span>فاصله از پایین تصویر ({fa(style.position)}٪)</span><input type="range" min={2} max={40} step={1} value={style.position} onChange={event => setStyle({ position: Number(event.target.value) })} dir="ltr" /></label>
        <button type="button" className="vp-menu-action" onClick={() => subs.setStyle(subs.defaultStyle ?? DEFAULT_SUBTITLE_STYLE)}>بازگشت به ظاهر پیش‌فرض</button>
      </>}

      {page === 'speed' && <div role="radiogroup" aria-label="سرعت پخش" className="vp-menu-list">{SPEEDS.map(value => <button key={value} type="button" role="radio" aria-checked={speed === value} className="vp-menu-option" onClick={() => onSpeed(value)}><span className="vp-tick">{speed === value && <PlayerIcon name="check" size={16} />}</span>{speedLabel(value)}</button>)}</div>}
      {page === 'quality' && <div role="radiogroup" aria-label="کیفیت" className="vp-menu-list">{[{ index: -1, height: 0 }, ...levels].map(item => <button key={item.index} type="button" role="radio" aria-checked={level === item.index} className="vp-menu-option" onClick={() => onLevel(item.index)}><span className="vp-tick">{level === item.index && <PlayerIcon name="check" size={16} />}</span>{item.index < 0 ? 'خودکار' : `${fa(item.height)}p`}</button>)}</div>}
    </div>}

    <div className="vp-controls" role="group" aria-label="کنترل‌های پخش" dir="ltr">
      <div className="vp-timeline" onPointerMove={point} onPointerLeave={() => setHover(null)}>
        <div className="vp-timeline-track"><i className="vp-loaded" style={{ width: `${duration ? Math.min(100, loaded / duration * 100) : 0}%` }} /><i className="vp-played" style={{ width: `${duration ? Math.min(100, time / duration * 100) : 0}%` }} /></div>
        <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration || 0)} disabled={!duration} aria-label="زمان پخش" aria-valuetext={`${clock(time)} از ${clock(duration)}`} onChange={event => { if (video.current) video.current.currentTime = Number(event.target.value) }} />
        {hover && duration > 0 && <span className="vp-hover-time" style={{ left: `${hover.x}%` }}>{clock(hover.time)}</span>}
      </div>
      <div className="vp-row">
        <button type="button" onClick={toggle} aria-label={paused ? 'پخش' : 'توقف'}><PlayerIcon name={paused ? 'play' : 'pause'} /></button>
        <button type="button" className="vp-optional" onClick={() => seekBy(-10)} aria-label="ده ثانیه عقب"><PlayerIcon name="back" /></button>
        <button type="button" className="vp-optional" onClick={() => seekBy(10)} aria-label="ده ثانیه جلو"><PlayerIcon name="forward" /></button>
        {!externalAudio && <div className="vp-volume">
          <button type="button" onClick={() => { if (video.current) video.current.muted = !video.current.muted }} aria-label={muted || volume === 0 ? 'وصل صدا' : 'بی‌صدا'}><PlayerIcon name={muted || volume === 0 ? 'muted' : 'volume'} /></button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="بلندی صدا" onChange={event => { const element = video.current; if (!element) return; element.volume = Number(event.target.value); element.muted = element.volume === 0 }} />
        </div>}
        <span className="vp-time">{clock(time)} <span aria-hidden="true">/</span> {clock(duration)}</span>
        <span className="vp-spacer" />
        {subs.all.length > 0 && <button type="button" onClick={captions} aria-pressed={!!subs.selected} aria-label="زیرنویس" className="vp-cc"><PlayerIcon name="captions" /></button>}
        <button type="button" ref={gear} onClick={() => setPage(page ? null : 'main')} aria-expanded={!!page} aria-label="تنظیمات پخش"><PlayerIcon name="settings" /></button>
        {canPip && <button type="button" className="vp-optional" onClick={() => { void video.current?.requestPictureInPicture?.().catch(() => undefined) }} aria-label="تصویر در تصویر"><PlayerIcon name="pip" /></button>}
        <button type="button" onClick={fullscreen} aria-label={full ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}><PlayerIcon name={full ? 'shrink' : 'expand'} /></button>
      </div>
    </div>
  </div>
}
