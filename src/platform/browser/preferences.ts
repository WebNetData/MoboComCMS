export function setCookieLang(lang: string) {
  document.cookie = `lang=${lang};path=/;max-age=31536000;SameSite=Lax`
  document.cookie = 'lang_source=manual;path=/;max-age=31536000;SameSite=Lax'
}

export function setCookieTheme(theme: string) {
  document.cookie = `theme=${theme};path=/;max-age=31536000`
}

export function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match?.[2]
}
