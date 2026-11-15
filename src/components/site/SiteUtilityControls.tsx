'use client'

import { usePathname } from '@/platform/routing/navigation'
import ContentRequest from '@/components/site/ContentRequest'
import { DEMAND_SECTIONS } from '@/modules/support/domain/demand'
import { useLowData } from '@/components/site/LowDataProvider'
import ReportProblemControl from '@/components/site/ReportProblemControl'
import styles from './site-utility-controls.module.css'

export default function SiteUtilityControls() {
  const { ready } = useLowData()
  const path = usePathname() || ''
  const section = DEMAND_SECTIONS.find(item => path === item.path || path.startsWith(item.path + '/'))
  return <>
    {section && <ContentRequest key={section.id} section={section.id} />}
    <div className={styles.utility}><div className={styles.controls}>
      <ReportProblemControl ready={ready} />
    </div></div>
  </>
}
