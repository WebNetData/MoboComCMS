'use client'

import { useEffect, useState } from 'react'

const Icon = ({ path, fill = false }: { path: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
)
const TELEGRAM = 'M21.5 4.3 18.4 19c-.2 1-.9 1.300-1.800.800l-4.800-3.500-2.300 2.200c-.3.300-.5.500-1 .500l.3-4.900 9-8.100c.400-.300-.1-.5-.600-.2L6 12.800l-4.800-1.500c-1-.300-1-1 .2-1.500L20.200 3c.9-.300 1.600.200 1.300 1.300Z'
const X = 'M17.800 3h3.100l-6.800 7.700L22 21h-6.200l-4.900-6.300L5.300 21H2.200l7.200-8.200L1.800 3h6.400l4.400 5.800L17.800 3Zm-1.100 16.200h1.700L7.300 4.700H5.500l11.200 14.500Z'
const WHATSAPP = 'M12 2a10 10 0 0 0-8.600 15.100L2 22l5-1.300A10 10 0 1 0 12 2Zm5.800 14.100c-.200.700-1.400 1.300-2 1.400-.500.100-1.200.100-1.900-.100a13 13 0 0 1-5.400-4.800c-.600-.900-1.100-2-.900-3 .100-.800.600-1.400 1-1.700.300-.200.700-.200.900-.100l.700 1.700c.100.200.100.500 0 .700l-.600.800c-.1.200-.2.400 0 .600.700 1.200 1.700 2.100 3 2.700.2.100.4.100.5-.1l.800-1c.2-.2.400-.3.700-.200l1.700.800c.3.100.4.300.4.500 0 .200 0 .600-.1.800Z'

/**
 * The actions that stay beside a long article: how much of it has been read, sharing, the link, and the way back
 * to the top. Beside the text on a wide screen, a bar at the bottom edge on a narrow one.
 */
export default function ArticleRail({ title, fa = true }: { title: string; fa?: boolean }) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { setUrl(window.location.href.split('#')[0]) }, [])
  const L = (en: string, persian: string) => (fa ? persian : en)
  const share = (href: string) => (url ? href : undefined)

  async function copy() {
    try { await navigator.clipboard.writeText(url || window.location.href) } catch { return }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <aside className="jp-rail no-print" aria-label={L('Article actions', 'ابزارهای نوشته')}>
      <span className="jp-rail-meter" role="img" aria-label={L('Reading progress', 'میزان مطالعه')}><b aria-hidden="true" /></span>
      <a className="jp-rail-btn" target="_blank" rel="noreferrer" href={share(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`)} aria-label={L('Share on Telegram', 'اشتراک در تلگرام')} title={L('Telegram', 'تلگرام')}><Icon path={TELEGRAM} fill /></a>
      <a className="jp-rail-btn" target="_blank" rel="noreferrer" href={share(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`)} aria-label={L('Share on X', 'اشتراک در ایکس')} title="X"><Icon path={X} fill /></a>
      <a className="jp-rail-btn" target="_blank" rel="noreferrer" href={share(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`)} aria-label={L('Share on WhatsApp', 'اشتراک در واتس‌اپ')} title={L('WhatsApp', 'واتس‌اپ')}><Icon path={WHATSAPP} fill /></a>
      <button type="button" className={`jp-rail-btn${copied ? ' is-done' : ''}`} onClick={() => void copy()} aria-label={L('Copy link', 'کپی پیوند')} title={L('Copy link', 'کپی پیوند')}>
        <Icon path={copied ? 'M5 12.5 10 17.500 19 7' : 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1'} />
      </button>
      <span className="sr-only" role="status">{copied ? L('Link copied', 'پیوند کپی شد') : ''}</span>
      <button type="button" className="jp-rail-btn is-top" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} aria-label={L('Back to top', 'بازگشت به بالا')} title={L('Back to top', 'بازگشت به بالا')}>
        <Icon path="M12 19V5M5.500 11.500 12 5l6.500 6.500" />
      </button>
    </aside>
  )
}
