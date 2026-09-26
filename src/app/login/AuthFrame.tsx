'use client'

import type { ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { useSite } from '@/components/site/SiteProvider'

export default function AuthFrame({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const site = useSite()
  const fa = locale === 'fa'
  const features = [
    { icon: 'devices', title: fa ? 'همه دستگاه‌ها، یک حساب' : 'All your devices. One account.', text: fa ? 'اشتراک‌ها و اتصال‌های خود را یک‌جا مدیریت کنید.' : 'Keep your subscriptions and connections together.' },
    { icon: 'wallet', title: fa ? 'مدیریت ساده و شفاف' : 'Everything, at a glance.', text: fa ? 'مصرف، کیف پول و سفارش‌ها همیشه در دسترس شماست.' : 'Your usage, wallet and orders, always within reach.' },
    { icon: 'chat', title: fa ? 'پشتیبانی در کنار شما' : 'A little help, whenever you need it.', text: fa ? 'از پنل خود با تیم پشتیبانی در ارتباط باشید.' : 'Contact the support team directly from your account.' },
  ]

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <span className="auth-eyebrow"><span aria-hidden="true" />{site.brand}</span>
          <h2 id="auth-story-title">{fa ? 'دنیای شما.' : 'Your world.'}<br /><em>{fa ? 'بدون مرز.' : 'Within reach.'}</em></h2>
          <p className="auth-story-intro">{fa ? 'فضایی برای مدیریت اتصال‌های شما. ساده، منظم و همیشه در دسترس.' : 'A space for your connected life. Simple, organized, and always yours.'}</p>
          <div className="auth-orbit" aria-hidden="true">
            <svg viewBox="0 0 440 190" fill="none">
              <defs><radialGradient id="auth-orbit-glow"><stop stopColor="#119bff" stopOpacity=".2" /><stop offset="1" stopColor="#119bff" stopOpacity="0" /></radialGradient></defs>
              <ellipse cx="220" cy="97" rx="205" ry="92" fill="url(#auth-orbit-glow)" />
              <g stroke="currentColor" strokeWidth=".8"><ellipse cx="220" cy="97" rx="166" ry="50" /><ellipse cx="220" cy="97" rx="125" ry="82" transform="rotate(-17 220 97)" /><ellipse cx="220" cy="97" rx="67" ry="83" transform="rotate(30 220 97)" /><path d="M54 97h332M99 59c65 34 177 34 242 0M99 135c65-34 177-34 242 0" /></g>
              <g fill="#60d8ff"><circle cx="68" cy="78" r="4" /><circle cx="325" cy="52" r="5" /><circle cx="369" cy="118" r="4" /><circle cx="187" cy="172" r="3" /></g>
              <circle cx="220" cy="97" r="26" fill="#0c2946" stroke="#358ed0" /><path d="m220 82 11 5v8c0 8-11 15-11 15s-11-7-11-15v-8l11-5Z" stroke="#75ddff" strokeWidth="1.7" /><path d="m215 95 4 4 7-8" stroke="#75ddff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="auth-feature-list">
            {features.map(feature => <div className="auth-feature" key={feature.icon}><span><Icon name={feature.icon} size={20} /></span><div><h3>{feature.title}</h3><p>{feature.text}</p></div></div>)}
          </div>
          <p className="auth-story-foot">{fa ? 'اتصال بهتر، از اینجا شروع می‌شود.' : 'Your next connection starts here.'}</p>
        </section>
        <section className="auth-form-panel">{children}</section>
      </div>
    </main>
  )
}
