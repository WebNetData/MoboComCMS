'use client'

import { useEffect, useState, type RefObject } from 'react'

type Props = {
  video: RefObject<HTMLVideoElement | null>
  /** Changes when another file (or another attempt at it) is loaded: each is listened to afresh. */
  source: string
  playback: string
  /** A separate sound track plays instead of the video's own. */
  separatePlaying: boolean
  /** The player already shows its codec or network message. */
  failed: boolean
  hasSeparateAudio: boolean
  downloadHref?: string
}

/**
 * Chrome and Edge drop an AC3, E-AC3 or DTS sound track without any error: the picture plays and nothing is heard,
 * so the player's codec message never appears. After three seconds of unmuted playback with no audio decoded, ask.
 * A file with no sound at all reads the same, so the notice asks rather than asserts. Browsers without the
 * decoded-audio counter are left alone.
 */
export default function SilentAudioNotice({ video, source, playback, separatePlaying, failed, hasSeparateAudio, downloadHref }: Props) {
  const [silent, setSilent] = useState(false)
  // HLS streams and embeds have their own sound handling; only plain files are listened to.
  const enabled = playback !== 'hls' && playback !== 'embed' && !separatePlaying && !failed
  useEffect(() => {
    const element = video.current as (HTMLVideoElement & { webkitAudioDecodedByteCount?: number }) | null
    setSilent(false)
    if (!element || !enabled || typeof element.webkitAudioDecodedByteCount !== 'number') return
    let heard = 0, last = element.currentTime
    const check = () => {
      const step = element.currentTime - last
      last = element.currentTime
      // Only ordinary playback counts: a seek or the resume jump is not three seconds of listening.
      if (element.paused || element.muted || element.volume === 0 || step <= 0 || step > 1) return
      heard += step
      if (heard < 3) return
      element.removeEventListener('timeupdate', check)
      if (element.webkitAudioDecodedByteCount === 0) setSilent(true)
    }
    element.addEventListener('timeupdate', check)
    return () => element.removeEventListener('timeupdate', check)
  }, [video, source, enabled])

  if (!silent || !enabled) return null
  return <div className="vp-silent" role="status">
    <p><b>صدای فیلم پخش نمی‌شود؟</b> مرورگرها صدای AC3، E-AC3 و DTS را پخش نمی‌کنند و فقط تصویر نشان داده می‌شود. {hasSeparateAudio ? 'یک صدای جداگانه را از فهرست صدا انتخاب کنید، ' : ''}فایل را دانلود کنید و با VLC یا MX Player ببینید، یا کیفیت دیگری را امتحان کنید.</p>
    {downloadHref && <a href={downloadHref} rel="nofollow">⤓ دانلود فایل</a>}
    <button type="button" onClick={() => setSilent(false)}>بستن</button>
  </div>
}
