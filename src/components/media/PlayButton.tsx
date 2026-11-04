'use client'
import { contentPath } from '@/platform/routing/aliases'

import Link from '@/components/AppLink'
import { sized } from '@/shared/media/image'
import { useI18n } from '@/i18n/LocaleProvider'
import { usePlayer } from './MusicPlayer'
import type { PlayerTrack } from './player-types'
import TrackActions from './TrackActions'

/** Play / pause control bound to the site-wide player. */
export function PlayButton({ tracks, index = 0, variant = 'round', label }: { tracks: PlayerTrack[]; index?: number; variant?: 'round' | 'big' | 'overlay'; label?: string }) {
  const player = usePlayer()
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const track = tracks[index]
  if (!player || !track) return null
  const active = player.current?.id === track.id
  const playing = active && player.playing
  const text = playing ? (fa ? 'توقف' : 'Pause') : (fa ? 'پخش' : 'Play')
  return (
    <button type="button" className={`mu-pb mu-pb-${variant}${active ? ' is-active' : ''}${playing ? ' is-playing' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); player.play(tracks, index) }} aria-label={variant === 'big' ? `${label || text} — ${track.title}` : `${text} ${track.title}`}>
      <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      {variant === 'big' && <b>{label || text}</b>}
    </button>
  )
}

const fmt = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '')

/** Numbered track list (album, playlist, charts). */
export function TrackList({ tracks, numbered = true, showCover = true, chart = false, history, reasons }: { tracks: PlayerTrack[]; numbered?: boolean; showCover?: boolean; chart?: boolean; reasons?: string[]; history?: { lastPlayedAt?: string; playCount?: number; positionSeconds?: number; durationSeconds?: number }[] }) {
  const player = usePlayer()
  const { locale } = useI18n()
  const fa = locale === 'fa'
  if (!tracks.length) return <p className="muted mu-empty">{fa ? 'هنوز آهنگی منتشر نشده.' : 'No tracks yet.'}</p>
  return (
    <ol className={`mu-tracklist${chart ? ' is-chart' : ''}`}>
      {tracks.map((track, i) => {
        const active = player?.current?.id === track.id
        return (
          <li key={track.id} className={active ? 'is-active' : ''}>
            {numbered && <span className="mu-tl-no">{active && player?.playing ? <i className="mu-eq" aria-hidden="true"><b /><b /><b /></i> : (i + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}
            <PlayButton tracks={tracks} index={i} />
            {showCover && (track.cover ? <img className="mu-tl-cover" src={sized(track.cover, 120)} alt="" loading="lazy" /> : <span className="mu-tl-cover mu-noart">♪</span>)}
            <span className="mu-tl-meta">
              <Link href={contentPath('track', track.slug, { artist: track.artistSlug })}><b>{track.title}</b></Link>
              <Link href={`/music/artist/${track.artistSlug}`} className="muted">{track.artist}</Link>
              {reasons?.[i] && <small className="muted">{reasons[i]}</small>}
              {history?.[i] && <small className="muted">{history[i].lastPlayedAt && `${new Date(history[i].lastPlayedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')} · `}{history[i].playCount && `${history[i].playCount.toLocaleString(fa ? 'fa-IR' : 'en-US')} ${fa ? 'بار پخش' : 'plays'}`}{history[i].positionSeconds && history[i].durationSeconds && history[i].durationSeconds - history[i].positionSeconds > 5 ? ` · ${fa ? 'ادامه از' : 'Resume at'} ${fmt(history[i].positionSeconds)}` : ''}</small>}
            </span>
            {track.access === 'MEMBERS' && <span className="vip-chip" title="VIP">♛ VIP</span>}
            {track.hasHq && <span className="mu-hq-chip">320</span>}
            <TrackActions trackId={track.id} title={track.title} heart={false} placement="down" />
            <span className="mu-tl-time" dir="ltr">{fmt(track.duration)}</span>
          </li>
        )
      })}
    </ol>
  )
}
