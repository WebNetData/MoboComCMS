import { randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { bot, type TelegramConfig, telegramConfig } from '@/modules/notifications/server/telegram'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { logEvent } from '@/platform/observability/logger'

export function resellerBotConfig(row: { tokenCipher: string; username: string; webhookSecret: string }): TelegramConfig {
  return { token: decryptPanelCredential(row.tokenCipher), username: row.username, webhookSecret: row.webhookSecret, apiBase: 'https://api.telegram.org', enabled: true, ready: true }
}

export function secretMatches(expected: string, received: string | null) {
  if (!received || expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

export function botPublic(row: { id: number; botId: string; username: string; ownerTelegramId: string; brandName: string; publicUrl: string; cardNumber: string; cardHolder: string; active: boolean; lastError: string; installedAt: Date | null }) {
  return { id: row.id, botId: row.botId, username: row.username, ownerTelegramId: row.ownerTelegramId, brandName: row.brandName, publicUrl: row.publicUrl, cardNumber: row.cardNumber, cardHolder: row.cardHolder, active: row.active, lastError: row.lastError, installedAt: row.installedAt, link: `https://t.me/${row.username}` }
}

export async function installResellerBot(resellerId: number, input: Record<string, unknown>) {
  const rawToken = String(input.token || '').trim()
  const ownerTelegramId = String(input.ownerTelegramId || '').trim()
  const brandName = String(input.brandName || '').trim()
  const cardNumber = String(input.cardNumber || '').replace(/[ -]/g, '')
  const cardHolder = String(input.cardHolder || '').trim()
  const publicUrl = String(input.publicUrl || '').trim()
  if (!/^\d{6,16}:[A-Za-z0-9_-]{25,}$/.test(rawToken)) throw Error('Invalid Telegram bot token')
  if (!/^\d{4,20}$/.test(ownerTelegramId)) throw Error('Numeric Telegram owner ID is required')
  if (!brandName || brandName.length > 64 || !cardHolder || cardHolder.length > 100 || !/^\d{12,24}$/.test(cardNumber)) throw Error('Brand and payment card details are required')
  if (publicUrl) {
    const u = new URL(publicUrl)
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) throw Error('Public URL must use HTTPS')
  }
  const global = await telegramConfig()
  if (global.token && global.token === rawToken) throw Error('Use a separate bot token for the reseller')
  const siteUrl = await siteBaseUrl()
  if (!siteUrl.startsWith('https://')) throw Error('A public HTTPS site URL is required to install a Telegram webhook')
  const cfg: TelegramConfig = { token: rawToken, username: '', apiBase: 'https://api.telegram.org', webhookSecret: '', enabled: true, ready: true }
  const me = await bot<{ id: number; username: string; is_bot: boolean }>('getMe', {}, cfg)
  if (!me.ok || !me.result?.is_bot || !me.result.username) throw Error(me.description || 'Telegram could not verify this bot')
  if (global.username && global.username.toLowerCase() === me.result.username.toLowerCase()) throw Error('Use a separate bot from the platform bot')
  const botId = String(me.result.id)
  const collision = await db.resellerBot.findUnique({ where: { botId } })
  if (collision && collision.resellerId !== resellerId) throw Error('This bot is already assigned to another reseller')
  const prior = await db.resellerBot.findUnique({ where: { resellerId } })
  if (prior && prior.botId !== botId) throw Error('A different bot is connected. Contact the platform admin to migrate existing orders before replacing it')
  const webhookSecret = prior?.webhookSecret || randomBytes(32).toString('hex')
  const installed = await bot('setWebhook', { url: `${siteUrl}/api/telegram/reseller/${botId}`, secret_token: webhookSecret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }, cfg)
  if (!installed.ok) throw Error(installed.description || 'Telegram webhook installation failed')
  await bot('setMyCommands', { commands: [{ command: 'start', description: 'Start' }, { command: 'plans', description: 'Available plans' }, { command: 'orders', description: 'My orders' }, { command: 'cancel', description: 'Cancel latest unpaid order' }] }, cfg)
  const row = await db.resellerBot.upsert({ where: { resellerId }, create: { resellerId, botId, username: me.result.username, tokenCipher: encryptPanelCredential(rawToken), webhookSecret, ownerTelegramId, brandName, publicUrl, cardNumber, cardHolder, active: true, installedAt: new Date() }, update: { username: me.result.username, tokenCipher: encryptPanelCredential(rawToken), ownerTelegramId, brandName, publicUrl, cardNumber, cardHolder, active: true, lastError: '', installedAt: new Date() } })
  logEvent('info', 'reseller.bot.installed', { resellerId, botId, username: row.username })
  return botPublic(row)
}

export async function setResellerBotActive(resellerId: number, active: boolean) {
  const row = await db.resellerBot.findUnique({ where: { resellerId } })
  if (!row) throw Error('Bot not found')
  if (!active) {
    const updated = await db.resellerBot.update({ where: { id: row.id }, data: { active: false, lastError: '' } })
    const removed = await bot('deleteWebhook', { drop_pending_updates: false }, resellerBotConfig(row))
    if (!removed.ok) await db.resellerBot.update({ where: { id: row.id }, data: { lastError: removed.description || 'Webhook removal failed' } })
    logEvent('info', 'reseller.bot.status', { resellerId, botId: row.botId, active: false, webhookRemoved: removed.ok })
    return botPublic(updated)
  }
  const result = await bot('setWebhook', { url: `${await siteBaseUrl()}/api/telegram/reseller/${row.botId}`, secret_token: row.webhookSecret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }, resellerBotConfig(row))
  if (!result.ok) throw Error(result.description || 'Telegram did not accept the change')
  const updated = await db.resellerBot.update({ where: { id: row.id }, data: { active, lastError: '' } })
  logEvent('info', 'reseller.bot.status', { resellerId, botId: row.botId, active })
  return botPublic(updated)
}
