import { RatingMeter } from '@/components/engage/RatingMeter'

/** A business's score as the site's level meter. The name is kept for the pages that import it. */
export default function BusinessStars({ value }: { value: number | null }) {
  return <RatingMeter value={value} label={value === null ? 'بدون امتیاز' : `${value.toLocaleString('fa-IR')} از ۵`} />
}
