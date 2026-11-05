import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { headers } from 'next/headers'
import { requireModule } from '@/extensions/server/modules'
import { isExtensionEnabled } from '@/extensions/server/state'
import { notFound, redirect } from 'next/navigation'
import { getSettings } from '@/modules/settings/server'
import { adDocument } from '@/modules/forwarder/domain/forwarder'
import { resolveForward } from '@/modules/forwarder/server/forwarder'
import ForwardCountdown from '@/components/forwarder/ForwardCountdown'

export const forwarderMetadata: Metadata = { title: 'در حال انتقال', robots: { index: false, follow: false }, referrer: 'origin' }

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|telegrambot|whatsapp|discord|curl|wget|python|go-http/i

function Ad({ html, label }: { html: string; label: string }) {
  if (!html.trim()) return null
  // Ad code runs in a sandboxed frame without the site's origin, cookies or storage.
  return <iframe className="fw-ad" title={label} srcDoc={adDocument(html)} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" loading="lazy" referrerPolicy="origin" />
}

/** The "redirecting…" page for a short link or an outside address. */
export async function ForwarderPage({ segment, rawTarget, automatic = false }: { segment: string; rawTarget?: string; automatic?: boolean }) {
  const extensionOn = await isExtensionEnabled('forwarder')
  if (!automatic) {
    await requireModule('forwarder')
    if (!extensionOn) notFound()
  }
  const agent = (await headers()).get('user-agent') || ''
  const [result, site] = await Promise.all([resolveForward(segment, { count: !BOT.test(agent), rawTarget, automatic }), getSettings().catch(() => ({} as Record<string, string>))])
  if (result.ok && result.bypass) redirect(result.url)
  if (!extensionOn) notFound()
  const brand = site.brandName || 'موبوکام'
  const s = result.settings
  return <main className="fw-page" dir="rtl">
    <div className="fw-card">
      <Link href="/" className="fw-brand"><span aria-hidden="true">{brand.slice(0, 1)}</span>{brand}</Link>
      <Ad html={s.adTop} label="تبلیغ" />
      {result.ok ? <>
        <h1>{s.title || 'در حال انتقال…'}</h1>
        {result.title && <p className="fw-link-title">{result.title}</p>}
        <p className="fw-dest">مقصد: <b dir="ltr">{result.host}</b></p>
        <p className="fw-url" dir="ltr">{result.url}</p>
        <ForwardCountdown url={result.url} seconds={result.countdown} auto={s.autoRedirect} />
        {s.message && <p className="fw-note">{s.message}</p>}
      </> : <>
        <h1>انتقال انجام نشد</h1>
        <p className="fw-note">{result.message}</p>
        <Link href="/" className="fw-go">بازگشت به صفحهٔ اصلی</Link>
      </>}
      {s.bannerImage && (s.bannerLink
        ? <a href={s.bannerLink} target="_blank" rel="noopener sponsored" className="fw-banner"><img src={s.bannerImage} alt="تبلیغ" /></a>
        : <div className="fw-banner"><img src={s.bannerImage} alt="تبلیغ" /></div>)}
      <Ad html={s.adBottom} label="تبلیغ" />
    </div>
  </main>
}
