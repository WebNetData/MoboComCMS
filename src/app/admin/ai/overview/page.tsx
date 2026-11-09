'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { useControlNavigation } from '@/components/admin/navigation/ControlNavigation'
import { keylessAi } from '@/modules/ai/domain/ai'
import styles from './page.module.css'

type Status = { provider: string; label: string; model: string; free: boolean; ready: boolean }

const ABOUT: Record<string, [string, string]> = {
  '/admin/ai': ['مقاله، توضیح محصول، پاسخ دیدگاه و تالار و توضیح متا؛ همه اول پیش‌نویس و با تأیید شما.', 'Articles, product copy, replies and meta descriptions — always drafts you approve.'],
  '/admin/ai/operations': ['کارهای پنل را بخواهید؛ دستیار برنامه را پیشنهاد می‌کند و فقط پس از تأیید شما اجرا می‌شود.', 'Ask for Admin work; the assistant proposes a plan and runs only after you confirm.'],
  '/admin/ai/production': ['تولید گروهی متن و تصویر برای مطالب و محصولات با صف و بازبینی.', 'Batch text and image generation for posts and products, queued and reviewed.'],
  '/admin/ai/sales': ['نتیجهٔ واقعی کمپین‌ها، فرصت کمپین هر دسته، سفارش‌های نیمه‌تمام و پیشنهاد کالای مرتبط.', 'Real campaign results, category opportunities, unpaid orders and related products.'],
  '/admin/ai?tab=settings': ['سرویس پیش‌فرض، کلیدها، مسیریابی هر کاربرد و اتصال شخصی مدیر.', 'Default provider, keys, per-purpose routing and personal connections.'],
  '/admin/ai/monitoring': ['وضعیت درخواست‌ها، خطاها، مصرف گزارش‌شده و کیفیت پاسخ‌های پشتیبانی.', 'Requests, errors, reported usage and support answer quality.'],
}

export default function AiOverviewPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (f: string, e: string) => fa ? f : e
  const { groups, loading, failed, retry } = useControlNavigation()
  const sections = groups.filter(group => group.area === 'ai').map(group => ({ ...group, items: group.items.filter(item => item.href !== '/admin/ai/overview') })).filter(group => group.items.length)
  const [status, setStatus] = useState<Status | null | 'none'>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/ai', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (controller.signal.aborted) return
        if (!data?.config) { setStatus('none'); return }
        const provider = (data.providers || []).find((p: { id: string }) => p.id === data.config.provider)
        setStatus({ provider: data.config.provider, label: provider?.label || data.config.provider, model: data.config.effectiveModel, free: !!provider?.free, ready: data.config.hasKey || keylessAi(data.config.provider) })
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('none') })
    return () => controller.abort()
  }, [])

  const count = sections.reduce((sum, group) => sum + group.items.length, 0)

  return <div className={styles.page} aria-busy={loading}>
    <header className={styles.hero}>
      <span className={styles.aurora} aria-hidden="true" />
      <span className={styles.orb} aria-hidden="true"><Icon name="sparkles" size={30} /></span>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>{L('مرکز هوش مصنوعی', 'AI center')}</p>
        <h1>{L('هوش مصنوعی سایت', 'Site AI')}</h1>
        <p>{L('دستیارها، تولید محتوا، اتصال سرویس‌ها و پایش مصرف در یک جا. هر نتیجه پیش‌نویسی است که شما بازبینی و تأیید می‌کنید.', 'Assistants, generation, providers and usage in one place. Every result is a draft you review and approve.')}</p>
      </div>
      {status && status !== 'none' && <dl className={styles.status}>
        <div><dt>{L('سرویس پیش‌فرض', 'Default provider')}</dt><dd>{status.label}</dd></div>
        <div><dt>{L('مدل', 'Model')}</dt><dd dir="ltr">{status.model}</dd></div>
        <div><dt>{L('وضعیت', 'State')}</dt><dd><span className={status.ready ? styles.ready : styles.waiting}>{status.ready ? L('آماده', 'Ready') : L('نیاز به کلید', 'Needs a key')}</span>{status.free && <span className={styles.free}>{L('رایگان', 'Free')}</span>}</dd></div>
      </dl>}
    </header>

    {failed ? <div className="card" role="alert"><h2 className="h3">{L('فهرست ابزارها دریافت نشد', 'Tools could not be loaded')}</h2><button className="btn btn-primary" type="button" onClick={retry}>{L('تلاش دوباره', 'Try again')}</button></div>
      : loading ? <div className={styles.skeleton} role="status" aria-label={L('در حال دریافت ابزارها…', 'Loading tools…')}>{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</div>
      : !count ? <p className={styles.empty}>{L('ابزار هوش مصنوعی‌ای برای دسترسی شما فعال نیست.', 'No AI tools are available to you.')}</p>
      : sections.map(group => <section key={group.id} className={styles.section} aria-labelledby={`ai-${group.id}`}>
        <header><span className={styles.sectionIcon} aria-hidden="true"><Icon name={group.icon} size={18} /></span><h2 id={`ai-${group.id}`}>{group.title}</h2><span className={styles.count}>{group.items.length.toLocaleString(fa ? 'fa-IR' : 'en')}</span></header>
        <ul className={styles.cards}>{group.items.map(item => <li key={item.href}>
          <Link href={item.href} className={styles.card}>
            <span className={styles.tile} aria-hidden="true"><Icon name={item.icon} size={22} /></span>
            <b>{item.label}</b>
            <span className={styles.about}>{ABOUT[item.href] ? L(...ABOUT[item.href]) : L('ابزار افزوده‌شده به بخش هوش مصنوعی', 'An AI tool added by an extension')}</span>
            <span className={styles.go} aria-hidden="true">{fa ? '←' : '→'}</span>
          </Link>
        </li>)}</ul>
      </section>)}
  </div>
}
