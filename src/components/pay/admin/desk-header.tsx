import type { ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import styles from './OperationsWorkbench.module.css'

export default function DeskHeader({ title, description, icon, children }: {
  title: string
  description: ReactNode
  icon: string
  children?: ReactNode
}) {
  return <header className={styles.heading}>
    <span className={styles.icon} aria-hidden="true"><Icon name={icon} size={21} /></span>
    <div className={styles.intro}><h2>{title}</h2><p>{description}</p></div>
    {children && <div className={styles.actions}>{children}</div>}
  </header>
}
