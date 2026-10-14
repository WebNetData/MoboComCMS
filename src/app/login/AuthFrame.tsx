'use client'

import type { ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { useSite } from '@/components/site/SiteProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

const COPY = {
  fa: {
    title: 'دنیای شما.', accent: 'بدون مرز.', intro: 'خرید، سرگرمی و دانلود در یک جا. ساده، امن و همیشه در دسترس.',
    wallet: ['کیف پول', 'شارژ آنی، پرداخت با یک لمس'], order: ['سفارش شما تحویل شد', 'همین حالا'], chat: ['پاسخ پشتیبانی رسید', 'تیکت شما پاسخ گرفت'],
    sectionsLabel: 'بخش‌های سایت', sections: ['فروشگاه', 'مجله', 'موزیک', 'فیلم و سریال', 'بازی', 'نرم‌افزار', 'تالار'],
    features: [
      ['devices', 'یک حساب برای همه‌چیز', 'فروشگاه، مجله، موزیک، فیلم، بازی، نرم‌افزار و تالار با یک حساب.'],
      ['wallet', 'مدیریت ساده و شفاف', 'سفارش‌ها، فاکتورها و کیف پول همیشه در دسترس شماست.', 'سفارش‌ها، فاکتورها، کیف پول و اشتراک ویژه همیشه در دسترس شماست.'],
      ['chat', 'پشتیبانی در کنار شما', 'از پنل خود با تیم پشتیبانی در ارتباط باشید.'],
    ],
    foot: 'ورود امن: ارتباط رمزگذاری‌شده، کد یک‌بارمصرف و ورود دو مرحله‌ای.',
  },
  en: {
    title: 'Your world.', accent: 'Within reach.', intro: 'Shopping, entertainment and downloads in one place. Simple, safe and always yours.',
    wallet: ['Wallet', 'Instant top-up, one-tap pay'], order: ['Your order was delivered', 'Just now'], chat: ['Support replied', 'Your ticket has an answer'],
    sectionsLabel: 'Sections', sections: ['Store', 'Magazine', 'Music', 'Cinema', 'Games', 'Software', 'Forum'],
    features: [
      ['devices', 'One account for everything', 'Shop, magazine, music, films, games, software and forum in one account.'],
      ['wallet', 'Everything, at a glance.', 'Your orders, invoices and wallet, always within reach.', 'Your orders, invoices, wallet and VIP membership, always within reach.'],
      ['chat', 'A little help, whenever you need it.', 'Contact the support team directly from your account.'],
    ],
    foot: 'Secure sign-in: encrypted connection, one-time codes and 2-step sign-in.',
  },
}

/** The frame of the sign-in and sign-up pages: the site's story on one side, the form on the other. */
export default function AuthFrame({ children, variant = 'login' }: { children: ReactNode; variant?: 'login' | 'register' }) {
  const { locale } = useI18n()
  const site = useSite()
  const copy = COPY[locale === 'fa' ? 'fa' : 'en']
  const vipOn = useModuleEnabled('membership')

  return (
    <main className={`auth-page auth-page-${variant}`}>
      <div className="auth-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <span className="auth-eyebrow"><span aria-hidden="true" />{site.brand}</span>
          <h2 id="auth-story-title">{copy.title}<br /><em>{copy.accent}</em></h2>
          <p className="auth-story-intro">{copy.intro}</p>

          {/* A glimpse of the account: three moments a member sees there. Decorative. */}
          <div className="auth-showcase" aria-hidden="true">
            <div className="auth-glass auth-glass-wallet">
              <span className="auth-glass-icon"><Icon name="wallet" size={18} /></span>
              <div><b>{copy.wallet[0]}</b><small>{copy.wallet[1]}</small></div>
              <span className="auth-glass-bar"><i /></span>
            </div>
            <div className="auth-glass auth-glass-order">
              <span className="auth-glass-icon is-ok"><Icon name="check" size={18} /></span>
              <div><b>{copy.order[0]}</b><small>{copy.order[1]}</small></div>
            </div>
            <div className="auth-glass auth-glass-chat">
              <span className="auth-glass-icon is-chat"><Icon name="chat" size={18} /></span>
              <div><b>{copy.chat[0]}</b><small>{copy.chat[1]}</small></div>
            </div>
          </div>

          <ul className="auth-sections" aria-label={copy.sectionsLabel}>{copy.sections.map((name) => <li key={name}>{name}</li>)}</ul>

          <div className="auth-feature-list">
            {copy.features.map(([icon, title, text, withVip]) => <div className="auth-feature" key={icon}><span><Icon name={icon} size={20} /></span><div><h3>{title}</h3><p>{vipOn && withVip ? withVip : text}</p></div></div>)}
          </div>
          <p className="auth-story-foot"><Icon name="shield" size={16} />{copy.foot}</p>
        </section>
        <section className="auth-form-panel">{children}</section>
      </div>
    </main>
  )
}
