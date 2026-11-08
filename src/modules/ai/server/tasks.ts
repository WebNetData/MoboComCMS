import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { cleanRichText } from '@/shared/content/sanitize'
import { getSiteSeo } from '@/modules/site/server/seo'
import { createReply } from '@/modules/forum/server/actions'
import { viewerFor } from '@/modules/forum/server/community'
import { ForumError } from '@/modules/forum/domain/forum'
import { queueIndexNow } from '@/modules/seo/server/indexnow'
import {
  commentReplyPrompt, forumReplyPrompt, metaPrompt, naturalize, oneLine, parseTagged, polishPrompt, postPrompt, productPrompt, slugify, sourceCredit, sourcePrompt, toHtml, toPlainText,
  type AiConfig,
} from '@/modules/ai/domain/ai'
import { AiError, generate, getAiConfig } from '@/modules/ai/server/client'
import { queueCommentNotification } from '@/modules/journal/server/comment-notification-intents'
import { completeOwnerCase } from '@/modules/moderation/server/cases'
import { autofillPrompt, cleanSchema, parseAutofill } from '@/modules/ai/domain/autofill'
import { editorAssistPlan, type EditorAssistInput } from './editor-assist'

// Everything the assistant writes is a suggestion: posts are saved as drafts,
// and replies, product copy and meta descriptions are only stored after an
// admin reviews them and presses "publish" / "apply".

const BOT_EMAIL = 'ai-assistant@bot.mobocom.local'
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

async function context() {
  const [config, seo] = await Promise.all([getAiConfig(), getSiteSeo('fa')])
  return { config, brand: seo.name, voice: config.voice }
}

async function uniquePostSlug(base: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt ? `${base}-${attempt + 1}` : base
    if (!await db.post.findUnique({ where: { slug }, select: { id: true } })) return slug
  }
  return `${base}-${randomBytes(3).toString('hex')}`
}

// ------------------------------------------------------------------ queues

/** Work waiting for the assistant: pending comments, unanswered threads, products and thin meta. */
export async function assistantQueues() {
  const bot = await db.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true } })
  const [comments, threads, products, posts] = await Promise.all([
    db.postComment.findMany({
      where: { status: 'PENDING', replies: { none: {} } }, orderBy: { createdAt: 'desc' }, take: 25,
      include: { post: { select: { id: true, slug: true, title: true } }, user: { select: { name: true, email: true } } },
    }),
    db.forumThread.findMany({
      where: { status: 'VISIBLE', locked: false, category: { access: 'PUBLIC' } }, orderBy: { lastPostAt: 'desc' }, take: 60,
      select: { id: true, title: true, replyCount: true, lastPostAt: true, lastPostUserId: true, category: { select: { title: true } }, user: { select: { name: true } } },
    }),
    db.product.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }], take: 200, select: { id: true, name: true, slug: true, kind: true, active: true, description: true } }),
    db.post.findMany({ orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, title: true, slug: true, status: true, excerpt: true } }),
  ])
  // A thread needs an answer when its latest message is from a regular member (not staff, not the bot).
  const lastIds = [...new Set(threads.map((thread) => thread.lastPostUserId).filter((id): id is number => id != null))]
  const staff = new Set((await db.user.findMany({ where: { id: { in: lastIds }, role: 'ADMIN' }, select: { id: true } })).map((user) => user.id))
  return {
    comments: comments.map((comment) => ({ id: comment.id, body: comment.body, createdAt: comment.createdAt, author: comment.user.name || comment.user.email, post: comment.post })),
    threads: threads.filter((thread) => thread.lastPostUserId !== bot?.id && !staff.has(thread.lastPostUserId ?? -1)).slice(0, 25)
      .map((thread) => ({ id: thread.id, title: thread.title, board: thread.category.title, author: thread.user.name, replies: thread.replyCount, lastPostAt: thread.lastPostAt })),
    products: products.map((product) => ({ id: product.id, name: product.name, slug: product.slug, kind: product.kind, active: product.active, words: plain(product.description).split(' ').filter(Boolean).length })),
    posts: posts.filter((post) => post.excerpt.trim().length < 70 || post.excerpt.trim().length > 170)
      .map((post) => ({ id: post.id, title: post.title, slug: post.slug, status: post.status, excerpt: post.excerpt })),
  }
}

// ------------------------------------------------------------------ posts

