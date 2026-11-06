import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { AI_PROVIDERS } from '@/modules/ai/domain/ai'
import { AiError, generate, getAiConfig, publicAiConfig, saveAiConfig } from '@/modules/ai/server/client'
import {
  applyMeta, applyProductCopy, assistEditor, assistantQueues, autofillContent, draftPost, productCopy, publishCommentReply, publishForumReply,
  suggestCommentReply, suggestForumReply, suggestMeta,
} from '@/modules/ai/server/tasks'

type Handler = (admin: { id: number; email: string }, body: Record<string, any>) => Promise<unknown>
const id = (value: unknown) => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : 0 }

// Each action names the permission it needs; generating calls count against a per-admin limit.
const ACTIONS: Record<string, { perm: string | string[]; generates: boolean; run: Handler }> = {
  test: { perm: 'settings.manage', generates: true, run: async () => {
    const result = await generate({ system: 'فقط به فارسی جواب بده.', user: 'در یک جملهٔ کوتاه بگو آماده‌ای.', maxTokens: 200 })
    return { reply: result.text.trim().slice(0, 300), model: result.model }
  } },
  'post.draft': { perm: 'cms.posts', generates: true, run: (admin, body) => draftPost(admin.id, body) },
  'product.write': { perm: 'cms.products', generates: true, run: (_admin, body) => productCopy(id(body.id), body.facts) },
  'product.apply': { perm: 'cms.products', generates: false, run: (_admin, body) => applyProductCopy(id(body.id), body.description) },
  'comment.suggest': { perm: 'cms.posts', generates: true, run: (_admin, body) => suggestCommentReply(id(body.id)) },
  'comment.publish': { perm: 'cms.posts', generates: false, run: (admin, body) => publishCommentReply(admin.id, id(body.id), body.reply) },
  'forum.suggest': { perm: 'forum.moderate', generates: true, run: (_admin, body) => suggestForumReply(id(body.id)) },
  'forum.publish': { perm: 'forum.moderate', generates: false, run: (_admin, body) => publishForumReply(id(body.id), body.reply) },
  'meta.suggest': { perm: 'cms.posts', generates: true, run: (_admin, body) => suggestMeta(id(body.id)) },
  'editor.assist': { perm: 'cms.posts', generates: true, run: (_admin, body) => assistEditor(body) },
  'meta.apply': { perm: 'cms.posts', generates: false, run: (_admin, body) => applyMeta(id(body.id), body.meta) },
  // Any content editor may auto-fill the form of a section they manage.
  'content.autofill': { perm: ['cms.posts', 'cms.pages', 'cms.products', 'software.manage', 'games.manage', 'cinema.manage', 'music.manage'], generates: true, run: (_admin, body) => autofillContent(body) },
}

async function anyPerm(req: NextRequest, perms: string[]) {
  for (const perm of perms) { const admin = await requirePerm(req, perm); if (admin) return admin }
  return null
}

export async function GET(req: NextRequest) {
  const off = await moduleGuard('ai-assistant')
  if (off) return off
  const admin = await anyPerm(req, ['cms.posts', 'cms.products', 'forum.moderate', 'settings.manage'])
  if (!admin) return err('forbidden', 403)
  try {
    const [config, queues, categories] = await Promise.all([getAiConfig(), assistantQueues(), db.postCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })])
    return ok({ config: publicAiConfig(config), providers: AI_PROVIDERS, queues, categories })
  } catch (error) {
    if (error instanceof AiError) return err(error.message, error.status)
    throw error
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('invalid body')
  try {
    const config = await saveAiConfig(body)
    await auditAdmin({ req, actor: admin, action: 'ai.config.update', targetType: 'setting', targetId: 'ai.config.v1', metadata: { provider: config.provider, model: config.model } })
    return ok({ config: publicAiConfig(config) })
  } catch (error) {
    if (error instanceof AiError) return err(error.message, error.status)
    throw error
  }
}

/** POST { action, ...input } — see ACTIONS. */
export async function POST(req: NextRequest) {
  const off = await moduleGuard('ai-assistant')
  if (off) return off
  const body = await req.json().catch(() => null)
  const action = ACTIONS[String(body?.action || '')]
  if (!action) return err('unknown action', 404)
  const admin = await anyPerm(req, Array.isArray(action.perm) ? action.perm : [action.perm])
  if (!admin) return err('forbidden', 403)
  if (action.generates && !rateLimitHit(`ai:generate:${admin.id}`, 30, 10 * 60_000).ok) return err('درخواست‌های زیادی فرستادید؛ چند دقیقه صبر کنید', 429)
  try {
    const result = await action.run(admin, body)
    await auditAdmin({ req, actor: admin, action: `ai.${body.action}`, targetType: 'ai', targetId: body.id ?? body.section ?? '', metadata: { model: (result as { model?: string })?.model } })
    return ok(result)
  } catch (error) {
    if (error instanceof AiError) return err(error.message, error.status)
    console.error('[ai] action failed', body.action, error)
    return err('انجام نشد؛ جزئیات در لاگ سرور ثبت شد', 500)
  }
}
