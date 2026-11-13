'use client'

import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { SUBTITLE_COLORS, type SubtitleStyle } from '@/modules/media/domain/playback-prefs'

const SIZE = { XS: 3.4, S: 4.2, M: 5.2, L: 6.4, XL: 7.8 } as const
const BACKGROUND = { NONE: 'transparent', DIM: 'rgb(0 0 0 / .55)', SOLID: '#000' } as const
const EDGE = {
  SHADOW: '0 1px 2px rgb(0 0 0 / .95), 0 2px 6px rgb(0 0 0 / .8)',
  OUTLINE: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 2px #000',
  NONE: 'none',
} as const

/** The look of the subtitle layer as CSS variables (sizes follow the picture's height, so fullscreen grows them). */
function subtitleVars(style: SubtitleStyle): CSSProperties {
  return { '--vp-sub-size': `${SIZE[style.size]}cqh`, '--vp-sub-color': SUBTITLE_COLORS[style.color].value, '--vp-sub-bg': BACKGROUND[style.background], '--vp-sub-edge': EDGE[style.edge], '--vp-sub-bottom': `${style.position}%` } as CSSProperties
}

/** The cue lines playing at `time` (cues are in start order; a few long ones may overlap). */
function activeCues(cues: TextTrackCueList, time: number): TextTrackCue[] {
  let low = 0, high = cues.length - 1, last = -1
  while (low <= high) { const mid = (low + high) >> 1; if (cues[mid].startTime <= time) { last = mid; low = mid + 1 } else high = mid - 1 }
  const out: TextTrackCue[] = []
  for (let i = last; i >= 0 && i > last - 24; i--) if (cues[i].endTime > time) out.unshift(cues[i])
  return out
}

/**
 * The site's own subtitle layer: draws the chosen text track's lines (kept 'hidden', so the browser draws nothing) in
 * the viewer's look, shifted by their timing correction, over the picture and inside fullscreen. Cue markup is only
 * what WebVTT allows (<i>, <b>, <u>), turned into elements by the browser itself (getCueAsHTML), never as HTML text.
 */
export default function SubtitleOverlay({ video, track, style, delay }: { video: RefObject<HTMLVideoElement | null>; track: TextTrack | null; style: SubtitleStyle; delay: number }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = video.current, node = box.current
    if (!element || !node) return
    node.replaceChildren()
    if (!track) return
    let frame = 0, shown = ''
    const draw = () => {
      const cues = track.cues
      const now = cues ? activeCues(cues, element.currentTime - delay) : []
      const key = now.map(cue => `${cue.startTime}:${(cue as VTTCue).text}`).join('|')
      if (key === shown) return
      shown = key
      node.replaceChildren(...now.map(cue => {
        const line = document.createElement('div'), words = document.createElement('span')
        line.className = 'vp-cue'; line.dir = 'auto'
        words.append(typeof (cue as VTTCue).getCueAsHTML === 'function' ? (cue as VTTCue).getCueAsHTML() : document.createTextNode((cue as VTTCue).text))
        line.append(words)
        return line
      }))
    }
    // While the film plays the layer follows each frame; paused, each seek or new cue.
    const loop = () => { draw(); frame = element.paused ? 0 : requestAnimationFrame(loop) }
    const start = () => { if (!frame) frame = requestAnimationFrame(loop) }
    element.addEventListener('play', start); element.addEventListener('seeked', draw); element.addEventListener('timeupdate', draw); track.addEventListener('cuechange', draw)
    draw(); if (!element.paused) start()
    return () => { cancelAnimationFrame(frame); element.removeEventListener('play', start); element.removeEventListener('seeked', draw); element.removeEventListener('timeupdate', draw); track.removeEventListener('cuechange', draw); node.replaceChildren() }
  }, [video, track, delay])
  return <div ref={box} className="vp-subs" style={subtitleVars(style)} aria-live="off" />
}
