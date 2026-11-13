'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type ASS from 'assjs'
import type { PlayerTrack } from '@/components/media/player/useMkvSubtitles'

type Props = { video: RefObject<HTMLVideoElement | null>; layer: RefObject<HTMLDivElement | null>; tracks: PlayerTrack[]; preference: string | null }
/** The video's text track of a subtitle: its own (read in the browser) or the one of its <track id="vp-sub-…">. */
const textTrackOf = (list: TextTrackList, track: PlayerTrack | undefined) => track && (track.textTrack ?? Array.from(list).find(item => item.id === `vp-sub-${track.id}`))
const remembered = () => { try { return localStorage.getItem('vp:subtitle') || 'fa' } catch { return 'fa' } }

export default function SubtitleControls({ video, layer, tracks, preference }: Props) {
  const [selected, setSelected] = useState(''), [plain, setPlain] = useState(false), [delay, setDelay] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(false), [ready, setReady] = useState(false)
  const renderer = useRef<ASS | null>(null)
  const chosen = tracks.find(track => String(track.id) === selected), styled = chosen?.format === 'ass' && !plain
  useEffect(() => { const wanted = preference || remembered(); setSelected(wanted === 'off' ? '' : String(tracks.find(track => track.language === wanted)?.id || '')) }, [preference, tracks])
  const remember = useCallback((id: string) => {
    const language = tracks.find(track => String(track.id) === id)?.language || 'off'
    try { localStorage.setItem('vp:subtitle', language) } catch { /* Private browsing still supports this page. */ }
    if (preference !== null) void fetch('/api/media/playback-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subtitle: language }), keepalive: true }).catch(() => undefined)
  }, [tracks, preference])
  useEffect(() => {
    const element = video.current
    if (!element) return
    const list = element.textTracks
    const apply = () => { const shown = styled ? undefined : textTrackOf(list, chosen); for (let i = 0; i < list.length; i++) list[i].mode = list[i] === shown ? 'showing' : 'disabled' }
    apply()
    const nativeChange = () => {
      const showing = Array.from(list).find(track => track.mode === 'showing')
      const match = showing && tracks.find(track => textTrackOf(list, track) === showing)
      if (match && String(match.id) !== selected) { const next = String(match.id); setSelected(next); setPlain(true); remember(next) }
    }
    list.addEventListener('addtrack', apply); list.addEventListener('change', nativeChange)
    return () => { list.removeEventListener('addtrack', apply); list.removeEventListener('change', nativeChange) }
  }, [video, tracks, chosen, selected, styled, remember])
  useEffect(() => {
    if (!styled || !chosen?.styledSrc || !video.current || !layer.current) { setLoading(false); setReady(false); return }
    const abort = new AbortController(), element = video.current, container = layer.current
    let instance: ASS | null = null
    setError(''); setLoading(true); setReady(false)
    void Promise.all([import('assjs'), fetch(chosen.styledSrc, { cache: 'no-store', signal: abort.signal }).then(async response => { if (!response.ok) throw Error('دریافت زیرنویس ممکن نشد'); return response.text() })]).then(([{ default: Renderer }, content]) => {
      if (abort.signal.aborted) return
      instance = new Renderer(content, element, { container, resampling: 'video_width' }); renderer.current = instance; setReady(true)
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'نمایش استایل زیرنویس ممکن نشد') }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => { abort.abort(); instance?.destroy(); if (renderer.current === instance) renderer.current = null }
  }, [chosen?.styledSrc, styled, video, layer])
  useEffect(() => { if (renderer.current) renderer.current.delay = delay }, [delay, ready])
  if (!tracks.length) return null
  return <div className="vp-track-controls">
    <label>زیرنویس<select aria-label="زیرنویس" value={selected} onChange={e => { setSelected(e.target.value); setPlain(false); setError(''); remember(e.target.value) }}><option value="">خاموش</option>{tracks.map(track => <option key={track.id} value={track.id}>{track.label}{track.format === 'ass' ? ' · ASS' : ''}</option>)}</select></label>
    {chosen?.format === 'ass' && <label className="vp-check"><input type="checkbox" checked={!plain} onChange={e => { setPlain(!e.target.checked); setError('') }} />استایل اصلی ASS</label>}
    {styled && <label>تأخیر زیرنویس (ثانیه)<input type="number" min={-30} max={30} step={0.25} value={delay} onChange={e => setDelay(Math.max(-30, Math.min(30, Number(e.target.value) || 0)))} /></label>}
    <span role="status" aria-live="polite">{loading ? 'در حال دریافت زیرنویس…' : ready ? 'زیرنویس با استایل فعال است' : ''}</span>
    {error && <p role="alert">{error} <button type="button" onClick={() => { setPlain(true); setError('') }}>نمایش سادهٔ زیرنویس</button></p>}
  </div>
}
