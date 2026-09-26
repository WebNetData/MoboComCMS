'use client'

import { useEffect, useState } from 'react'
import ConnectionGuide from '@/components/ConnectionGuide'
import QRCode from 'qrcode'
import type { ConnectKit } from '@/modules/subscriptions/server/subs'
import { useI18n } from '@/i18n/LocaleProvider'

export default function ConnectPanel({ kit, loading, onReload, onClose, onAction, compact }: { kit: ConnectKit; loading?: boolean; onReload: () => void; onClose: () => void; onAction?: (action: string) => void; compact?: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const encryptedLink = kit.happUrl || kit.primary?.url || ''
  const qrLink = encryptedLink
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  useEffect(() => {
    let alive = true
    setQr('')
    if (!qrLink) return
    QRCode.toDataURL(qrLink, { width: 420, margin: 1, color: { dark: '#07100b', light: '#ffffff' } }).then(value => alive && setQr(value)).catch(() => alive && setQr(''))
    return () => { alive = false }
  }, [qrLink])

  async function copy() {
    try { await navigator.clipboard.writeText(encryptedLink); setCopied(true); setCopyError(''); setTimeout(() => setCopied(false), 1500) }
    catch { setCopyError(fa ? 'کپی انجام نشد؛ اجازه دسترسی به کلیپ‌بورد را بررسی کنید.' : 'Clipboard access was denied.') }
  }

  const ready = Boolean(encryptedLink) && Boolean(kit.primary?.healthy)

  return <section className={`card connect-panel happ-connect ${compact ? 'connect-compact' : ''}`}>
    <div className="happ-connect-head">
      <div className="happ-app-mark">H</div>
      <div className="min-w-0"><div className="happ-kicker">HAPP SECURE LINK</div><h4>{fa ? 'اتصال خصوصی با Happ' : 'Private connection with Happ'}</h4><p>{kit.planName} · <span className="num">{kit.username}</span></p></div>
      <button className="happ-close" onClick={onClose} aria-label={fa ? 'بستن' : 'Close'}>×</button>
    </div>

    <div className={`happ-security ${ready ? 'is-ready' : 'is-waiting'}`}>
      <span className="happ-security-icon">{ready ? '✓' : '!'}</span>
      <div><b>{ready ? (fa ? 'لینک رمزگذاری‌شده آماده است' : 'Encrypted subscription is ready') : (fa ? 'اتصال هنوز آماده نیست' : 'Connection is not ready yet')}</b><p>{fa ? 'لینک اصلی از VPN Panel خوانده می‌شود و قبل از نمایش با فرمت crypt5 مخصوص Happ رمزگذاری می‌شود؛ لینک خام پنل نمایش داده نمی‌شود.' : 'The source URL is read from the VPN panel and encrypted as a Happ crypt5 link before it is shown; the raw panel URL is never exposed.'}</p></div>
    </div>

    <ConnectionGuide hasLink={Boolean(encryptedLink)} importControls={<><div className="happ-import-grid">
      <div className="happ-qr-frame">{qr ? <img src={qr} alt={fa ? 'کد اتصال Happ' : 'Happ connection QR'} /> : <span>{fa ? 'در حال ساخت QR…' : 'Creating QR…'}</span>}<i className="happ-qr-logo">H</i></div>
      <div className="happ-import-copy"><span className="happ-step">01</span><h5>{fa ? 'در برنامه Happ وارد کن' : 'Import into Happ'}</h5><p>{fa ? 'همین لینک رمزگذاری‌شده را باز یا کپی کن؛ آدرس خام VPN Panel به کاربر نمایش داده نمی‌شود.' : 'Open or copy this encrypted link; the raw VPN panel URL is not exposed to the customer.'}</p>{encryptedLink && <a className="btn btn-primary happ-open" href={encryptedLink}>{fa ? 'باز کردن در Happ' : 'Open in Happ'} <span>↗</span></a>}<button className="btn btn-ghost" onClick={copy}>{copied ? (fa ? 'کپی شد ✓' : 'Copied ✓') : (fa ? 'کپی لینک رمزگذاری‌شده' : 'Copy encrypted link')}</button></div>
    </div>

    <div className="happ-link-box" dir="ltr"><span className="happ-lock">◆</span><code>{encryptedLink || (fa ? 'در حال آماده‌سازی…' : 'Preparing…')}</code><span className="badge badge-green">CRYPT5</span></div></>} />
    {copyError && <p className="happ-error" role="alert">{copyError}</p>}
    {kit.happError && <p className="happ-note">{kit.happError}</p>}
    {kit.linksError && <p className="happ-error">{kit.linksError}</p>}
    {kit.syncMessage && <p className="happ-note">{fa ? 'آخرین همگام‌سازی کامل نبود؛ دوباره تلاش کن.' : 'The last sync was incomplete. Try again.'}</p>}
    <div className="happ-connect-actions"><button className="btn btn-ghost" onClick={onReload} disabled={loading}>↻ {fa ? 'بررسی دوباره' : 'Check again'}</button>{onAction && <button className="btn btn-ghost" onClick={() => confirm(fa ? 'لینک قبلی پنل باطل و لینک جدید ساخته شود؟' : 'Rotate the current panel subscription link?') && onAction('rotate')}>{fa ? 'تعویض لینک ساب' : 'Rotate subscription link'}</button>}</div>
  </section>
}
