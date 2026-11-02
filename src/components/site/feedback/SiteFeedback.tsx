import type { ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import styles from './feedback.module.css'

/** Presentation shared by the existing route-error and not-found boundaries. */
export default function SiteFeedback({ label, title, description, icon, alert = false, children, search }: {
  label: string; title: string; description: string; icon: string; alert?: boolean; children: ReactNode; search?: ReactNode
}) {
  return <main className={styles.page}>
    <section className={styles.panel} aria-labelledby="feedback-title">
      <div className={styles.symbol} aria-hidden="true"><Icon name={icon} size={48} /></div>
      <div className={styles.content}>
        <span className={styles.label}>{label}</span>
        <h1 id="feedback-title">{title}</h1>
        <p role={alert ? 'alert' : undefined}>{description}</p>
        <div className={styles.actions}>{children}</div>
      </div>
    </section>
    {search && <div className={styles.searchPanel}>{search}</div>}
  </main>
}
