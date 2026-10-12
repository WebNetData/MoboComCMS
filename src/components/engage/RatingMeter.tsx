// How a rating out of five is shown: a five-step level meter with the score beside it, coloured by how good the
// score is. No decoration carries meaning by itself: the number and the word are always there as text.

/** What each whole score is called. */
export const RATING_LABELS = ['', 'ضعیف', 'متوسط', 'خوب', 'خیلی خوب', 'عالی'] as const

/** The colour step of a score: 1 (poor) to 5 (excellent); 0 when there is no score yet. */
export const ratingTone = (value: number | null | undefined) => (value ? Math.min(5, Math.max(1, Math.round(value))) : 0)

const fa = (value: number, digits = 0) => value.toLocaleString('fa-IR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/**
 * The meter: five steps, filled as far as the score reaches (half steps included). `label` is what a screen
 * reader hears; the steps themselves are decoration.
 */
export function RatingMeter({ value, label, size = 'md' }: { value: number | null | undefined; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const score = Math.min(5, Math.max(0, Number(value) || 0))
  return (
    <span className={`rv-meter is-${size} tone-${ratingTone(score)}`} role="img" aria-label={label}>
      <span style={{ inlineSize: `${(score / 5) * 100}%` }} aria-hidden="true" />
    </span>
  )
}

/** The score as a small coloured chip, e.g. «۴ از ۵ · خیلی خوب». */
export function RatingChip({ value, digits = 0, word = true }: { value: number; digits?: number; word?: boolean }) {
  const tone = ratingTone(value)
  return <span className={`rv-chip tone-${tone}`} aria-hidden="true"><b>{fa(value, digits)}</b> از ۵{word && tone ? <i>{RATING_LABELS[tone]}</i> : null}</span>
}
