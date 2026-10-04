import type { db } from '@/platform/database/prisma'
import { bot } from '@/modules/notifications/server/telegram'
import { resellerBotConfig } from '@/modules/reseller/server/reseller-bot'
type BotRow = NonNullable<Awaited<ReturnType<typeof db.resellerBot.findUnique>>>


export function say(row: BotRow, chatId: string, text: string, reply_markup?: object) {
  return bot('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) }, resellerBotConfig(row))
}


export function localized(fa: boolean, en: string, faText: string) { return fa ? faText : en }
