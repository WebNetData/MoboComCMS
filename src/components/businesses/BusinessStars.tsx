import styles from './BusinessExperience.module.css'
export default function BusinessStars({ value }: { value: number | null }) {
  return <span className={styles.stars} role="img" aria-label={value === null ? 'بدون امتیاز' : `${value.toLocaleString('fa-IR')} از پنج ستاره`}>{[1, 2, 3, 4, 5].map(star => <span key={star} className={value !== null && star <= Math.round(value) ? styles.on : undefined} aria-hidden="true">★</span>)}</span>
}
