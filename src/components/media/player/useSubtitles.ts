'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type ASS from 'assjs'
import { normalizeSubtitleStyle, type SubtitleStyle } from '@/modules/media/domain/playback-prefs'
import { assToWebVtt, decodeSubtitle, toWebVtt } from '@/modules/media/domain/media'
import { languageName, subtitleLanguage } from '@/modules/media/domain/found-subtitles'
import type { PlayerTrack } from '@/components/media/player/useMkvSubtitles'

const STYLE_KEY = 'vp:subtitle-style'
const MAX_OWN_BYTES = 5 * 1024 * 1024
const MAX_OWN_FILES = 6
const readStyle = (): unknown => { try { const raw = localStorage.getItem(STYLE_KEY); return raw ? JSON.parse(raw) : null } catch { return null } }
const remembered = () => { try { return localStorage.getItem('vp:subtitle') || 'fa' } catch { return 'fa' } }

/** The video's text track of a subtitle: its own (read in the browser) or the one of its <track id="vp-sub-…">. */
export const textTrackOf = (list: TextTrackList, track: PlayerTrack | undefined) => track && (track.textTrack ?? Array.from(list).find(item => item.id === `vp-sub-${track.id}`))

/** A subtitle file's format from its name, or else from its first lines. */
function fileFormat(name: string, text: string): 'srt' | 'vtt' | 'ass' {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (ext === 'ass' || ext === 'ssa' || /^\s*\[Script Info\]/i.test(text)) return 'ass'
  if (ext === 'vtt' || /^﻿?WEBVTT/.test(text)) return 'vtt'
  return 'srt'
}

type Options = {
  video: RefObject<HTMLVideoElement | null>
  layer: RefObject<HTMLDivElement | null>
  /** The subtitles of the site and the ones read inside the file. */
  tracks: PlayerTrack[]
  /** The member's chosen language ('' never chose); null for a visitor (the device remembers theirs). */
  preference: string | null
  /** The member's chosen look; null when they never chose. */
  memberStyle: SubtitleStyle | null
  /** The site's look from Admin. */
  defaultStyle: SubtitleStyle
}

/**
 * Which subtitle is on, how it looks and how it is timed, for the player's own subtitle layer (SubtitleOverlay): the
 * chosen text track is kept 'hidden' (its cues load; the browser draws nothing) and every other one 'disabled'. An ASS
 * track may instead be drawn with its own styles (assjs). A viewer's own file is read in their browser and never sent.
 */
export function useSubtitles({ video, layer, tracks, preference, memberStyle, defaultStyle }: Options) {
  const [own, setOwn] = useState<PlayerTrack[]>([])
  const all = useMemo(() => own.length ? [...tracks, ...own] : tracks, [tracks, own])
  const [selected, setSelected] = useState('')
  const [plain, setPlain] = useState(false), [delay, setDelay] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(false), [ready, setReady] = useState(false)
  const [style, setStyleState] = useState<SubtitleStyle>(memberStyle ?? defaultStyle)
  const [active, setActive] = useState<TextTrack | null>(null)
  const renderer = useRef<ASS | null>(null), urls = useRef<string[]>([]), counter = useRef(0), saveTimer = useRef(0)
  const chosen = all.find(track => String(track.id) === selected)
  const styled = chosen?.format === 'ass' && !plain && !!chosen.styledSrc

  // A visitor's look is kept on their device (read after the first paint, which used the site's look).
  useEffect(() => { if (!memberStyle && preference === null) { const saved = readStyle(); if (saved) setStyleState(normalizeSubtitleStyle(saved, defaultStyle)) } }, [memberStyle, preference, defaultStyle])
  // The member's language, else the device's, else Persian; again when the file's own subtitles arrive.
  useEffect(() => { const wanted = preference || remembered(); setSelected(wanted === 'off' ? '' : String(tracks.find(track => track.language === wanted)?.id || '')) }, [preference, tracks])
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); window.clearTimeout(saveTimer.current) }, [])

  const remember = useCallback((id: string) => {
    const language = all.find(track => String(track.id) === id)?.language || 'off'
    try { localStorage.setItem('vp:subtitle', language) } catch { /* Private browsing still plays. */ }
    if (preference !== null && !id.startsWith('own')) void fetch('/api/media/playback-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subtitle: language }), keepalive: true }).catch(() => undefined)
  }, [all, preference])
  const select = useCallback((id: string) => { setSelected(id); setPlain(false); setError(''); remember(id) }, [remember])

  const setStyle = useCallback((next: SubtitleStyle) => {
    setStyleState(next)
    try { localStorage.setItem(STYLE_KEY, JSON.stringify(next)) } catch { /* Private browsing. */ }
    if (preference === null) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void fetch('/api/media/playback-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subtitleStyle: next }), keepalive: true }).catch(() => undefined) }, 700)
  }, [preference])

  /** A subtitle file from the viewer's device: SubRip, WebVTT or ASS (UTF-8 or Windows Arabic/Persian), as one more choice. */
  const addFile = useCallback(async (file: File) => {
    setError('')
    if (file.size > MAX_OWN_BYTES) { setError('حجم فایل زیرنویس بیش از ۵ مگابایت است'); return }
    if (own.length >= MAX_OWN_FILES) { setError('بیش از شش فایل زیرنویس نمی‌شود افزود'); return }
    const text = decodeSubtitle(new Uint8Array(await file.arrayBuffer()))
    const format = fileFormat(file.name, text)
    const vtt = format === 'ass' ? assToWebVtt(text) : toWebVtt(text, format)
    if (!vtt) { setError('در این فایل زیرنویس قابل خواندنی پیدا نشد؛ فایل SRT، VTT یا ASS بدهید'); return }
    const src = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })), styledSrc = format === 'ass' ? URL.createObjectURL(new Blob([text], { type: 'text/plain' })) : undefined
    urls.current.push(src, ...(styledSrc ? [styledSrc] : []))
    const language = file.name.split(/[.\-_ ]+/).map(word => subtitleLanguage(word)).find(Boolean) || ''
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40)
    const id = `own${++counter.current}`
    setOwn(previous => [...previous, { id, language, label: `${languageName(language) || 'زیرنویس'} · فایل شما (${name})`, src, format, ...(styledSrc ? { styledSrc } : {}) }])
    setSelected(id); setPlain(false)
  }, [own.length])

  // The chosen text track loads its cues for the site's own layer; the browser draws none.
  useEffect(() => {
    const element = video.current
    if (!element) return
    const list = element.textTracks
    const apply = () => {
      const shown = styled ? undefined : textTrackOf(list, chosen)
      for (let i = 0; i < list.length; i++) list[i].mode = list[i] === shown ? 'hidden' : 'disabled'
      setActive(shown || null)
    }
    apply()
    list.addEventListener('addtrack', apply)
    return () => list.removeEventListener('addtrack', apply)
  }, [video, chosen, styled])

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

  return { all, own, selected, select, chosen, styled, plain, setPlain, delay, setDelay, style, setStyle, defaultStyle, addFile, error, setError, loading, ready, active }
}

export type Subtitles = ReturnType<typeof useSubtitles>
