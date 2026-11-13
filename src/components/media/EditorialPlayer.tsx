'use client'

import { useEffect, useRef, useState } from 'react'
import type { EditorialMedia } from '@/shared/media/editorial'
import { embedOf } from '@/shared/media/editorial'
import InlineAudioPlayer from './InlineAudioPlayer'
import VideoPlayer from './VideoPlayer'
import Icon from '@/components/site/Icon'
import './editorial-player.css'

const providers: Record<string, string> = { youtube: 'یوتیوب', aparat: 'آپارات', namasha: 'نماشا', tamasha: 'تماشا', vimeo: 'Vimeo' }
const resumeKey = (src: string) => { let hash = 2166136261; for (const c of src) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return 'editorial-video:'+String(hash >>> 0) }
export default function EditorialPlayer({ media }: { media: EditorialMedia }) {
  const [opened, setOpened] = useState(false)
  // A file's own width and height decide its frame, so a vertical video is not boxed into the chosen or default ratio.
  const [shape, setShape] = useState<[number, number] | null>(null), box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = box.current
    if (!node || media.kind !== 'video') return
    const read = () => { const video = node.querySelector('video'); if (video?.videoWidth && video.videoHeight) setShape([video.videoWidth, video.videoHeight]) }
    read()
    node.addEventListener('loadedmetadata', read, true)
    return () => node.removeEventListener('loadedmetadata', read, true)
  }, [media.kind, media.src])
  if (media.kind === 'audio') return <InlineAudioPlayer key={media.src} media={media} />
  const title = media.title || 'ویدیو', provider = embedOf(media.src)?.provider || ''
  const [w, h] = shape || media.ratio.split(':').map(Number)
  return <div ref={box} className={h > w ? 'mc-video mc-video-portrait' : 'mc-video'} style={{ '--mc-ratio': `${w} / ${h}`, '--mc-rw': w, '--mc-rh': h } as React.CSSProperties}>
    <div className="mc-video-head"><span><Icon name="video" size={17} />{title}</span>{provider && <a href={media.src} target="_blank" rel="noopener noreferrer">{providers[provider]} ↗</a>}</div>
    {media.kind === 'video' ? (
      <VideoPlayer key={media.src} src={media.src} playback="video" title={title} poster={media.poster} resumeKey={resumeKey(media.src)} keyboardScope="focused" />
    ) : opened ? (
      <iframe
        src={media.src}
        title={title}
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
    ) : (
      <button type="button" className="mc-video-open" onClick={() => { document.querySelectorAll<HTMLMediaElement>('audio,video').forEach(element => element.pause()); setOpened(true) }}>
        <span className="mc-video-play"><Icon name="play" size={30} /></span><strong>{title}</strong><span>نمایش ویدیو از {providers[provider]}</span><small>با انتخاب پخش، پلیر رسمی سرویس بارگذاری می‌شود.</small>
      </button>
    )}
  </div>
}
