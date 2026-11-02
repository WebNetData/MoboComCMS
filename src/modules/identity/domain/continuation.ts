/** A bounded local destination, excluding authentication/completion loops. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500 || !/^\/(?!\/)/.test(value) || /[\\\u0000-\u001f\u007f]/.test(value)) return ''
  try {
    const pathname = decodeURIComponent(new URL(value, 'https://mobocom.invalid').pathname)
    if (!/^\/(?!\/)/.test(pathname) || /[\\\u0000-\u001f\u007f]/.test(pathname) || /^\/(login|register|welcome)(\/|$)/i.test(pathname)) return ''
  } catch { return '' }
  return value
}

/** Preserve only an explicit, safe destination when switching account entry methods. */
export function authEntryHref(path: '/login' | '/register', next: unknown, query: Record<string, string> = {}): string {
  const params = new URLSearchParams(query)
  const destination = safeNext(next)
  if (destination) params.set('next', destination)
  else params.delete('next')
  const search = params.toString()
  return path + (search ? `?${search}` : '')
}
