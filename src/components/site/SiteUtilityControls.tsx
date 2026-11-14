'use client'

import { usePathname } from '@/platform/routing/navigation'
import ContentRequest from '@/components/site/ContentRequest'
import { DEMAND_SECTIONS } from '@/modules/support/domain/demand'
import { useI18n } from '@/i18n/LocaleProvider'
import { useLowData } from '@/components/site/LowDataProvider'
import ReportProblemControl from '@/components/site/ReportProblemControl'
import styles from './site-utility-controls.module.css'

export default function SiteUtilityControls() {
  const { locale } = useI18n()
  const { enabled, ready, setEnabled } = useLowData()
  const fa = locale === 'fa'
  const path = usePathname() || ''
  const section = DEMAND_SECTIONS.find(item => path === item.path || path.startsWith(item.path + '/'))
  return <>{section && <ContentRequest key={section.id} section={section.id} />}<div className={styles.controls}>
    <ReportProblemControl ready={ready} />
    <button type="button" className="btn btn-ghost btn-sm" aria-pressed={enabled} disabled={!ready} onClick={() => setEnabled(!enabled)}>
      {enabled ? (fa ? 'حالت کم‌مصرف: روشن' : 'Low data: on') : (fa ? 'حالت کم‌مصرف' : 'Low data mode')}
    </button>
<p className={styles.hint}>{enabled ? (fa ? 'ویدیو و کیفیت بالای موسیقی تا انتخاب شما بارگیری نمی‌شوند؛ پخش و دانلود با اقدام شما آغاز می‌شود.' : 'Video and high-quality audio wait for your action; playback and downloads start when you choose.') : (fa ? 'رسانه با تنظیمات عادی پخش و بارگیری می‌شود.' : 'Media uses the site’s standard playback and download behavior.')}</p>
  </div></>
}
