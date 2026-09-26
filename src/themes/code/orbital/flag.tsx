const bundled = new Set('de nl fi gb fr tr ae us ca jp sg kr hk au se ch pl at it es br in za'.split(' '))

/** Windows does not render regional-indicator emoji as flags. */
export default function Flag({ value }: { value: string }) {
  const points = Array.from(value)
  const code = points.length === 2 ? points.map(point => String.fromCharCode((point.codePointAt(0) || 0) - 0x1f1e6 + 97)).join('') : ''
  return bundled.has(code) ? <img className="hp-country-flag" src={`/flags/${code}.svg`} width="28" height="21" alt="" loading="lazy"/> : <span aria-hidden="true">{value || '◎'}</span>
}
