import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import VideoPlayer from '@/components/media/VideoPlayer'
import { getServerTheme } from '@/i18n/server'
import { watchSource } from '@/modules/media/server/links'
import { isModuleEnabled } from '@/extensions/server/modules'
import { getAdsConfig } from '@/modules/ads/server/serving'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import type { PlayerBreaksConfig } from '@/components/media/player/PlayerBreaks'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پخش آنلاین', robots: { index: false, follow: false } }

const REASON: Record<string, { title: string; text: string; action?: { href: string; label: string } }> = {
  'not-found': { title: 'این لینک پیدا نشد', text: 'ممکن است حذف یا غیرفعال شده باشد.' },
  removed: { title: 'این فایل در دسترس نیست', text: 'لینک به‌دلیل خرابی یا درخواست حق نشر غیرفعال شده است.' },
  login: { title: 'برای تماشا وارد شوید', text: 'تماشای این مورد برای کاربران عضو است.', action: { href: '/login', label: 'ورود / ثبت‌نام' } },
  vip: { title: 'ویژهٔ اعضای VIP', text: 'این مورد فقط برای اشتراک ویژه قابل تماشاست.', action: { href: '/vip', label: 'خرید اشتراک ویژه' } },
  buy: { title: 'این مورد فروشی است', text: 'برای تماشا ابتدا آن را از صفحهٔ خودش خریداری کنید؛ پس از خرید همیشه در دسترس شماست.' },
  expired: { title: 'اعتبار لینک تمام شده است', text: 'برای امنیت، لینک‌های پخش مدت محدودی اعتبار دارند. از صفحهٔ فیلم دوباره روی «پخش» بزنید.' },
  unplayable: { title: 'این فایل قابل پخش آنلاین نیست', text: 'فرمت این لینک برای پخش در مرورگر مناسب نیست (مثلاً فایل فشرده یا AVI). آن را دانلود کنید.' },
}

/**
 * What may play around a film or an episode: ads (the ads module on and enabled; who is exempt is decided when an ad
 * is asked for) and the site's intro (cinema settings). Game trailers and embedded players get neither.
 */
async function playerBreaks(path: string, cinema: Awaited<ReturnType<typeof getCinemaSettings>> | null): Promise<PlayerBreaksConfig | null> {
  const adsOn = await isModuleEnabled('ads').catch(() => false)
  const config = adsOn ? await getAdsConfig().catch(() => null) : null
  const ads = config?.enabled ? { pacing: config.player, label: config.label } : null
  const intro = cinema?.introUrl ? { src: cinema.introUrl, skipAfter: cinema.introSkipAfter, frequency: cinema.introFrequency } : null
  return ads || intro ? { path, ads, intro } : null
}

/** /watch/:id — the in-site player for film, episode and game-trailer links. */
export default async function WatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ id }, { t }, theme, requestHeaders] = await Promise.all([params, searchParams, getServerTheme(), headers()])
  const result = await watchSource(id, t || null, new Headers(requestHeaders))
  const cinema = result.ok && result.playback !== 'embed' ? await getCinemaSettings().catch(() => null) : null
  const breaks = result.ok && result.ownerType !== 'game' && result.playback !== 'embed' ? await playerBreaks(result.backPath, cinema) : null
  return <>
    <SiteHeader theme={theme} />
    <main className="vp-page" dir="rtl">
      <div className="container">
        {result.ok ? <>
          <header className="vp-head">
            <div>
              <Link href={result.backPath} className="vp-back">← بازگشت به صفحهٔ {result.title || 'فیلم'}</Link>
              <h1>{result.title}{result.subtitle && <small>{result.subtitle}</small>}</h1>
            </div>
            <div className="vp-tags">{result.quality && <span dir="ltr">{result.quality}</span>}{result.label && <span>{result.label}</span>}</div>
          </header>
          <VideoPlayer audioTracks={result.audioTracks} subtitles={result.subtitles} embeddedSubtitles={result.embeddedSubtitles} subtitlePreference={result.subtitlePreference} subtitleStyle={result.subtitleStyle} defaultSubtitleStyle={cinema?.subtitleStyle} ownSubtitles={cinema?.viewerSubtitleFiles ?? true} src={result.src} playback={result.playback as 'hls' | 'video' | 'maybe' | 'embed'} poster={result.poster} title={[result.title, result.subtitle].filter(Boolean).join(' — ')} resumeKey={`${result.resumeKey}:${result.id}`} progressLinkId={result.progressEnabled ? result.id : undefined} serverResume={result.serverResume} nextEpisode={result.nextEpisode} downloadHref={result.downloadHref} breaks={breaks} externalPlayers={cinema?.externalPlayers} />
        </> : <section className="vp-denied">
          <h1>{REASON[result.reason].title}</h1>
          <p>{REASON[result.reason].text}</p>
          <div>
            {REASON[result.reason].action && <Link href={REASON[result.reason].action!.href} className="btn btn-primary">{REASON[result.reason].action!.label}</Link>}
            <Link href={`${result.backPath}#${result.reason === 'buy' ? 'buy' : 'downloads'}`} className={result.reason === 'buy' ? 'btn btn-primary' : 'btn btn-ghost'}>{result.reason === 'buy' ? 'خرید از صفحهٔ این مورد' : 'بازگشت'}</Link>
          </div>
        </section>}
      </div>
    </main>
  </>
}