export async function draftPost(adminId: number, input: { topic?: unknown; keywords?: unknown; length?: unknown; categoryId?: unknown }) {
  const topic = String(input.topic || '').trim().slice(0, 300)
  if (topic.length < 3) throw new AiError('موضوع مقاله را بنویسید')
  const length = input.length === 'short' || input.length === 'long' ? input.length : 'medium'
  const { brand, voice } = await context()
  const result = await generate(postPrompt({ brand, voice, topic, keywords: String(input.keywords || '').slice(0, 300), length }))
  const { fields, body } = parseTagged(result.text)
  const content = cleanRichText(naturalize(toHtml(body)))
  if (plain(content).length < 200) throw new AiError('متن تولیدشده خیلی کوتاه بود؛ دوباره تلاش کنید یا مدل دیگری انتخاب کنید', 502)
  const title = oneLine(fields.title || topic, 120)
  const categoryId = Number(input.categoryId)
  const category = Number.isSafeInteger(categoryId) && categoryId > 0 ? await db.postCategory.findUnique({ where: { id: categoryId }, select: { id: true } }) : null
  const post = await db.post.create({
    data: {
      slug: await uniquePostSlug(slugify(fields.slug || '', `post-${Date.now().toString(36)}`)),
      title,
      excerpt: oneLine(fields.excerpt || plain(content), 160),
      content,
      status: 'DRAFT',
      authorId: adminId,
      categoryId: category?.id ?? null,
      ...(category ? { categories: { create: [{ categoryId: category.id }] } } : {}),
    },
    select: { id: true, slug: true, title: true, excerpt: true },
  })
  return { post, model: result.model }
}

// ------------------------------------------------------------------ products

export async function productCopy(productId: number, facts: unknown) {
  const product = await db.product.findUnique({ where: { id: productId }, include: { category: { select: { name: true } } } })
  if (!product) throw new AiError('محصول پیدا نشد', 404)
  const { brand, voice } = await context()
  const result = await generate(productPrompt({
    brand, voice, name: product.name, kind: product.kind, category: product.category?.name || '',
    price: '', facts: String(facts || '').slice(0, 1500), current: plain(product.description),
  }))
  const { fields, body } = parseTagged(result.text)
  const description = cleanRichText(naturalize(toHtml(body)))
  if (plain(description).length < 80) throw new AiError('متن تولیدشده خیلی کوتاه بود؛ دوباره تلاش کنید', 502)
  return { description, meta: oneLine(fields.meta || '', 160), model: result.model }
}

export async function applyProductCopy(productId: number, description: unknown) {
  const html = cleanRichText(String(description || '')).slice(0, 60_000)
  if (plain(html).length < 20) throw new AiError('متن توضیحات خالی است')
  const product = await db.product.update({ where: { id: productId }, data: { description: html }, select: { id: true, slug: true, active: true } }).catch(() => null)
  if (!product) throw new AiError('محصول پیدا نشد', 404)
  if (product.active) queueIndexNow([`/products/${product.slug}`])
  return product
}

// ------------------------------------------------------------------ editor assistant

/**
 * Writing help inside the post editor. Nothing is saved here: the result goes
 * back into the editor form and the admin reviews it before saving.
 * - polish: smoother, more natural wording of the admin's own draft
 * - source: a new article that uses a pasted source only as research (credited when a URL is given)
 * - excerpt: a meta description for the current content
 */
export async function assistEditor(input: EditorAssistInput) {
  const plan = await editorAssistPlan(input)
  return plan.parse(await generate(plan.prompt))
}

// ------------------------------------------------------------------ comments

export async function suggestCommentReply(commentId: number) {
  const comment = await db.postComment.findUnique({ where: { id: commentId }, include: { post: { select: { title: true, excerpt: true } }, user: { select: { name: true } } } })
  if (!comment) throw new AiError('دیدگاه پیدا نشد', 404)
  const { brand, voice } = await context()
  const result = await generate(commentReplyPrompt({ brand, voice, postTitle: comment.post.title, postExcerpt: comment.post.excerpt, author: comment.user.name, comment: comment.body }))
  return { reply: toPlainText(result.text, 2000), model: result.model }
}

/** Approves the comment and posts the admin's (edited) reply under it. */
export async function publishCommentReply(adminId: number, commentId: number, reply: unknown) {
  const body = toPlainText(String(reply || ''), 2000)
  if (body.length < 2) throw new AiError('متن پاسخ خالی است')
  const comment = await db.postComment.findUnique({ where: { id: commentId }, select: { id: true, postId: true, parentId: true, status: true } })
  if (!comment) throw new AiError('دیدگاه پیدا نشد', 404)
  if (comment.parentId) {
    const parent = await db.postComment.findFirst({ where: { id: comment.parentId, status: 'APPROVED' }, select: { id: true } })
    if (!parent) throw new AiError('ابتدا دیدگاه والد را تأیید کنید', 409)
  }
  if (comment.status === 'DELETED') throw new AiError('این دیدگاه را نویسنده‌اش حذف کرده است', 409)
  const created = await db.$transaction(async (tx) => {
    const claimed = await tx.postComment.updateMany({ where: { id: comment.id, status: comment.status }, data: { status: 'APPROVED' } })
    if (!claimed.count) throw new AiError('دیدگاه هم‌زمان تغییر کرده است', 409)
    if (comment.status !== 'APPROVED') {
      await completeOwnerCase(tx, 'article-comments', comment.id, adminId, 'approve')
      await queueCommentNotification(tx, comment.id, 'moderator')
    }
    const answer = await tx.postComment.create({ data: { postId: comment.postId, userId: adminId, parentId: comment.id, body, status: 'APPROVED' }, select: { id: true } })
    await queueCommentNotification(tx, answer.id, 'auto')
    return answer
  })
  return created
}

