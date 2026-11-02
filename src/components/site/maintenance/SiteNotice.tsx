import type { ReactNode } from 'react'
import Countdown from '@/components/site/maintenance/Countdown'
import './site-notice.css'

const path = (children: ReactNode) => <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>

/** One line of drawing each: they share a size and stroke, so any of them sits in any design. */
export const SITE_ICON_ART: Record<string, ReactNode> = {
  gear: path(<><g className="sn-turn"><circle cx="24" cy="24" r="6" /><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M36.7 11.3l-4.2 4.2M15.5 32.5l-4.2 4.2" /><circle cx="24" cy="24" r="13" /></g></>),
  wrench: path(<path className="sn-swing" d="M31 8a9 9 0 0 0-8.6 11.700L8.800 33.300a3.800 3.800 0 0 0 5.400 5.400l13.600-13.600A9 9 0 0 0 40 16l-5.800 5.800-6-6L34 10a9 9 0 0 0-3-2Z" />),
  hammer: path(<g className="sn-swing"><path d="M27 12 16 23l9 9 11-11" /><path d="m21 28-11 11a3 3 0 0 1-4-4l11-11" /><path d="M24 9h10l6 6v5l-4 1" /></g>),
  rocket: path(<g className="sn-lift"><path d="M24 6c6 4 9 10 9 18l-3 8H18l-3-8c0-8 3-14 9-18Z" /><circle cx="24" cy="20" r="3.500" /><path d="m15 24-5 6 6 2M33 24l5 6-6 2M21 37v4M27 37v4" /></g>),
  sparkle: path(<g className="sn-glint"><path d="M24 8c1.600 8.400 7.600 14.400 16 16-8.400 1.600-14.400 7.600-16 16-1.600-8.400-7.600-14.400-16-16 8.400-1.600 14.400-7.600 16-16Z" /><path d="M38 8v6M35 11h6" /></g>),
  clock: path(<><circle cx="24" cy="24" r="17" /><path className="sn-turn" d="M24 13v11l7 5" /></>),
  shield: path(<><path d="M24 6 9 12v11c0 9.500 6.200 16.200 15 19 8.800-2.800 15-9.500 15-19V12L24 6Z" /><path className="sn-glint" d="m17 24 5 5 9-10" /></>),
}

export type SiteNoticeProps = { title: string; message: string; design: string; effect: string; icon: string; reopensAt: string; name?: string; preview?: boolean }

/** What visitors see while the whole site is closed. The owner's words are plain text; the scene behind them is decoration. */
export default function SiteNotice({ title, message, design, effect, icon, reopensAt, name, preview = false }: SiteNoticeProps) {
  const Heading = preview ? 'h3' : 'h1'
  const Root = preview ? 'div' : 'main'
  return <Root className={`sn is-${design} fx-${effect}${preview ? ' is-preview' : ''}`} dir="rtl">
    <div className="sn-scene" aria-hidden="true"><i /><i /><i /><i /></div>
    <section className="sn-card" aria-labelledby={preview ? 'sn-title-preview' : 'sn-title'}>
      <div className="sn-bar" aria-hidden="true"><i /><i /><i /></div>
      <span className="sn-icon">{SITE_ICON_ART[icon] || SITE_ICON_ART.gear}</span>
      {name && <p className="sn-brand">{name}</p>}
      <Heading id={preview ? 'sn-title-preview' : 'sn-title'} className="sn-title">{title}</Heading>
      <p className="sn-text">{message}</p>
      <div className="sn-progress" aria-hidden="true"><span /></div>
      {reopensAt && <Countdown until={reopensAt} />}
      {!preview && <a className="sn-login" href="/login">ورود به حساب</a>}
    </section>
  </Root>
}
