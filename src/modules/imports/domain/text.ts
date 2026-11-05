export const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)

export function toText(value: unknown, max = 500): string {
  if (isBlank(value)) return ''
  if (Array.isArray(value)) return value.map((item) => toText(item, max)).filter(Boolean).join(', ').slice(0, max)
  if (typeof value === 'object') return JSON.stringify(value).slice(0, max)
  return String(value).replace(/\u0000/g, '').trim().slice(0, max)
}
