import { db } from '@/platform/database/prisma'
import type { InlineKeyboard } from './telegram'

export type BotLocale = 'en' | 'fa'

const key = (telegramId: string) => `telegram.locale.${telegramId}`
const userKey = (userId: number) => `user.locale.${userId}`

/** The website and the bot share one account preference after linking. */
export async function getUserLocale(userId: number): Promise<BotLocale | null> {
  if (!Number.isSafeInteger(userId) || userId < 1) return null
  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } })
  if (!user) return null
  const saved = await db.setting.findUnique({ where: { key: userKey(userId) } })
  if (saved?.value === 'en' || saved?.value === 'fa') return saved.value
  if (user.telegramId) {
    const bot = await db.setting.findUnique({ where: { key: key(user.telegramId) } })
    if (bot?.value === 'en' || bot?.value === 'fa') return bot.value
  }
  return null
}

export async function setUserLocale(userId: number, locale: BotLocale): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('invalid user id')
  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } })
  if (!user) throw new Error('user not found')
  await db.$transaction([
    db.setting.upsert({ where: { key: userKey(userId) }, create: { key: userKey(userId), value: locale }, update: { value: locale } }),
    ...(user.telegramId ? [db.setting.upsert({ where: { key: key(user.telegramId) }, create: { key: key(user.telegramId), value: locale }, update: { value: locale } })] : []),
  ])
}

export async function getBotLocale(telegramId: string): Promise<BotLocale | null> {
  if (!/^\d{1,20}$/.test(telegramId)) return null
  const user = await db.user.findUnique({ where: { telegramId }, select: { id: true } })
  if (user) {
    const account = await db.setting.findUnique({ where: { key: userKey(user.id) } })
    if (account?.value === 'en' || account?.value === 'fa') return account.value
  }
  const row = await db.setting.findUnique({ where: { key: key(telegramId) } })
  return row?.value === 'en' || row?.value === 'fa' ? row.value : null
}

export async function setBotLocale(telegramId: string, locale: BotLocale): Promise<void> {
  if (!/^\d{1,20}$/.test(telegramId)) throw new Error('invalid Telegram id')
  const user = await db.user.findUnique({ where: { telegramId }, select: { id: true } })
  await db.$transaction([
    db.setting.upsert({ where: { key: key(telegramId) }, create: { key: key(telegramId), value: locale }, update: { value: locale } }),
    ...(user ? [db.setting.upsert({ where: { key: userKey(user.id) }, create: { key: userKey(user.id), value: locale }, update: { value: locale } })] : []),
  ])
}

export const botText = (locale: BotLocale, en: string, fa: string) => locale === 'fa' ? fa : en

export const languagePrompt = '🌐 Please choose your language.\nلطفاً زبان خود را انتخاب کنید.'

export const languageKeyboard: InlineKeyboard = [[
  { text: '🇬🇧 English', callback_data: 'lang:en' },
  { text: '🇮🇷 فارسی', callback_data: 'lang:fa' },
]]
