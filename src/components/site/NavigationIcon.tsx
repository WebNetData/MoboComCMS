import Icon, { ICON_NAMES } from './Icon'

/** Icon markup is never accepted from settings. Unknown names/emoji remain plain text. */
export default function NavigationIcon({ name, size = 18 }: { name?: string; size?: number }) {
  if (!name) return null
  return ICON_NAMES.includes(name) ? <Icon name={name} size={size} /> : <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>{name}</span>
}
