import { PayError } from './pay'

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new PayError('ساختار پیامک معتبر نیست', 422)
  return v as Record<string, unknown>
}

/** JSON.parse accepts duplicate identity keys. Check decoded keys at every depth first. */
export function uniqueSmsJson(raw: string): Record<string, unknown> {
  if (raw.length > 24000) throw new PayError('حجم پیامک معتبر نیست', 413)
  let at = 0
  const white = () => { while (/^[\t\n\r ]$/.test(raw[at] || 'x')) at++ }
  const string = (): string => {
    const start = at++
    while (at < raw.length) {
      if (raw[at] === '\\') { at += 2; continue }
      if (raw[at++] === '"') return JSON.parse(raw.slice(start, at)) as string
    }
    throw new Error('string')
  }
  const value = (depth: number): void => {
    if (depth > 24) throw new Error('depth')
    white()
    if (raw[at] === '"') { string(); return }
    if (raw[at] === '{') {
      at++; white(); const keys = new Set<string>()
      if (raw[at] === '}') { at++; return }
      while (at < raw.length) {
        white(); if (raw[at] !== '"') throw new Error('key')
        const key = string(); if (keys.has(key)) throw new Error('duplicate'); keys.add(key)
        white(); if (raw[at++] !== ':') throw new Error('colon')
        value(depth + 1); white(); const end = raw[at++]
        if (end === '}') return
        if (end !== ',') throw new Error('comma')
      }
    } else if (raw[at] === '[') {
      at++; white(); if (raw[at] === ']') { at++; return }
      while (at < raw.length) { value(depth + 1); white(); const end = raw[at++]; if (end === ']') return; if (end !== ',') throw new Error('comma') }
    } else {
      const start = at
      while (at < raw.length && !/[\s,\]}]/.test(raw[at])) at++
      if (at === start) throw new Error('primitive')
      JSON.parse(raw.slice(start, at)); return
    }
    throw new Error('end')
  }
  try { value(0); white(); if (at !== raw.length) throw new Error('trailing'); return object(JSON.parse(raw)) }
  catch { throw new PayError('JSON پیامک مبهم یا نامعتبر است', 422) }
}
