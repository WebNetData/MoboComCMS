/** A check drawn once (desk.css `.cd-check`) when a counter step or a sale is done. */
export default function DoneMark({ size = 14 }: { size?: number }) {
  return <svg className="cd-check" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" pathLength={1} /></svg>
}
