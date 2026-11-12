'use client'

import { useState, useSyncExternalStore } from 'react'
import { devicePlatform, externalPlayerLinks, playableAddress, type DevicePlatform, type ExternalPlayerId } from '@/modules/media/domain/external-players'
import type { PlayerSubtitle } from '@/modules/media/server/links'

type Props = {
  src: string
  title: string
  /** The apps the owner chose in Admin › فیلم و سریال › تنظیمات; none hides the row. */
  players: ExternalPlayerId[]
  subtitles: PlayerSubtitle[]
}

const never = () => () => {}
/** The viewer's device, read in the browser only (null while the page is rendered on the server). */
const usePlatform = () => useSyncExternalStore<DevicePlatform | null>(never, () => devicePlatform(navigator.userAgent, navigator.maxTouchPoints || 0), () => null)
/** The site's own origin, to make the site's masked address absolute for the app. */
const useOrigin = () => useSyncExternalStore(never, () => window.location.origin, () => '')

/**
 * «پخش در برنامهٔ دیگر» under the player: on a phone, buttons that open the file in KMPlayer, MX Player or VLC (which
 * play Dolby sound and the subtitles inside an MKV that browsers cannot); on a computer, the address to paste into the
 * app's "Open URL". The address is the one this player plays, valid for the same time.
 */
export default function ExternalPlayers({ src, title, players, subtitles }: Props) {
  const platform = usePlatform(), origin = useOrigin()
  const [copied, setCopied] = useState<'' | 'ok' | 'manual'>('')
  if (!platform || !origin || !players.length) return null
  const subtitle = (subtitles.find(track => track.language === 'fa') || subtitles[0])?.src || ''
  const links = externalPlayerLinks({ src, origin, platform, players, title, subtitle })
  const address = playableAddress(src, origin)
  // A device with no app link for the chosen apps (an iPhone without VLC chosen) shows nothing.
  if (!address || (platform !== 'other' && !links.length)) return null

  async function copy() {
    try { await navigator.clipboard.writeText(address); setCopied('ok') } catch { setCopied('manual') }
  }
  return <section className="vp-apps" aria-label="پخش در برنامهٔ دیگر">
    <span className="vp-apps-title">پخش در برنامهٔ دیگر</span>
    {platform === 'other' ? <>
      <button type="button" onClick={() => void copy()}>کپی لینک پخش</button>
      <span className="vp-apps-hint">در KMPlayer یا PotPlayer کلید Ctrl+U را بزنید و لینک را بچسبانید؛ صدای Dolby و زیرنویس داخل فایل را هم پخش می‌کنند.</span>
      {copied === 'manual' && <input className="vp-apps-address" dir="ltr" readOnly value={address} aria-label="لینک پخش" onFocus={event => event.currentTarget.select()} />}
    </> : <>
      {links.map(link => <a key={link.id} href={link.href} rel="nofollow noreferrer">{link.label}</a>)}
      <span className="vp-apps-hint">{platform === 'android' ? 'اگر برنامه نصب نباشد، صفحهٔ آن در Google Play باز می‌شود.' : 'VLC را از App Store نصب کنید؛ زیرنویس سایت هم همراه فیلم فرستاده می‌شود.'}</span>
    </>}
    <span className="vp-apps-status" role="status">{copied === 'ok' ? 'لینک کپی شد؛ تا مدتی معتبر است.' : copied === 'manual' ? 'لینک را از کادر کپی کنید.' : ''}</span>
  </section>
}
