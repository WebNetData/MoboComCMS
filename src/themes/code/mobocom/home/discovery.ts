import type { ThemeHomeProps } from '@/themes/sdk/server'
export type HomeProps = ThemeHomeProps & { section: ThemeHomeProps['site']['sections'][number] }
export type HomeText = { fa: string; en: string; [key: string]: string }
export const homeText = (value: HomeText, locale: string) => value[locale] || value.fa || value.en
export const homeLive = (href: string, paths: string[]) => !!href && !paths.some(path => href === path || href.startsWith(`${path}/`) || href.startsWith(`${path}?`))
const destinations: [RegExp, string][] = [
  [/^\/products(?:[/?]|$)/, 'bag'], [/^\/blog(?:[/?]|$)/, 'news'], [/^\/music(?:[/?]|$)/, 'music'],
  [/^\/cinema(?:[/?]|$)/, 'film'], [/^\/games(?:[/?]|$)/, 'game'], [/^\/software(?:[/?]|$)/, 'download'],
  [/^\/forum(?:[/?]|$)/, 'chat'], [/^\/celebrities(?:[/?]|$)/, 'users'], [/^\/businesses(?:[/?]|$)/, 'globe'], [/^\/prompts(?:[/?]|$)/, 'pen'],
]
/** Compose saved service cards and visible configured section navigation. */
export function discoveryLinks(site: ThemeHomeProps['site'], data: ThemeHomeProps['data'], locale: string) {
  const cards = site.sections.filter(section => section.enabled && section.kind === 'services').flatMap(section => section.items)
  const links = cards.map(item => ({ href: item.href, title: homeText(item.title, locale), text: homeText(item.text || { fa: '', en: '' }, locale), icon: item.icon }))
  for (const item of site.navigation || []) {
    if (item.enabled === false || !destinations.some(([pattern]) => pattern.test(item.href))) continue
    if (!links.some(link => link.href === item.href)) links.push({ href: item.href, title: homeText(item.label, locale), text: item.description ? homeText(item.description, locale) : '', icon: item.icon ?? (destinations.find(([pattern]) => pattern.test(item.href))?.[1] || 'grid') })
  }
  return links.filter(item => homeLive(item.href, data.disabledPaths)).filter((item, index, all) => all.findIndex(entry => entry.href === item.href) === index).slice(0, 10).map(item => ({ ...item, stat: data.stats?.find(stat => item.href === stat.href) }))
}
