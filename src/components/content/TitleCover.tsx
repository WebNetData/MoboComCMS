import type { CSSProperties, ReactNode } from 'react'
import styles from './TitleCover.module.css'

/** A decorative cover keeps the page's only H1 readable over any editorial image. */
export default function TitleCover({ title, cover, eyebrow, children }: {
  title: string
  cover?: string | null
  eyebrow?: ReactNode
  children?: ReactNode
}) {
  const image = cover || '/images/network-earth.webp'
  return (
    <header className={`${styles.cover} ${cover ? '' : styles.branded}`} style={{ '--title-cover-image': `url(${JSON.stringify(image)})` } as CSSProperties}>
      <div className={styles.inner}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.accent} aria-hidden="true" />
        {children && <div className={styles.meta}>{children}</div>}
      </div>
    </header>
  )
}
