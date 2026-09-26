'use client'
import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { guidePlatforms, platformNames, type GuidePlatform, type ConnectionGuideConfig } from '@/modules/site/domain/connection-guide'

export default function ConnectionGuide({ importControls, hasLink }: { importControls: React.ReactNode; hasLink: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const pathname = usePathname()
  const id = useId()
  const [platform, setPlatform] = useState<GuidePlatform>('android')
  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<ConnectionGuideConfig | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const agent = navigator.userAgent
    setPlatform(/Android/i.test(agent) ? 'android' : /iPhone|iPad|iPod/i.test(agent) || /Macintosh/i.test(agent) && navigator.maxTouchPoints > 1 ? 'ios' : /Windows/i.test(agent) ? 'windows' : /Mac/i.test(agent) ? 'macos' : /Linux/i.test(agent) ? 'linux' : 'android')
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setError(false)
    fetch('/api/public/connection-guide', { cache: 'no-store', signal: abort.signal }).then(response => { if (!response.ok) throw Error(); return response.json() }).then(setConfig).catch(() => { if (!abort.signal.aborted) setError(true) })
    return () => abort.abort()
  }, [revision])
  const titles = fa ? ['نصب برنامه', 'افزودن اشتراک', 'اتصال و بررسی'] : ['Install app', 'Import subscription', 'Connect and check']
  if (error) return <div className="connection-guide"><p role="alert">{fa ? 'دریافت راهنما ممکن نشد.' : 'Could not load the guide.'}</p><button className="btn btn-ghost mt-3" onClick={() => setRevision(value => value + 1)}>{fa ? 'تلاش دوباره' : 'Retry'}</button>{hasLink && importControls}</div>
  if (!config) return <p role="status" className="muted mt-4">{fa ? 'در حال دریافت راهنمای اتصال…' : 'Loading connection guide…'}</p>
  const guide = config.platforms[platform]
  const language = fa ? 'fa' : 'en'
  return <div className="connection-guide">
    <h5 className="font-bold text-lg">{fa ? 'قدم‌به‌قدم تا اتصال' : 'Get connected, step by step'}</h5>
    <p className="muted text-sm mt-2">{fa ? 'دستگاهی را انتخاب کنید که می‌خواهید اشتراک را روی آن استفاده کنید.' : 'Choose the device where you want to use this subscription.'}</p>
    <div className="guide-platforms" role="group" aria-label={fa ? 'انتخاب دستگاه' : 'Choose device'}>{guidePlatforms.map(device => <button key={device} type="button" aria-pressed={device === platform} onClick={() => { setPlatform(device); setStep(0) }}>{platformNames[device]}</button>)}</div>
    <nav className="guide-steps" aria-label={fa ? 'مرحله‌های اتصال' : 'Connection steps'}>{titles.map((title, index) => <button key={title} type="button" aria-current={step === index ? 'step' : undefined} aria-controls={`${id}-step`} onClick={() => setStep(index)}><span>{index + 1}</span>{title}</button>)}</nav>
    <section id={`${id}-step`} className="guide-step-content" aria-live="polite" aria-label={titles[step]}>
      <h5>{titles[step]}</h5>
      <p className="guide-copy">{guide[(['install', 'import', 'connect'] as const)[step]][language]}</p>
      {step === 0 && (guide.downloadUrl ? <a className="btn btn-primary" href={guide.downloadUrl} target="_blank" rel="noopener noreferrer">{fa ? 'دریافت Happ برای' : 'Get Happ for'} {platformNames[platform]} ↗</a> : <p className="muted">{fa ? 'لینک دانلود هنوز تنظیم نشده؛ از پشتیبانی دریافت کنید.' : 'Download link is not configured. Contact support.'}</p>)}
      {step === 1 && <>{hasLink ? importControls : <p role="status" className="happ-note">{fa ? 'لینک این اشتراک هنوز آماده نیست. «بررسی دوباره» را بزنید یا با پشتیبانی تماس بگیرید.' : 'This subscription link is not ready. Select “Check again” or contact support.'}</p>}</>}
      {step === 2 && <Link className="btn btn-ghost" href={pathname.startsWith('/miniapp') ? '/miniapp/support' : '/dashboard/tickets'}>{fa ? 'برای اتصال کمک می‌خواهم' : 'Get connection help'}</Link>}
    </section>
    <div className="flex flex-wrap gap-2 mt-4">{step > 0 && <button className="btn btn-ghost" type="button" onClick={() => setStep(value => value - 1)}>{fa ? 'مرحله قبل' : 'Back'}</button>}{step < 2 && <button className="btn btn-primary" type="button" onClick={() => setStep(value => value + 1)}>{fa ? 'مرحله بعد' : 'Next step'}</button>}</div>
    <details className="guide-troubleshoot"><summary>{fa ? 'مشکل در اتصال؟ راهنمای رفع خطا' : 'Having trouble? Troubleshooting guide'}</summary><p className="guide-copy">{guide.troubleshoot[language]}</p><Link className="text-link" href={pathname.startsWith('/miniapp') ? '/miniapp/support' : '/dashboard/tickets'}>{fa ? 'ارتباط با پشتیبانی' : 'Contact support'}</Link></details>
  </div>
}
