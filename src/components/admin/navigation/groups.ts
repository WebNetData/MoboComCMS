import type { ShellGroup } from '@/components/shell/ShellNav'

export type ControlGroup = ShellGroup & { part: string }

const searchable = (value: string) => value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLocaleLowerCase().trim()

/** Presentation only: the Admin layout has already applied the canonical permissions and module state. */
export function searchControlGroups(groups: ControlGroup[], query: string, part = ''): ControlGroup[] {
  const words = searchable(query).split(/\s+/).filter(Boolean)
  let previous = ''
  return groups.flatMap(group => {
    if (part && group.part !== part) return []
    const items = group.items.filter(item => words.every(word => searchable(`${item.label} ${item.href} ${group.title} ${group.part}`).includes(word)))
    if (!items.length) return []
    const caption = group.part && group.part !== previous ? group.part : undefined
    previous = group.part
    return [{ ...group, items, caption }]
  })
}
