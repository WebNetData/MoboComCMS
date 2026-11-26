import type { TriggerDef } from '@/modules/automation/domain/automation'
import styles from './recovery-list.module.css'

export type Recovery = {
  needsReview: number
  recent: { id: number; name: string; needsReviewAt: string; processingError: string }[]
}

const recoveryDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran',
})

function reason(code: string) {
  if (code === 'EFFECT_LEASE_EXPIRED') return 'پردازش رویداد پیش از ثبت نتیجه متوقف شد و ممکن است اقدام آغاز شده باشد.'
  if (code === 'ACTION_FAILED_AFTER_EFFECT' || code === 'RULE_FAILED_AFTER_EFFECT') return 'یک اقدام با خطا روبه‌رو شد؛ ممکن است بخشی از اثر آن اعمال شده باشد.'
  return 'برای جلوگیری از اجرای دوباره، این رویداد خودکار تکرار نمی‌شود و نیاز به بررسی دارد.'
}

export default function RecoveryList({ recovery, triggers }: { recovery: Recovery; triggers: TriggerDef[] }) {
  const labels = new Map(triggers.map(trigger => [trigger.id, trigger.label]))

  return <section className={styles.section} aria-labelledby="am-recovery-title">
    <header className={styles.header}>
      <div>
        <h2 id="am-recovery-title">رویدادهای نیازمند بررسی</h2>
        <p>اگر نتیجهٔ یک اقدام روشن نباشد، همان رویداد برای بررسی می‌ماند تا اقدام خودکار تکرار نشود.</p>
      </div>
      <span className={styles.count} aria-label={`${recovery.needsReview.toLocaleString('fa-IR')} رویداد نیازمند بررسی`}>
        {recovery.needsReview.toLocaleString('fa-IR')} مورد
      </span>
    </header>

    {!recovery.needsReview ? <p className={styles.empty}>فعلاً رویدادی برای بررسی ندارید.</p> : <>
      {recovery.needsReview > recovery.recent.length && <p className={styles.limit}>تازه‌ترین {recovery.recent.length.toLocaleString('fa-IR')} مورد از {recovery.needsReview.toLocaleString('fa-IR')} مورد نمایش داده شده است.</p>}
      <ol className={styles.list}>
        {recovery.recent.map(item => <li key={item.id} className={styles.item}>
          <div className={styles.itemHead}>
            <strong>{labels.get(item.name) || 'رویداد ثبت‌شده'}</strong>
            <time dateTime={item.needsReviewAt}>{recoveryDate.format(new Date(item.needsReviewAt))}</time>
          </div>
          <p>{reason(item.processingError)}</p>
          <small dir="ltr">#{item.id}</small>
        </li>)}
      </ol>
    </>}
  </section>
}
