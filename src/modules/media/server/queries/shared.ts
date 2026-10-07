import { splitList } from '@/modules/media/domain/media'

/** "a, b" strings → distinct values ordered by frequency. */
export function countMap(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) for (const part of splitList(value)) counts[part] = (counts[part] || 0) + 1
  return counts
}

export function countList(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) for (const part of splitList(value)) counts.set(part, (counts.get(part) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}
