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
  const next = query.get('next') || '/dashboard'
  const destination = /^\/(?!\/)/.test(next) && !/[\\\u0000-\u001f]/.test(next) ? next : '/dashboard'
  return { authData: JSON.stringify(data), destination }
}
