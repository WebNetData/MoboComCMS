'use client'

import { useEffect, useState, type RefObject } from 'react'
import { openMkvSubtitles, type MkvSubtitles } from '@/modules/media/client/mkv-subtitles'
import type { PlayerSubtitle } from '@/modules/media/server/links'

/** A subtitle the player shows from its own text track (read in this browser) instead of a file of the site. */
export type PlayerTrack = PlayerSubtitle & { textTrack?: TextTrack }
const NONE: PlayerTrack[] = []

/**
 * The text subtitles inside the MKV being played, read by this browser straight from the file's host
 * (modules/media/client/mkv-subtitles): one text track each, filled with the lines near the playing time while it is
 * shown. Nothing passes through the site. A host that does not allow it simply leaves the list empty.
 */
export function useMkvSubtitles(video: RefObject<HTMLVideoElement | null>, src: string, enabled: boolean): PlayerTrack[] {
  const [found, setFound] = useState<{ src: string; tracks: PlayerTrack[] }>({ src: '', tracks: NONE })
  useEffect(() => {
    const element = video.current
    if (!enabled || !element) return
    const controller = new AbortController()
    let reader: MkvSubtitles | null = null
    let made: { number: number; textTrack: TextTrack }[] = []
    const busy = new Set<number>()
    const fill = () => {
      if (!reader) return
      for (const { number, textTrack } of made) {
        if (textTrack.mode === 'disabled' || busy.has(number)) continue
        busy.add(number)
        void reader.ensure(number, element.currentTime * 1000, cue => { try { textTrack.addCue(new VTTCue(cue.start, cue.end, cue.text)) } catch { /* A cue the browser refuses is skipped. */ } })
          .catch(() => undefined).finally(() => busy.delete(number))
      }
    }
    void openMkvSubtitles(src, controller.signal).then(opened => {
      if (!opened || controller.signal.aborted) return
      reader = opened
      made = opened.tracks.map(track => {
        const textTrack = element.addTextTrack('subtitles', track.label, track.language || 'und')
        textTrack.mode = 'disabled'
        return { number: track.number, textTrack }
      })
      setFound({ src, tracks: opened.tracks.map((track, at) => ({ id: `m${track.number}`, language: track.language, label: track.label, src: '', format: 'vtt', textTrack: made[at].textTrack })) })
    }).catch(() => undefined)
    const list = element.textTracks
    element.addEventListener('timeupdate', fill); element.addEventListener('seeked', fill); list.addEventListener('change', fill)
    return () => {
      controller.abort()
      element.removeEventListener('timeupdate', fill); element.removeEventListener('seeked', fill); list.removeEventListener('change', fill)
      // A text track cannot be taken off a video element; it is emptied and turned off.
      // (Its cues are listed only while it is not disabled.)
      for (const { textTrack } of made) { for (const cue of Array.from(textTrack.cues || [])) textTrack.removeCue(cue); textTrack.mode = 'disabled' }
    }
  }, [video, src, enabled])
  return enabled && found.src === src ? found.tracks : NONE
}
