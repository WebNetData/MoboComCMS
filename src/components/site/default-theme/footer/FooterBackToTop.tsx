'use client'

import styles from './Footer.module.css'

export default function FooterBackToTop({ label }: { label: string }) {
  function goToTop() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })
    const target = document.querySelector<HTMLElement>('header a[href="/"]') || document.querySelector<HTMLElement>('main')
    if (!target) return
    if (!target.hasAttribute('tabindex') && target.tagName !== 'A') {
      target.setAttribute('tabindex', '-1')
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
    }
    target.focus({ preventScroll: true })
  }
  return <button className={styles.backToTop} type="button" onClick={goToTop}><span>{label}</span><span className={styles.upIcon} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg></span></button>
}
