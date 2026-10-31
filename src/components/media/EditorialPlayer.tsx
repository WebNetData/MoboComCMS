'use client'

import { useState } from 'react'
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
  if (media.kind === 'audio') return <InlineAudioPlayer key={media.src} media={media} />
  const title = media.title || 'ویدیو', provider = embedOf(media.src)?.provider || ''
  return <div className="mc-video" style={{ '--mc-ratio': media.ratio.replace(':', ' / ') } as React.CSSProperties}>
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
