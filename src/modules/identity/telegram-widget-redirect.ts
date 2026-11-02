import { safeNext } from './domain/continuation'

const AUTH_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'] as const

/** Extract only Telegram's signed fields; never pass local routing params to signature verification. */
export function parseTelegramWidgetRedirect(query: URLSearchParams) {
  const data: Record<string, string> = {}
  for (const key of AUTH_FIELDS) {
    const values = query.getAll(key)
    if (values.length > 1) return null
    if (values.length === 1) data[key] = values[0]
  }
  if (!data.id || !data.auth_date || !data.hash) return null
  const destination = safeNext(query.get('next')) || '/dashboard'
  return { authData: JSON.stringify(data), destination }
}
