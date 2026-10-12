'use client'

import { RATING_LABELS } from '@/components/engage/RatingMeter'

/**
 * Choosing a score from one to five: numbered tiles, the chosen one filled with the colour of that score.
 * A radio group for the keyboard and screen readers (arrow keys move, as in any radio group). `words` adds the
 * name of each score under its number; `clearable` lets the chosen tile be pressed again to take the score back.
 */
export default function RatingTiles({ value, onChange, label, words = false, size = 'md', clearable = false, disabled = false, locale = 'fa' }: { value: number; onChange: (value: number) => void; label: string; words?: boolean; size?: 'sm' | 'md'; clearable?: boolean; disabled?: boolean; locale?: 'fa' | 'en' }) {
  const digits = (n: number) => n.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')
  function move(event: React.KeyboardEvent<HTMLSpanElement>) {
    const step = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
    if (!step || disabled) return
    event.preventDefault()
    // In right-to-left writing the next tile is to the left.
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    const next = Math.min(5, Math.max(1, (value || 0) + (horizontal && rtl ? -step : step)))
    onChange(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-score="${next}"]`)?.focus()
  }
  return (
    <span className={`rv-tiles is-${size}${words ? ' has-words' : ''}`} role="radiogroup" aria-label={label} onKeyDown={move}>
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          data-score={score}
          aria-checked={value === score}
          aria-label={`${digits(score)} ${locale === 'fa' ? 'از ۵' : 'of 5'}${locale === 'fa' ? `، ${RATING_LABELS[score]}` : ''}`}
          tabIndex={value === score || (!value && score === 1) ? 0 : -1}
          disabled={disabled}
          className={`tone-${score}${value === score ? ' is-on' : score < value ? ' is-under' : ''}`}
          onClick={() => onChange(clearable && value === score ? 0 : score)}
        >
          <b aria-hidden="true">{digits(score)}</b>{words && locale === 'fa' ? <span aria-hidden="true">{RATING_LABELS[score]}</span> : null}
        </button>
      ))}
    </span>
  )
}
