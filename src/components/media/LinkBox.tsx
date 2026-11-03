import Link from '@/components/AppLink'
import { groupLinks, isTrack, trackLanguage, trackLinks } from '@/modules/media/domain/media'
import { getViewer } from '@/modules/membership/server/membership'
import { linkHref } from '@/modules/downloads/server/guard'
import { playableLinks } from '@/modules/media/server/links'
import { DownloadNotice, ReportLinkButton } from '@/components/media/DownloadExtras'
import { linkPaywalls } from '@/modules/paywall/server/paywall'
import { getPlaybackPrefs } from '@/modules/media/server/playback-prefs'
import { audioOrder } from '@/modules/media/domain/playback-prefs'
import { allLists } from '@/modules/vocabulary/server/vocabulary'
import BuyLinkButton from '@/components/paywall/BuyLinkButton'
import CopyText from '@/components/software/CopyText'

type PublicLink = { id: number; label: string; kind: string; quality: string; size: string; platform?: string; architecture?: string; checksum?: string; audio: string; subtitle: boolean; language?: string; access: string }

/**
 * Download / stream box (hexdl / melofilm style): grouped by dub vs original audio,
 * one row per quality; separate subtitle and audio files follow in groups of their own. Members-only rows show a lock and send guests to /vip.
 * Open rows carry a short-lived signed token (download protection module) and
 * a "report a problem" button.
 */
