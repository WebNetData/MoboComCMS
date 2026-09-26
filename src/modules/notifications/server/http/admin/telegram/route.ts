// Admin control of the Telegram integration:
//   GET   → current settings + live bot/webhook status
//   PATCH → save token / username / api base / webhook secret / enabled
//   POST  → actions: install (webhook + menu + commands), delete-webhook, test
import { NextRequest } from 'next/server'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getSettings, setSetting } from '@/modules/settings/server'
import { TG_KEYS, bot, installBot, telegramConfig } from '@/modules/notifications/server/telegram'
import { db } from '@/platform/database/prisma'


async function siteBase() {
  const s = await getSettings()
  return (s.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const cfg = await telegramConfig()
  const base = await siteBase()
  const [me, hook, linked] = await Promise.all([
    cfg.token ? bot('getMe', {}, cfg) : Promise.resolve({ ok: false, description: 'no token', result: undefined }),
    cfg.token ? bot('getWebhookInfo', {}, cfg) : Promise.resolve({ ok: false, description: 'no token', result: undefined }),
    db.user.count({ where: { NOT: { telegramId: '' } } }),
  ])

  return ok({
    enabled: cfg.enabled,
    ready: cfg.ready,
    username: cfg.username,
    // never hand a token back to the browser: only whether one is stored
    hasToken: Boolean(cfg.token),
    apiBase: cfg.apiBase,
    hasWebhookSecret: Boolean(cfg.webhookSecret),
    miniAppUrl: `${base}/miniapp`,
    expectedWebhook: `${base}/api/telegram/webhook`,
    linkedUsers: linked,
    me: me.ok ? { username: me.result?.username, name: me.result?.first_name, id: me.result?.id } : null,
    meError: me.ok ? null : me.description || 'failed',
    webhook: hook.ok
      ? {
          url: hook.result?.url || '',
          pending: hook.result?.pending_update_count || 0,
          lastError: hook.result?.last_error_message || '',
        }
      : null,
    webhookError: hook.ok ? null : hook.description || 'failed',
  })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  if (!b) return err('بدنه نامعتبر است')
  if (typeof b.webhookSecret === 'string' && b.webhookSecret.trim() && !/^[A-Za-z0-9_-]{1,256}$/.test(b.webhookSecret.trim())) return err('کلید وب‌هوک فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد')

  if (typeof b.token === 'string' && b.token.trim()) await setSetting(TG_KEYS.token, b.token.trim())
  if (b.clearToken === true) await setSetting(TG_KEYS.token, '')
  if (typeof b.username === 'string') await setSetting(TG_KEYS.username, b.username.trim().replace(/^@/, ''))
  if (typeof b.apiBase === 'string') await setSetting(TG_KEYS.apiBase, b.apiBase.trim().replace(/\/+$/, ''))
  if (typeof b.webhookSecret === 'string' && b.webhookSecret.trim()) await setSetting(TG_KEYS.webhookSecret, b.webhookSecret.trim())
  if (typeof b.enabled === 'boolean') await setSetting(TG_KEYS.enabled, b.enabled ? 'true' : 'false')

  const cfg = await telegramConfig()
  return ok({ saved: true, ready: cfg.ready, enabled: cfg.enabled })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const action = String(b?.action || '')
  const cfg = await telegramConfig()
  if (!cfg.token) return err('اول توکن ربات را ذخیره کنید', 400, { code: 'NO_TOKEN' })

  if (action === 'install') {
    const res = await installBot(await siteBase())
    return ok(res)
  }
  if (action === 'delete-webhook') {
    const res = await bot('deleteWebhook', {}, cfg)
    return ok({ ok: res.ok, steps: [{ step: 'deleteWebhook', ok: res.ok, detail: res.description || 'deleted' }] })
  }
  if (action === 'test') {
    const self = await db.user.findUnique({ where: { id: admin.id }, select: { telegramId: true } })
    const chatId = String(b?.chatId || '').trim() || self?.telegramId || ''
    if (!chatId) return err('شناسه چت را وارد کنید یا اول تلگرام حساب ادمین را وصل کنید', 400, { code: 'NO_CHAT' })
    const res = await bot('sendMessage', {
      chat_id: chatId,
      text: '✅ پیام آزمایشی HappVPN — ربات درست کار می‌کند.',
      parse_mode: 'HTML',
    }, cfg)
    return ok({ ok: res.ok, detail: res.description || 'sent' })
  }
  return err('دستور ناشناخته', 400)
}