// ------------------------------------------------------------------ forum

/** The clearly-named account that signs AI forum replies (cannot log in: random password, no admin role). */
async function forumBot(config: AiConfig) {
  const existing = await db.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true, name: true } })
  if (existing) {
    if (existing.name !== config.botName) await db.user.update({ where: { id: existing.id }, data: { name: config.botName } })
    return existing.id
  }
  const created = await db.user.create({
    data: { email: BOT_EMAIL, name: config.botName, passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10), role: 'CUSTOMER', avatarColor: '#0ea5e9', note: 'حساب خودکار دستیار هوش مصنوعی — ورود ندارد', subscriptionAlerts: false },
    select: { id: true },
  })
  return created.id
}

export async function suggestForumReply(threadId: number) {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    include: { category: { select: { title: true } }, posts: { where: { status: 'VISIBLE' }, orderBy: { createdAt: 'asc' }, take: 40, include: { user: { select: { name: true } } } } },
  })
  if (!thread) throw new AiError('موضوع پیدا نشد', 404)
  const { brand, voice } = await context()
  const result = await generate(forumReplyPrompt({
    brand, voice, board: thread.category.title, title: thread.title,
    posts: thread.posts.map((post) => ({ author: post.user.name || 'کاربر', content: post.content })),
  }))
  return { reply: toPlainText(result.text, 4000), model: result.model }
}

/** Posts the reviewed reply as the assistant account, through the normal forum rules. */
export async function publishForumReply(threadId: number, reply: unknown) {
  const content = toPlainText(String(reply || ''), 8000)
  if (content.length < 2) throw new AiError('متن پاسخ خالی است')
  const botId = await forumBot(await getAiConfig())
  try {
    // The bot posts under the normal forum rules (category permissions, locks), as a regular member.
    return await createReply(await viewerFor(botId), threadId, { content })
  } catch (error) {
    if (error instanceof ForumError) throw new AiError(error.message, error.status)
    throw error
  }
}

// ------------------------------------------------------------------ meta descriptions

export async function suggestMeta(postId: number) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { title: true, content: true } })
  if (!post) throw new AiError('نوشته پیدا نشد', 404)
  const { brand, voice } = await context()
  const result = await generate(metaPrompt({ brand, voice, kind: 'مقاله', title: post.title, content: plain(post.content) }))
  return { meta: oneLine(result.text, 160), model: result.model }
}

export async function applyMeta(postId: number, meta: unknown) {
  const excerpt = oneLine(String(meta || ''), 170)
  if (excerpt.length < 20) throw new AiError('توضیح متا خیلی کوتاه است')
  const post = await db.post.update({ where: { id: postId }, data: { excerpt }, select: { id: true, slug: true, status: true } }).catch(() => null)
  if (!post) throw new AiError('نوشته پیدا نشد', 404)
  if (post.status === 'PUBLISHED') queueIndexNow([`/blog/${post.slug}`])
  return post
}

// ------------------------------------------------------------------ section auto-fill

/**
 * Fills a section's form from pasted source material. Returns proposed values
 * only; the editor reviews them in the form and publishing still needs their
 * explicit confirmation.
 */
export async function autofillContent(input: { section?: unknown; fields?: unknown; source?: unknown; current?: unknown }) {
  const fields = cleanSchema(input.fields)
  const source = String(input.source ?? '').trim()
  if (!fields.length) throw new AiError('فیلدی برای تکمیل وجود ندارد')
  if (source.length < 40) throw new AiError('متن منبع خیلی کوتاه است؛ دست‌کم چند جمله دربارهٔ موضوع بنویسید یا بچسبانید')
  const current = input.current && typeof input.current === 'object' && !Array.isArray(input.current) ? input.current as Record<string, unknown> : {}
  const { config, brand, voice } = await context()
  const result = await generate(autofillPrompt({ brand, voice, section: String(input.section || '').slice(0, 40), fields, source, current }), config)
  const parsed = parseAutofill(result.text, fields)
  if (!parsed.filled.length) throw new AiError('پاسخ هوش مصنوعی قابل استفاده نبود؛ دوباره تلاش کنید', 502)
  for (const field of fields) if (field.type === 'richtext' && typeof parsed.values[field.key] === 'string') parsed.values[field.key] = cleanRichText(parsed.values[field.key] as string)
  return { ...parsed, model: result.model }
}