export default async function LinkBox({ links, fa, member, loggedIn, parentLocked = false, title, compact, paywall }: { links: PublicLink[]; fa: boolean; member: boolean; loggedIn: boolean; parentLocked?: boolean; title?: string; compact?: boolean; paywall?: { open: boolean } | null }) {
  if (!links.length) return <p className="muted md-nolinks">{fa ? 'لینکی برای این مورد ثبت نشده است.' : 'No links yet.'}</p>
  const viewer = await getViewer()
  // A member who prefers the original audio (or the dub) sees those releases first; nothing is hidden.
  // The owner's audio list (dub, original, dubbing studios…) names the release groups and, with the member's preference, orders them.
  const [prefs, audioList] = await Promise.all([getPlaybackPrefs(viewer.userId), allLists('media').then((lists) => lists.AUDIO || [])])
  const order = audioOrder(prefs, audioList.map((entry) => entry.code))
  const audioEntry = new Map(audioList.map((entry) => [entry.code, entry]))
  const [hrefs, playable, ownPrices] = await Promise.all([
    Promise.all(links.map(async (link) => [link.id, await linkHref(link.id, viewer.userId)] as const)).then((rows) => new Map(rows)),
    playableLinks(links.map((link) => link.id)),
    // Links sold on their own (e.g. a 4K file) — their price replaces the item's.
    linkPaywalls(viewer, links.map((link) => link.id)),
  ])
  // The in-site player reuses the download token (same link, same viewer).
  const watchHref = (id: number) => { const token = new URL(hrefs.get(id) || '/', 'http://x').searchParams.get('t'); return `/watch/${id}${token ? `?t=${encodeURIComponent(token)}` : ''}` }
  const audioName = (audio: string) => { const entry = audioEntry.get(audio); return entry ? `${entry.icon ? `${entry.icon} ` : ''}${fa ? entry.name : entry.nameEn || entry.name}` : audio || (fa ? 'لینک‌ها' : 'Links') }
  const tracks = trackLinks(links)
  const groups = [
    ...groupLinks(links, order).map((group) => ({ key: group.audio || 'all', head: audioName(group.audio), track: false, items: group.items })),
    ...(tracks.subtitles.length ? [{ key: 'subtitles', head: fa ? '💬 زیرنویس جدا' : '💬 Subtitle files', track: true, items: tracks.subtitles }] : []),
    ...(tracks.audio.length ? [{ key: 'audio-tracks', head: fa ? '🎧 صوت جدا (برای افزودن به فیلم)' : '🎧 Separate audio tracks', track: true, items: tracks.audio }] : []),
  ]
  return (
    <div className={`md-links${compact ? ' is-compact' : ''}`} id={compact ? undefined : 'downloads'}>
      {!compact && <DownloadNotice />}
      {title && <h3 className="md-links-title">{title}</h3>}
      {groups.map((group) => (
        <div key={group.key} className="md-links-group">
          {(!compact || group.track) && <div className="md-links-group-head">{group.head}</div>}
          <ul>
            {group.items.map((link) => {
              // A priced item: buying (or VIP, when the admin made it free for members) opens every link.
              // A link with its own price is bought on its own, whatever the item's rule is.
              const own = ownPrices.get(link.id)
              const vipLocked = !own && !paywall && (link.access === 'MEMBERS' || parentLocked)
              const locked = own ? !own.open : paywall ? !paywall.open : vipLocked && !member
              const href = locked ? (paywall ? '#buy' : loggedIn ? '/vip' : `/login?next=${encodeURIComponent('/vip')}`) : hrefs.get(link.id) || `/api/media/link/${link.id}`
              return (
                <li key={link.id} className={locked ? 'is-locked' : ''}>
                  <span className="md-q" dir={isTrack(link.kind) && link.language ? undefined : 'ltr'}>{isTrack(link.kind) ? trackLanguage(link.language || '', fa) || link.quality || '—' : link.quality || '—'}</span>
                  <span className="md-l">
                    <b>{link.label || (link.kind === 'STREAM' ? (fa ? 'پخش آنلاین' : 'Watch online') : link.kind === 'SUBTITLE' ? (fa ? 'فایل زیرنویس' : 'Subtitle file') : link.kind === 'AUDIO' ? (fa ? 'فایل صوت' : 'Audio file') : (fa ? 'دانلود مستقیم' : 'Direct download'))}</b>
                    <small>
                      {isTrack(link.kind) && link.language && link.quality && <span dir="ltr">{link.quality}</span>}
                      {link.size && <span dir="ltr">{link.size}</span>}
                      {(link.platform || link.architecture) && <span dir="ltr">{[link.platform, link.architecture].filter(Boolean).join(' · ')}</span>}
                      {compact && link.audio.startsWith('DUBBED') && <span>{fa ? audioEntry.get(link.audio)?.name || 'دوبله' : 'Dubbed'}</span>}
                      {link.subtitle && <span>{fa ? 'زیرنویس فارسی' : 'Persian subs'}</span>}
                      {vipLocked && <span className="vip-chip is-small">♛ VIP</span>}
                      {own && (own.open ? <span className="md-own is-open">{own.reason === 'purchased' ? '✓ خریداری‌شده' : '♛ رایگان برای شما'}</span> : <span className="md-own">فروش جداگانه</span>)}
                    </small>
                    {link.checksum && <small className="md-checksum">SHA-256: <CopyText value={link.checksum} label="SHA-256" /></small>}
                  </span>
                  {locked && own
                    ? <BuyLinkButton contentKey={own.key} price={own.price} listPrice={own.listPrice} memberPrice={own.memberPrice} groupPrice={own.groupPrice} quote={own.quote} vipFree={own.vipFree} loggedIn={loggedIn} />
                    : locked
                    ? paywall ? <a href="#buy" className="md-go is-locked" rel="nofollow">🛒 {fa ? 'خرید' : 'Buy'}</a> : <Link href={href} className="md-go is-locked" rel="nofollow">🔒 {fa ? 'ویژه VIP' : 'VIP only'}</Link>
                    : <span className="md-go-wrap">
                      {(playable.get(link.id) || 'none') !== 'none' && <a href={watchHref(link.id)} className="md-go is-play" rel="nofollow">{fa ? '▶ پخش آنلاین' : '▶ Watch online'}</a>}
                      {(link.kind === 'DOWNLOAD' || (playable.get(link.id) || 'none') === 'none') && <a href={href} className={`md-go${link.kind === 'STREAM' ? ' is-stream' : ''}`} rel="nofollow noopener" target={link.kind === 'STREAM' ? '_blank' : undefined}>{link.kind === 'STREAM' ? (fa ? '▶ پخش' : '▶ Watch') : (fa ? '⤓ دانلود' : '⤓ Download')}</a>}<ReportLinkButton linkId={link.id} label={[link.label, link.quality, link.size].filter(Boolean).join(' · ') || (fa ? 'لینک دانلود' : 'Download link')} /></span>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
