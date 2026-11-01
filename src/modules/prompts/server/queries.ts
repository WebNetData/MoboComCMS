import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { getExtensionState } from '@/extensions/server/state'
import { moduleGuard, isModuleEnabled } from '@/extensions/server/modules'
import { getAiConfig } from '@/modules/ai/server/generation'
import { activeLists } from '@/modules/vocabulary/server/vocabulary'
import { cleanText, isKind, promptPolicy, PromptError } from '../domain/prompts'

export const publicTemplateWhere = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })
export const templateAuthor = { id: true, name: true, telegramPhoto: true, userProfile: { select: { avatar: true } } } as const
// Public/studio DTO is an explicit projection: review notes and trash provenance stay in Admin.
const publicTemplateSelect = { id: true, slug: true, title: true, summary: true, kind: true, category: true, tags: true, content: true, example: true, defaults: true, showcase: true, status: true, featured: true, sortOrder: true, version: true, publishedAt: true, createdAt: true, updatedAt: true, createdById: true, createdBy: { select: templateAuthor } } as const
export async function policy(reader: Prisma.TransactionClient = db) {
  if (await moduleGuard('prompt-master', reader)) throw new PromptError('پرامپت مستر فعال نیست', 404)
  return promptPolicy((await getExtensionState('prompt-master', [], reader, true)).settings as Record<string, unknown>)
}
export async function studioState() {
  const [settings, lists, aiOn] = await Promise.all([policy(), activeLists('prompts'), isModuleEnabled('ai-assistant')])
  const ai = settings.aiEnabled && aiOn ? await getAiConfig() : null
  return { ...settings, aiAvailable: !!(ai && (ai.apiKey || ai.provider === 'custom')), categories: lists.CATEGORY || [] }
}
export async function templateDirectory(input: Record<string, unknown>, admin = false, authorId: number | null = null) {
  const q = cleanText(input.q, 100), kind = isKind(input.kind) ? input.kind : '', category = cleanText(input.category, 40)
  const pageSize = admin ? 20 : 12
  const insensitive = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '') ? { mode: 'insensitive' as const } : {}
  const samples = input.samples === 'true', sort = input.sort === 'newest' ? 'newest' : 'curated'
  const author = Number(input.author), publicAuthor = Number.isSafeInteger(author) && author > 0 ? author : null
  const own = admin ? (authorId ? { createdById: authorId } : {}) : publicAuthor ? { createdById: publicAuthor } : {}
  const where = { ...own, ...(admin ? (['DRAFT', 'PENDING', 'PUBLISHED', 'TRASHED'].includes(String(input.status)) ? { status: String(input.status) } : { status: { not: 'TRASHED' } }) : publicTemplateWhere()), ...(samples ? { showcase: { not: '{}' } } : {}), ...(kind ? { kind } : {}), ...(category ? { category } : {}), ...(q ? { OR: ['title', 'summary', 'tags', 'slug'].map(key => ({ [key]: { contains: q, ...insensitive } })) } : {}) }
  const total = await db.promptTemplate.count({ where }), pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.max(1, Math.min(pages, Math.floor(Number(input.page) || 1)))
  const orderBy: Prisma.PromptTemplateOrderByWithRelationInput[] = sort === 'newest' ? [{ id: 'desc' }] : [{ featured: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }]
  const slice = { where, orderBy, skip: (page - 1) * pageSize, take: pageSize }
  const templates = admin ? await db.promptTemplate.findMany({ ...slice, include: { createdBy: { select: templateAuthor } } }) : await db.promptTemplate.findMany({ ...slice, select: publicTemplateSelect })
  const counts = admin ? await db.promptTemplate.groupBy({ by: ['status'], where: own, _count: { _all: true } }) : []
  return { templates, total, page, pages, q, kind, category, sort, samples, author: publicAuthor ? String(publicAuthor) : '', counts: Object.fromEntries(counts.map(row => [row.status, row._count._all])) }
}
export async function templateFacets(samples: boolean) {
  return db.promptTemplate.groupBy({ by: ['kind'], where: { ...publicTemplateWhere(), ...(samples ? { showcase: { not: '{}' } } : {}) }, _count: { _all: true } })
}
export async function templateBySlug(slug: string, reader: Prisma.TransactionClient = db) {
  return reader.promptTemplate.findFirst({ where: { slug, ...publicTemplateWhere() }, select: publicTemplateSelect })
}
export async function templateForAdmin(id: number, authorId: number | null = null) {
  const template = await db.promptTemplate.findFirst({ where: { id, ...(authorId ? { createdById: authorId } : {}) }, include: { createdBy: { select: templateAuthor } } })
  if (!template) throw new PromptError('الگو پیدا نشد', 404)
  return template
}

/** Moderation only projects current waiting rows; commands remain with this owner. */
export async function waitingTemplates(status: 'PENDING' | 'TRASHED', take = 5) {
  const where = { status }, count = await db.promptTemplate.count({ where })
  const rows = await db.promptTemplate.findMany({ where, take, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], include: { createdBy: { select: { name: true } } } })
  return { count, items: rows.map(row => ({ id: row.id, text: row.title, full: row.summary, by: row.createdBy?.name || 'نویسنده', about: row.title, at: row.updatedAt })) }
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
