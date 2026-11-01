import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { getExtensionState } from '@/extensions/server/state'
import { moduleGuard, isModuleEnabled } from '@/extensions/server/modules'
import { getAiConfig } from '@/modules/ai/server/generation'
import { activeLists } from '@/modules/vocabulary/server/vocabulary'
import { cleanText, isKind, promptPolicy, PromptError } from '../domain/prompts'

export const publicTemplateWhere = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })
export async function policy(reader: Prisma.TransactionClient = db) {
  if (await moduleGuard('prompt-master', reader)) throw new PromptError('پرامپت مستر فعال نیست', 404)
  return promptPolicy((await getExtensionState('prompt-master', [], reader, true)).settings as Record<string, unknown>)
}
export async function studioState() {
  const [settings, lists, aiOn] = await Promise.all([policy(), activeLists('prompts'), isModuleEnabled('ai-assistant')])
  const ai = settings.aiEnabled && aiOn ? await getAiConfig() : null
  return { ...settings, aiAvailable: !!(ai && (ai.apiKey || ai.provider === 'custom')), categories: lists.CATEGORY || [] }
}
export async function templateDirectory(input: Record<string, unknown>, admin = false) {
  const q = cleanText(input.q, 100), kind = isKind(input.kind) ? input.kind : '', category = cleanText(input.category, 40)
  const pageSize = admin ? 20 : 12
  const insensitive = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '') ? { mode: 'insensitive' as const } : {}
  const where = { ...(admin ? (input.status === 'DRAFT' || input.status === 'PUBLISHED' ? { status: input.status } : {}) : publicTemplateWhere()), ...(kind ? { kind } : {}), ...(category ? { category } : {}), ...(q ? { OR: ['title', 'summary', 'tags', 'slug'].map(key => ({ [key]: { contains: q, ...insensitive } })) } : {}) }
  const total = await db.promptTemplate.count({ where }), pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.max(1, Math.min(pages, Math.floor(Number(input.page) || 1)))
  const templates = await db.promptTemplate.findMany({ where, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize })
  return { templates, total, page, pages, q, kind, category }
}
export async function templateBySlug(slug: string, reader: Prisma.TransactionClient = db) {
  return reader.promptTemplate.findFirst({ where: { slug, ...publicTemplateWhere() } })
}
export async function templateForAdmin(id: number) {
  const template = await db.promptTemplate.findUnique({ where: { id } })
  if (!template) throw new PromptError('الگو پیدا نشد', 404)
  return template
}
export async function memberHistory(userId: number, input: Record<string, unknown> = {}) {
  const q = cleanText(input.q, 100), pinned = input.pinned === 'true'
  const where = { userId, ...(pinned ? { pinned: true } : {}), ...(q ? { title: { contains: q } } : {}) }
  const total = await db.promptGeneration.count({ where }), pages = Math.max(1, Math.ceil(total / 20))
  const page = Math.max(1, Math.min(pages, Math.floor(Number(input.page) || 1)))
  const items = await db.promptGeneration.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 })
  return { items, total, page, pages, q, pinned }
}
export async function memberGeneration(userId: number, id: number) {
  const item = await db.promptGeneration.findFirst({ where: { id, userId } })
  if (!item) throw new PromptError('خروجی پیدا نشد', 404)
  return item
}
