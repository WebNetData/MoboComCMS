import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import { getUserLocale } from '@/modules/notifications/server/telegram-locale'
import { normalizeLocale } from './config'
import type { Locale } from './dictionaries'

export async function getServerLocale(): Promise<Locale> {
  const c = await cookies()
  const cookieLocale = normalizeLocale(c.get('lang')?.value, 'en')
  try {
    const session = await getServerSession(authOptions)
    const userId = Number((session?.user as { id?: string } | undefined)?.id)
    if (Number.isSafeInteger(userId) && userId > 0) {
      return await getUserLocale(userId) || cookieLocale
    }
  } catch {
    // Public pages still honour the visitor's cookie during a database outage.
  }
  return cookieLocale
}

export async function getServerTheme(): Promise<'light' | 'dark'> {
  const c = await cookies()
  return c.get('theme')?.value === 'light' ? 'light' : 'dark'
}
